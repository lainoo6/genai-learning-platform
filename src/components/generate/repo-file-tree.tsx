"use client";

import { FileCode2, Folder } from "lucide-react";

import { Checkbox } from "@/components/ui/checkbox";
import { formatBytes, type RepoTreeNode } from "@/lib/repo-tree";
import { cn } from "@/lib/utils";

/**
 * Read-only repository tree for the generate form (Phase 3).
 *
 * Folders are derived on the client from the flat path list, so this component
 * only renders what it is given: no collapsing, no state. Indentation comes
 * from nesting (`ml-2 border-l pl-3`), which keeps deep paths readable inside
 * the scroll container.
 */

type RepoFileTreeProps = {
  nodes: RepoTreeNode[];
  selected: ReadonlySet<string>;
  onToggle: (path: string) => void;
  /** A generation is running; nothing may change. */
  disabled: boolean;
  /** The selection limit is reached, so unchecked rows are blocked. */
  limitReached: boolean;
};

export function RepoFileTree({
  nodes,
  selected,
  onToggle,
  disabled,
  limitReached,
}: RepoFileTreeProps) {
  return (
    <ul className="space-y-0.5">
      {nodes.map((node) => {
        if (node.kind === "dir") {
          return (
            <li key={node.path}>
              <div className="flex items-center gap-1.5 py-1 text-xs font-medium text-muted-foreground">
                <Folder aria-hidden="true" className="size-3.5 shrink-0" />
                <span className="truncate">{node.name}</span>
              </div>
              <div className="ml-2 border-l pl-3">
                <RepoFileTree
                  disabled={disabled}
                  limitReached={limitReached}
                  nodes={node.children}
                  onToggle={onToggle}
                  selected={selected}
                />
              </div>
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
