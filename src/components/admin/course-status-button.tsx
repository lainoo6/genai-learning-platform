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
        {archiving ? "Archive" : "Restore"}
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
              {archiving ? `Archive “${title}”?` : `Restore “${title}”?`}
            </DialogTitle>
            <DialogDescription>
              {archiving
                ? "The course disappears from the public catalog. Enrollments, progress and the course itself are kept."
                : "The course becomes visible in the public catalog again. Learners who already enrolled keep their progress."}
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
              Cancel
            </Button>
            <Button
              disabled={pending}
              onClick={() => {
                void confirm();
              }}
              variant={archiving ? "destructive" : "default"}
            >
              {pending
                ? "Saving…"
                : archiving
                  ? "Archive course"
                  : "Publish again"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
