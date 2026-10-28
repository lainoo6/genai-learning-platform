"use server";

import { z } from "zod";
import { activityAccess } from "@/lib/activity-access";
import {
  contentVersionForBlock,
  persistActivity,
} from "@/lib/activity-store";
import {
  activitySubmissionSchema,
  gradeActivity,
} from "@/lib/blocks/activity-result";
import { prisma } from "@/lib/prisma";

export async function submitActivity(
  lessonId: string,
  blockId: string,
  input: z.input<typeof activitySubmissionSchema>,
  preview = false,
) {
  try {
    const parsed = activitySubmissionSchema.parse(input);
    if (JSON.stringify(parsed).length > 250000)
      throw new Error("Submission is too large.");
    const access = await activityAccess(lessonId, blockId, undefined, preview);
    // A teacher preview is read-only: never create ActivityAttempt or
    // LessonProgress rows while the teacher is looking at the course.
    if (access.preview) return { ok: true as const, id: null };
    const grade =
      parsed.feedback.kind === "hint" || parsed.answer.kind === "replay"
        ? {
            score: null,
            completed: false,
            passed: null,
            verification: "ungraded" as const,
            feedback: parsed.feedback,
          }
        : gradeActivity(access.block, parsed.answer);
    const attempt = await persistActivity({
      ...access,
      courseId: access.courseId!,
      lessonId,
      attemptId: parsed.attemptId,
      answer: parsed.answer,
      grade,
    });
    return { ok: true as const, id: attempt.id };
  } catch (cause) {
    return {
      ok: false as const,
      error:
        cause instanceof Error
          ? cause.message
          : "Could not save submission. Please retry.",
    };
  }
}

/** Cursor pagination; private to the signed-in learner. Teacher analytics can use the same table. */
export async function loadActivityAttempts(
  lessonId: string,
  blockId: string,
  cursor?: string,
  preview = false,
) {
  try {
    const access = await activityAccess(lessonId, blockId, undefined, preview);
    if (access.preview)
      return { ok: true as const, attempts: [], nextCursor: null };
    const rows = await prisma.activityAttempt.findMany({
      where: { userId: access.userId, lessonId, blockId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 20,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    return {
      ok: true as const,
      attempts: rows.map((r) => ({
        id: r.id,
        createdAt: r.createdAt.toISOString(),
        result: r.result,
      })),
      nextCursor: rows.length === 20 ? rows[19].id : null,
    };
  } catch (cause) {
    return {
      ok: false as const,
      error: cause instanceof Error ? cause.message : "Cannot load history.",
    };
  }
}

/**
 * Returns the latest unfinished or completed game run for this learner.
 * Attempts are filtered by the saved content fingerprint so a republished
 * challenge can never hydrate controls with answers from an older version.
 */
export async function loadLatestGamePlaythrough(
    lessonId: string,
    blockId: string,
    preview = false,
  ) {
    try {
      const access = await activityAccess(lessonId, blockId, undefined, preview);
      if (access.preview)
        return { ok: true as const, attempts: [], playthroughId: null };
      const rows = await prisma.activityAttempt.findMany({
        where: { userId: access.userId, lessonId, blockId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      });
      const version = contentVersionForBlock(access.block);
      const latest = rows.find((row) => {
        const result = row.result as {
          contentVersion?: unknown;
          playthroughId?: unknown;
        };
        return (
          result.contentVersion === version &&
          typeof result.playthroughId === "string"
        );
      });
      if (!latest) {
        return { ok: true as const, attempts: [], playthroughId: null };
      }
      const playthroughId = (latest.result as { playthroughId: string })
        .playthroughId;
      return {
        ok: true as const,
        playthroughId,
        attempts: rows
          .filter((row) => {
            const result = row.result as {
              contentVersion?: unknown;
              playthroughId?: unknown;
            };
            return (
              result.contentVersion === version &&
              result.playthroughId === playthroughId
            );
          })
          .reverse()
          .map((row) => ({
            answer: ((row.result as { answer?: unknown }).answer ??
              {}) as Record<string, unknown>,
            completed: (row.result as { completed?: unknown }).completed === true,
          })),
      };
    } catch (cause) {
      return {
        ok: false as const,
        error:
          cause instanceof Error ? cause.message : "Cannot recover game state.",
      };
    }
}
