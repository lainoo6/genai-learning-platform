"use server";

import { z } from "zod";

import { trackEvent } from "@/lib/analytics";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Client-reachable analytics for the AI tutor (P4.3).
 *
 * `trackEvent` is server-only, so opening the panel goes through this action.
 * The course id is taken from the lesson rather than from the client: even if a
 * caller passes a mismatched pair, the event lands on the course the lesson
 * really belongs to.
 */

const tutorOpenSchema = z.object({
  courseId: z.string().min(1),
  lessonId: z.string().min(1),
});

/** Records that the learner opened the tutor drawer. */
export async function trackTutorOpen(
  courseId: string,
  lessonId: string,
): Promise<void> {
  const parsed = tutorOpenSchema.safeParse({ courseId, lessonId });
  if (!parsed.success) {
    return;
  }

  const session = await auth();
  const userId = session?.user?.id;
  if (userId === undefined) {
    return;
  }

  const lesson = await prisma.lesson.findUnique({
    where: { id: parsed.data.lessonId },
    select: { module: { select: { courseId: true } } },
  });

  if (lesson === null) {
    return;
  }

  await trackEvent("TUTOR_OPEN", {
    userId,
    courseId: lesson.module.courseId,
    payload: { lessonId: parsed.data.lessonId },
  });
}
