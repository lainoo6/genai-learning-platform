import type { Role } from "@prisma/client";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getI18n } from "@/i18n/server";
import { ROLE_KEYS, ROLE_OPTIONS } from "@/lib/roles";

/**
 * Search and role filter for the Users tab (P5.4).
 *
 * A plain GET form: the filters live in the URL, survive a refresh, and need no
 * client JavaScript. The shadcn Select is a listbox rather than a native
 * control, so a styled `<option>` list is used instead — it submits natively.
 */

const SELECT_CLASS =
  "h-8 w-40 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export async function UserFilters({
  search,
  role,
}: {
  search: string;
  role: Role | null;
}) {
  const { t } = await getI18n();
  const hasFilters = search.length > 0 || role !== null;

  return (
    <form action="/admin" className="flex flex-wrap items-end gap-2" method="get">
      <input name="tab" type="hidden" value="users" />

      <div className="min-w-56 flex-1 space-y-1.5">
        <label className="text-xs font-medium" htmlFor="admin-user-search">
          {t("admin.filter.search")}
        </label>
        <Input
          defaultValue={search}
          id="admin-user-search"
          name="q"
          placeholder={t("admin.filter.searchPlaceholder")}
          type="search"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium" htmlFor="admin-user-role">
          {t("admin.filter.role")}
        </label>
        <select
          className={SELECT_CLASS}
          defaultValue={role ?? ""}
          id="admin-user-role"
          name="role"
        >
          <option value="">{t("admin.filter.allRoles")}</option>
          {ROLE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {t(ROLE_KEYS[option])}
            </option>
          ))}
        </select>
      </div>

      <Button type="submit" variant="outline">
        {t("admin.filter.apply")}
      </Button>

      {hasFilters ? (
        <Link
          className="pb-1.5 text-xs text-muted-foreground hover:text-foreground hover:underline"
          href="/admin?tab=users"
        >
          {t("admin.filter.reset")}
        </Link>
      ) : null}
    </form>
  );
}
