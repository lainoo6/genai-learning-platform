"use server";

import { Prisma } from "@prisma/client";
import { redirect } from "next/navigation";
import { z } from "zod";

import { trackEvent } from "@/lib/analytics";
import { auth } from "@/lib/auth";
import { firstLesson, getCourseById } from "@/lib/courses";
import { prisma } from "@/lib/prisma";

/** Result returned to the enroll button; `loginUrl` asks the client to redirect. */
export type EnrollResult =
  | { ok: true }
  | { ok: false; error: string; loginUrl?: string };

const enrollSchema = z.object({
  courseId: z.string().min(1),
});

/**
 * Enrol the signed-in user in a published course and open its first lesson.
 *
 * Re-enrollment is not an error: the `@@unique([userId, courseId])` constraint
 * is caught (P2002) and treated as "already enrolled", so pressing Enroll twice
 * behaves like pressing Continue.
 */
export async function enroll(courseId: string): Promise<EnrollResult> {
  const parsedInput = enrollSchema.safeParse({ courseId });
  if (!parsedInput.success) {
    return { ok: false, error: "Invalid course." };
  }

  const course = await getCourseById(courseId);
  if (course === null) {
    return { ok: false, error: "Course not found." };
  }

  const session = await auth();
  const userId = session?.user?.id;
  if (userId === undefined) {
    return {
      ok: false,
      error: "Sign in to enroll in this course.",
      loginUrl: `/login?callbackUrl=${encodeURIComponent(`/courses/${course.slug}`)}`,
    };
  }

  if (course.status !== "PUBLISHED") {
    return { ok: false, error: "This course is not open for enrollment." };
  }

  const lesson = firstLesson(course);
  if (lesson === undefined) {
    return { ok: false, error: "This course has no lessons yet." };
  }

  try {
    await prisma.enrollment.create({ data: { userId, courseId } });
  } catch (error: unknown) {
    const isDuplicate =
      error instanceof Prisma.PrismaClientKnownRequestError
      && error.code === "P2002";
    if (!isDuplicate) {
      console.error("[enroll] failed", error);
      return { ok: false, error: "Could not enroll. Please try again." };
    }
  }

  await trackEvent("ENROLL", {
    userId,
    courseId,
    payload: { courseSlug: course.slug },
  });

  redirect(`/learn/${course.id}/${lesson.id}`);
}
