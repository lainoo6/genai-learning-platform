"use server";

import { z } from "zod";

import { trackEvent } from "@/lib/analytics";
import { activityAccess } from "@/lib/activity-access";
import { persistActivity } from "@/lib/activity-store";
import { gradeActivity } from "@/lib/blocks/activity-result";
import { prisma } from "@/lib/prisma";

/** Result shape returned to the block components (never throws at the client). */
export type ProgressActionResult = { ok: true } | { ok: false; error: string };

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
  preview = false,
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

  let access;
  try {
    access = await activityAccess(lessonId, blockId, undefined, preview);
  } catch {
    return;
  }
  if (access.preview) return;
  const userId = access.userId;

  await trackEvent(parsedInput.data.type, {
    userId,
    courseId: access.courseId,
    payload: { ...(parsedInput.data.payload ?? {}), lessonId, blockId },
  });
}

/** Backward-compatible completion adapter. Graded activities need a saved passing attempt. */
export async function completeBlock(
  lessonId: string,
  blockId: string,
  _score?: number,
  preview = false,
): Promise<ProgressActionResult> {
  try {
    void _score; // Legacy callers may still pass a score; all grading now uses saved evidence.
    const access = await activityAccess(lessonId, blockId, undefined, preview);
    // Preview is read-only: report success to the UI, write nothing.
    if (access.preview) return { ok: true };
    if (
      [
        "quiz",
        "coding",
        "game",
        "simulation",
        "roleplay",
        "reflection",
      ].includes(access.block.type)
    ) {
      const attempts = await prisma.activityAttempt.findMany({
        where: { userId: access.userId, lessonId, blockId },
      });
      if (
        !attempts.some((a) => (a.result as { completed?: boolean }).completed)
      )
        return { ok: false, error: "Submit this activity successfully first." };
      return { ok: true };
    }
    await persistActivity({
      ...access,
      courseId: access.courseId!,
      lessonId,
      attemptId: `completion-${blockId}`,
      answer: {},
      grade: gradeActivity(access.block, {}),
    });
    return { ok: true };
  } catch (cause) {
    return {
      ok: false,
      error:
        cause instanceof Error ? cause.message : "Unable to save completion.",
    };
  }
}
