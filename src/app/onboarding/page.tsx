import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { OnboardingForm } from "@/components/onboarding/onboarding-form";
import { Skeleton } from "@/components/ui/skeleton";
import { auth } from "@/lib/auth";
import { loadLearnerProfile } from "@/lib/profile";
import { saveProfileAction } from "@/server/onboarding";
import { getI18n } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return {
    title: t("onboarding.metaTitle"),
    description: t("onboarding.metaDescription"),
  };
}

type OnboardingPageProps = {
  searchParams: Promise<{ next?: string | string[] }>;
};

/**
 * Profile questionnaire. Signed-in learners land here right after their first
 * login and can re-open the page any time from the user menu or the dashboard,
 * in which case the saved answers are pre-filled.
 */
async function OnboardingContent({ searchParams }: OnboardingPageProps) {
  // Auth.js draws random bytes; keep it out of the prerender pass.
  await connection();
  const session = await auth();
  const user = session?.user;
  if (!user) {
    redirect("/login?callbackUrl=%2Fonboarding");
  }

  const [{ next }, profile] = await Promise.all([
    searchParams,
    loadLearnerProfile(user.id),
  ]);

  return (
    <OnboardingForm
      action={saveProfileAction}
      initialProfile={profile}
      nextHref={typeof next === "string" ? next : undefined}
    />
  );
}

export default function OnboardingPage(props: OnboardingPageProps) {
  return (
    <main className="flex flex-1 items-start justify-center px-4 py-10">
      <Suspense fallback={<Skeleton className="h-96 w-full max-w-2xl rounded-xl" />}>
        <OnboardingContent searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}
