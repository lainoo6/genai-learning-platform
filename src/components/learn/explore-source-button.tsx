"use client";

import { Code2 } from "lucide-react";
import { useState, useSyncExternalStore } from "react";

import { RepoExplorerSheet } from "@/components/learn/repo-explorer-sheet";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/client";

type ExploreSourceButtonProps = {
  /** Course the repository belongs to; scopes the "already opened" memory. */
  courseId: string;
  /** Canonical repository URL stored on the course. */
  repoUrl: string;
  /** Branch the course was generated from; null only for legacy rows. */
  branch: string | null;
  /** Files the teacher selected and that actually grounded the course. */
  filePaths: string[];
};

/**
 * `useSyncExternalStore` seam for the "already opened" flag.
 *
 * The dot never needs to react to another tab's storage write, so there is
 * nothing to unsubscribe from; the click handler updates local state itself.
 */
function subscribeToStorage(): () => void {
  return () => {
    // No external subscription: opening the explorer hides the dot directly.
  };
}

/** Returns true when the storage key exists; unavailable storage counts as seen. */
function hasSeenExplorer(storageKey: string): boolean {
  try {
    return window.localStorage.getItem(storageKey) !== null;
  } catch {
    return true;
  }
}

/**
 * Entry point for the repository explorer (Phase 4).
 *
 * The button itself only owns the open state; the sheet loads the tree and file
 * content through server actions, so no repository data is sent until a learner
 * asks for it.
 *
 * A pulsing dot marks the feature as unseen. It is remembered per course in
 * `localStorage`: `useSyncExternalStore` reads it after hydration (the server
 * snapshot assumes "seen", so markup always matches), and opening the explorer
 * writes the key and hides the dot immediately.
 */
export function ExploreSourceButton({
  courseId,
  repoUrl,
  branch,
  filePaths,
}: ExploreSourceButtonProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [openedHere, setOpenedHere] = useState(false);

  const storageKey = `source-explorer-seen:${courseId}`;
  const seenBefore = useSyncExternalStore(
    subscribeToStorage,
    () => hasSeenExplorer(storageKey),
    () => true,
  );
  const showNewCue = !seenBefore && !openedHere;

  function openExplorer(): void {
    setOpen(true);
    setOpenedHere(true);

    try {
      window.localStorage.setItem(storageKey, "1");
    } catch {
      // The cue simply reappears next time; opening must never fail.
    }
  }

  return (
    <>
      <Button
        className="font-semibold shadow-sm"
        onClick={openExplorer}
        size="sm"
        type="button"
        variant="default"
      >
        <Code2 aria-hidden="true" />
        {t("lesson.exploreSource")}
        {showNewCue ? (
          <span aria-hidden="true" className="relative ml-0.5 flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary-foreground/70" />
            <span className="relative inline-flex size-2 rounded-full bg-primary-foreground" />
          </span>
        ) : null}
        {showNewCue ? (
          <span className="sr-only">{t("lesson.exploreSourceNew")}</span>
        ) : null}
      </Button>
      <RepoExplorerSheet
        branch={branch}
        filePaths={filePaths}
        key={repoUrl}
        onOpenChange={setOpen}
        open={open}
        repoUrl={repoUrl}
      />
    </>
  );
}
