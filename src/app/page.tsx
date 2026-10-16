import { Blocks, Sparkles, WandSparkles } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { buttonVariants } from "@/components/ui/button";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";

const FEATURES: ReadonlyArray<{
  icon: typeof Blocks;
  title: string;
  description: string;
}> = [
  {
    icon: Blocks,
    title: "Interactive courses",
    description:
      "Nine activity types per lesson: reading, quiz, flashcards, narrated slides, coding exercises, games, simulations, role-play and reflection.",
  },
  {
    icon: Sparkles,
    title: "AI personalisation",
    description:
      "A short onboarding survey, an always-available AI tutor and \"explain it for me\" rewrites adapt every lesson to your background.",
  },
  {
    icon: WandSparkles,
    title: "Instructor generation",
    description:
      "Describe a topic, review the AI draft and publish. Then track participation, quiz scores and export grades to CSV.",
  },
];

/** Reads the published catalogue per request; the page wraps it in Suspense. */
async function PublishedCourses() {
  await connection();

  const courses = await prisma.course.findMany({
    where: { status: "PUBLISHED" },
    orderBy: { createdAt: "desc" },
    take: 6,
    select: {
      slug: true,
      title: true,
      description: true,
      topic: true,
      difficulty: true,
      coverEmoji: true,
    },
  });

  if (courses.length === 0) {
    return (
      <Card className="w-full">
        <CardContent className="text-muted-foreground">
          No published mini-courses yet. The seeded placeholder course is still a
          draft — instructors can publish it from the teacher console.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {courses.map((course) => (
        // TODO(P2): link each card to /courses/[slug] once the detail page exists.
        <Card key={course.slug}>
          <CardHeader>
            <span aria-hidden="true" className="text-2xl">
              {course.coverEmoji}
            </span>
            <CardTitle>{course.title}</CardTitle>
            <CardDescription className="line-clamp-3">
              {course.description}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Badge variant="secondary">{course.topic}</Badge>
            <Badge variant="outline">{course.difficulty}</Badge>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function CoursePreviewSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Skeleton className="h-40 rounded-xl" />
      <Skeleton className="h-40 rounded-xl" />
      <Skeleton className="h-40 rounded-xl" />
    </div>
  );
}

export default function HomePage() {
  return (
    <div className="flex flex-1 flex-col">
      <section className="mx-auto w-full max-w-6xl px-4 py-16 text-center sm:py-24">
        <Badge variant="secondary" className="mb-5">
          Interactive · AI-personalised · Mini-courses
        </Badge>

        <h1 className="mx-auto max-w-3xl text-3xl font-semibold tracking-tight text-balance sm:text-5xl">
          Learn AI-assisted software development one interactive mini-course at a
          time.
        </h1>

        <p className="mx-auto mt-5 max-w-2xl text-base text-muted-foreground text-pretty sm:text-lg">
          Short, hands-on courses on software engineering, AI coding assistants and
          soft skills — adapted to your background by AI, authored in minutes by your
          instructors.
        </p>

        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/courses"
            className={cn(buttonVariants({ size: "lg" }), "w-full px-4 sm:w-auto")}
          >
            Browse courses
          </Link>
          <Link
            href="/teach"
            className={cn(
              buttonVariants({ variant: "outline", size: "lg" }),
              "w-full px-4 sm:w-auto",
            )}
          >
            Create a course
          </Link>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 pb-12">
        <div className="grid gap-4 md:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, description }) => (
            <Card key={title}>
              <CardHeader>
                <span className="mb-1 flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon aria-hidden="true" />
                </span>
                <CardTitle>{title}</CardTitle>
                <CardDescription>{description}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>

      <section
        id="courses"
        className="mx-auto w-full max-w-6xl px-4 pb-20"
        aria-labelledby="courses-heading"
      >
        <h2 id="courses-heading" className="text-xl font-semibold">
          Published mini-courses
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          A preview of the catalogue. More courses appear here as instructors publish
          them.
        </p>

        <div className="mt-6">
          <Suspense fallback={<CoursePreviewSkeleton />}>
            <PublishedCourses />
          </Suspense>
        </div>
      </section>
    </div>
  );
}
