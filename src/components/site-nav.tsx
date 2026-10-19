import type { Role } from "@prisma/client";
import {
  BookOpen,
  GraduationCap,
  LayoutDashboard,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

import { LocaleSwitcher } from "@/components/locale-switcher";
import { UserMenu } from "@/components/user-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { buttonVariants } from "@/components/ui/button";
import { auth } from "@/lib/auth";
import { getI18n } from "@/i18n/server";
import { cn } from "@/lib/utils";

type NavLink = {
  href: string;
  /** Dictionary key, translated at render time. */
  labelKey: string;
  /** Rendered on every width; the label itself is hidden on small screens. */
  icon: typeof BookOpen;
  /** `null` means the link is public, otherwise only these roles see it. */
  roles: ReadonlyArray<Role> | null;
};

const NAV_LINKS: ReadonlyArray<NavLink> = [
  { href: "/courses", labelKey: "nav.courses", icon: BookOpen, roles: null },
  {
    href: "/dashboard",
    labelKey: "nav.dashboard",
    icon: LayoutDashboard,
    roles: ["LEARNER", "INSTRUCTOR", "ADMIN"],
  },
  {
    href: "/generate",
    labelKey: "nav.generate",
    icon: Sparkles,
    roles: ["LEARNER", "INSTRUCTOR", "ADMIN"],
  },
  {
    href: "/teach",
    labelKey: "nav.teach",
    icon: GraduationCap,
    roles: ["INSTRUCTOR", "ADMIN"],
  },
  { href: "/admin", labelKey: "nav.admin", icon: ShieldCheck, roles: ["ADMIN"] },
];

/** Role-aware navigation links. Reads the session, so it is dynamic. */
async function SiteNavLinks() {
  // Auth.js draws random bytes; keep it out of the prerender pass.
  await connection();
  const [session, { t }] = await Promise.all([auth(), getI18n()]);
  const role: Role | null = session?.user?.role ?? null;

  const visibleLinks = NAV_LINKS.filter(
    (link) => link.roles === null || (role !== null && link.roles.includes(role)),
  );

  return (
    <>
      {visibleLinks.map(({ href, labelKey, icon: Icon }) => {
        const label = t(labelKey);

        return (
          <Link
            key={href}
            href={href}
            aria-label={label}
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "gap-1.5")}
          >
            <Icon aria-hidden="true" />
            <span className="hidden md:inline">{label}</span>
          </Link>
        );
      })}
    </>
  );
}

/** Right-hand side of the navigation; reads the session, so it is dynamic. */
async function SiteNavActions() {
  // Auth.js draws random bytes (cookies / CSRF), which must never run while
  // Next prerenders a route shell, so opt this subtree into request-time work.
  await connection();
  const [session, { t }] = await Promise.all([auth(), getI18n()]);
  const user = session?.user ?? null;

  if (user === null) {
    return (
      <>
        <Link href="/login" className={buttonVariants({ variant: "ghost", size: "sm" })}>
          {t("nav.login")}
        </Link>
        <Link href="/register" className={buttonVariants({ size: "sm" })}>
          {t("nav.register")}
        </Link>
      </>
    );
  }

  return (
    <UserMenu
      name={user.name ?? t("nav.dashboard")}
      email={user.email ?? ""}
      role={user.role}
    />
  );
}

export async function SiteNav() {
  const { t } = await getI18n();

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-2 px-4">
        <Link href="/" className="flex items-center gap-2 text-sm font-semibold">
          <span aria-hidden="true">🎓</span>
          <span className="hidden sm:inline">GenAI Learning</span>
        </Link>

        <nav aria-label={t("nav.main")} className="flex min-h-8 items-center gap-1">
          <Suspense fallback={<Skeleton className="h-8 w-24" />}>
            <SiteNavLinks />
          </Suspense>
        </nav>

        <div className="ml-auto flex min-h-8 items-center gap-2">
          <LocaleSwitcher />
          <Suspense fallback={<Skeleton className="ml-auto h-8 w-32" />}>
            <SiteNavActions />
          </Suspense>
        </div>
      </div>
    </header>
  );
}
