import type { Role } from "@prisma/client";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  /** Session user always carries the database id and the platform role. */
  interface Session {
    user: {
      id: string;
      role: Role;
    } & DefaultSession["user"];
  }

  /** Returned by the credentials provider `authorize` callback. */
  interface User {
    role: Role;
  }
}

// `next-auth/jwt` only re-exports from `@auth/core/jwt`, which is where the
// interface is actually declared, so the augmentation has to target it.
declare module "@auth/core/jwt" {
  interface JWT {
    id: string;
    role: Role;
  }
}
