import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  access: vi.fn(),
  persist: vi.fn(),
  generate: vi.fn(),
  find: vi.fn(),
}));
vi.mock("@/lib/activity-access", () => ({ activityAccess: m.access }));
vi.mock("@/lib/activity-store", () => ({ persistActivity: m.persist }));
vi.mock("@/lib/llm/provider", () => ({
  generateJson: m.generate,
  isMockMode: () => true,
}));
vi.mock("@/lib/llm/mocks", () => ({ registerLlmMocks: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: { activityAttempt: { findUnique: m.find } },
}));
vi.mock("@/i18n/server", () => ({
  getI18n: async () => ({ locale: "en", t: (k: string) => k }),
}));
import { requestCodeReview } from "./code-review";
import { requestRoleplayFeedback } from "./roleplay";
const coding = {
  id: "b",
  title: "Sum",
  type: "coding" as const,
  payload: {
    problem: "Sum two numbers",
    starter: "",
    hints: [],
    tests: [{ name: "sum", expression: "sum(1,2)===3" }],
  },
};
const roleplay = {
  id: "b",
  title: "Practice",
  type: "roleplay" as const,
  payload: {
    scenario: "Interview",
    persona: "Manager",
    goal: "Explain",
    rubric: ["Clarity"],
  },
};
const attemptId = "ad77ae57-789a-4b3c-a723-717ffcd21c63";
const codeInput = {
  attemptId,
  lessonId: "l",
  blockId: "b",
  code: "function sum(a,b){return a+b}",
  evidence: {
    results: [{ name: "sum", passed: true, error: null }],
    failure: null,
  },
};
const report = {
  summary: "[MOCK] Demo",
  errors: [],
  improvements: ["Use names"],
  edgeCases: ["Empty inputs"],
};
const rpReport = {
  criteria: [{ criterion: "Clarity", score: 4, comment: "[MOCK] Clear" }],
  suggestion: "[MOCK] Practice",
};
beforeEach(() => {
  vi.resetAllMocks();
  m.persist.mockResolvedValue({ id: "a" });
});
describe("activity AI feedback / preview isolation", () => {
  it("reviews an unsaved teacher coding preview without creating a student attempt", async () => {
    m.access.mockResolvedValue({
      userId: "teacher",
      preview: true,
      block: coding,
    });
    m.generate.mockResolvedValue(report);
    expect(
      (await requestCodeReview({ ...codeInput, previewBlock: coding })).ok,
    ).toBe(true);
    expect(m.persist).not.toHaveBeenCalled();
  });
  it("stores AI code review separately from test grades", async () => {
    m.access.mockResolvedValue({
      userId: "u",
      courseId: "c",
      preview: false,
      block: coding,
      blocks: [coding],
    });
    m.generate.mockResolvedValue(report);
    expect((await requestCodeReview(codeInput)).ok).toBe(true);
    expect(m.persist.mock.calls[0][0].grade).toMatchObject({
      score: null,
      completed: false,
      feedback: { review: report, mock: true },
    });
  });
  it("returns a visible failure when feedback could not be saved", async () => {
    m.access.mockResolvedValue({
      userId: "u",
      courseId: "c",
      preview: false,
      block: coding,
      blocks: [coding],
    });
    m.generate.mockResolvedValue(report);
    m.persist.mockRejectedValue(new Error("offline"));
    expect(await requestCodeReview(codeInput)).toEqual({
      ok: false,
      error: "offline",
    });
  });
  it("grades an unsaved roleplay preview without querying or creating student attempts", async () => {
    m.access.mockResolvedValue({
      userId: "teacher",
      preview: true,
      block: roleplay,
    });
    m.generate.mockResolvedValue(rpReport);
    expect(
      (
        await requestRoleplayFeedback({
          attemptId,
          lessonId: "unsaved",
          blockId: "b",
          previewBlock: roleplay,
          transcript: [{ role: "user", content: "Hello" }],
        })
      ).ok,
    ).toBe(true);
    expect(m.find).not.toHaveBeenCalled();
    expect(m.persist).not.toHaveBeenCalled();
  });
  it("reuses an existing roleplay report for the same submission id", async () => {
    m.access.mockResolvedValue({
      userId: "u",
      courseId: "c",
      preview: false,
      block: roleplay,
      blocks: [roleplay],
    });
    m.find.mockResolvedValue({ result: { feedback: { report: rpReport } } });
    const result = await requestRoleplayFeedback({
      attemptId,
      lessonId: "l",
      blockId: "b",
      transcript: [{ role: "user", content: "Hello" }],
    });
    expect(result).toEqual({ ok: true, report: rpReport });
    expect(m.generate).not.toHaveBeenCalled();
    expect(m.persist).not.toHaveBeenCalled();
  });
});
