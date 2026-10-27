"use server";

import { Prisma } from "@prisma/client";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getI18n } from "@/i18n/server";
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
  const { t } = await getI18n();
  const parsedInput = enrollSchema.safeParse({ courseId });
  if (!parsedInput.success) {
    return { ok: false, error: t("server.course.invalid") };
  }

  const course = await getCourseById(courseId);
  if (course === null) {
    return { ok: false, error: t("server.course.notFound") };
  }

  const session = await auth();
  const userId = session?.user?.id;
  if (userId === undefined) {
    return {
      ok: false,
      error: t("server.course.signInToEnroll"),
      loginUrl: `/login?callbackUrl=${encodeURIComponent(`/courses/${course.slug}`)}`,
    };
  }

  // Teachers never enroll: doing so would create a learner record with 0%
  // progress and make the course look started on their dashboard. Preview mode
  // is the read-only path instead.
  if (session?.user?.role === "INSTRUCTOR") {
    return { ok: false, error: t("server.course.instructorCannotEnroll") };
  }

  if (course.status !== "PUBLISHED") {
    return { ok: false, error: t("server.course.notOpen") };
  }

  const lesson = firstLesson(course);
  if (lesson === undefined) {
    return { ok: false, error: t("server.course.noLessons") };
  }

  try {
    await prisma.enrollment.create({ data: { userId, courseId } });
  } catch (error: unknown) {
    const isDuplicate =
      error instanceof Prisma.PrismaClientKnownRequestError
      && error.code === "P2002";
    if (!isDuplicate) {
      console.error("[enroll] failed", error);
      return { ok: false, error: t("server.course.enrollFailed") };
    }
  }

  await trackEvent("ENROLL", {
    userId,
    courseId,
    payload: { courseSlug: course.slug },
  });

  redirect(`/learn/${course.id}/${lesson.id}`);
}
