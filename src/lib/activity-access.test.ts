import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  lesson: vi.fn(),
  enrollment: vi.fn(),
  lessonProgress: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    lesson: { findUnique: mocks.lesson },
    enrollment: { findUnique: mocks.enrollment },
    lessonProgress: { findUnique: mocks.lessonProgress },
  },
}));
import { activityAccess } from "./activity-access";
const block = {
  id: "b",
  title: "Read",
  type: "reading" as const,
  payload: { markdown: "Read" },
};
const challenge = {
  id: "challenge-1",
  title: "Choose",
  type: "game" as const,
  payload: {
    variant: "choose" as const,
    prompt: "Pick one",
    options: [
      { text: "Correct", correct: true },
      { text: "Wrong", correct: false },
      { text: "Also wrong", correct: false },
    ],
    feedback: { correct: "Yes", incorrect: "No" },
  },
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: "u", role: "LEARNER" } });
  mocks.lesson.mockResolvedValue({
    blocks: [block],
    gameActivity: {
      id: "activity-1",
      title: "Practice",
      challenges: Array.from({ length: 5 }, (_, index) => ({
        ...challenge,
        id: `challenge-${index + 1}`,
      })),
    },
    module: { course: { id: "c", status: "PUBLISHED" } },
  });
  mocks.enrollment.mockResolvedValue({ userId: "u" });
  mocks.lessonProgress.mockResolvedValue({ completedBlocks: [] });
});
describe("activity access / preview isolation", () => {
  it("authorizes Challenges stored in the Game Activity container", async () => {
    const access = await activityAccess("l", "challenge-1");

    expect(access.block).toEqual(challenge);
    expect(access.blocks).toContainEqual(challenge);
    expect(access.activityId).toBe("activity-1");
  });

  it("does not double-count legacy game blocks once a Game Activity exists", async () => {
    mocks.lesson.mockResolvedValue({
      blocks: [block, challenge],
      gameActivity: {
        id: "activity-1",
        title: "Practice",
        challenges: Array.from({ length: 5 }, (_, index) => ({
          ...challenge,
          id: `challenge-${index + 1}`,
        })),
      },
      module: { course: { id: "c", status: "PUBLISHED" } },
    });

    const access = await activityAccess("l", "challenge-1");
    expect(access.blocks.filter((item) => item.id === "challenge-1")).toHaveLength(
      1,
    );
    expect(access.blocks.some((item) => item.id === "b")).toBe(true);
  });
  it("rejects a later Game Activity Challenge until earlier Challenges are complete", async () => {
    await expect(activityAccess("l", "challenge-2")).rejects.toThrow(
      "Complete Game Activity Challenges in order.",
    );
  });
  it("authorizes the next Game Activity Challenge after earlier completion", async () => {
    mocks.lessonProgress.mockResolvedValue({
      completedBlocks: ["challenge-1"],
    });

    await expect(activityAccess("l", "challenge-2")).resolves.toMatchObject({
      block: { id: "challenge-2" },
    });
  });
  it("authorizes a finished Challenge again so completion can be recorded", async () => {
    mocks.lessonProgress.mockResolvedValue({
      completedBlocks: ["challenge-1"],
    });

    await expect(activityAccess("l", "challenge-1")).resolves.toMatchObject({
      block: { id: "challenge-1" },
    });
  });
  it("allows an enrolled learner in a published lesson", async () =>
    expect(await activityAccess("l", "b")).toMatchObject({
      preview: false,
      activityId: undefined,
    }));
  it("rejects a non-enrolled learner", async () => {
    mocks.enrollment.mockResolvedValue(null);
    await expect(activityAccess("l", "b")).rejects.toThrow();
  });
  it("rejects draft courses", async () => {
    mocks.lesson.mockResolvedValue({
      blocks: [block],
      module: { course: { id: "c", status: "DRAFT" } },
    });
    await expect(activityAccess("l", "b")).rejects.toThrow();
  });
  it("rejects teacher writes even if the teacher is enrolled", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "u", role: "INSTRUCTOR" } });
    await expect(activityAccess("l", "b")).rejects.toThrow();
  });
  it("allows a stored-course teacher preview without reading enrollment", async () => {
    mocks.auth.mockResolvedValue({
      user: { id: "teacher", role: "INSTRUCTOR" },
    });
    const access = await activityAccess("l", "b", undefined, true);
    expect(access.preview).toBe(true);
    expect(access.block.id).toBe("b");
    expect(mocks.enrollment).not.toHaveBeenCalled();
  });
  it("rejects a learner who forges ?preview=1", async () => {
    await expect(activityAccess("l", "b", undefined, true)).rejects.toThrow();
  });
  it("allows unsaved teacher previews without touching lesson / enrollment storage", async () => {
    mocks.auth.mockResolvedValue({
      user: { id: "teacher", role: "INSTRUCTOR" },
    });
    expect((await activityAccess("unsaved", "b", block)).preview).toBe(true);
    expect(mocks.lesson).not.toHaveBeenCalled();
    expect(mocks.enrollment).not.toHaveBeenCalled();
  });
  it("rejects student-authored preview payloads", async () =>
    await expect(activityAccess("l", "b", block)).rejects.toThrow());
});
