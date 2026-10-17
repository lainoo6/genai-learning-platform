import { Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import {
  GeneratedCourseList,
  type GeneratedCourseItem,
} from "@/components/generate/generated-course-list";
import { GeneratorForm } from "@/components/generate/generator-form";
import { Skeleton } from "@/components/ui/skeleton";
import { auth } from "@/lib/auth";
import { listGeneratedCourses } from "@/lib/generated";

export const metadata: Metadata = {
  title: "Generate a course",
};

const DATE_FORMAT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

async function GenerateContent() {
  // Auth.js draws random bytes; keep it out of the prerender pass.
  await connection();
  const session = await auth();
  const user = session?.user;
  if (!user) {
    redirect(`/login?callbackUrl=${encodeURIComponent("/generate")}`);
  }

  const generated = await listGeneratedCourses(user.id);
  const history: GeneratedCourseItem[] = generated.map((course) => ({
    id: course.id,
    title: course.title,
    lessonCount: course.lessonCount,
    firstLessonId: course.firstLessonId,
    createdAt: DATE_FORMAT.format(course.createdAt),
  }));

  return (
    <div className="space-y-10">
      <header className="space-y-2">
        <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-primary">
          <Sparkles aria-hidden="true" className="size-3.5" />
          Self-service
        </p>
        <h1 className="text-2xl font-semibold">Generate a mini-course</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Type any topic. The generator writes a three-lesson course — reading,
          one interactive activity and a quiz in each lesson — enrols you in it
          and opens the first lesson. Generated courses stay private to your
          dashboard.
        </p>
      </header>

      <GeneratorForm />

      <section aria-labelledby="history-heading" className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-medium" id="history-heading">
            Your generated courses
          </h2>
          <Link
            className="text-xs text-muted-foreground hover:text-foreground"
            href="/dashboard"
          >
            Back to dashboard
          </Link>
        </div>

        {history.length === 0 ? (
          <p className="rounded-xl px-4 py-6 text-sm text-muted-foreground ring-1 ring-foreground/10">
            Nothing generated yet. Your first course will appear here, and only
            you will be able to see it.
          </p>
        ) : (
          <GeneratedCourseList courses={history} />
        )}
      </section>
    </div>
  );
}

export default function GeneratePage() {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">
      <Suspense
        fallback={
          <div className="space-y-4">
            <Skeleton className="h-16 w-2/3 rounded-xl" />
            <Skeleton className="h-64 w-full rounded-xl" />
          </div>
        }
      >
        <GenerateContent />
      </Suspense>
    </main>
  );
}
