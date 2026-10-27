import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  lesson: vi.fn(),
  enrollment: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    lesson: { findUnique: mocks.lesson },
    enrollment: { findUnique: mocks.enrollment },
  },
}));
import { activityAccess } from "./activity-access";
const block = {
  id: "b",
  title: "Read",
  type: "reading" as const,
  payload: { markdown: "Read" },
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: "u", role: "LEARNER" } });
  mocks.lesson.mockResolvedValue({
    blocks: [block],
    module: { course: { id: "c", status: "PUBLISHED" } },
  });
  mocks.enrollment.mockResolvedValue({ userId: "u" });
});
describe("activity access / preview isolation", () => {
  it("allows an enrolled learner in a published lesson", async () =>
    expect((await activityAccess("l", "b")).preview).toBe(false));
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
