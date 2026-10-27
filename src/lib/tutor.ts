import type { Prisma } from "@prisma/client";

import { blockDigest } from "@/lib/blocks/digest";
import { blockListSchema } from "@/lib/blocks/schema";
import { prisma } from "@/lib/prisma";
import { loadLearnerProfile, type LearnerProfile } from "@/lib/profile";

/**
 * Server-side helpers for the AI tutor (P4.3).
 *
 * Two responsibilities:
 * - assemble the context the model needs (learner profile + the block the
 *   learner is currently on);
 * - read and write the TutorSession / TutorMessage history so a conversation
 *   survives a reload.
 *
 * One session per (user, course, lesson): the session's `context` JSON holds the
 * lesson id, which is the only place to keep it — the table has no lesson column.
 */

/** Messages handed to the panel, oldest first. */
export type TutorMessageView = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

/** Everything the tutor prompt needs about the learner and the page. */
export type TutorLessonContext = {
  courseId: string;
  courseTitle: string;
  lessonId: string;
  lessonTitle: string;
  blockType: string | null;
  blockTitle: string | null;
  blockDigest: string | null;
  profile: LearnerProfile | null;
};

/** How many past messages are replayed to the model and to the panel. */
export const TUTOR_HISTORY_LIMIT = 20;

const RECENT_SESSION_SCAN = 10;

type SessionContext = {
  lessonId: string;
  lessonTitle: string;
};

/** Reads the lesson id back out of a session's `context` JSON. */
function readSessionContext(value: Prisma.JsonValue | null): SessionContext | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const lessonId = record["lessonId"];
  if (typeof lessonId !== "string") {
    return null;
  }

  return {
    lessonId,
    lessonTitle: typeof record["lessonTitle"] === "string"
      ? record["lessonTitle"]
      : "",
  };
}

/** Stored `completedBlocks` entries that are usable strings. */
function completedIds(value: Prisma.JsonValue | null): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === "string");
}

/**
 * Builds the tutor context for a lesson.
 *
 * The "current block" is the first block the learner has not completed yet, so
 * the tutor follows the learner through the lesson instead of always describing
 * the top of the page.
 */
export async function loadTutorLessonContext(
  userId: string,
  lessonId: string,
): Promise<TutorLessonContext | null> {
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    select: {
      id: true,
      title: true,
      blocks: true,
      module: {
        select: {
          courseId: true,
          course: { select: { title: true } },
        },
      },
    },
  });

  if (lesson === null) {
    return null;
  }

  const [profile, progress] = await Promise.all([
    loadLearnerProfile(userId),
    prisma.lessonProgress.findUnique({
      where: { userId_lessonId: { userId, lessonId } },
      select: { completedBlocks: true },
    }),
  ]);

  const parsed = blockListSchema.safeParse(lesson.blocks);
  const blocks = parsed.success ? parsed.data : [];
  const done = completedIds(progress?.completedBlocks ?? null);

  const current = blocks.find((block) => !done.includes(block.id)) ?? blocks[0];

  return {
    courseId: lesson.module.courseId,
    courseTitle: lesson.module.course.title,
    lessonId: lesson.id,
    lessonTitle: lesson.title,
    blockType: current?.type ?? null,
    blockTitle: current?.title ?? null,
    blockDigest: current === undefined ? null : blockDigest(current),
    profile,
  };
}

/** Finds the existing session for a lesson without creating one. */
async function findTutorSessionId(
  userId: string,
  courseId: string,
  lessonId: string,
): Promise<string | null> {
  const recent = await prisma.tutorSession.findMany({
    where: { userId, courseId },
    orderBy: { createdAt: "desc" },
    take: RECENT_SESSION_SCAN,
    select: { id: true, context: true },
  });

  const match = recent.find(
    (session) => readSessionContext(session.context)?.lessonId === lessonId,
  );

  return match?.id ?? null;
}

/**
 * Session for this lesson, created on first use.
 *
 * Called by the streaming route (a real conversation is starting), while page
 * loads use `loadTutorHistory` so simply opening a lesson writes nothing.
 */
export async function resolveTutorSession(
  userId: string,
  courseId: string,
  lessonId: string,
  lessonTitle: string,
): Promise<string> {
  const existing = await findTutorSessionId(userId, courseId, lessonId);
  if (existing !== null) {
    return existing;
  }

  const created = await prisma.tutorSession.create({
    data: {
      userId,
      courseId,
      context: { lessonId, lessonTitle } satisfies SessionContext as Prisma.InputJsonValue,
    },
    select: { id: true },
  });

  return created.id;
}

/** The most recent messages of a session, oldest first. */
export async function loadTutorMessages(
  sessionId: string,
  limit: number = TUTOR_HISTORY_LIMIT,
): Promise<TutorMessageView[]> {
  const rows = await prisma.tutorMessage.findMany({
    where: { sessionId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { id: true, role: true, content: true },
  });

  return rows
    .reverse()
    .map((row) => ({
      id: row.id,
      role: row.role === "assistant" ? "assistant" : "user",
      content: row.content,
    }));
}

/** History shown when the panel opens; empty until the learner has asked. */
export async function loadTutorHistory(
  userId: string,
  courseId: string,
  lessonId: string,
): Promise<TutorMessageView[]> {
  const sessionId = await findTutorSessionId(userId, courseId, lessonId);
  if (sessionId === null) {
    return [];
  }

  return loadTutorMessages(sessionId);
}

/** Appends one message to a session. */
export async function appendTutorMessage(
  sessionId: string,
  role: "user" | "assistant",
  content: string,
): Promise<void> {
  if (content.trim().length === 0) {
    return;
  }

  await prisma.tutorMessage.create({
    data: { sessionId, role, content },
  });
}
