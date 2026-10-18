import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { CourseWizard } from "@/components/teach/course-wizard";
import { Skeleton } from "@/components/ui/skeleton";
import { auth } from "@/lib/auth";
import { isMockMode } from "@/lib/llm/provider";

export const metadata: Metadata = {
  title: "New course",
};

/**
 * Hosts the four-step wizard (P4.6).
 *
 * The page only checks the role and reads the LLM mode; all of the wizard's
 * work happens in the client component, because the draft exists only in the
 * browser until the instructor saves it.
 */
async function NewCourseContent() {
  // Auth.js draws random bytes; keep it out of the prerender pass.
  await connection();
  const session = await auth();
  const user = session?.user;

  if (!user) {
    redirect(
      `/login?callbackUrl=${encodeURIComponent("/teach/courses/new")}`,
    );
  }

  if (user.role !== "INSTRUCTOR" && user.role !== "ADMIN") {
    redirect("/");
  }

  return <CourseWizard mockMode={isMockMode()} />;
}

export default function NewCoursePage() {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">
      <Suspense
        fallback={
          <div className="space-y-4">
            <Skeleton className="h-24 w-2/3 rounded-xl" />
            <Skeleton className="h-64 w-full rounded-xl" />
          </div>
        }
      >
        <NewCourseContent />
      </Suspense>
    </main>
  );
}
