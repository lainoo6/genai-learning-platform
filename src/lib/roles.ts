import type { Role } from "@prisma/client";

/**
 * Role vocabulary shared by the server read models and the admin client
 * components.
 *
 * It lives on its own (not in `lib/admin.ts`) because that module also imports
 * Prisma: a client component may read these labels, but must never pull the
 * database client into the browser bundle.
 */

/** Dictionary keys: client components render these in the UI language. */
export const ROLE_KEYS: Record<Role, string> = {
  LEARNER: "admin.role.learner",
  INSTRUCTOR: "admin.role.instructor",
  ADMIN: "admin.role.admin",
};

export const ROLE_OPTIONS: ReadonlyArray<Role> = [
  "LEARNER",
  "INSTRUCTOR",
  "ADMIN",
];
