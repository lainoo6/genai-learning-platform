"use server";

import { randomUUID } from "node:crypto";

import { Prisma } from "@prisma/client";
import { z } from "zod";

import { trackEvent } from "@/lib/analytics";
import { auth } from "@/lib/auth";
import { registerLlmMocks } from "@/lib/llm/mocks";
import { generateJson } from "@/lib/llm/provider";
import {
  learnerCoursePrompt,
  learnerCourseSchema,
} from "@/lib/llm/prompts/course";
import { prisma } from "@/lib/prisma";

/**
 * Learner self-service course generation (P4.7).
 *
 * One action does the whole job — generate, persist, enroll — so a failure
 * leaves nothing half-written and the browser can show one clear error with a
 * retry button. The generated course is PUBLISHED (the player only renders
 * published courses' enrolment flow) but its `source = LEARNER` keeps it out of
 * the catalog and out of every other learner's dashboard.
 */

export type GenerateCourseResult =
  | { ok: true; courseId: string; lessonId: string; title: string }
  | { ok: false; error: string };

const generateInputSchema = z.object({
  topic: z.string().trim().min(3).max(120),
  goal: z.string().trim().max(300).default(""),
});

type GenerateCourseInput = z.input<typeof generateInputSchema>;

const deleteInputSchema = z.string().min(1);

/** URL-safe stub of the topic plus a random suffix, so slugs never collide. */
function courseSlug(topic: string): string {
  const base = topic
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 40);

  return `${base.length > 0 ? base : "mini-course"}-${randomUUID().slice(0, 8)}`;
}

/** Generates one three-lesson mini-course, enrolls the learner and returns the first lesson. */
export async function generateLearnerCourse(
  input: GenerateCourseInput,
): Promise<GenerateCourseResult> {
  const parsedInput = generateInputSchema.safeParse(input);
  if (!parsedInput.success) {
    return {
      ok: false,
      error: "Give the course a topic of at least three characters.",
    };
  }

  const session = await auth();
  const userId = session?.user?.id;
  if (userId === undefined) {
    return { ok: false, error: "Sign in to generate a course." };
  }

  const { topic, goal } = parsedInput.data;

  registerLlmMocks();

  try {
    const generated = await generateJson(
      learnerCourseSchema,
      learnerCoursePrompt(topic, goal),
      {
        usage: "learner-course",
        userId,
        input: { topic, goal },
        temperature: 0.6,
      },
    );

    const course = await prisma.course.create({
      data: {
        slug: courseSlug(topic),
        title: `🎯 ${generated.title}`,
        description: generated.description,
        topic,
        audience: "Self-directed learners",
        difficulty: generated.difficulty,
        coverEmoji: "✨",
        status: "PUBLISHED",
        source: "LEARNER",
        createdById: userId,
        modules: {
          create: [
            {
              title: "Module 1 · The essentials",
              order: 0,
              lessons: {
                create: generated.lessons.map((lesson, index) => ({
                  title: lesson.title,
                  order: index,
                  estimatedMinutes: lesson.estimatedMinutes,
                  blocks: lesson.blocks as unknown as Prisma.InputJsonValue,
                })),
              },
            },
          ],
        },
      },
      select: {
        id: true,
        title: true,
        modules: {
          orderBy: { order: "asc" },
          select: {
            lessons: {
              orderBy: { order: "asc" },
              select: { id: true },
            },
          },
        },
      },
    });

    const firstLessonId = course.modules[0]?.lessons[0]?.id;
    if (firstLessonId === undefined) {
      await prisma.course.delete({ where: { id: course.id } });
      return { ok: false, error: "The generated course had no lessons. Try again." };
    }

    await prisma.enrollment.upsert({
      where: { userId_courseId: { userId, courseId: course.id } },
      update: {},
      create: { userId, courseId: course.id },
    });

    await trackEvent("GENERATE_COURSE", {
      userId,
      courseId: course.id,
      payload: { topic, goal, lessonCount: generated.lessons.length },
    });

    return {
      ok: true,
      courseId: course.id,
      lessonId: firstLessonId,
      title: course.title,
    };
  } catch (error: unknown) {
    console.error("[generate] course generation failed", error);
    return {
      ok: false,
      error:
        "The course could not be generated. Your topic is still here — try again in a moment.",
    };
  }
}

/** Deletes one of the caller's own generated courses (and its progress, by cascade). */
export async function deleteGeneratedCourse(
  courseId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsedInput = deleteInputSchema.safeParse(courseId);
  if (!parsedInput.success) {
    return { ok: false, error: "Invalid course." };
  }

  const session = await auth();
  const userId = session?.user?.id;
  if (userId === undefined) {
    return { ok: false, error: "Sign in to delete this course." };
  }

  const course = await prisma.course.findUnique({
    where: { id: parsedInput.data },
    select: { source: true, createdById: true },
  });

  if (course === null) {
    return { ok: false, error: "Course not found." };
  }

  if (course.source !== "LEARNER" || course.createdById !== userId) {
    return { ok: false, error: "You can only delete courses you generated." };
  }

  await prisma.course.delete({ where: { id: parsedInput.data } });

  return { ok: true };
}
