import type { Role } from "@prisma/client";
import type { NextAuthConfig, Session } from "next-auth";
import { NextResponse } from "next/server";

/**
 * Roles allowed per protected route prefix. Longest prefix wins, so "/admin"
 * stays admin-only even though it also sits under the generic prefixes.
 */
const PROTECTED_ROUTES: ReadonlyArray<{
  prefix: string;
  roles: ReadonlyArray<Role>;
}> = [
  { prefix: "/admin", roles: ["ADMIN"] },
  { prefix: "/teach", roles: ["INSTRUCTOR", "ADMIN"] },
  { prefix: "/learn", roles: ["LEARNER", "INSTRUCTOR", "ADMIN"] },
  { prefix: "/dashboard", roles: ["LEARNER", "INSTRUCTOR", "ADMIN"] },
  { prefix: "/onboarding", roles: ["LEARNER", "INSTRUCTOR", "ADMIN"] },
  { prefix: "/generate", roles: ["LEARNER", "INSTRUCTOR", "ADMIN"] },
];

const LOGIN_PATH = "/login";
const HOME_PATH = "/";

function matchProtectedRoute(
  pathname: string,
): { prefix: string; roles: ReadonlyArray<Role> } | null {
  let match: { prefix: string; roles: ReadonlyArray<Role> } | null = null;

  for (const route of PROTECTED_ROUTES) {
    const isMatch =
      pathname === route.prefix || pathname.startsWith(`${route.prefix}/`);
    if (isMatch && (match === null || route.prefix.length > match.prefix.length)) {
      match = route;
    }
  }

  return match;
}

/**
 * Edge-safe Auth.js configuration: no Prisma, no bcrypt. It is consumed both by
 * the middleware (route guard) and by the full server-side auth instance.
 */
export const authConfig = {
  // Required for self-hosted runs (`npm start`) where Auth.js cannot infer the host.
  trustHost: true,
  pages: {
    signIn: LOGIN_PATH,
  },
  session: {
    strategy: "jwt",
  },
  providers: [],
  callbacks: {
    /** Copy the user id and role from the provider payload into the JWT. */
    jwt({ token, user }) {
      if (user?.id) {
        token.id = user.id;
      }
      if (user) {
        token.role = user.role;
      }
      return token;
    },
    /** Expose id and role on the session object read by server components. */
    session({ session, token }) {
      session.user.id = token.id;
      session.user.role = token.role;
      return session;
    },
    /**
     * Route guard used by the middleware: anonymous users go to /login (with a
     * callbackUrl), users without the required role are sent back home.
     */
    authorized({ auth, request }) {
      const route = matchProtectedRoute(request.nextUrl.pathname);
      if (route === null) {
        return true;
      }

      const session: Session | null = auth;
      if (!session?.user) {
        const loginUrl = new URL(LOGIN_PATH, request.nextUrl.origin);
        loginUrl.searchParams.set(
          "callbackUrl",
          `${request.nextUrl.pathname}${request.nextUrl.search}`,
        );
        return NextResponse.redirect(loginUrl);
      }

      if (!route.roles.includes(session.user.role)) {
        return NextResponse.redirect(new URL(HOME_PATH, request.nextUrl.origin));
      }

      return true;
    },
  },
} satisfies NextAuthConfig;
