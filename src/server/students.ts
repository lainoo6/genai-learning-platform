"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { MAX_IMPORT_BYTES } from "@/lib/csv";
import { prisma } from "@/lib/prisma";
import type { ImportStudentsResult } from "@/lib/students";
import { importStudentsFromCsv } from "@/server/student-import";

/**
 * Instructor actions for the student roster (P5.2).
 *
 * Both actions repeat the ownership check: the middleware only proves that the
 * caller is a teacher, not that this course belongs to them. Removing a student
 * deletes the enrolment only — the account and its lesson progress stay, so a
 * removed student can be imported again without losing work.
 */

export type StudentActionResult = { ok: true } | { ok: false; error: string };

const courseIdSchema = z.string().min(1).max(100);
const userIdSchema = z.string().min(1).max(100);

type OwnerGuard = { ok: true } | { ok: false; error: string };

async function requireCourseOwner(rawCourseId: string): Promise<OwnerGuard> {
  const parsedCourseId = courseIdSchema.safeParse(rawCourseId);
  if (!parsedCourseId.success) {
    return { ok: false, error: "This course could not be found." };
  }

  const session = await auth();
  const user = session?.user;

  if (user === undefined) {
    return { ok: false, error: "Sign in to manage students." };
  }

  if (user.role !== "INSTRUCTOR" && user.role !== "ADMIN") {
    return { ok: false, error: "Only instructors can manage students." };
  }

  const course = await prisma.course.findUnique({
    where: { id: parsedCourseId.data },
    select: { id: true, createdById: true },
  });

  if (course === null) {
    return { ok: false, error: "This course no longer exists." };
  }

  if (course.createdById !== user.id) {
    return {
      ok: false,
      error: "You can only manage students in courses you created.",
    };
  }

  return { ok: true };
}

/**
 * Imports a `name,email` CSV into the course.
 *
 * The file is validated here (size, extension) and parsed inside
 * `importStudentsFromCsv`; the returned credentials are the only copy of the
 * temporary passwords, so the panel must offer the download straight away.
 */
export async function importStudents(
  courseId: string,
  formData: FormData,
): Promise<ImportStudentsResult> {
  const guard = await requireCourseOwner(courseId);
  if (!guard.ok) {
    return { ok: false, error: guard.error };
  }

  if (!(formData instanceof FormData)) {
    return { ok: false, error: "Choose a CSV file to import." };
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { ok: false, error: "Choose a CSV file to import." };
  }

  if (!file.name.toLowerCase().endsWith(".csv")) {
    return { ok: false, error: "Upload a .csv file, not another file type." };
  }

  if (file.size === 0) {
    return { ok: false, error: "That file is empty." };
  }

  if (file.size > MAX_IMPORT_BYTES) {
    return {
      ok: false,
      error: "The file is larger than 1 MB. Split it into smaller files.",
    };
  }

  let text: string;
  try {
    text = await file.text();
  } catch (error: unknown) {
    console.error("[students] failed to read the uploaded file", error);
    return {
      ok: false,
      error: "That file could not be read. Save it as UTF-8 CSV and try again.",
    };
  }

  const result = await importStudentsFromCsv(courseId, text);

  if (result.ok) {
    revalidatePath(`/teach/courses/${courseId}/students`);
  }

  return result;
}

/** Removes one enrolment; the learner account and its progress are kept. */
export async function removeStudent(
  courseId: string,
  userId: string,
): Promise<StudentActionResult> {
  const guard = await requireCourseOwner(courseId);
  if (!guard.ok) {
    return { ok: false, error: guard.error };
  }

  if (!userIdSchema.safeParse(userId).success) {
    return { ok: false, error: "That student could not be found." };
  }

  const removed = await prisma.enrollment.deleteMany({
    where: { courseId, userId },
  });

  if (removed.count === 0) {
    return { ok: false, error: "That student is not enrolled in this course." };
  }

  revalidatePath(`/teach/courses/${courseId}/students`);
  return { ok: true };
}
