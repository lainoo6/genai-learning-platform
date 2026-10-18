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
import { COURSE_SOURCE_LABELS, type AdminCourseRow } from "@/lib/admin";
import { COURSE_STATUS_LABELS } from "@/lib/teach";

import { CourseStatusButton } from "./course-status-button";

/**
 * Every course on the platform, for moderation (P5.4).
 *
 * Unlike `/teach`, this list includes drafts and learner-generated courses —
 * the point of the tab is to see what the public catalog hides.
 */

const DATE_FORMAT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const STATUS_BADGE_VARIANT: Record<
  CourseStatus,
  "default" | "secondary" | "outline"
> = {
  PUBLISHED: "default",
  DRAFT: "secondary",
  ARCHIVED: "outline",
};

export function CourseTable({ courses }: { courses: AdminCourseRow[] }) {
  return (
    <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="pl-4">Course</TableHead>
            <TableHead>Creator</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Source</TableHead>
            <TableHead className="text-right">Students</TableHead>
            <TableHead className="text-right">Lessons</TableHead>
            <TableHead>Updated</TableHead>
            <TableHead className="pr-4 text-right">
              <span className="sr-only">Actions</span>
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
                  {COURSE_STATUS_LABELS[course.status]}
                </Badge>
              </TableCell>

              <TableCell className="text-sm text-muted-foreground">
                {COURSE_SOURCE_LABELS[course.source]}
              </TableCell>

              <TableCell className="text-right text-sm tabular-nums">
                {course.studentCount}
              </TableCell>

              <TableCell className="text-right text-sm tabular-nums">
                {course.lessonCount}
              </TableCell>

              <TableCell className="text-sm text-muted-foreground">
                {DATE_FORMAT.format(course.updatedAt)}
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
