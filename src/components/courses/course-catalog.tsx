"use client";

import { BookOpen, Check, Clock, Search } from "lucide-react";
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
  difficultyLabel: string;
  lessonCount: number;
  minutes: number;
  blockTypes: string[];
  enrolled: boolean;
};

const DIFFICULTY_FILTERS = [
  { value: "all", label: "All levels" },
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
] as const;

/**
 * Catalog list with client-side search and difficulty filtering.
 *
 * The whole catalog is small enough to send in one payload, so filtering runs
 * locally and applies as the learner types — no round trip per keystroke.
 */
export function CourseCatalog({ courses }: { courses: CourseCardData[] }) {
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
            aria-label="Search courses"
            className="pl-8"
            onChange={(event) => {
              setQuery(event.target.value);
            }}
            placeholder="Search by title or description"
            type="search"
            value={query}
          />
        </div>

        <div aria-label="Filter by difficulty" className="flex flex-wrap gap-1.5">
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
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <p aria-live="polite" className="text-xs text-muted-foreground">
        {visible.length} of {courses.length} courses
      </p>

      {visible.length === 0 ? (
        <Card className="items-center py-10 text-center">
          <CardContent className="text-sm text-muted-foreground">
            No course matches this search. Try a shorter keyword or another level.
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
                  <Badge variant="secondary">{course.difficultyLabel}</Badge>
                  <Badge variant="outline">{course.audience}</Badge>
                  <Badge variant="outline">{course.sourceLabel}</Badge>
                  {course.enrolled ? (
                    <Badge className="gap-1">
                      <Check aria-hidden="true" />
                      Enrolled
                    </Badge>
                  ) : null}
                </CardContent>

                <CardFooter className="flex-col items-start gap-2">
                  <p className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <BookOpen aria-hidden="true" className="size-3.5" />
                      {course.lessonCount} lessons
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock aria-hidden="true" className="size-3.5" />
                      ~{course.minutes} min
                    </span>
                  </p>
                  <p className="flex flex-wrap gap-1.5">
                    {course.blockTypes.map((type) => {
                      const { icon: Icon, label } = blockMetaFor(type);
                      return (
                        <span
                          className="flex items-center gap-1 text-xs text-muted-foreground"
                          key={type}
                        >
                          <Icon aria-hidden="true" className="size-3.5" />
                          {label}
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
