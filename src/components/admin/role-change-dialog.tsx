"use client";

import type { Role } from "@prisma/client";
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
import { ROLE_LABELS } from "@/lib/roles";
import { updateUserRole } from "@/server/admin";
import { cn } from "@/lib/utils";

/**
 * Role change with an explicit confirmation (P5.4).
 *
 * The dialog spells out what each role can do and warns that the change takes
 * effect on the user's next sign-in, because the session is a signed JWT that
 * still carries the old role.
 */

const ROLE_CHOICES: ReadonlyArray<{
  value: Role;
  description: string;
}> = [
  {
    value: "LEARNER",
    description: "Browse the catalog, study courses and generate their own.",
  },
  {
    value: "INSTRUCTOR",
    description: "Create and publish courses, manage students, see insights.",
  },
  {
    value: "ADMIN",
    description: "Full access to this console, every user and every course.",
  },
];

export function RoleChangeDialog({
  userId,
  name,
  currentRole,
}: {
  userId: string;
  name: string;
  currentRole: Role;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<Role>(currentRole);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openDialog(): void {
    setRole(currentRole);
    setError(null);
    setOpen(true);
  }

  async function confirm(): Promise<void> {
    setPending(true);
    setError(null);

    const result = await updateUserRole(userId, role);

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
      <Button onClick={openDialog} size="xs" variant="outline">
        Change role
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
            <DialogTitle>Change role for {name}</DialogTitle>
            <DialogDescription>
              The new role applies the next time they sign in. A signed-in tab
              keeps the old navigation until then.
            </DialogDescription>
          </DialogHeader>

          <fieldset className="space-y-2">
            <legend className="sr-only">Role</legend>
            {ROLE_CHOICES.map((choice) => (
              <label
                className={cn(
                  "flex cursor-pointer items-start gap-2.5 rounded-lg px-3 py-2 ring-1 transition-colors",
                  role === choice.value
                    ? "bg-primary/5 ring-primary/40"
                    : "ring-foreground/10 hover:bg-muted/60",
                )}
                key={choice.value}
              >
                <input
                  checked={role === choice.value}
                  className="mt-0.5"
                  name={`role-${userId}`}
                  onChange={() => {
                    setRole(choice.value);
                  }}
                  type="radio"
                  value={choice.value}
                />
                <span>
                  <span className="block text-sm font-medium">
                    {ROLE_LABELS[choice.value]}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {choice.description}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>

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
              disabled={pending || role === currentRole}
              onClick={() => {
                void confirm();
              }}
            >
              {pending ? "Saving…" : "Save role"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
