"use server";

import { z } from "zod";
import { activityAccess } from "@/lib/activity-access";
import { persistActivity } from "@/lib/activity-store";
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
    const grade = gradeActivity(access.block, parsed.answer);
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
