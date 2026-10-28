import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
const m = vi.hoisted(() => ({
  transaction: vi.fn(),
  find: vi.fn(),
  create: vi.fn(),
  progress: vi.fn(),
  upsert: vi.fn(),
  list: vi.fn(),
  event: vi.fn(),
  count: vi.fn(),
  enrollment: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: { $transaction: m.transaction } }));
import { contentVersionForBlock, persistActivity } from "./activity-store";
import type { Block } from "./blocks/schema";
const block: Block = {
  id: "g",
  title: "Game",
  type: "game",
  payload: {
    variant: "sort",
    items: [
      { text: "A", order: 0 },
      { text: "B", order: 1 },
    ],
  },
};
const input = {
  userId: "u",
  courseId: "c",
  lessonId: "l",
  block,
  blocks: [block],
  attemptId: "attempt",
  answer: { order: [0, 1] },
  grade: {
    completed: true,
    passed: true,
    verification: "server" as const,
    feedback: {},
    score: { raw: 2, min: 0, max: 2, normalized: 1 },
  },
};
beforeEach(() => {
  vi.resetAllMocks();
  m.transaction.mockImplementation((fn) =>
    fn({
      activityAttempt: {
        findUnique: m.find,
        create: m.create,
        findMany: m.list,
      },
      lessonProgress: { findUnique: m.progress, upsert: m.upsert },
      engagementEvent: { create: m.event },
      lesson: { count: m.count },
      enrollment: { updateMany: m.enrollment },
    }),
  );
  m.find.mockResolvedValue(null);
  m.create.mockResolvedValue({ id: "saved" });
  m.progress.mockResolvedValue(null);
  m.list.mockResolvedValue([
    { blockId: "g", result: { score: { normalized: 1 } } },
  ]);
  m.count.mockResolvedValue(0);
});
describe("atomic activity persistence", () => {
  it("saves answer, feedback and snapshot; uses game events rather than quiz events", async () => {
    await persistActivity(input);
    expect(m.create.mock.calls[0][0].data.result).toMatchObject({
      version: 1,
      answer: input.answer,
      activitySnapshot: block,
      score: { normalized: 1 },
      contentVersion: expect.stringMatching(/^[a-f0-9]{16}$/),
      firstPass: true,
    });
    expect(m.event.mock.calls.map((c) => c[0].data.type)).toEqual([
      "GAME_FINISH",
      "BLOCK_COMPLETE",
    ]);
    expect(m.enrollment).toHaveBeenCalledOnce();
  });
  it("deduplicates retries without duplicate completions or events", async () => {
    m.find.mockResolvedValue({ id: "previous" });
    expect(await persistActivity(input)).toEqual({ id: "previous" });
    expect(m.create).not.toHaveBeenCalled();
    expect(m.event).not.toHaveBeenCalled();
  });
  it("preserves previous completed blocks and emits BLOCK_COMPLETE only once", async () => {
    m.progress.mockResolvedValue({ completedBlocks: ["other", "g"] });
    await persistActivity(input);
    expect(m.upsert.mock.calls[0][0].update.completedBlocks).toEqual([
      "other",
      "g",
    ]);
    expect(m.event.mock.calls.map((c) => c[0].data.type)).toEqual([
      "GAME_FINISH",
    ]);
  });
  it("aggregates latest normalized score per activity, rather than overwriting with the last submission", async () => {
    m.list.mockResolvedValue([
      { blockId: "g", result: { score: { normalized: 0.5 } } },
      { blockId: "other", result: { score: { normalized: 1 } } },
      { blockId: "g", result: { score: { normalized: 0 } } },
    ]);
    await persistActivity({
      ...input,
      blocks: [block, { ...block, id: "other" }],
    });
    expect(m.upsert.mock.calls[0][0].update.score).toBe(0.75);
  });
  it("retries serialization conflicts within a bounded transaction loop", async () => {
    m.transaction.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("conflict", {
        code: "P2034",
        clientVersion: "6",
      }),
    );
    await persistActivity(input);
    expect(m.transaction).toHaveBeenCalledTimes(2);
    expect(m.transaction.mock.calls[1][1].isolationLevel).toBe("Serializable");
  });
  it("propagates failed writes so the learner can retry", async () => {
    m.create.mockRejectedValue(new Error("offline"));
    await expect(persistActivity(input)).rejects.toThrow("offline");
    expect(m.event).not.toHaveBeenCalled();
  });

  it("keeps a different content version separate from earlier history", async () => {
    await persistActivity({
      ...input,
      answer: { ...input.answer, playthroughId: "run-1" },
    });
    const firstVersion = m.create.mock.calls[0][0].data.result.contentVersion;
    m.create.mockClear();
    m.list.mockResolvedValue([]);

    await persistActivity({
      ...input,
      block: { ...block, title: "Revised game" },
      answer: { ...input.answer, playthroughId: "run-2" },
    });

    expect(m.create.mock.calls[0][0].data.result.contentVersion).not.toBe(
      firstVersion,
    );
    expect(m.create.mock.calls[0][0].data.result.activitySnapshot.title).toBe(
      "Revised game",
    );
  });

  it("keeps the first substantive submission first-pass after a replay marker", async () => {
    m.list.mockResolvedValue([
      {
        blockId: "g",
        result: {
          contentVersion: contentVersionForBlock(block),
          playthroughId: "run-2",
          answer: { kind: "replay" },
        },
      },
    ]);

    await persistActivity({
      ...input,
      answer: {
        ...input.answer,
        playthroughId: "run-2",
      },
    });

    expect(m.create.mock.calls[0][0].data.result).toMatchObject({
      firstPass: true,
      attemptNumber: 2,
    });
  });
});
