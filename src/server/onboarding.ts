"use server";

import { redirect } from "next/navigation";

import { getI18n } from "@/i18n/server";
import { auth } from "@/lib/auth";
import { encodeProfile, onboardingSchema } from "@/lib/profile";
import { prisma } from "@/lib/prisma";

/** State shared between the onboarding server action and the client wizard. */
export type OnboardingState = {
  error: string | null;
};

const DEFAULT_REDIRECT = "/dashboard";

/** Only same-origin absolute paths may be used as a post-onboarding target. */
function safeRedirectTarget(value: FormDataEntryValue | null): string {
  if (
    typeof value !== "string"
    || !value.startsWith("/")
    || value.startsWith("//")
  ) {
    return DEFAULT_REDIRECT;
  }

  return value;
}

/**
 * Stores the questionnaire answers on the signed-in user and continues to the
 * next page. Re-opening the wizard edits the same profile.
 */
export async function saveProfileAction(
  _previous: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const session = await auth();
  const user = session?.user;
  if (!user) {
    redirect("/login");
  }

  const parsed = onboardingSchema.safeParse({
    background: formData.get("background"),
    backgroundNote: formData.get("backgroundNote") ?? "",
    goals: formData.getAll("goals"),
    goalNote: formData.get("goalNote") ?? "",
    statement: formData.get("statement") ?? "",
  });

  if (!parsed.success) {
    const { t } = await getI18n();
    return { error: t("server.onboarding.invalidProfile") };
  }

  const encoded = encodeProfile(parsed.data);
  await prisma.user.update({
    where: { id: user.id },
    data: { background: encoded.background, goal: encoded.goal },
  });

  redirect(safeRedirectTarget(formData.get("next")));
}
