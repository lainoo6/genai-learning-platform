"use server";

import { AuthError } from "next-auth";
import { z } from "zod";

import { trackEvent } from "@/lib/analytics";
import {
  credentialsSchema,
  hashPassword,
  normaliseEmail,
  signIn,
  signOut,
  verifyPassword,
} from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/** State shared between the auth server actions and the client form. */
export type AuthFormState = {
  error: string | null;
};

const registerSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.email().max(200),
  password: z.string().min(8).max(200),
});

const DEFAULT_REDIRECT = "/dashboard";
const INVALID_CREDENTIALS = "Invalid email or password.";
const INVALID_REGISTRATION =
  "Enter your name, a valid email, and a password of at least 8 characters.";

/**
 * Only same-origin absolute paths may be used as a post-login destination,
 * otherwise an open redirect would be possible.
 */
function safeRedirectTarget(value: FormDataEntryValue | null): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
    return DEFAULT_REDIRECT;
  }
  return value;
}

/** Signs a user in with Auth.js and lets the redirect error bubble up. */
async function startSession(
  email: string,
  password: string,
  redirectTo: string,
): Promise<AuthFormState> {
  try {
    await signIn("credentials", { email, password, redirectTo });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return { error: INVALID_CREDENTIALS };
    }
    // `signIn` signals a successful redirect by throwing; never swallow it.
    throw error;
  }

  return { error: null };
}

export async function loginAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: INVALID_CREDENTIALS };
  }

  const email = normaliseEmail(parsed.data.email);
  const user = await prisma.user.findUnique({ where: { email } });

  if (user === null || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    return { error: INVALID_CREDENTIALS };
  }

  await trackEvent("LOGIN", { userId: user.id });

  return startSession(
    email,
    parsed.data.password,
    safeRedirectTarget(formData.get("callbackUrl")),
  );
}

/** Registers a new learner account and signs it in immediately. */
export async function registerAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = registerSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: INVALID_REGISTRATION };
  }

  const email = normaliseEmail(parsed.data.email);
  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (existingUser !== null) {
    return { error: "An account with this email already exists." };
  }

  const passwordHash = await hashPassword(parsed.data.password);
  await prisma.user.create({
    data: {
      email,
      name: parsed.data.name,
      passwordHash,
      role: "LEARNER",
    },
  });

  return startSession(
    email,
    parsed.data.password,
    safeRedirectTarget(formData.get("callbackUrl")),
  );
}

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}
