import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { AuthForm } from "@/components/auth-form";
import { Skeleton } from "@/components/ui/skeleton";
import { auth } from "@/lib/auth";
import { loginAction } from "@/server/auth";
import { getI18n } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return {
    title: t("auth.login.metaTitle"),
    description: t("auth.login.metaDescription"),
  };
}

/**
 * Reads the session cookie, so it is streamed behind a Suspense boundary under
 * Next's Cache Components model.
 */
async function LoginForm({
  searchParams,
}: {
  searchParams: PageProps<"/login">["searchParams"];
}) {
  // Auth.js draws random bytes; keep it out of the prerender pass.
  await connection();
  const session = await auth();
  if (session?.user) {
    redirect("/dashboard");
  }

  const { callbackUrl } = await searchParams;

  return (
    <AuthForm
      mode="login"
      action={loginAction}
      callbackUrl={typeof callbackUrl === "string" ? callbackUrl : undefined}
    />
  );
}

export default function LoginPage(props: PageProps<"/login">) {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <Suspense fallback={<Skeleton className="h-80 w-full max-w-md rounded-xl" />}>
        <LoginForm searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}
