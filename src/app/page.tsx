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
import { getI18n } from "@/i18n/server";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";

const FEATURES: ReadonlyArray<{
  icon: typeof Blocks;
  titleKey: string;
  descriptionKey: string;
}> = [
  {
    icon: Blocks,
    titleKey: "home.feature.interactive.title",
    descriptionKey: "home.feature.interactive.description",
  },
  {
    icon: Sparkles,
    titleKey: "home.feature.ai.title",
    descriptionKey: "home.feature.ai.description",
  },
  {
    icon: WandSparkles,
    titleKey: "home.feature.generation.title",
    descriptionKey: "home.feature.generation.description",
  },
];

/** Reads the published catalogue per request; the page wraps it in Suspense. */
async function PublishedCourses() {
  await connection();

  const [courses, { t }] = await Promise.all([
    prisma.course.findMany({
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
    }),
    getI18n(),
  ]);

  if (courses.length === 0) {
    return (
      <Card className="w-full">
        <CardContent className="text-muted-foreground">
          {t("home.published.empty")}
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

export default async function HomePage() {
  const { t } = await getI18n();

  return (
    <div className="flex flex-1 flex-col">
      <section className="mx-auto w-full max-w-6xl px-4 py-16 text-center sm:py-24">
        <Badge variant="secondary" className="mb-5">
          {t("home.badge")}
        </Badge>

        <h1 className="mx-auto max-w-3xl text-3xl font-semibold tracking-tight text-balance sm:text-5xl">
          {t("home.title")}
        </h1>

        <p className="mx-auto mt-5 max-w-2xl text-base text-muted-foreground text-pretty sm:text-lg">
          {t("home.subtitle")}
        </p>

        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/courses"
            className={cn(buttonVariants({ size: "lg" }), "w-full px-4 sm:w-auto")}
          >
            {t("home.cta.browse")}
          </Link>
          <Link
            href="/teach"
            className={cn(
              buttonVariants({ variant: "outline", size: "lg" }),
              "w-full px-4 sm:w-auto",
            )}
          >
            {t("home.cta.create")}
          </Link>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 pb-12">
        <div className="grid gap-4 md:grid-cols-3">
          {FEATURES.map(({ icon: Icon, titleKey, descriptionKey }) => (
            <Card key={titleKey}>
              <CardHeader>
                <span className="mb-1 flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon aria-hidden="true" />
                </span>
                <CardTitle>{t(titleKey)}</CardTitle>
                <CardDescription>{t(descriptionKey)}</CardDescription>
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
          {t("home.published.title")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("home.published.subtitle")}
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
