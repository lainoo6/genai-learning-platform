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
import { removeStudent } from "@/server/students";

type RemoveStudentButtonProps = {
  courseId: string;
  userId: string;
  name: string;
};

/**
 * Enrolment removal with an explicit confirmation (P5.2).
 *
 * Only the enrolment is deleted, so the copy says so: the account and its
 * lesson progress survive and the student can be imported again later.
 */
export function RemoveStudentButton({
  courseId,
  userId,
  name,
}: RemoveStudentButtonProps) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm(): Promise<void> {
    setPending(true);
    setError(null);

    const result = await removeStudent(courseId, userId);

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
        aria-label={t("students.remove.aria", { name })}
        className="text-muted-foreground hover:text-destructive"
        onClick={() => {
          setOpen(true);
        }}
        size="xs"
        variant="ghost"
      >
        {t("students.remove.button")}
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
            <DialogTitle>{t("students.remove.title", { name })}</DialogTitle>
            <DialogDescription>
              {t("students.remove.description")}
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
              variant="destructive"
            >
              {pending
                ? t("students.remove.pending")
                : t("students.remove.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
