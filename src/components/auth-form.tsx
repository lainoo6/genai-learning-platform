"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AuthFormState } from "@/server/auth";

type AuthMode = "login" | "register";

type AuthFormProps = {
  mode: AuthMode;
  action: (state: AuthFormState, formData: FormData) => Promise<AuthFormState>;
  callbackUrl?: string;
};

const COPY: Record<
  AuthMode,
  {
    title: string;
    description: string;
    submit: string;
    pending: string;
    footerLabel: string;
    footerHref: string;
    footerText: string;
  }
> = {
  login: {
    title: "Welcome back",
    description: "Sign in to continue your mini-courses.",
    submit: "Sign in",
    pending: "Signing in…",
    footerLabel: "New here?",
    footerHref: "/register",
    footerText: "Create an account",
  },
  register: {
    title: "Create your account",
    description: "Sign up as a learner and start your first mini-course.",
    submit: "Create account",
    pending: "Creating account…",
    footerLabel: "Already registered?",
    footerHref: "/login",
    footerText: "Sign in",
  },
};

const INITIAL_STATE: AuthFormState = { error: null };

export function AuthForm({ mode, action, callbackUrl }: AuthFormProps) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_STATE);
  const copy = COPY[mode];

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="text-lg">{copy.title}</CardTitle>
        <CardDescription>{copy.description}</CardDescription>
      </CardHeader>

      <form action={formAction} className="contents">
        <CardContent className="flex flex-col gap-4">
          {mode === "register" ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                name="name"
                type="text"
                autoComplete="name"
                placeholder="Jamie Chan"
                required
              />
            </div>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              placeholder="At least 8 characters"
              minLength={8}
              required
            />
          </div>

          {callbackUrl ? (
            <input type="hidden" name="callbackUrl" value={callbackUrl} />
          ) : null}

          {state.error ? (
            <p role="alert" className="text-sm text-destructive">
              {state.error}
            </p>
          ) : null}

          <Button type="submit" disabled={isPending} className="w-full">
            {isPending ? copy.pending : copy.submit}
          </Button>
        </CardContent>
      </form>

      <CardFooter className="justify-center text-sm text-muted-foreground">
        <span>
          {copy.footerLabel}{" "}
          <Link href={copy.footerHref} className="text-primary underline-offset-4 hover:underline">
            {copy.footerText}
          </Link>
        </span>
      </CardFooter>
    </Card>
  );
}
