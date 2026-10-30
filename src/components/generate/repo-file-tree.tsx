"use client";

import { ChevronDown, ChevronRight, FileCode2, Folder } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { useT } from "@/i18n/client";
import {
  collectFolderPaths,
  formatBytes,
  toggleExpandedPath,
  type RepoTreeNode,
} from "@/lib/repo-tree";
import { cn } from "@/lib/utils";

/**
 * Read-only repository tree for the generate form (Phase 3).
 *
 * Folders are derived on the client from the flat path list, so this component
 * only renders what it is given: no selection state of its own. Expansion is
 * local UI state: every folder starts collapsed, and the header buttons expand
 * or collapse the whole tree at once. Indentation comes from nesting
 * (`ml-2 border-l pl-3`), which keeps deep paths readable inside the scroll
 * container.
 */

type RepoFileTreeProps = {
  nodes: RepoTreeNode[];
  selected: ReadonlySet<string>;
  onToggle: (path: string) => void;
  /** A generation is running; nothing may change. */
  disabled: boolean;
  /** The selection limit is reached, so unchecked rows are blocked. */
  limitReached: boolean;
  /**
   * Bump this to expand every folder. Used after an AI suggestion so the chosen
   * files are visible without a manual "Expand all".
   */
  revealNonce?: number;
};

type TreeLevelProps = RepoFileTreeProps & {
  expandedPaths: ReadonlySet<string>;
  onToggleFolder: (path: string) => void;
};

export function RepoFileTree({
  nodes,
  selected,
  onToggle,
  disabled,
  limitReached,
  revealNonce,
}: RepoFileTreeProps) {
  const t = useT();
  const folderPaths = useMemo(() => collectFolderPaths(nodes), [nodes]);
  const [expandedPaths, setExpandedPaths] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const lastReveal = useRef(revealNonce);

  // Expansion is local state and starts empty (everything collapsed). A new
  // nonce means a caller wants the whole tree open; the initial value is
  // recorded so mounting does not expand anything by itself.
  useEffect(() => {
    if (revealNonce === undefined || revealNonce === lastReveal.current) {
      return;
    }

    lastReveal.current = revealNonce;
    setExpandedPaths(new Set(folderPaths));
  }, [folderPaths, revealNonce]);

  const canExpand = expandedPaths.size < folderPaths.length;
  const canCollapse = expandedPaths.size > 0;

  function toggleFolder(path: string): void {
    setExpandedPaths((current) => toggleExpandedPath(current, path));
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-end gap-1">
        <button
          className="rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted/60 hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
          disabled={!canExpand}
          onClick={() => {
            setExpandedPaths(new Set(folderPaths));
          }}
          type="button"
        >
          {t("generate.form.repo.expandAll")}
        </button>
        <button
          className="rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted/60 hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
          disabled={!canCollapse}
          onClick={() => {
            setExpandedPaths(new Set());
          }}
          type="button"
        >
          {t("generate.form.repo.collapseAll")}
        </button>
      </div>
      <TreeLevel
        disabled={disabled}
        expandedPaths={expandedPaths}
        limitReached={limitReached}
        nodes={nodes}
        onToggle={onToggle}
        onToggleFolder={toggleFolder}
        selected={selected}
      />
    </div>
  );
}

function TreeLevel({
  nodes,
  selected,
  onToggle,
  onToggleFolder,
  expandedPaths,
  disabled,
  limitReached,
}: TreeLevelProps) {
  return (
    <ul className="space-y-0.5">
      {nodes.map((node) => {
        if (node.kind === "dir") {
          const isExpanded = expandedPaths.has(node.path);

          return (
            <li key={node.path}>
              <button
                aria-expanded={isExpanded}
                className="flex w-full items-center gap-1.5 rounded px-1 py-1 text-left text-xs font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                onClick={() => {
                  onToggleFolder(node.path);
                }}
                type="button"
              >
                {isExpanded ? (
                  <ChevronDown
                    aria-hidden="true"
                    className="size-3.5 shrink-0"
                  />
                ) : (
                  <ChevronRight
                    aria-hidden="true"
                    className="size-3.5 shrink-0"
                  />
                )}
                <Folder aria-hidden="true" className="size-3.5 shrink-0" />
                <span className="truncate">{node.name}</span>
              </button>
              {isExpanded ? (
                <div className="ml-2 border-l pl-3">
                  <TreeLevel
                    disabled={disabled}
                    expandedPaths={expandedPaths}
                    limitReached={limitReached}
                    nodes={node.children}
                    onToggle={onToggle}
                    onToggleFolder={onToggleFolder}
                    selected={selected}
                  />
                </div>
              ) : null}
            </li>
          );
        }

        const checked = selected.has(node.path);
        const blocked = disabled || (!checked && limitReached);

        return (
          <li key={node.path}>
            <label
              className={cn(
                "flex items-center gap-2 rounded px-1 py-1 text-sm",
                blocked
                  ? "cursor-not-allowed opacity-60"
                  : "cursor-pointer hover:bg-muted/60",
              )}
            >
              <Checkbox
                checked={checked}
                disabled={blocked}
                onCheckedChange={() => {
                  onToggle(node.path);
                }}
              />
              <FileCode2
                aria-hidden="true"
                className="size-3.5 shrink-0 text-muted-foreground"
              />
              <span className="truncate">{node.name}</span>
              {node.size === undefined ? null : (
                <span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">
                  {formatBytes(node.size)}
                </span>
              )}
            </label>
          </li>
        );
      })}
    </ul>
  );
}
