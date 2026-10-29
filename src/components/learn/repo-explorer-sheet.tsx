"use client";

import {
  ChevronDown,
  ChevronRight,
  FileCode2,
  Folder,
  Loader2,
  Sparkles,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { MarkdownView } from "@/components/markdown";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useT } from "@/i18n/client";
import {
  buildRepoTree,
  collectFolderPaths,
  flattenFiles,
  toggleExpandedPath,
  type RepoTreeNode,
} from "@/lib/repo-tree";
import { cn } from "@/lib/utils";
import {
  explainCodeAction,
  fetchFileContentAction,
  fetchRepoTreeAction,
} from "@/server/explain";

/**
 * Source-code explorer for repo-generated courses (Phase 4, part 2).
 *
 * The left pane is the same readable-file list the generator used (the server
 * filters it), with the files that actually grounded the course highlighted.
 * Picking a file loads at most 3,000 characters; "Explain with AI" then asks
 * `explainCodeAction` for a short, learner-facing explanation. Highlighting a
 * snippet inside the code viewer offers a second action that explains only that
 * part.
 */

/** Mirrors `MAX_SELECTED_CHARS` in `src/server/explain.ts`. */
const MAX_SELECTED_CHARS = 1_000;

type RepoExplorerSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repoUrl: string;
  branch: string | null;
  filePaths: string[];
};

type TreeStatus = "idle" | "loading" | "ready" | "error";

type FileState =
  | { status: "idle" }
  | { status: "loading"; path: string }
  | { status: "ready"; path: string; content: string; truncated: boolean }
  | { status: "error"; path: string; error: string };

type ExplainState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; explanation: string }
  | { status: "error"; error: string };

