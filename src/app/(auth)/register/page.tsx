import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { AuthForm } from "@/components/auth-form";
import { Skeleton } from "@/components/ui/skeleton";
import { auth } from "@/lib/auth";
import { registerAction } from "@/server/auth";
import { getI18n } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return {
    title: t("auth.register.metaTitle"),
    description: t("auth.register.metaDescription"),
  };
}

/**
 * Reads the session cookie, so it is streamed behind a Suspense boundary under
 * Next's Cache Components model.
 */
async function RegisterForm({
  searchParams,
}: {
  searchParams: PageProps<"/register">["searchParams"];
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
      mode="register"
      action={registerAction}
      callbackUrl={typeof callbackUrl === "string" ? callbackUrl : undefined}
    />
  );
}

export default function RegisterPage(props: PageProps<"/register">) {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <Suspense fallback={<Skeleton className="h-96 w-full max-w-md rounded-xl" />}>
        <RegisterForm searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}
