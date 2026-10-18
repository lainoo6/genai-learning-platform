import Link from "next/link";

import { cn } from "@/lib/utils";

/**
 * Link-based tabs for the admin console (P5.4).
 *
 * Each tab is a real URL, so the page only queries the data of the visible tab
 * and every tab can be bookmarked or shared. The styling matches the shadcn tab
 * list while keeping the markup server-rendered.
 */

export type AdminTab = "overview" | "users" | "courses";

const TABS: ReadonlyArray<{ id: AdminTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "users", label: "Users" },
  { id: "courses", label: "Courses" },
];

/** Unknown or missing `?tab=` values fall back to the overview. */
export function parseAdminTab(value: string | undefined): AdminTab {
  const match = TABS.find((tab) => tab.id === value);
  return match?.id ?? "overview";
}

export function AdminTabs({ active }: { active: AdminTab }) {
  return (
    <nav
      aria-label="Admin sections"
      className="inline-flex w-fit items-center gap-1 rounded-lg bg-muted p-1"
    >
      {TABS.map((tab) => {
        const isActive = tab.id === active;

        return (
          <Link
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              isActive
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
            href={`/admin?tab=${tab.id}`}
            key={tab.id}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
