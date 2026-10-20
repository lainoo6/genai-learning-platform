import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { blockSchema, type Block } from "@/lib/blocks/schema";

/** Explicit teacher preview accepts unsaved content but never authorizes student writes. */
export async function activityAccess(
  lessonId: string,
  blockId: string,
  previewBlock?: Block,
) {
  const user = (await auth())?.user;
  if (!user?.id) throw new Error("Sign in to use this activity.");
  if (previewBlock) {
    if (user.role !== "INSTRUCTOR" && user.role !== "ADMIN")
      throw new Error("Teacher preview only.");
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
