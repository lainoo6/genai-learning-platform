"use server";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isRobotCourse, ROBOT_COURSE_TOPIC, robotCourseDraftSchema, type RobotCourseDraft } from "@/lib/programming-game/robot-course";
import { courseProgrammingPayloadSchema, isParallelProgramming } from "@/lib/programming-game/course-config";

export async function saveRobotCourse(courseId: string | null, input: unknown, removedLessonIds: unknown = []) {
  let language: "zh" | "en" = "en";
  try {
    const user = (await auth())?.user;
    if (!user || (user.role !== "INSTRUCTOR" && user.role !== "ADMIN")) throw new Error("Teacher access required.");
    const p = robotCourseDraftSchema.parse(input);
    language = p.language;
    const removed = z.array(z.string().uuid()).max(20).parse(removedLessonIds);
    if (new Set(removed).size !== removed.length || (!courseId && removed.length)) throw new Error("Invalid removed level IDs.");
    const historyError = p.language === "zh" ? "无法删除已有学习记录的关卡，请恢复被删除的关卡后保存。" : "Cannot delete levels with learning records. Restore the removed levels before saving.";
    const saved = await prisma.$transaction(async (tx) => {
      if (!courseId) {
        const prior = await tx.course.findUnique({ where: { id: p.draftId } });
        if (prior) {
          if (prior.createdById !== user.id || !isRobotCourse(prior)) throw new Error("Game course not owned by you.");
          return { courseId: prior.id, updatedAt: prior.updatedAt.toISOString() };
        }
        const course = await tx.course.create({ data: {
          id: p.draftId, slug: `robot-game-${randomUUID()}`, topic: ROBOT_COURSE_TOPIC, title: p.title, description: p.description, language: p.language,
          audience: "All learners", difficulty: "beginner", coverEmoji: "🤖", source: "INSTRUCTOR", status: p.status, createdById: user.id,
          modules: { create: { title: p.title, order: 0, lessons: { create: p.levels.map((l, i) => ({ id: l.lessonId, title: l.title, order: i, estimatedMinutes: 10,
            blocks: JSON.parse(JSON.stringify([{ id: l.blockId, type: "game", title: l.title, payload: l.payload }])) as Prisma.InputJsonValue })) } } },
        } }); return { courseId: course.id, updatedAt: course.updatedAt.toISOString() };
      }
      if (p.draftId !== courseId) throw new Error("Course identity changed.");
      const existing = await tx.course.findUnique({ where: { id: courseId }, include: { modules: { include: { lessons: true } } } });
      if (!existing || existing.createdById !== user.id || !isRobotCourse(existing) || existing.modules.length !== 1) throw new Error("Game course not found or not owned by you.");
      if (!p.updatedAt || existing.updatedAt.toISOString() !== p.updatedAt) throw new Error("Course changed. Reload before saving.");
      const courseModule = existing.modules[0], submitted = new Map(p.levels.map((l) => [l.lessonId, l]));
      const omitted = courseModule.lessons.filter((l) => !submitted.has(l.id)).map((l) => l.id);
      if (omitted.length !== removed.length || !omitted.every((id) => removed.includes(id))) throw new Error("Confirm the exact levels to remove.");
      // Preserve every retained identity; removing a level is explicit and history-free only.
      for (const old of courseModule.lessons) {
        const next = submitted.get(old.id), blocks = old.blocks as { id: string }[];
        if (!next) continue;
        if (!Array.isArray(blocks) || blocks.length !== 1 || blocks[0].id !== next.blockId) throw new Error("Keep existing level and block IDs.");
      }
      const protectedRelations = { progress: { none: {} }, activityAttempts: { none: {} }, playthroughs: { none: {} }, gameActivityVersions: { none: {} }, feedback: { none: {} } };
      if (removed.length) {
        const eligible = await tx.lesson.count({ where: { id: { in: removed }, moduleId: courseModule.id, ...protectedRelations } });
        const overrides = await tx.userBlockOverride.count({ where: { lessonId: { in: removed } } });
        if (eligible !== removed.length || overrides) throw new Error(historyError);
      }
      const updated = await tx.course.updateMany({ where: { id: courseId, createdById: user.id, updatedAt: new Date(p.updatedAt) }, data: { title: p.title, description: p.description, language: p.language, status: p.status } });
      if (updated.count !== 1) throw new Error("Course changed. Reload before saving.");
      if (removed.length) {
        const deleted = await tx.lesson.deleteMany({ where: { id: { in: removed }, moduleId: courseModule.id, ...protectedRelations } });
        if (deleted.count !== removed.length) throw new Error(historyError);
      }
      const oldLevels = new Map(courseModule.lessons.map((l) => [l.id, l]));
      for (const [i, l] of p.levels.entries()) {
        const data = { title: l.title, order: i, blocks: JSON.parse(JSON.stringify([{ id: l.blockId, type: "game", title: l.title, payload: l.payload }])) as Prisma.InputJsonValue };
        const old = oldLevels.get(l.lessonId);
        if (old) {
          // PostgreSQL JSONB may reorder object keys; compare JSON values, not serialization.
          if (old.title !== data.title || old.order !== i || !isDeepStrictEqual(old.blocks, data.blocks))
            await tx.lesson.update({ where: { id: l.lessonId }, data });
        } else await tx.lesson.create({ data: { id: l.lessonId, moduleId: courseModule.id, estimatedMinutes: 10, ...data } });
      }
      const stamp = await tx.course.findUniqueOrThrow({ where: { id: courseId }, select: { updatedAt: true } });
      return { courseId, updatedAt: stamp.updatedAt.toISOString() };
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      // A 20-level update can exceed Prisma's default 5s interactive transaction.
      // Keep the total wait/run budget below the editor's 30s request timeout.
      maxWait: 5000, timeout: 20000,
    });
    return { ok: true as const, ...saved };
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && e.code === "P2028") return { ok: false as const, error: language === "zh"
      ? "数据库事务已失效或超时，本次保存未确认成功。请保留当前编辑内容，检查数据库连接后重试；若提示版本冲突，请先导出当前课程，再刷新核对。"
      : "The database transaction expired or closed. Saving was not confirmed. Keep your edits, check the database connection and retry. If a version conflict appears, export the course before reloading." };
    return { ok: false as const, error: e instanceof Error ? e.message : "Could not save course." };
  }
}

export async function loadRobotCourseDraft(courseId: string): Promise<{ courseId: string; draft: RobotCourseDraft } | null> {
  const user = (await auth())?.user;
  if (!user || (user.role !== "INSTRUCTOR" && user.role !== "ADMIN")) return null;
  const course = await prisma.course.findUnique({ where: { id: courseId }, include: { modules: { orderBy: { order: "asc" }, include: { lessons: { orderBy: { order: "asc" } } } } } });
  if (!course || course.createdById !== user.id || !isRobotCourse(course)) return null;
  const levels = course.modules.flatMap((m) => m.lessons.map((l) => {
    const blocks = l.blocks as { id: string; payload: unknown }[];
    if (!Array.isArray(blocks) || blocks.length !== 1) throw new Error("Invalid game course level.");
    const payload = courseProgrammingPayloadSchema.parse(blocks[0].payload);
    if (!isParallelProgramming(payload)) throw new Error("Unsupported game course rules.");
    return { lessonId: l.id, blockId: blocks[0].id, title: l.title, payload };
  }));
  return { courseId, draft: robotCourseDraftSchema.parse({ draftId: course.id, title: course.title, description: course.description, language: course.language, status: course.status, updatedAt: course.updatedAt.toISOString(), levels }) };
}
