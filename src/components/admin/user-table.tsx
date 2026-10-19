import type { Role } from "@prisma/client";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getI18n } from "@/i18n/server";
import type { AdminUserRow } from "@/lib/admin";
import { ROLE_KEYS } from "@/lib/roles";

import { RoleChangeDialog } from "./role-change-dialog";

/**
 * Users table for the admin console (P5.4).
 *
 * The signed-in admin's own row has no role button: the server action refuses
 * self-demotion, and hiding the control avoids offering a button that can only
 * fail.
 */

const ROLE_BADGE_VARIANT: Record<Role, "default" | "secondary" | "outline"> = {
  ADMIN: "default",
  INSTRUCTOR: "secondary",
  LEARNER: "outline",
};

export async function UserTable({
  users,
  currentUserId,
}: {
  users: AdminUserRow[];
  currentUserId: string;
}) {
  const { locale, t } = await getI18n();
  const dateFormat = new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const dateTimeFormat = new Intl.DateTimeFormat(
    locale === "zh" ? "zh-CN" : "en-GB",
    {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    },
  );

  return (
    <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="pl-4">{t("admin.table.user")}</TableHead>
            <TableHead>{t("admin.table.role")}</TableHead>
            <TableHead>{t("admin.table.joined")}</TableHead>
            <TableHead>{t("admin.table.lastLogin")}</TableHead>
            <TableHead className="text-right">
              {t("admin.table.enrolled")}
            </TableHead>
            <TableHead className="text-right">
              {t("admin.table.authored")}
            </TableHead>
            <TableHead className="pr-4 text-right">
              <span className="sr-only">{t("admin.table.actions")}</span>
            </TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {users.map((user) => {
            const isSelf = user.id === currentUserId;

            return (
              <TableRow key={user.id}>
                <TableCell className="pl-4">
                  <p className="flex items-center gap-1.5 font-medium text-foreground">
                    {user.name}
                    {isSelf ? (
                      <Badge className="text-[10px]" variant="outline">
                        {t("admin.table.you")}
                      </Badge>
                    ) : null}
                  </p>
                  <p className="text-xs text-muted-foreground">{user.email}</p>
                </TableCell>

                <TableCell>
                  <Badge variant={ROLE_BADGE_VARIANT[user.role]}>
                    {t(ROLE_KEYS[user.role])}
                  </Badge>
                </TableCell>

                <TableCell className="text-sm text-muted-foreground">
                  {dateFormat.format(user.createdAt)}
                </TableCell>

                <TableCell className="text-sm text-muted-foreground">
                  {user.lastLoginAt === null
                    ? t("admin.table.never")
                    : dateTimeFormat.format(user.lastLoginAt)}
                </TableCell>

                <TableCell className="text-right text-sm tabular-nums">
                  {user.enrolledCourses}
                </TableCell>

                <TableCell className="text-right text-sm tabular-nums">
                  {user.authoredCourses}
                </TableCell>

                <TableCell className="pr-4 text-right">
                  {isSelf ? (
                    <span className="text-xs text-muted-foreground">
                      {t("admin.table.ownAccount")}
                    </span>
                  ) : (
                    <RoleChangeDialog
                      currentRole={user.role}
                      name={user.name}
                      userId={user.id}
                    />
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
