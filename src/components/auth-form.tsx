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
import { useT } from "@/i18n/client";
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
    titleKey: string;
    descriptionKey: string;
    submitKey: string;
    pendingKey: string;
    footerLabelKey: string;
    footerHref: string;
    footerTextKey: string;
  }
> = {
  login: {
    titleKey: "auth.login.title",
    descriptionKey: "auth.login.description",
    submitKey: "auth.login.submit",
    pendingKey: "auth.login.pending",
    footerLabelKey: "auth.login.footerLabel",
    footerHref: "/register",
    footerTextKey: "auth.login.footerText",
  },
  register: {
    titleKey: "auth.register.title",
    descriptionKey: "auth.register.description",
    submitKey: "auth.register.submit",
    pendingKey: "auth.register.pending",
    footerLabelKey: "auth.register.footerLabel",
    footerHref: "/login",
    footerTextKey: "auth.register.footerText",
  },
};

const INITIAL_STATE: AuthFormState = { error: null };

export function AuthForm({ mode, action, callbackUrl }: AuthFormProps) {
  const t = useT();
  const [state, formAction, isPending] = useActionState(action, INITIAL_STATE);
  const copy = COPY[mode];

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="text-lg">{t(copy.titleKey)}</CardTitle>
        <CardDescription>{t(copy.descriptionKey)}</CardDescription>
      </CardHeader>

      <form action={formAction} className="contents">
        <CardContent className="flex flex-col gap-4">
          {mode === "register" ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">{t("auth.field.name")}</Label>
              <Input
                id="name"
                name="name"
                type="text"
                autoComplete="name"
                placeholder={t("auth.field.namePlaceholder")}
                required
              />
            </div>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">{t("auth.field.email")}</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder={t("auth.field.emailPlaceholder")}
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">{t("auth.field.password")}</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              placeholder={t("auth.field.passwordPlaceholder")}
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
            {isPending ? t(copy.pendingKey) : t(copy.submitKey)}
          </Button>
        </CardContent>
      </form>

      <CardFooter className="justify-center text-sm text-muted-foreground">
        <span>
          {t(copy.footerLabelKey)}{" "}
          <Link href={copy.footerHref} className="text-primary underline-offset-4 hover:underline">
            {t(copy.footerTextKey)}
          </Link>
        </span>
      </CardFooter>
    </Card>
  );
}
