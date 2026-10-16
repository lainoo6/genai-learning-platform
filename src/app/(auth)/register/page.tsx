import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { AuthForm } from "@/components/auth-form";
import { Skeleton } from "@/components/ui/skeleton";
import { auth } from "@/lib/auth";
import { registerAction } from "@/server/auth";

export const metadata: Metadata = {
  title: "Create an account",
  description: "Register as a learner and start your first mini-course.",
};

/**
 * Reads the session cookie, so it is streamed behind a Suspense boundary under
 * Next's Cache Components model.
 */
async function RegisterForm({
  searchParams,
}: {
  searchParams: PageProps<"/register">["searchParams"];
}) {
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
