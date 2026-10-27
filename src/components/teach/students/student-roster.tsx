import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { getI18n } from "@/i18n/server";
import { completionPercent, type CourseStudent } from "@/lib/students";

import { RemoveStudentButton } from "./remove-student-button";

/**
 * Roster table for `/teach/courses/[id]/students` (P5.2).
 *
 * Server rendered: the numbers come straight from the read model, and the only
 * client island is the remove button with its confirmation dialog.
 */

const DATE_FORMAT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const DATE_TIME_FORMAT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

type StudentRosterProps = {
  courseId: string;
  students: CourseStudent[];
};

export async function StudentRoster({ courseId, students }: StudentRosterProps) {
  const { t } = await getI18n();

  return (
    <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="pl-4">{t("students.roster.student")}</TableHead>
            <TableHead>{t("students.roster.joined")}</TableHead>
            <TableHead>{t("students.roster.progress")}</TableHead>
            <TableHead>{t("students.roster.quizAverage")}</TableHead>
            <TableHead>{t("students.roster.lastActive")}</TableHead>
            <TableHead className="pr-4 text-right">
              <span className="sr-only">{t("students.roster.actions")}</span>
            </TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {students.map((student) => {
            const percent = completionPercent(student);

            return (
              <TableRow key={student.userId}>
                <TableCell className="pl-4">
                  <p className="font-medium text-foreground">{student.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {student.email}
                  </p>
                </TableCell>

                <TableCell className="text-sm text-muted-foreground">
                  {DATE_FORMAT.format(student.joinedAt)}
                </TableCell>

                <TableCell>
                  <Progress
                    aria-label={t("students.roster.progressAria", {
                      name: student.name,
                    })}
                    className="w-44 items-center gap-2"
                    value={percent}
                  >
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {student.completedLessons} / {student.totalLessons} ·{" "}
                      {percent}%
                    </span>
                  </Progress>
                </TableCell>

                <TableCell className="text-sm tabular-nums">
                  {student.quizAverage === null
                    ? "—"
                    : `${Math.round(student.quizAverage * 100)}%`}
                </TableCell>

                <TableCell className="text-sm text-muted-foreground">
                  {student.lastActiveAt === null
                    ? "—"
                    : DATE_TIME_FORMAT.format(student.lastActiveAt)}
                </TableCell>

                <TableCell className="pr-4 text-right">
                  <RemoveStudentButton
                    courseId={courseId}
                    name={student.name}
                    userId={student.userId}
                  />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
