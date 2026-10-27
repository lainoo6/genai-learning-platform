import Link from "next/link";

import { getI18n } from "@/i18n/server";
import { cn } from "@/lib/utils";

/**
 * Link-based tabs for the admin console (P5.4).
 *
 * Each tab is a real URL, so the page only queries the data of the visible tab
 * and every tab can be bookmarked or shared. The styling matches the shadcn tab
 * list while keeping the markup server-rendered.
 */

export type AdminTab = "overview" | "users" | "courses";

const TABS: ReadonlyArray<{ id: AdminTab; labelKey: string }> = [
  { id: "overview", labelKey: "admin.tabs.overview" },
  { id: "users", labelKey: "admin.tabs.users" },
  { id: "courses", labelKey: "admin.tabs.courses" },
];

/** Unknown or missing `?tab=` values fall back to the overview. */
export function parseAdminTab(value: string | undefined): AdminTab {
  const match = TABS.find((tab) => tab.id === value);
  return match?.id ?? "overview";
}

export async function AdminTabs({ active }: { active: AdminTab }) {
  const { t } = await getI18n();

  return (
    <nav
      aria-label={t("admin.tabs.aria")}
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
            {t(tab.labelKey)}
          </Link>
        );
      })}
    </nav>
  );
}
