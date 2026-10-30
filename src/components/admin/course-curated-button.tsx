"use client";

import { Star } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/client";
import { setCourseCurated } from "@/server/admin";

/**
 * Toggle for the "curated" badge (P5.4).
 *
 * One click, no confirmation: the flag only changes a badge, is trivially
 * reversible, and never alters visibility. The label names the action, so the
 * current state is readable straight from the table.
 */
export function CourseCuratedButton({
  courseId,
  isCurated,
}: {
  courseId: string;
  isCurated: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle(): Promise<void> {
    setPending(true);
    setError(null);

    const result = await setCourseCurated(courseId, !isCurated);

    if (!result.ok) {
      setError(result.error);
      setPending(false);
      return;
    }

    setPending(false);
    router.refresh();
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        disabled={pending}
        onClick={() => {
          void toggle();
        }}
        size="xs"
        variant={isCurated ? "secondary" : "outline"}
      >
        <Star
          aria-hidden="true"
          className={isCurated ? "fill-current" : undefined}
        />
        {isCurated ? t("admin.course.uncurate") : t("admin.course.curate")}
      </Button>

      {error === null ? null : (
        <p aria-live="polite" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
