import type { CourseStatus } from "@prisma/client";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getI18n } from "@/i18n/server";
import { COURSE_SOURCE_KEYS, type AdminCourseRow } from "@/lib/admin";
import { EDITOR_STATUS_KEYS } from "@/lib/teach-editor";

import { CourseCuratedButton } from "./course-curated-button";
import { CourseStatusButton } from "./course-status-button";

/**
 * Every course on the platform, for moderation (P5.4).
 *
 * Unlike `/teach`, this list includes drafts and learner-generated courses —
 * the point of the tab is to see what the public catalog hides.
 */

const STATUS_BADGE_VARIANT: Record<
  CourseStatus,
  "default" | "secondary" | "outline"
> = {
  PUBLISHED: "default",
  DRAFT: "secondary",
  ARCHIVED: "outline",
};

export async function CourseTable({ courses }: { courses: AdminCourseRow[] }) {
  const { locale, t } = await getI18n();
  const dateFormat = new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="pl-4">{t("admin.table.course")}</TableHead>
            <TableHead>{t("admin.table.creator")}</TableHead>
            <TableHead>{t("admin.table.status")}</TableHead>
            <TableHead>{t("admin.table.source")}</TableHead>
            <TableHead>{t("admin.table.curated")}</TableHead>
            <TableHead className="text-right">
              {t("admin.table.students")}
            </TableHead>
            <TableHead className="text-right">
              {t("admin.table.lessons")}
            </TableHead>
            <TableHead>{t("admin.table.updated")}</TableHead>
            <TableHead className="pr-4 text-right">
              <span className="sr-only">{t("admin.table.actions")}</span>
            </TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {courses.map((course) => (
            <TableRow key={course.id}>
              <TableCell className="pl-4">
                <p className="flex items-start gap-2 font-medium text-foreground">
                  <span aria-hidden="true">{course.coverEmoji}</span>
                  <span>
                    <span className="block">{course.title}</span>
                    <span className="block text-xs font-normal text-muted-foreground">
                      {course.slug}
                    </span>
                  </span>
                </p>
              </TableCell>

              <TableCell>
                <p className="text-sm">{course.creatorName}</p>
                <p className="text-xs text-muted-foreground">
                  {course.creatorEmail}
                </p>
              </TableCell>

              <TableCell>
                <Badge variant={STATUS_BADGE_VARIANT[course.status]}>
                  {t(EDITOR_STATUS_KEYS[course.status])}
                </Badge>
              </TableCell>

              <TableCell className="text-sm text-muted-foreground">
                {t(COURSE_SOURCE_KEYS[course.source])}
              </TableCell>

              <TableCell>
                <CourseCuratedButton
                  courseId={course.id}
                  isCurated={course.isCurated}
                />
              </TableCell>

              <TableCell className="text-right text-sm tabular-nums">
                {course.studentCount}
              </TableCell>

              <TableCell className="text-right text-sm tabular-nums">
                {course.lessonCount}
              </TableCell>

              <TableCell className="text-sm text-muted-foreground">
                {dateFormat.format(course.updatedAt)}
              </TableCell>

              <TableCell className="pr-4 text-right">
                <CourseStatusButton
                  courseId={course.id}
                  nextStatus={
                    course.status === "ARCHIVED" ? "PUBLISHED" : "ARCHIVED"
                  }
                  title={course.title}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
