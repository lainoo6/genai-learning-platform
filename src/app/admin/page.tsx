import { Activity, BookOpenCheck, Library, ShieldCheck, Users } from "lucide-react";
import type { Role } from "@prisma/client";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { AdminTabs, parseAdminTab } from "@/components/admin/admin-tabs";
import { CourseTable } from "@/components/admin/course-table";
import { UserFilters } from "@/components/admin/user-filters";
import { UserTable } from "@/components/admin/user-table";
import { ActivityLineChart } from "@/components/charts/activity-line-chart";
import { Skeleton } from "@/components/ui/skeleton";
import {
  listAdminCourses,
  listAdminUsers,
  loadAdminOverview,
} from "@/lib/admin";
import { auth } from "@/lib/auth";
import { ROLE_OPTIONS } from "@/lib/roles";

export const metadata: Metadata = {
  title: "Admin",
};

type AdminSearchParams = {
  tab?: string | string[];
  q?: string | string[];
  role?: string | string[];
};

/** A query parameter may repeat; only the first value is used. */
function readParam(value: string | string[] | undefined): string {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }
  return "";
}

/** Accepts only real role values, so `?role=bogus` reads as "all roles". */
function parseRoleFilter(value: string | undefined): Role | null {
  return ROLE_OPTIONS.find((role) => role === value) ?? null;
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Users;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-xl px-4 py-4 ring-1 ring-foreground/10">
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Icon aria-hidden="true" className="size-3.5" />
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

async function OverviewTab() {
  const overview = await loadAdminOverview();

  return (
    <div className="space-y-4">
      <section
        aria-label="Platform numbers"
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
      >
        <StatCard
          hint="Registered accounts"
          icon={Users}
          label="Users"
          value={String(overview.userCount)}
        />
        <StatCard
          hint={`${overview.publishedCount} published`}
          icon={Library}
          label="Courses"
          value={String(overview.courseCount)}
        />
        <StatCard
          hint="Visible in the public catalog"
          icon={BookOpenCheck}
          label="Published"
          value={String(overview.publishedCount)}
        />
        <StatCard
          hint="Distinct users with any activity"
          icon={Activity}
          label="Active (7 days)"
          value={String(overview.activeLast7Days)}
        />
      </section>

      <section className="rounded-xl px-4 py-4 ring-1 ring-foreground/10">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="flex items-center gap-1.5 text-sm font-medium">
            <Activity aria-hidden="true" className="size-4 text-muted-foreground" />
            Daily active users
          </h2>
          <p className="text-xs text-muted-foreground">
            Platform-wide, last 30 days
          </p>
        </div>
        <div className="mt-3">
          <ActivityLineChart
            data={overview.dailyActivity}
            seriesLabel="Active users"
          />
        </div>
      </section>
    </div>
  );
}

async function UsersTab({
  search,
  role,
  currentUserId,
}: {
  search: string;
  role: Role | null;
  currentUserId: string;
}) {
  const users = await listAdminUsers({ search, role });

  return (
    <div className="space-y-4">
      <UserFilters role={role} search={search} />

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-medium">Users</h2>
        <p className="text-xs text-muted-foreground">
          {users.length} account{users.length === 1 ? "" : "s"}
          {search.length === 0 ? "" : ` matching “${search}”`}
        </p>
      </div>

      {users.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-4 py-12 text-center">
          <p className="text-sm font-medium">No accounts match</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            Try a different name or email, or clear the role filter.
          </p>
        </div>
      ) : (
        <UserTable currentUserId={currentUserId} users={users} />
      )}
    </div>
  );
}

async function CoursesTab() {
  const courses = await listAdminCourses();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-lg font-medium">Courses</h2>
          <p className="text-sm text-muted-foreground">
            Including drafts and learner-made courses that the catalog hides.
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          {courses.length} course{courses.length === 1 ? "" : "s"}
        </p>
      </div>

      {courses.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-4 py-12 text-center">
          <p className="text-sm font-medium">No courses yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            Courses appear here as soon as a teacher or a learner creates one.
          </p>
        </div>
      ) : (
        <CourseTable courses={courses} />
      )}
    </div>
  );
}

/**
 * Admin console (P5.4).
 *
 * The middleware guards `/admin`; this repeats the role check server-side, and
 * every action repeats it again. Tabs are URLs, so each one only loads its own
 * data and the Users tab can carry its search and role filter in the query.
 */
async function AdminContent({
  searchParams,
}: {
  searchParams: Promise<AdminSearchParams>;
}) {
  // Auth.js draws random bytes; keep it out of the prerender pass.
  await connection();
  const session = await auth();
  const user = session?.user;

  if (user === undefined) {
    redirect(`/login?callbackUrl=${encodeURIComponent("/admin")}`);
  }

  if (user.role !== "ADMIN") {
    redirect("/");
  }

  const params = await searchParams;
  const tab = parseAdminTab(readParam(params.tab));
  const search = readParam(params.q).trim().slice(0, 100);
  const role = parseRoleFilter(readParam(params.role));

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-primary">
          <ShieldCheck aria-hidden="true" className="size-3.5" />
          Administration
        </p>
        <h1 className="text-2xl font-semibold">Admin console</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Manage who can do what on the platform, moderate every course, and
          watch activity across all learners.
        </p>
      </header>

      <AdminTabs active={tab} />

      {tab === "users" ? (
        <UsersTab currentUserId={user.id} role={role} search={search} />
      ) : tab === "courses" ? (
        <CoursesTab />
      ) : (
        <OverviewTab />
      )}
    </div>
  );
}

export default function AdminPage({
  searchParams,
}: {
  searchParams: Promise<AdminSearchParams>;
}) {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">
      <Suspense
        fallback={
          <div className="space-y-4">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-40 w-full rounded-xl" />
          </div>
        }
      >
        <AdminContent searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
