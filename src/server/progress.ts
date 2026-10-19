"use server";

import type { Prisma } from "@prisma/client";
import { z } from "zod";

import { getI18n } from "@/i18n/server";
import { trackEvent } from "@/lib/analytics";
import { auth } from "@/lib/auth";
import { blockListSchema } from "@/lib/blocks/schema";
import { prisma } from "@/lib/prisma";

/** Result shape returned to the block components (never throws at the client). */
export type ProgressActionResult = { ok: true } | { ok: false; error: string };

const completeBlockSchema = z.object({
  lessonId: z.string().min(1),
  blockId: z.string().min(1),
  /** Quiz score as a ratio in [0, 1]; omitted by unscored blocks. */
  score: z.number().min(0).max(1).optional(),
});

const BLOCK_EVENT_TYPES = ["GAME_FINISH", "SIM_END", "QUIZ_ATTEMPT"] as const;
type BlockEventType = (typeof BLOCK_EVENT_TYPES)[number];

/**
 * Event types a block component may raise from the browser.
 *
 * Kept to this short allow-list: the action is reachable from the client, so a
 * caller must not be able to write arbitrary rows into `EngagementEvent`.
 * `QUIZ_ATTEMPT` carries the questions a learner got wrong, which "Explain for
 * me" reads back to explain their own attempt (P4.4).
 */
const blockEventSchema = z.object({
  lessonId: z.string().min(1),
  blockId: z.string().min(1),
  type: z.enum(BLOCK_EVENT_TYPES),
  payload: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Records an engagement event raised by a block component (a finished game,
 * simulation or quiz attempt).
 *
 * Best effort by design — analytics must never block the learner, so anything
 * unexpected is dropped silently instead of being reported back.
 */
export async function trackBlockEvent(
  lessonId: string,
  blockId: string,
  type: BlockEventType,
  payload?: Record<string, unknown>,
): Promise<void> {
  const parsedInput = blockEventSchema.safeParse({
    lessonId,
    blockId,
    type,
    payload,
  });

  if (!parsedInput.success) {
    return;
  }

  const session = await auth();
  const userId = session?.user?.id;
  if (userId === undefined) {
    return;
  }

  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    select: { module: { select: { courseId: true } } },
  });

  if (lesson === null) {
    return;
  }

  await trackEvent(parsedInput.data.type, {
    userId,
    courseId: lesson.module.courseId,
    payload: { lessonId, blockId, ...(parsedInput.data.payload ?? {}) },
  });
}

/** Reads the stored `completedBlocks` JSON array, dropping anything malformed. */
function readCompletedBlocks(value: Prisma.JsonValue | null | undefined): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === "string");
}

/**
 * Stamps `Enrollment.completedAt` once every lesson of the course is completed.
 *
 * Called after a lesson flips to COMPLETED; `updateMany` with `completedAt: null`
 * keeps it idempotent without relying on a unique constraint.
 */
async function completeCourseIfDone(
  userId: string,
  courseId: string,
): Promise<void> {
  const lessons = await prisma.lesson.findMany({
    where: { module: { courseId } },
    select: { id: true },
  });

  if (lessons.length === 0) {
    return;
  }

  const completedCount = await prisma.lessonProgress.count({
    where: {
      userId,
      status: "COMPLETED",
      lessonId: { in: lessons.map((lesson) => lesson.id) },
    },
  });

  if (completedCount < lessons.length) {
    return;
  }

  await prisma.enrollment.updateMany({
    where: { userId, courseId, completedAt: null },
    data: { completedAt: new Date() },
  });
}

/**
 * Records one completed block for the signed-in learner.
 *
 * Upserts `LessonProgress`: `blockId` is appended once (deduped), the status
 * moves to at least IN_PROGRESS, and `score` is only overwritten by scored
 * blocks (quiz) so a reading block never clears a quiz result.
 */
export async function completeBlock(
  lessonId: string,
  blockId: string,
  score?: number,
): Promise<ProgressActionResult> {
  const { t } = await getI18n();
  const parsedInput = completeBlockSchema.safeParse({ lessonId, blockId, score });
  if (!parsedInput.success) {
    return { ok: false, error: t("server.progress.invalid") };
  }

  const session = await auth();
  const userId = session?.user?.id;
  if (userId === undefined) {
    return { ok: false, error: t("server.progress.signIn") };
  }

  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    select: {
      id: true,
      blocks: true,
      module: { select: { courseId: true } },
    },
  });

  if (lesson === null) {
    return { ok: false, error: t("server.progress.lessonNotFound") };
  }

  const parsedBlocks = blockListSchema.safeParse(lesson.blocks);
  if (
    !parsedBlocks.success
    || !parsedBlocks.data.some((block) => block.id === blockId)
  ) {
    return { ok: false, error: t("server.progress.unknownBlock") };
  }

  const existing = await prisma.lessonProgress.findUnique({
    where: { userId_lessonId: { userId, lessonId } },
    select: { status: true, completedBlocks: true },
  });

  const completedBlocks = readCompletedBlocks(existing?.completedBlocks);
  if (!completedBlocks.includes(blockId)) {
    completedBlocks.push(blockId);
  }

  // A lesson is finished once every one of its blocks has been completed.
  const allBlockIds = parsedBlocks.data.map((block) => block.id);
  const isLessonComplete = allBlockIds.every((id) =>
    completedBlocks.includes(id),
  );

  await prisma.lessonProgress.upsert({
    where: { userId_lessonId: { userId, lessonId } },
    create: {
      userId,
      lessonId,
      status: isLessonComplete ? "COMPLETED" : "IN_PROGRESS",
      completedBlocks,
      score: score ?? null,
    },
    update: {
      status: isLessonComplete || existing?.status === "COMPLETED"
        ? "COMPLETED"
        : "IN_PROGRESS",
      completedBlocks,
      // `undefined` leaves the previous score untouched (Prisma skips it).
      score: score ?? undefined,
    },
  });

  if (isLessonComplete) {
    await completeCourseIfDone(userId, lesson.module.courseId);
  }

  const courseId = lesson.module.courseId;

  if (score === undefined) {
    await trackEvent("BLOCK_COMPLETE", {
      userId,
      courseId,
      payload: { lessonId, blockId },
    });
    return { ok: true };
  }

  await trackEvent("QUIZ_SUBMIT", {
    userId,
    courseId,
    payload: { lessonId, blockId, score },
  });
  await trackEvent("BLOCK_COMPLETE", {
    userId,
    courseId,
    payload: { lessonId, blockId, score },
  });

  return { ok: true };
}