export function RepoExplorerSheet({
  open,
  onOpenChange,
  repoUrl,
  branch,
  filePaths,
}: RepoExplorerSheetProps) {
  const t = useT();

  const [treeStatus, setTreeStatus] = useState<TreeStatus>("idle");
  const [treeNodes, setTreeNodes] = useState<RepoTreeNode[]>([]);
  const [treeError, setTreeError] = useState<string | null>(null);
  const [treeTruncated, setTreeTruncated] = useState(false);
  const [resolvedBranch, setResolvedBranch] = useState<string | null>(null);
  const [expandedPaths, setExpandedPaths] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [activePath, setActivePath] = useState<string | null>(null);
  const [fileState, setFileState] = useState<FileState>({ status: "idle" });
  const [explainState, setExplainState] = useState<ExplainState>({
    status: "idle",
  });
  const [selectedCode, setSelectedCode] = useState("");
  const [selectionTruncated, setSelectionTruncated] = useState(false);

  const treeRequested = useRef(false);
  const fileRequest = useRef(0);
  const explainRequest = useRef(0);
  const preRef = useRef<HTMLPreElement>(null);
  const selectionActionRef = useRef<HTMLDivElement>(null);
  const selectedRangeRef = useRef<Range | null>(null);

  const highlightedPaths = useMemo(() => new Set(filePaths), [filePaths]);
  const folderPaths = useMemo(
    () => collectFolderPaths(treeNodes),
    [treeNodes],
  );

  const repoLabel = repoUrl
    .replace(/^https?:\/\/github\.com\//iu, "")
    .replace(/\/+$/u, "");
  const branchLabel =
    resolvedBranch ?? branch ?? t("lesson.source.defaultBranch");

  const clearSelection = useCallback((): void => {
    setSelectedCode("");
    setSelectionTruncated(false);
    selectedRangeRef.current = null;
    window.getSelection()?.removeAllRanges();
  }, []);

  function handleCodeMouseUp(): void {
    const selection = window.getSelection();
    const pre = preRef.current;

    if (
      selection === null ||
      selection.isCollapsed ||
      selection.rangeCount === 0 ||
      pre === null ||
      !pre.contains(selection.anchorNode) ||
      !pre.contains(selection.focusNode)
    ) {
      clearSelection();
      return;
    }

    const text = selection.toString().trim();

    if (text.length <= 10) {
      clearSelection();
      return;
    }

    const capped = text.slice(0, MAX_SELECTED_CHARS);
    // Keep the exact range so the highlight survives clicking the action bar.
    selectedRangeRef.current = selection.getRangeAt(0).cloneRange();
    setSelectedCode(capped);
    setSelectionTruncated(capped.length < text.length);
  }

  function restoreSelectionHighlight(): void {
    const range = selectedRangeRef.current;

    if (
      range === null ||
      !range.startContainer.isConnected ||
      !range.endContainer.isConnected
    ) {
      return;
    }

    const selection = window.getSelection();
    if (selection === null) {
      return;
    }

    try {
      selection.removeAllRanges();
      selection.addRange(range);
    } catch {
      // The code block was re-rendered since the selection was captured.
    }
  }

  const loadFile = useCallback(
    async (path: string, branchForRead: string | null): Promise<void> => {
      const request = ++fileRequest.current;
      // Any explanation for the previous file is now stale.
      explainRequest.current += 1;
      clearSelection();

      setActivePath(path);
      setFileState({ status: "loading", path });
      setExplainState({ status: "idle" });

      try {
        const result = await fetchFileContentAction({
          repoUrl,
          branch: branchForRead,
          filePath: path,
        });

        if (request !== fileRequest.current) {
          return;
        }

        if (!result.ok) {
          setFileState({ status: "error", path, error: result.error });
          return;
        }

        setFileState({
          status: "ready",
          path,
          content: result.content,
          truncated: result.truncated,
        });
      } catch (cause: unknown) {
        if (request !== fileRequest.current) {
          return;
        }

        setFileState({
          status: "error",
          path,
          error:
            cause instanceof Error
              ? cause.message
              : t("server.explain.fileFailed"),
        });
      }
    },
    [clearSelection, repoUrl, t],
  );

  const loadTree = useCallback(async (): Promise<void> => {
    fileRequest.current += 1;
    explainRequest.current += 1;
    clearSelection();

    setTreeStatus("loading");
    setTreeError(null);
    setActivePath(null);
    setFileState({ status: "idle" });
    setExplainState({ status: "idle" });

    try {
      const result = await fetchRepoTreeAction({ repoUrl, branch });

      if (!result.ok) {
        setTreeStatus("error");
        setTreeError(result.error);
        return;
      }

      const nodes = buildRepoTree(result.entries);

      setTreeNodes(nodes);
      setTreeTruncated(result.truncated);
      setResolvedBranch(result.branch);
      // Every folder starts open so the highlighted files are visible at once.
      setExpandedPaths(new Set(collectFolderPaths(nodes)));
      setTreeStatus("ready");

      const available = new Set(
        flattenFiles(nodes).map((file) => file.path),
      );
      const first =
        filePaths.find((path) => available.has(path)) ??
        flattenFiles(nodes)[0]?.path;

      if (first !== undefined) {
        void loadFile(first, result.branch);
      }
    } catch (cause: unknown) {
      setTreeStatus("error");
      setTreeError(
        cause instanceof Error
          ? cause.message
          : t("server.explain.treeFailed"),
      );
    }
  }, [branch, clearSelection, filePaths, loadFile, repoUrl, t]);

  // Load once per mounted sheet; closing keeps the tree cached for reopening.
  useEffect(() => {
    if (!open || treeRequested.current) {
      return;
    }

    treeRequested.current = true;
    void loadTree();
  }, [loadTree, open]);

  // Clicking outside the code block (or the selection action bar) clears the
  // snippet. The action bar is excluded so its own buttons keep working.
  useEffect(() => {
    if (selectedCode.length === 0) {
      return;
    }

    function selectionIsInsideCode(): boolean {
      const selection = window.getSelection();
      const pre = preRef.current;

      return (
        selection !== null &&
        !selection.isCollapsed &&
        selection.rangeCount > 0 &&
        pre !== null &&
        pre.contains(selection.anchorNode) &&
        pre.contains(selection.focusNode)
      );
    }

    function onPointerDown(event: PointerEvent): void {
      const target = event.target as Node | null;
      if (target === null) {
        return;
      }
      if (preRef.current?.contains(target)) {
        return;
      }
      if (selectionActionRef.current?.contains(target)) {
        return;
      }

      clearSelection();
    }

    function onMouseUp(): void {
      // Handles a drag that starts in the code block but ends outside it.
      if (!selectionIsInsideCode()) {
        clearSelection();
      }
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("mouseup", onMouseUp);

    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, [clearSelection, selectedCode]);

  function toggleFolder(path: string): void {
    setExpandedPaths((current) => toggleExpandedPath(current, path));
  }

  function selectFile(path: string): void {
    if (
      (fileState.status === "ready" && fileState.path === path) ||
      (fileState.status === "loading" && fileState.path === path)
    ) {
      return;
    }

    void loadFile(path, resolvedBranch);
  }

  async function runExplanation(selection?: string): Promise<void> {
    if (activePath === null || fileState.status !== "ready") {
      return;
    }

    // Clicking the action bar must not make the student lose track of the
    // snippet while the model is thinking.
    if (selection !== undefined) {
      restoreSelectionHighlight();
    }

    const request = ++explainRequest.current;
    setExplainState({ status: "loading" });

    try {
      const result = await explainCodeAction({
        repoUrl,
        branch: resolvedBranch ?? branch ?? "",
        filePath: activePath,
        selectedCode: selection,
      });

      if (request !== explainRequest.current) {
        return;
      }

      if (!result.ok) {
        setExplainState({ status: "error", error: result.error });
        return;
      }

      setExplainState({ status: "ready", explanation: result.explanation });
    } catch (cause: unknown) {
      if (request !== explainRequest.current) {
        return;
      }

      setExplainState({
        status: "error",
        error:
          cause instanceof Error
            ? cause.message
            : t("server.explain.codeFailed"),
      });
    }
  }

  function explainActiveFile(): void {
    void runExplanation();
  }

  function explainSelectedCode(): void {
    void runExplanation(selectedCode);
  }

  return (
    <Sheet
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          clearSelection();
        }
        onOpenChange(nextOpen);
      }}
      open={open}
    >
      <SheetContent closeLabel={t("lesson.source.close")}>
        <SheetHeader className="gap-1 border-b px-5 py-4 pr-14">
          <SheetTitle>{t("lesson.source.title")}</SheetTitle>
          <SheetDescription>
            {t("lesson.source.description", {
              repo: repoLabel,
              branch: branchLabel,
            })}
          </SheetDescription>
        </SheetHeader>

        <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,45%)_minmax(0,55%)] lg:grid-cols-[19rem_minmax(0,1fr)] lg:grid-rows-1">
          <aside
            aria-label={t("lesson.source.fileTree")}
            className="flex min-h-0 flex-col border-b lg:border-r lg:border-b-0"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2">
              <p className="text-xs text-muted-foreground">
                {t("lesson.source.selectedCount", { count: filePaths.length })}
              </p>
              <div className="flex items-center gap-1">
                <button
                  className="rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted/60 hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
                  disabled={
                    treeStatus !== "ready" ||
                    expandedPaths.size >= folderPaths.length
                  }
                  onClick={() => {
                    setExpandedPaths(new Set(folderPaths));
                  }}
                  type="button"
                >
                  {t("generate.form.repo.expandAll")}
                </button>
                <button
                  className="rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted/60 hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
                  disabled={expandedPaths.size === 0}
                  onClick={() => {
                    setExpandedPaths(new Set());
                  }}
                  type="button"
                >
                  {t("generate.form.repo.collapseAll")}
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {treeStatus === "loading" ? (
                <p className="flex items-center gap-2 p-2 text-xs text-muted-foreground">
                  <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
                  {t("lesson.source.loadingTree")}
                </p>
              ) : null}

              {treeStatus === "error" ? (
                <div className="space-y-2 p-2">
                  <p className="text-xs text-destructive">{treeError}</p>
                  <Button
                    onClick={() => {
                      void loadTree();
                    }}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    {t("lesson.source.retry")}
                  </Button>
                </div>
              ) : null}

              {treeStatus === "ready" && treeNodes.length === 0 ? (
                <p className="p-2 text-xs text-muted-foreground">
                  {t("lesson.source.treeEmpty")}
                </p>
              ) : null}

              {treeStatus === "ready" && treeNodes.length > 0 ? (
                <ExplorerTree
                  activePath={activePath}
                  expandedPaths={expandedPaths}
                  highlightedPaths={highlightedPaths}
                  nodes={treeNodes}
                  onSelect={selectFile}
                  onToggleFolder={toggleFolder}
                />
              ) : null}

              {treeStatus === "ready" && treeTruncated ? (
                <p className="px-2 pt-2 text-[0.7rem] text-muted-foreground">
                  {t("lesson.source.treeTruncated")}
                </p>
              ) : null}
            </div>
          </aside>

          <section className="min-h-0 overflow-y-auto p-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 break-all font-mono text-xs text-muted-foreground">
                    {activePath ?? t("lesson.source.selectFile")}
                  </p>
                  {activePath !== null && highlightedPaths.has(activePath) ? (
                    <Badge variant="secondary">
                      {t("lesson.source.grounded")}
                    </Badge>
                  ) : null}
                </div>

                {fileState.status === "idle" ? (
                  <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                    {t("lesson.source.selectFile")}
                  </p>
                ) : null}

                {fileState.status === "loading" ? (
                  <p className="flex items-center gap-2 rounded-lg border border-dashed px-4 py-8 text-sm text-muted-foreground">
                    <Loader2
                      aria-hidden="true"
                      className="size-4 animate-spin"
                    />
                    {t("lesson.source.fileLoading")}
                  </p>
                ) : null}

                {fileState.status === "error" ? (
                  <div className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
                    <p className="text-sm text-destructive">
                      {fileState.error}
                    </p>
                    <Button
                      onClick={() => {
                        void loadFile(fileState.path, resolvedBranch);
                      }}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      {t("lesson.source.retry")}
                    </Button>
                  </div>
                ) : null}

                {fileState.status === "ready" ? (
                  <div className="space-y-2">
                    <pre
                      className="max-h-[45vh] overflow-auto rounded-lg bg-muted/50 p-3 font-mono text-xs leading-relaxed"
                      onMouseUp={handleCodeMouseUp}
                      ref={preRef}
                    >
                      <code>{fileState.content}</code>
                    </pre>

                    {selectedCode.length > 10 ? (
                      <div
                        className="flex flex-wrap items-center gap-2 rounded-lg border bg-background p-2 shadow-sm"
                        onMouseDown={(event) => {
                          // Keep the native text selection alive while the
                          // action bar is clicked.
                          event.preventDefault();
                        }}
                        ref={selectionActionRef}
                      >
                        <p className="text-xs text-muted-foreground">
                          {selectionTruncated
                            ? t("lesson.source.selectionTruncated", {
                                count: MAX_SELECTED_CHARS,
                              })
                            : t("lesson.source.selectedChars", {
                                count: selectedCode.length,
                              })}
                        </p>
                        <Button
                          disabled={explainState.status === "loading"}
                          onClick={explainSelectedCode}
                          size="sm"
                          type="button"
                          variant="secondary"
                        >
                          {explainState.status === "loading" ? (
                            <Loader2
                              aria-hidden="true"
                              className="animate-spin"
                            />
                          ) : (
                            <Sparkles aria-hidden="true" />
                          )}
                          {explainState.status === "loading"
                            ? t("lesson.source.explaining")
                            : t("lesson.source.explainSelection")}
                        </Button>
                        <Button
                          onClick={clearSelection}
                          size="sm"
                          type="button"
                          variant="ghost"
                        >
                          {t("lesson.source.clearSelection")}
                        </Button>
                      </div>
                    ) : null}

                    {fileState.truncated ? (
                      <p className="text-xs text-muted-foreground">
                        {t("lesson.source.fileTruncated")}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div className="space-y-3 border-t pt-4">
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <Button
                    disabled={
                      fileState.status !== "ready" ||
                      explainState.status === "loading"
                    }
                    onClick={() => {
                      void explainActiveFile();
                    }}
                    size="sm"
                    type="button"
                  >
                    {explainState.status === "loading" ? (
                      <Loader2
                        aria-hidden="true"
                        className="animate-spin"
                      />
                    ) : (
                      <Sparkles aria-hidden="true" />
                    )}
                    {explainState.status === "loading"
                      ? t("lesson.source.explaining")
                      : t("lesson.source.explain")}
                  </Button>
                </div>

                {explainState.status === "error" ? (
                  <p className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                    {explainState.error}
                  </p>
                ) : null}

                {explainState.status === "ready" ? (
                  <div className="rounded-lg border bg-muted/30 p-4">
                    <p className="mb-2 text-xs font-medium text-muted-foreground">
                      {t("lesson.source.explanation")}
                    </p>
                    <MarkdownView>{explainState.explanation}</MarkdownView>
                  </div>
                ) : null}
              </div>
            </div>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}

type ExplorerTreeProps = {
  nodes: RepoTreeNode[];
  expandedPaths: ReadonlySet<string>;
  highlightedPaths: ReadonlySet<string>;
  activePath: string | null;
  onToggleFolder: (path: string) => void;
  onSelect: (path: string) => void;
};

/** Recursive tree rows: folders toggle, files load their source. */
function ExplorerTree({
  nodes,
  expandedPaths,
  highlightedPaths,
  activePath,
  onToggleFolder,
  onSelect,
}: ExplorerTreeProps) {
  const t = useT();

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
                <div className="ml-2 border-l pl-2">
                  <ExplorerTree
                    activePath={activePath}
                    expandedPaths={expandedPaths}
                    highlightedPaths={highlightedPaths}
                    nodes={node.children}
                    onSelect={onSelect}
                    onToggleFolder={onToggleFolder}
                  />
                </div>
              ) : null}
            </li>
          );
        }

        const isActive = activePath === node.path;
        const isHighlighted = highlightedPaths.has(node.path);

        return (
          <li key={node.path}>
            <button
              aria-current={isActive ? "true" : undefined}
              className={cn(
                "flex w-full items-center gap-1.5 rounded px-1 py-1 text-left text-xs",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "hover:bg-muted/60 hover:text-foreground",
                isHighlighted && !isActive ? "font-medium text-foreground" : "",
              )}
              onClick={() => {
                onSelect(node.path);
              }}
              title={node.path}
              type="button"
            >
              <FileCode2
                aria-hidden="true"
                className="size-3.5 shrink-0 text-muted-foreground"
              />
              <span className="truncate">{node.name}</span>
              {isHighlighted ? (
                <>
                  <span
                    aria-hidden="true"
                    className="ml-auto size-1.5 shrink-0 rounded-full bg-primary"
                  />
                  <span className="sr-only">
                    {t("lesson.source.grounded")}
                  </span>
                </>
              ) : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
