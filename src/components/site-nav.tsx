import type { Role } from "@prisma/client";
import {
  BookOpen,
  GraduationCap,
  LayoutDashboard,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

import { UserMenu } from "@/components/user-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { buttonVariants } from "@/components/ui/button";
import { auth } from "@/lib/auth";
import { cn } from "@/lib/utils";

type NavLink = {
  href: string;
  label: string;
  /** Rendered on every width; the label itself is hidden on small screens. */
  icon: typeof BookOpen;
  /** `null` means the link is public, otherwise only these roles see it. */
  roles: ReadonlyArray<Role> | null;
};

const NAV_LINKS: ReadonlyArray<NavLink> = [
  { href: "/courses", label: "Courses", icon: BookOpen, roles: null },
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    roles: ["LEARNER", "INSTRUCTOR", "ADMIN"],
  },
  {
    href: "/teach",
    label: "Teach",
    icon: GraduationCap,
    roles: ["INSTRUCTOR", "ADMIN"],
  },
  { href: "/admin", label: "Admin", icon: ShieldCheck, roles: ["ADMIN"] },
];

/** Role-aware navigation links. Reads the session, so it is dynamic. */
async function SiteNavLinks() {
  // Auth.js draws random bytes; keep it out of the prerender pass.
  await connection();
  const session = await auth();
  const role: Role | null = session?.user?.role ?? null;

  const visibleLinks = NAV_LINKS.filter(
    (link) => link.roles === null || (role !== null && link.roles.includes(role)),
  );

  return (
    <>
      {visibleLinks.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          aria-label={label}
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "gap-1.5")}
        >
          <Icon aria-hidden="true" />
          <span className="hidden md:inline">{label}</span>
        </Link>
      ))}
    </>
  );
}

/** Right-hand side of the navigation; reads the session, so it is dynamic. */
async function SiteNavActions() {
  // Auth.js draws random bytes (cookies / CSRF), which must never run while
  // Next prerenders a route shell, so opt this subtree into request-time work.
  await connection();
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
    <UserMenu name={user.name ?? "Learner"} email={user.email ?? ""} role={user.role} />
  );
}

export function SiteNav() {
  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-2 px-4">
        <Link href="/" className="flex items-center gap-2 text-sm font-semibold">
          <span aria-hidden="true">🎓</span>
          <span className="hidden sm:inline">GenAI Learning</span>
        </Link>

        <nav aria-label="Main" className="flex min-h-8 items-center gap-1">
          <Suspense fallback={<Skeleton className="h-8 w-24" />}>
            <SiteNavLinks />
          </Suspense>
        </nav>

        <div className="ml-auto flex min-h-8 items-center gap-2">
          <Suspense fallback={<Skeleton className="ml-auto h-8 w-32" />}>
            <SiteNavActions />
          </Suspense>
        </div>
      </div>
    </header>
  );
}
