import type { Role } from "@prisma/client";

/**
 * Role vocabulary shared by the server read models and the admin client
 * components.
 *
 * It lives on its own (not in `lib/admin.ts`) because that module also imports
 * Prisma: a client component may read these labels, but must never pull the
 * database client into the browser bundle.
 */

export const ROLE_LABELS: Record<Role, string> = {
  LEARNER: "Learner",
  INSTRUCTOR: "Instructor",
  ADMIN: "Admin",
};

export const ROLE_OPTIONS: ReadonlyArray<Role> = [
  "LEARNER",
  "INSTRUCTOR",
  "ADMIN",
];
