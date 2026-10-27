"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useT } from "@/i18n/client";
import { setCourseStatus } from "@/server/admin";

/**
 * Archive / restore control for one course (P5.4).
 *
 * Archiving hides a course from the catalog without deleting anything;
 * restoring publishes it again. Both directions go through a confirmation
 * dialog because either one changes what every visitor can see.
 */
export function CourseStatusButton({
  courseId,
  title,
  nextStatus,
}: {
  courseId: string;
  title: string;
  nextStatus: "PUBLISHED" | "ARCHIVED";
}) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const archiving = nextStatus === "ARCHIVED";

  async function confirm(): Promise<void> {
    setPending(true);
    setError(null);

    const result = await setCourseStatus(courseId, nextStatus);

    if (!result.ok) {
      setError(result.error);
      setPending(false);
      return;
    }

    setPending(false);
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button
        onClick={() => {
          setOpen(true);
        }}
        size="xs"
        variant={archiving ? "destructive" : "outline"}
      >
        {archiving ? t("admin.course.archive") : t("admin.course.restore")}
      </Button>

      <Dialog
        onOpenChange={(next) => {
          if (pending) {
            return;
          }
          setOpen(next);
          if (!next) {
            setError(null);
          }
        }}
        open={open}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {archiving
                ? t("admin.course.archiveTitle", { title })
                : t("admin.course.restoreTitle", { title })}
            </DialogTitle>
            <DialogDescription>
              {archiving
                ? t("admin.course.archiveDescription")
                : t("admin.course.restoreDescription")}
            </DialogDescription>
          </DialogHeader>

          {error === null ? null : (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <DialogFooter>
            <Button
              disabled={pending}
              onClick={() => {
                setOpen(false);
              }}
              variant="outline"
            >
              {t("editor.delete.cancel")}
            </Button>
            <Button
              disabled={pending}
              onClick={() => {
                void confirm();
              }}
              variant={archiving ? "destructive" : "default"}
            >
              {pending
                ? t("admin.role.saving")
                : archiving
                  ? t("admin.course.archiveConfirm")
                  : t("admin.course.restoreConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
