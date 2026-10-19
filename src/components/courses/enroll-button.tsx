"use client";

import { ArrowRight, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { enroll } from "@/server/courses";

/**
 * Enroll button for the course detail page.
 *
 * The server action either redirects straight to the first lesson or asks this
 * component to send the visitor to the login page (keeping the current URL as
 * `callbackUrl`), so the "click Enroll before signing in" path still works.
 */
export function EnrollButton({
  courseId,
  enrolled,
  firstLessonHref,
  label,
}: {
  courseId: string;
  enrolled: boolean;
  /** `/learn/<courseId>/<lessonId>` used when the learner is already enrolled. */
  firstLessonHref: string | null;
  label?: string;
}) {
  const t = useT();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (enrolled && firstLessonHref !== null) {
    return (
      <Link
        className={cn(buttonVariants({ size: "lg" }), "gap-1.5")}
        href={firstLessonHref}
      >
        {t("enroll.button.continue")}
        <ArrowRight aria-hidden="true" />
      </Link>
    );
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        disabled={isPending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await enroll(courseId);
            if (result.ok) {
              return;
            }
            if (result.loginUrl !== undefined) {
              router.push(result.loginUrl);
              return;
            }
            setError(result.error);
          });
        }}
        size="lg"
      >
        {isPending ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
        {isPending ? t("enroll.button.pending") : (label ?? t("enroll.button.submit"))}
      </Button>
      {error === null ? null : (
        <p className="text-xs text-red-600" role="status">
          {error}
        </p>
      )}
    </div>
  );
}
