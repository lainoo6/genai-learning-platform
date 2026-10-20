import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { blockSchema, type Block } from "@/lib/blocks/schema";

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

    const blocks = Array.isArray(lesson.blocks)
      ? lesson.blocks
          .map((b) => blockSchema.safeParse(b))
          .flatMap((p) => (p.success ? [p.data] : []))
      : [];
    const block = blocks.find((b) => b.id === blockId);
    if (!block) throw new Error("Activity not found.");

    return {
      userId: user.id,
      courseId: course.id,
      block,
      blocks,
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
  const blocks = Array.isArray(lesson.blocks)
    ? lesson.blocks
        .map((b) => blockSchema.safeParse(b))
        .flatMap((p) => (p.success ? [p.data] : []))
    : [];
  const block = blocks.find((b) => b.id === blockId);
  if (!block) throw new Error("Activity not found.");
  return {
    userId: user.id,
    courseId: course.id,
    block,
    blocks,
    preview: false,
  };
}
