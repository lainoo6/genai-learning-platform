import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  auth: vi.fn(),
  course: vi.fn(),
  transaction: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ auth: m.auth }));
vi.mock("@/lib/prisma", () => ({
  prisma: { course: { findUnique: m.course }, $transaction: m.transaction },
}));
vi.mock("@/lib/teach", () => ({ loadEditorCourse: vi.fn() }));
vi.mock("@/i18n/server", () => ({
  getI18n: async () => ({ t: (key: string) => key }),
}));
import { saveCourse } from "./editor";
const input = {
  title: "Course",
  description: "A complete course description for the test.",
  audience: "Students",
  difficulty: "beginner" as const,
  coverEmoji: "📘",
  status: "DRAFT" as const,
  modules: [
    {
      id: "m",
      title: "Module",
      lessons: [{ id: "l", title: "Lesson", estimatedMinutes: 5, blocks: [] }],
    },
  ],
};
beforeEach(() => vi.resetAllMocks());
describe("course save authorization beyond the page middleware", () => {
  it("rejects anonymous callers", async () => {
    m.auth.mockResolvedValue(null);
    expect((await saveCourse("c", input)).ok).toBe(false);
    expect(m.course).not.toHaveBeenCalled();
  });
  it("rejects learner writes even if they own a learner-generated course", async () => {
    m.auth.mockResolvedValue({ user: { id: "u", role: "LEARNER" } });
    expect((await saveCourse("c", input)).ok).toBe(false);
    expect(m.course).not.toHaveBeenCalled();
    expect(m.transaction).not.toHaveBeenCalled();
  });
  it("rejects a teacher who does not own the course", async () => {
    m.auth.mockResolvedValue({ user: { id: "u", role: "INSTRUCTOR" } });
    m.course.mockResolvedValue({ id: "c", createdById: "other", modules: [] });
    expect((await saveCourse("c", input)).ok).toBe(false);
    expect(m.transaction).not.toHaveBeenCalled();
  });
});
