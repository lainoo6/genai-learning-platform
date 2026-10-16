import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { auth } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Admin",
};

/** Placeholder admin surface. Server-side role check mirrors the middleware guard. */
async function AdminContent() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (session.user.role !== "ADMIN") {
    redirect("/");
  }

  return (
    <>
      <h1 className="text-2xl font-semibold">Admin overview</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Signed in as {session.user.email}. User and course management lands in a
        later task.
      </p>
    </>
  );
}

export default function AdminPage() {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">
      <Suspense fallback={<Skeleton className="h-40 w-full rounded-xl" />}>
        <AdminContent />
      </Suspense>
    </main>
  );
}
