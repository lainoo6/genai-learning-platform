import type { RepoTreeEntry } from "@/lib/github-repo";

/**
 * Client-side view of the repository preview (Phase 3).
 *
 * The server sends one flat, path-sorted list of files. The form turns it into
 * a nested tree for display, and back into a flat list (in render order) for
 * "select all". Nothing here touches the network, so the module is safe to
 * import from a client component and from the server action schema alike.
 */

/** A course is grounded in at most this many files. */
export const MAX_SELECTED_FILES = 10;

export type RepoTreeNode =
  | { kind: "dir"; name: string; path: string; children: RepoTreeNode[] }
  | { kind: "file"; name: string; path: string; size?: number };

export type RepoFileNode = Extract<RepoTreeNode, { kind: "file" }>;

/** Directories first, then files, each level sorted by name. */
function sortLevel(nodes: RepoTreeNode[]): void {
  nodes.sort((a, b) => {
    if (a.kind !== b.kind) {
      return a.kind === "dir" ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });

  for (const node of nodes) {
    if (node.kind === "dir") {
      sortLevel(node.children);
    }
  }
}

/**
 * Groups a flat list of files into a tree. Directory nodes are created on
 * demand, so a repository that only contains `src/app/page.tsx` still shows
 * `src` and `app` as folders.
 */
export function buildRepoTree(entries: RepoTreeEntry[]): RepoTreeNode[] {
  const roots: RepoTreeNode[] = [];
  const directories = new Map<
    string,
    Extract<RepoTreeNode, { kind: "dir" }>
  >();

  for (const entry of entries) {
    const segments = entry.path.split("/").filter((segment) => segment.length > 0);
    if (segments.length === 0) {
      continue;
    }

    let siblings = roots;
    let parentPath = "";

    for (const segment of segments.slice(0, -1)) {
      const path = parentPath.length === 0 ? segment : `${parentPath}/${segment}`;

      let directory = directories.get(path);
      if (directory === undefined) {
        directory = { kind: "dir", name: segment, path, children: [] };
        directories.set(path, directory);
        siblings.push(directory);
      }

      siblings = directory.children;
      parentPath = path;
    }

    const name = segments[segments.length - 1] ?? "";
    siblings.push(
      entry.size === undefined
        ? { kind: "file", name, path: entry.path }
        : { kind: "file", name, path: entry.path, size: entry.size },
    );
  }

  sortLevel(roots);
  return roots;
}

/**
 * Pre-order walk that visits directories before their files, matching what the
 * tree renders. "Select all" uses this so the first N picked are the first N
 * visible.
 */
export function flattenFiles(nodes: RepoTreeNode[]): RepoFileNode[] {
  const files: RepoFileNode[] = [];

  for (const node of nodes) {
    if (node.kind === "file") {
      files.push(node);
    } else {
      files.push(...flattenFiles(node.children));
    }
  }

  return files;
}

/**
 * Every directory path in the tree, in render order. "Expand all" seeds the
 * expanded set from this, so the collapsed default is simply an empty set.
 */
export function collectFolderPaths(nodes: RepoTreeNode[]): string[] {
  const paths: string[] = [];

  for (const node of nodes) {
    if (node.kind === "dir") {
      paths.push(node.path);
      paths.push(...collectFolderPaths(node.children));
    }
  }

  return paths;
}

/**
 * Adds or removes one folder from the expanded set. Always returns a new Set so
 * React sees a state change; callers keep the old set untouched.
 */
export function toggleExpandedPath(
  current: ReadonlySet<string>,
  path: string,
): Set<string> {
  const next = new Set(current);

  if (next.has(path)) {
    next.delete(path);
  } else {
    next.add(path);
  }

  return next;
}

/** Compact file size for the tree rows: "512 B", "3.4 KB", "1.2 MB". */
export function formatBytes(size: number): string {
  if (!Number.isFinite(size) || size < 0) {
    return "";
  }

  if (size < 1024) {
    return `${Math.round(size)} B`;
  }

  const kilobytes = size / 1024;
  if (kilobytes < 1024) {
    return `${kilobytes < 10 ? kilobytes.toFixed(1) : Math.round(kilobytes)} KB`;
  }

  const megabytes = kilobytes / 1024;
  return `${megabytes < 10 ? megabytes.toFixed(1) : Math.round(megabytes)} MB`;
}

/** Paths sent with an AI explanation: enough context without a tree dump. */
export const MAX_EXPLAIN_NEIGHBORS = 50;
/** Reserve part of the budget for nearby modules instead of one huge folder. */
const MAX_SIBLING_NEIGHBORS = 30;

function directoryOf(path: string): string {
  const index = path.lastIndexOf("/");
  return index === -1 ? "" : path.slice(0, index);
}

/** Leading path segments two files share; "src/lib/a.ts" vs "src/app/b.ts" → 1. */
function sharedPathSegments(a: string, b: string): number {
  const left = a.split("/");
  const right = b.split("/");
  const max = Math.min(left.length, right.length);
  let shared = 0;

  while (shared < max && left[shared] === right[shared]) {
    shared += 1;
  }

  return shared;
}

/**
 * Picks the tree context for an AI explanation of `activePath`.
 *
 * The file's own directory comes first (at most 30 files), then the remaining
 * budget is filled with the closest files elsewhere: most shared leading
 * segments, then shallower paths, then alphabetical order. The active file is
 * excluded because the prompt already names it, and the list is capped so a
 * large monorepo cannot flood the prompt.
 */
export function collectExplainNeighbors(
  nodes: RepoTreeNode[],
  activePath: string,
  limit: number = MAX_EXPLAIN_NEIGHBORS,
): string[] {
  const target = Math.max(
    0,
    Math.min(limit, MAX_EXPLAIN_NEIGHBORS),
  );

  if (target === 0) {
    return [];
  }

  const activeDirectory = directoryOf(activePath);
  const siblings: string[] = [];
  const others: string[] = [];

  for (const path of new Set(flattenFiles(nodes).map((file) => file.path))) {
    if (path === activePath) {
      continue;
    }

    if (directoryOf(path) === activeDirectory) {
      siblings.push(path);
    } else {
      others.push(path);
    }
  }

  const selected = siblings.slice(
    0,
    Math.min(MAX_SIBLING_NEIGHBORS, target),
  );

  others.sort((a, b) => {
    const byShared =
      sharedPathSegments(b, activePath) - sharedPathSegments(a, activePath);
    if (byShared !== 0) {
      return byShared;
    }

    const byDepth = a.split("/").length - b.split("/").length;
    return byDepth !== 0 ? byDepth : a.localeCompare(b);
  });

  selected.push(...others.slice(0, target - selected.length));

  return selected;
}
