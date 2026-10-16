import NextAuth from "next-auth";

import { authConfig } from "@/lib/auth.config";

// Uses the Prisma-free config so the guard can run on the edge runtime.
const { auth } = NextAuth(authConfig);

export default auth;

export const config = {
  matcher: [
    "/learn/:path*",
    "/teach/:path*",
    "/admin/:path*",
    "/dashboard/:path*",
    "/generate/:path*",
  ],
};
