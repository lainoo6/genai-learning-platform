"use client";

import { BookOpen, Check, Clock, Search, Star } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useT } from "@/i18n/client";
import { blockMetaFor } from "@/lib/blocks/meta";
import { cn } from "@/lib/utils";

/** Course data rendered by the catalog; prepared server-side per visit. */
export type CourseCardData = {
  id: string;
  slug: string;
  title: string;
  description: string;
  topic: string;
  audience: string;
  difficulty: string;
  coverEmoji: string;
  sourceLabel: string;
  /** Staff pick; independent of `sourceLabel`, so both badges can show. */
  curated: boolean;
  difficultyLabel: string;
  languageLabel: string;
  lessonCount: number;
  minutes: number;
  blockTypes: string[];
  enrolled: boolean;
};

const DIFFICULTY_FILTERS = [
  { value: "all", labelKey: "courses.filter.all" },
  { value: "beginner", labelKey: "courses.filter.beginner" },
  { value: "intermediate", labelKey: "courses.filter.intermediate" },
  { value: "advanced", labelKey: "courses.filter.advanced" },
] as const;

/**
 * Catalog list with client-side search and difficulty filtering.
 *
 * The whole catalog is small enough to send in one payload, so filtering runs
 * locally and applies as the learner types — no round trip per keystroke.
 */
export function CourseCatalog({ courses }: { courses: CourseCardData[] }) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [difficulty, setDifficulty] = useState<string>("all");

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return courses.filter((course) => {
      const matchesDifficulty =
        difficulty === "all" || course.difficulty === difficulty;
      if (!matchesDifficulty) {
        return false;
      }
      if (needle.length === 0) {
        return true;
      }

      return (
        course.title.toLowerCase().includes(needle)
        || course.description.toLowerCase().includes(needle)
      );
    });
  }, [courses, difficulty, query]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            aria-label={t("courses.search.label")}
            className="pl-8"
            onChange={(event) => {
              setQuery(event.target.value);
            }}
            placeholder={t("courses.search.placeholder")}
            type="search"
            value={query}
          />
        </div>

        <div aria-label={t("courses.filter.label")} className="flex flex-wrap gap-1.5">
          {DIFFICULTY_FILTERS.map((option) => (
            <button
              className={cn(
                "rounded-full px-3 py-1 text-xs ring-1 transition-colors",
                difficulty === option.value
                  ? "bg-primary text-primary-foreground ring-primary"
                  : "text-muted-foreground ring-foreground/15 hover:bg-muted",
              )}
              key={option.value}
              onClick={() => {
                setDifficulty(option.value);
              }}
              type="button"
            >
              {t(option.labelKey)}
            </button>
          ))}
        </div>
      </div>

      <p aria-live="polite" className="text-xs text-muted-foreground">
        {t("courses.count", { visible: visible.length, total: courses.length })}
      </p>

      {visible.length === 0 ? (
        <Card className="items-center py-10 text-center">
          <CardContent className="text-sm text-muted-foreground">
            {t("courses.empty")}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((course) => (
            <Link
              className="block h-full rounded-xl focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              href={`/courses/${course.slug}`}
              key={course.id}
            >
              <Card className="h-full transition-shadow hover:shadow-md">
                <CardHeader>
                  <span aria-hidden="true" className="text-3xl">
                    {course.coverEmoji}
                  </span>
                  <CardTitle className="mt-1">{course.title}</CardTitle>
                  <CardDescription className="line-clamp-3">
                    {course.description}
                  </CardDescription>
                </CardHeader>

                <CardContent className="flex flex-wrap items-center gap-1.5">
                  {course.curated ? (
                    <Badge className="gap-1">
                      <Star aria-hidden="true" />
                      {t("courses.badge.curated")}
                    </Badge>
                  ) : null}
                  <Badge variant="secondary">{course.difficultyLabel}</Badge>
                  <Badge variant="outline">{course.audience}</Badge>
                  <Badge variant="outline">{course.sourceLabel}</Badge>
                  <Badge variant="outline">{course.languageLabel}</Badge>
                  {course.enrolled ? (
                    <Badge className="gap-1">
                      <Check aria-hidden="true" />
                      {t("courses.badge.enrolled")}
                    </Badge>
                  ) : null}
                </CardContent>

                <CardFooter className="flex-col items-start gap-2">
                  <p className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <BookOpen aria-hidden="true" className="size-3.5" />
                      {t("courses.card.lessons", { count: course.lessonCount })}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock aria-hidden="true" className="size-3.5" />
                      {t("courses.card.minutes", { count: course.minutes })}
                    </span>
                  </p>
                  <p className="flex flex-wrap gap-1.5">
                    {course.blockTypes.map((type) => {
                      const { icon: Icon, labelKey } = blockMetaFor(type);
                      return (
                        <span
                          className="flex items-center gap-1 text-xs text-muted-foreground"
                          key={type}
                        >
                          <Icon aria-hidden="true" className="size-3.5" />
                          {t(labelKey)}
                        </span>
                      );
                    })}
                  </p>
                </CardFooter>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
