import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

/** Engagement event types tracked across the platform (docs/plan/01 §5). */
export type EngagementEventType =
  | "LOGIN"
  | "COURSE_VIEW"
  | "ENROLL"
  | "LESSON_START"
  | "BLOCK_COMPLETE"
  | "QUIZ_SUBMIT"
  | "GAME_FINISH"
  | "SIM_END"
  | "ROLEPLAY_END"
  | "TUTOR_OPEN"
  | "TUTOR_MESSAGE"
  | "GENERATE_COURSE";

export type TrackEventInput = {
  userId?: string;
  courseId?: string;
  payload?: Record<string, unknown>;
};

/**
 * Persist an engagement event. Server-side only.
 *
 * Analytics must never break the caller flow, so write failures are logged and
 * swallowed instead of being re-thrown.
 */
export async function trackEvent(
  type: EngagementEventType,
  input: TrackEventInput = {},
): Promise<void> {
  try {
    await prisma.engagementEvent.create({
      data: {
        type,
        userId: input.userId ?? null,
        courseId: input.courseId ?? null,
        payload: input.payload as Prisma.InputJsonValue | undefined,
      },
    });
  } catch (error: unknown) {
    console.error(`[analytics] failed to track "${type}"`, error);
  }
}
