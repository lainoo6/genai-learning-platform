"use client";

import { Code } from "lucide-react";
import { useState } from "react";

import { RepoExplorerSheet } from "@/components/learn/repo-explorer-sheet";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/client";

type ExploreSourceButtonProps = {
  /** Canonical repository URL stored on the course. */
  repoUrl: string;
  /** Branch the course was generated from; null only for legacy rows. */
  branch: string | null;
  /** Files the teacher selected and that actually grounded the course. */
  filePaths: string[];
};

/**
 * Entry point for the repository explorer (Phase 4).
 *
 * The button itself only owns the open state; the sheet loads the tree and file
 * content through server actions, so no repository data is sent until a learner
 * asks for it.
 */
export function ExploreSourceButton({
  repoUrl,
  branch,
  filePaths,
}: ExploreSourceButtonProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        onClick={() => {
          setOpen(true);
        }}
        size="sm"
        type="button"
        variant="outline"
      >
        <Code aria-hidden="true" />
        {t("lesson.exploreSource")}
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
