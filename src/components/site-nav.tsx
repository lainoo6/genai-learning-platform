import Link from "next/link";
import { Suspense } from "react";

import { UserMenu } from "@/components/user-menu";
import { buttonVariants } from "@/components/ui/button";
import { auth } from "@/lib/auth";

/** Right-hand side of the navigation; reads the session, so it is dynamic. */
async function SiteNavActions() {
  const session = await auth();
  const user = session?.user ?? null;

  if (user === null) {
    return (
      <>
        <Link href="/login" className={buttonVariants({ variant: "ghost", size: "sm" })}>
          Log in
        </Link>
        <Link href="/register" className={buttonVariants({ size: "sm" })}>
          Sign up
        </Link>
      </>
    );
  }

  return (
    <>
      <Link href="/dashboard" className={buttonVariants({ variant: "ghost", size: "sm" })}>
        Dashboard
      </Link>
      <UserMenu name={user.name ?? "Learner"} email={user.email ?? ""} role={user.role} />
    </>
  );
}

export function SiteNav() {
  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-4 px-4">
        <Link href="/" className="flex items-center gap-2 text-sm font-semibold">
          <span aria-hidden="true">🎓</span>
          GenAI Learning
        </Link>

        <nav className="flex min-h-8 items-center gap-2">
          <Suspense fallback={<div className="h-8 w-32" />}>
            <SiteNavActions />
          </Suspense>
        </nav>
      </div>
    </header>
  );
}
