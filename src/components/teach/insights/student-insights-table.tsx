"use client";

import { ChevronRight } from "lucide-react";
import { Fragment, useState } from "react";

import { Progress } from "@/components/ui/progress";
import { useT } from "@/i18n/client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

/**
 * Per-student table on the insights page (P5.3).
 *
 * The name is a button: pressing it expands one extra row with that student's
 * lesson-by-lesson status. Dates and scores arrive as already formatted strings
 * from the server so the markup is identical on both sides of hydration.
 */

export type StudentInsightLessonView = {
  lessonId: string;
  title: string;
  moduleTitle: string;
  status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
  scoreLabel: string;
  completedBlocks: number;
  totalBlocks: number;
};

export type StudentInsightRow = {
  userId: string;
  name: string;
  email: string;
  completedLessons: number;
  totalLessons: number;
  completionPercent: number;
  quizAverageLabel: string;
  blocksCompleted: number;
  lastActiveLabel: string;
  lessons: StudentInsightLessonView[];
};

const STATUS_KEYS: Record<StudentInsightLessonView["status"], string> = {
  COMPLETED: "insights.status.completed",
  IN_PROGRESS: "insights.status.inProgress",
  NOT_STARTED: "insights.status.notStarted",
};

const STATUS_CLASS: Record<StudentInsightLessonView["status"], string> = {
  COMPLETED: "bg-emerald-500/10 text-emerald-700",
  IN_PROGRESS: "bg-blue-500/10 text-blue-700",
  NOT_STARTED: "bg-muted text-muted-foreground",
};

export function StudentInsightsTable({ students }: { students: StudentInsightRow[] }) {
  const t = useT();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function toggle(userId: string): void {
    setExpandedId((current) => (current === userId ? null : userId));
  }

  return (
    <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="pl-4">{t("insights.table.student")}</TableHead>
            <TableHead>{t("insights.table.progress")}</TableHead>
            <TableHead>{t("insights.table.quizAverage")}</TableHead>
            <TableHead>{t("insights.table.blocksDone")}</TableHead>
            <TableHead className="pr-4">{t("insights.table.lastActive")}</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {students.map((student) => {
            const expanded = expandedId === student.userId;

            return (
              <Fragment key={student.userId}>
                <TableRow data-state={expanded ? "selected" : undefined}>
                  <TableCell className="pl-4">
                    <button
                      aria-expanded={expanded}
                      className="flex items-start gap-1.5 text-left"
                      onClick={() => {
                        toggle(student.userId);
                      }}
                      type="button"
                    >
                      <ChevronRight
                        aria-hidden="true"
                        className={cn(
                          "mt-0.5 size-3.5 shrink-0 text-muted-foreground transition-transform",
                          expanded && "rotate-90",
                        )}
                      />
                      <span>
                        <span className="block font-medium text-foreground hover:underline">
                          {student.name}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {student.email}
                        </span>
                      </span>
                    </button>
                  </TableCell>

                  <TableCell>
                    <Progress
                      aria-label={t("students.roster.progressAria", {
                        name: student.name,
                      })}
                      className="w-44 items-center gap-2"
                      value={student.completionPercent}
                    >
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {student.completedLessons} / {student.totalLessons} ·{" "}
                        {student.completionPercent}%
                      </span>
                    </Progress>
                  </TableCell>

                  <TableCell className="text-sm tabular-nums">
                    {student.quizAverageLabel}
                  </TableCell>

                  <TableCell className="text-sm tabular-nums">
                    {student.blocksCompleted}
                  </TableCell>

                  <TableCell className="pr-4 text-sm text-muted-foreground">
                    {student.lastActiveLabel}
                  </TableCell>
                </TableRow>

                {expanded ? (
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableCell className="px-4 py-3" colSpan={5}>
                      <p className="text-xs font-medium">
                        {t("insights.table.breakdown", { name: student.name })}
                      </p>

                      {student.lessons.length === 0 ? (
                        <p className="mt-2 text-xs text-muted-foreground">
                          {t("insights.lessons.empty")}
                        </p>
                      ) : (
                        <div className="mt-2 overflow-hidden rounded-lg ring-1 ring-foreground/10">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b bg-background/60 text-left text-muted-foreground">
                                <th className="px-3 py-1.5 font-medium">
                                  {t("insights.table.lesson")}
                                </th>
                                <th className="px-3 py-1.5 font-medium">
                                  {t("insights.table.status")}
                                </th>
                                <th className="px-3 py-1.5 font-medium">
                                  {t("insights.table.blocks")}
                                </th>
                                <th className="px-3 py-1.5 font-medium">
                                  {t("insights.table.score")}
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {student.lessons.map((lesson) => (
                                <tr
                                  className="border-b last:border-b-0"
                                  key={lesson.lessonId}
                                >
                                  <td className="px-3 py-1.5">
                                    <span className="block text-foreground">
                                      {lesson.title}
                                    </span>
                                    <span className="block text-[11px] text-muted-foreground">
                                      {lesson.moduleTitle}
                                    </span>
                                  </td>
                                  <td className="px-3 py-1.5">
                                    <span
                                      className={cn(
                                        "inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium",
                                        STATUS_CLASS[lesson.status],
                                      )}
                                    >
                                      {t(STATUS_KEYS[lesson.status])}
                                    </span>
                                  </td>
                                  <td className="px-3 py-1.5 tabular-nums text-muted-foreground">
                                    {lesson.completedBlocks} / {lesson.totalBlocks}
                                  </td>
                                  <td className="px-3 py-1.5 tabular-nums text-muted-foreground">
                                    {lesson.scoreLabel}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ) : null}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
