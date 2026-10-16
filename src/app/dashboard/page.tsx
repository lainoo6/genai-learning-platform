import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { auth } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Dashboard",
};

/**
 * Placeholder dashboard. It exists so the middleware route guard (and the role
 * guard on /admin) can be exercised; the real content lands in later tasks.
 */
async function DashboardContent() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <>
      <h1 className="text-2xl font-semibold">Welcome, {session.user.name}</h1>
      <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
        Signed in as {session.user.email}
        <Badge variant="secondary">{session.user.role}</Badge>
      </p>
      <p className="mt-6 text-sm text-muted-foreground">
        Your enrolled mini-courses and progress will appear here.
      </p>
    </>
  );
}

export default function DashboardPage() {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">
      <Suspense fallback={<Skeleton className="h-40 w-full rounded-xl" />}>
        <DashboardContent />
      </Suspense>
    </main>
  );
}
