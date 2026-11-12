import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { blockSchema, type Block } from "@/lib/blocks/schema";
import { gameActivityContainerSchema } from "@/lib/game-activity";
import { getGameActivityProgress } from "@/lib/game-activity-progression";

function storedBlocks(lesson: {
  blocks: unknown;
  gameActivity?: unknown;
}): Block[] {
  const blocks = Array.isArray(lesson.blocks)
    ? lesson.blocks
        .map((b) => blockSchema.safeParse(b))
        .flatMap((p) => (p.success ? [p.data] : []))
    : [];
  const activity = gameActivityContainerSchema.safeParse(lesson.gameActivity);
  if (!activity.success) return blocks;
  // Challenges live only in the Game Activity container once it exists.
  return [
    ...blocks.filter((block) => block.type !== "game" || block.payload.variant === "programming"),
    ...activity.data.challenges,
  ];
}

/**
 * Resolves access to one block of a lesson.
 *
 * `preview` is set by the lesson player when a teacher opens
 * `/learn/<courseId>/<lessonId>?preview=1`. An unsaved editor preview still
 * passes the block itself as `previewBlock`. Both preview modes are read-only:
 * callers must skip ActivityAttempt / LessonProgress writes when `preview` is
 * true.
 */
export async function activityAccess(
  lessonId: string,
  blockId: string,
  previewBlock?: Block,
  preview = false,
) {
  const user = (await auth())?.user;
  if (!user?.id) throw new Error("Sign in to use this activity.");

  const isTeacher = user.role === "INSTRUCTOR" || user.role === "ADMIN";

  /** Preview never authorizes a student write, even if the teacher is enrolled. */
  if (preview || previewBlock !== undefined) {
    if (!isTeacher) throw new Error("Teacher preview only.");

    // Unsaved editor preview: the block is supplied by the client because the
    // lesson has not been stored yet.
    if (previewBlock !== undefined) {
      const block = blockSchema.parse(previewBlock);
      if (block.id !== blockId) throw new Error("Activity id mismatch.");
      return {
        userId: user.id,
        courseId: undefined,
        block,
        blocks: [block],
        activityBlocks: undefined,
        activityId: undefined,
        preview: true,
      };
    }

    // Stored-course preview: read the real lesson, but never the enrollment.
    const lesson = await prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { module: { include: { course: true } } },
    });
    if (!lesson) throw new Error("Lesson not found.");
    const course = lesson.module.course;

    // Published courses are public, so any teacher may preview them. Drafts
    // stay private to their author.
    if (
      user.role !== "ADMIN" &&
      course.status !== "PUBLISHED" &&
      course.createdById !== user.id
    )
      throw new Error("You can only preview your own draft courses.");

    const blocks = storedBlocks(lesson);
    const block = blocks.find((b) => b.id === blockId);
    if (!block) throw new Error("Activity not found.");
    const activity = gameActivityContainerSchema.safeParse(lesson.gameActivity);
    const activityId =
      activity.success &&
      activity.data.challenges.some((challenge) => challenge.id === blockId)
        ? activity.data.id
        : undefined;
    const activityBlocks = activity.success
      ? activity.data.challenges
      : undefined;

    return {
      userId: user.id,
      courseId: course.id,
      block,
      blocks,
      activityBlocks,
      activityId,
      preview: true,
    };
  }

  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    include: { module: { include: { course: true } } },
  });
  if (!lesson) throw new Error("Lesson not found.");
  const course = lesson.module.course;
  const enrollment = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId: user.id, courseId: course.id } },
  });
  if (user.role !== "LEARNER" || !enrollment || course.status !== "PUBLISHED")
    throw new Error(
      "Use teacher preview, or enroll as a learner in a published course.",
    );
  const blocks = storedBlocks(lesson);
  const block = blocks.find((b) => b.id === blockId);
  if (!block) throw new Error("Activity not found.");
  const activity = gameActivityContainerSchema.safeParse(lesson.gameActivity);
  const activityId =
    activity.success &&
    activity.data.challenges.some((challenge) => challenge.id === blockId)
      ? activity.data.id
      : undefined;
  const activityBlocks = activity.success
      ? activity.data.challenges
      : undefined;
  if (activity.success && activity.data.challenges.some((b) => b.id === blockId)) {
    const progress = await prisma.lessonProgress.findUnique({
      where: { userId_lessonId: { userId: user.id, lessonId } },
      select: { completedBlocks: true },
    });
    const completedIds = Array.isArray(progress?.completedBlocks)
      ? progress.completedBlocks.filter(
          (value): value is string => typeof value === "string",
        )
      : [];
    const activityProgress = getGameActivityProgress(
      activity.data,
      completedIds,
    );
    // The completion adapter revisits a Challenge right after its result is
    // saved; only lock Challenges that are still ahead of the learner.
    if (
      activityProgress.nextChallenge !== null &&
      activityProgress.nextChallenge.id !== blockId &&
      !activityProgress.completedChallengeIds.includes(blockId)
    ) {
      throw new Error("Complete Game Activity Challenges in order.");
    }
  }
  return {
    userId: user.id,
    courseId: course.id,
    block,
    blocks,
    activityBlocks,
    activityId,
    preview: false,
  };
}
