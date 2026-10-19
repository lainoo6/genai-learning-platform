"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getI18n } from "@/i18n/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Admin actions (P5.4).
 *
 * The middleware already refuses `/admin` to non-admins, but a Server Action is
 * an independently addressable endpoint, so every action repeats the role check
 * here. Role changes are additionally refused on the caller's own account: an
 * admin who demotes themselves would lose the console and could not undo it.
 */

export type AdminActionResult = { ok: true } | { ok: false; error: string };

const idSchema = z.string().trim().min(1).max(100);
const roleSchema = z.enum(["LEARNER", "INSTRUCTOR", "ADMIN"]);
const courseStatusSchema = z.enum(["PUBLISHED", "ARCHIVED"]);

/** Returns the admin's user id, or null when the caller is not an admin. */
async function requireAdminId(): Promise<string | null> {
  const session = await auth();
  const user = session?.user;

  if (user === undefined || user.role !== "ADMIN") {
    return null;
  }

  return user.id;
}

/**
 * Changes a user's role.
 *
 * Sessions are JWT based, so the affected user sees the new role after their
 * next sign-in; the console tells the admin so in the confirmation dialog.
 */
export async function updateUserRole(
  userId: string,
  role: string,
): Promise<AdminActionResult> {
  const { t } = await getI18n();
  const adminId = await requireAdminId();
  if (adminId === null) {
    return { ok: false, error: t("server.admin.roleForbidden") };
  }

  const parsedUserId = idSchema.safeParse(userId);
  const parsedRole = roleSchema.safeParse(role);

  if (!parsedUserId.success || !parsedRole.success) {
    return { ok: false, error: t("server.admin.roleInvalid") };
  }

  if (parsedUserId.data === adminId) {
    return {
      ok: false,
      error: t("server.admin.selfRole"),
    };
  }

  const updated = await prisma.user.updateMany({
    where: { id: parsedUserId.data },
    data: { role: parsedRole.data },
  });

  if (updated.count === 0) {
    return { ok: false, error: t("server.admin.userMissing") };
  }

  revalidatePath("/admin");
  return { ok: true };
}

/**
 * Publishes or archives a course.
 *
 * Archiving is the admin's "take down": the course disappears from the public
 * catalog but keeps its enrollments and progress. Restoring always publishes,
 * because the previous status is not stored.
 */
export async function setCourseStatus(
  courseId: string,
  status: string,
): Promise<AdminActionResult> {
  const { t } = await getI18n();
  const adminId = await requireAdminId();
  if (adminId === null) {
    return { ok: false, error: t("server.admin.courseForbidden") };
  }

  const parsedCourseId = idSchema.safeParse(courseId);
  const parsedStatus = courseStatusSchema.safeParse(status);

  if (!parsedCourseId.success || !parsedStatus.success) {
    return { ok: false, error: t("server.admin.courseInvalid") };
  }

  const updated = await prisma.course.updateMany({
    where: { id: parsedCourseId.data },
    data: { status: parsedStatus.data },
  });

  if (updated.count === 0) {
    return { ok: false, error: t("server.admin.courseMissing") };
  }

  revalidatePath("/admin");
  revalidatePath("/courses");
  revalidatePath("/teach");
  return { ok: true };
}
