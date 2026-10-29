/**
 * GitHub repository reading for repo-to-course generation (Phase 1).
 *
 * This module owns every network call to GitHub so the rest of the app never
 * talks to the API directly. Every failure is raised as a `GithubRepoError`
 * carrying a stable code and a message that is safe to show to a learner.
 *
 * Request budget per analysis is small and predictable: one repository lookup
 * (only when no branch was given), one recursive tree call, and at most one
 * Contents call per analysed file. Nothing here retries or sleeps — a server
 * action must fail fast.
 */

const GITHUB_API = "https://api.github.com";
const USER_AGENT = "genai-learning-platform";
const API_VERSION = "2022-11-28";
const REQUEST_TIMEOUT_MS = 15_000;

/** Files larger than this are never requested (also the Contents API ceiling). */
const MAX_FILE_BYTES = 1_000_000;
/** Raw tree entries read before giving up on the rest of a huge tree. */
const MAX_RAW_ENTRIES = 20_000;
/** Filtered candidates kept before key-file scoring. */
const MAX_CANDIDATE_FILES = 400;
/** Analyzed files per run, and the hard ceiling for a direct caller. */
const DEFAULT_KEY_FILE_LIMIT = 15;
const MAX_KEY_FILE_LIMIT = 25;
/** Prompt budget: per file and for the whole set. */
const MAX_FILE_CHARS = 12_000;
const MAX_TOTAL_CHARS = 80_000;
const MIN_FILE_CHARS = 200;

/** Parsed form of a GitHub URL; `subpath` narrows a monorepo. */
export type RepoRef = {
  owner: string;
  repo: string;
  branch?: string;
  subpath?: string;
};

/** One entry of the recursive tree (submodules are dropped). */
export type RepoTreeEntry = {
  path: string;
  type: "blob" | "tree";
  /** GitHub omits the size for trees and for unusually large blobs. */
  size?: number;
};

export type RepoTree = {
  /** Branch actually read: the one from the URL, otherwise the default. */
  branch: string;
  entries: RepoTreeEntry[];
  /** GitHub's "tree too large to list completely" flag (or our own cap). */
  truncated: boolean;
};

/** A file that made it into the analysis prompt. */
export type KeyFile = {
  path: string;
  content: string;
  truncated: boolean;
};

export type GithubErrorCode =
  | "INVALID_URL"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "ACCESS_DENIED"
  | "EMPTY_REPO"
  | "NO_FILES"
  | "TOO_LARGE"
  | "NETWORK"
  | "HTTP_ERROR";

/** Every GitHub failure surfaces as this class, never as a raw fetch error. */
export class GithubRepoError extends Error {
  readonly code: GithubErrorCode;

  constructor(code: GithubErrorCode, message: string) {
    super(message);
    this.name = "GithubRepoError";
    this.code = code;
  }
}

const OWNER_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/u;
const REPO_PATTERN = /^[A-Za-z0-9._-]{1,100}$/u;

function safeDecode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/**
 * Extracts `{ owner, repo, branch?, subpath? }` from a GitHub repository URL.
 *
 * Accepts `github.com/owner/repo` with or without a protocol, a `.git` suffix,
 * a trailing slash, a query string, or a `/tree/<branch>/<path>` suffix. Other
 * sub-pages (`/issues`, `/blob/...`) collapse to the repository root.
 *
 * Limitation: a branch name is a single path segment, so `tree/feat/login`
 * reads branch `feat` with subpath `login`. That is the common case; branches
 * whose names contain a slash should be passed to `fetchRepoTree` directly.
 */
export function parseRepoUrl(url: string): RepoRef | null {
  const trimmed = url.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//iu.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(withProtocol);
  } catch {
    return null;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return null;
  }

  const host = parsed.hostname.toLowerCase().replace(/^www\./u, "");
  if (host !== "github.com") {
    return null;
  }

  const segments = parsed.pathname
    .split("/")
    .filter((segment) => segment.length > 0)
    .map(safeDecode);

  const owner = segments[0];
  const rawRepo = segments[1];
  if (owner === undefined || rawRepo === undefined) {
    return null;
  }

  const repo = rawRepo.replace(/\.git$/iu, "");
  if (!OWNER_PATTERN.test(owner) || !REPO_PATTERN.test(repo)) {
    return null;
  }

  const ref: RepoRef = { owner, repo };
  const rest = segments.slice(2);

  if (rest[0] === "tree" && rest[1] !== undefined && rest[1].length > 0) {
    ref.branch = rest[1];
    const subpath = rest.slice(2).join("/");
    if (subpath.length > 0) {
      ref.subpath = subpath;
    }
  }

  return ref;
}

function githubToken(): string | null {
  const token = process.env.GITHUB_TOKEN?.trim();
  return token === undefined || token.length === 0 ? null : token;
}

function repoPath(owner: string, repo: string): string {
  return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
}

/** Encodes a branch without escaping its `/` separators. */
function encodeRef(branch: string): string {
  return branch
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function encodeContentPath(path: string): string {
  return path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function headerNumber(response: Response, name: string): number | null {
  const raw = response.headers.get(name);
  if (raw === null || raw.trim().length === 0) {
    return null;
  }
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function rateLimitMessage(
  reset: number | null,
  retryAfter: number | null,
): string {
  const retryIn = retryAfter !== null && retryAfter > 0
    ? ` Try again in ${Math.ceil(retryAfter / 60)} minute(s).`
    : "";

  if (reset !== null && reset > 0) {
    const resetsAt = new Date(reset * 1_000);
    const clock = resetsAt.toTimeString().slice(0, 5);
    const minutes = Math.max(1, Math.ceil((resetsAt.getTime() - Date.now()) / 60_000));
    return `GitHub API rate limit exceeded. It resets at ${clock} (in about ${minutes} minute(s)).${retryIn} Add GITHUB_TOKEN to .env.local to raise the limit to 5,000 requests per hour.`;
  }

  return `GitHub API rate limit exceeded.${retryIn} Add GITHUB_TOKEN to .env.local to raise the limit to 5,000 requests per hour.`;
}

/** Maps a non-2xx response onto a typed, user-safe error. */
function githubError(response: Response): GithubRepoError {
  const status = response.status;
  const remaining = headerNumber(response, "x-ratelimit-remaining");
  const reset = headerNumber(response, "x-ratelimit-reset");
  const retryAfter = headerNumber(response, "retry-after");

  const rateLimited =
    status === 429 ||
    (status === 403 && (remaining === 0 || retryAfter !== null));

  if (rateLimited) {
    return new GithubRepoError(
      "RATE_LIMITED",
      rateLimitMessage(reset, retryAfter),
    );
  }

  if (status === 401) {
    return new GithubRepoError(
      "ACCESS_DENIED",
      "GitHub rejected the request. Check that GITHUB_TOKEN is valid and has not expired.",
    );
  }

  if (status === 403) {
    return new GithubRepoError(
      "ACCESS_DENIED",
      "GitHub denied access to this repository. It may be private, or your token may need the `repo` scope (and SSO authorisation for the organisation).",
    );
  }

  if (status === 404) {
    return new GithubRepoError(
      "NOT_FOUND",
      "Repository not found. It may be private, renamed or deleted — check the URL, or set GITHUB_TOKEN if it is private.",
    );
  }

  if (status === 409) {
    return new GithubRepoError(
      "EMPTY_REPO",
      "This repository is empty, so there is nothing to analyze yet.",
    );
  }

  if (status === 451) {
    return new GithubRepoError(
      "ACCESS_DENIED",
      "This repository is unavailable for legal reasons and cannot be read.",
    );
  }

  return new GithubRepoError(
    "HTTP_ERROR",
    `GitHub returned an unexpected response (HTTP ${status}). Please try again.`,
  );
}

async function githubRequest<T>(path: string): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": API_VERSION,
    "User-Agent": USER_AGENT,
  };

  const token = githubToken();
  if (token !== null) {
    headers.Authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(`${GITHUB_API}${path}`, {
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new GithubRepoError(
      "NETWORK",
      "Could not reach GitHub. Check your connection and try again.",
    );
  }

  if (!response.ok) {
    throw githubError(response);
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new GithubRepoError(
      "HTTP_ERROR",
      "GitHub returned a response that could not be read. Please try again.",
    );
  }
}

async function fetchDefaultBranch(
  owner: string,
  repo: string,
): Promise<string> {
  const payload = await githubRequest<{ default_branch?: unknown }>(
    repoPath(owner, repo),
  );

  const branch =
    typeof payload.default_branch === "string"
      ? payload.default_branch.trim()
      : "";

  if (branch.length === 0) {
    throw new GithubRepoError(
      "EMPTY_REPO",
      "This repository has no default branch, so there is nothing to analyze yet.",
    );
  }

  return branch;
}

type RawTreeItem = {
  path?: unknown;
  type?: unknown;
  size?: unknown;
};

/**
 * Reads the whole tree of one branch through the Git Trees API
 * (`recursive=1`) and resolves the branch that was actually read.
 *
 * A tree GitHub marks as truncated is still used — it normally contains
 * thousands of entries — but the flag is carried on the result so the caller
 * can tell the user the listing was partial.
 */
export async function fetchRepoTree(
  owner: string,
  repo: string,
  branch?: string,
): Promise<RepoTree> {
  const resolvedBranch =
    branch !== undefined && branch.trim().length > 0
      ? branch.trim()
      : await fetchDefaultBranch(owner, repo);

  const payload = await githubRequest<{
    tree?: unknown;
    truncated?: unknown;
  }>(
    `${repoPath(owner, repo)}/git/trees/${encodeRef(resolvedBranch)}?recursive=1`,
  );

  if (!Array.isArray(payload.tree)) {
    throw new GithubRepoError(
      "HTTP_ERROR",
      "GitHub returned an unexpected repository tree. Please try again.",
    );
  }

  const raw = payload.tree as RawTreeItem[];
  const capped = raw.slice(0, MAX_RAW_ENTRIES);
  const entries: RepoTreeEntry[] = [];

  for (const item of capped) {
    if (item === null || typeof item !== "object") {
      continue;
    }

    const path = typeof item.path === "string" ? item.path : "";
    if (path.length === 0) {
      continue;
    }

    // Submodules ("commit") have no readable content through the Contents API.
    if (item.type !== "blob" && item.type !== "tree") {
      continue;
    }

    entries.push({
      path,
      type: item.type,
      size: typeof item.size === "number" ? item.size : undefined,
    });
  }

  return {
    branch: resolvedBranch,
    entries,
    truncated: payload.truncated === true || raw.length > MAX_RAW_ENTRIES,
  };
}

const IGNORED_DIRECTORIES = new Set([
  "node_modules",
  "bower_components",
  "jspm_packages",
  "dist",
  "build",
  "out",
  "coverage",
  "vendor",
  ".git",
  ".next",
  ".nuxt",
  ".svelte-kit",
  ".turbo",
  ".cache",
  ".gradle",
  "__pycache__",
  ".venv",
  "venv",
  "target",
  "pods",
  "deriveddata",
  ".terraform",
  ".idea",
  ".vscode",
]);

const IGNORED_FILE_NAMES = new Set([
  "package-lock.json",
  "npm-shrinkwrap.json",
  "pnpm-lock.yaml",
  "bun.lockb",
  "composer.lock",
  "go.sum",
]);

const IGNORED_EXTENSIONS = [
  // images
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".avif",
  ".bmp",
  ".tif",
  ".tiff",
  ".ico",
  ".icns",
  ".svg",
  // fonts
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
  ".eot",
  // audio / video
  ".mp3",
  ".wav",
  ".ogg",
  ".flac",
  ".mp4",
  ".webm",
  ".mov",
  ".avi",
  ".mkv",
  // archives and binaries
  ".zip",
  ".tar",
  ".gz",
  ".tgz",
  ".rar",
  ".7z",
  ".bz2",
  ".xz",
  ".exe",
  ".dll",
  ".so",
  ".dylib",
  ".bin",
  ".pdf",
  ".psd",
  ".ai",
  ".sketch",
  ".fig",
  // generated / minified output
  ".map",
  ".min.js",
  ".min.css",
];

function isIgnoredPath(path: string): boolean {
  const segments = path.split("/");

  for (const segment of segments.slice(0, -1)) {
    const lower = segment.toLowerCase();
    if (lower.startsWith(".") || IGNORED_DIRECTORIES.has(lower)) {
      return true;
    }
  }

  const base = (segments[segments.length - 1] ?? "").toLowerCase();
  if (base.length === 0 || base.startsWith(".")) {
    return true;
  }

  if (IGNORED_FILE_NAMES.has(base) || base.endsWith(".lock")) {
    return true;
  }

  return IGNORED_EXTENSIONS.some((extension) => base.endsWith(extension));
}

/** `packages/api/` from `packages/api`; rejects `.` and `..` segments. */
function normaliseSubpath(subpath: string | undefined): string | null {
  if (subpath === undefined) {
    return null;
  }

  const segments = subpath
    .split("/")
    .map((segment) => segment.trim())
    .filter(
      (segment) =>
        segment.length > 0 && segment !== "." && segment !== "..",
    );

  return segments.length === 0 ? null : `${segments.join("/")}/`;
}

function isRelevantPathWithin(path: string, prefix: string | null): boolean {
  if (path.length === 0) {
    return false;
  }

  if (prefix !== null && !path.startsWith(prefix)) {
    return false;
  }

  return !isIgnoredPath(path);
}

/**
 * The per-path rule behind the file preview: inside the optional subpath and
 * not something a course can use (dependencies, build output, lockfiles,
 * minified files, dotfiles, binaries, media). The size ceiling lives in
 * `filterRelevantFiles` because it needs the tree entry, and the Contents API
 * rejects oversized files anyway.
 *
 * Exported so a server action can re-check caller-supplied paths before it
 * downloads anything.
 */
export function isRelevantPath(path: string, subpath?: string): boolean {
  return isRelevantPathWithin(path, normaliseSubpath(subpath));
}

export type RelevantFiles = {
  files: RepoTreeEntry[];
  /** The 400-file preview cap dropped at least one candidate. */
  truncated: boolean;
};

/**
 * Drops everything that cannot help a course: dependencies and build output,
 * lockfiles, minified files, images, fonts, media, binaries, and any file over
 * 1 MB. Only blobs are kept, and the result is capped so a monorepo cannot
 * flood the file list (or the later scoring pass).
 *
 * `truncated` tells the caller whether the cap actually hid files, which is
 * what the preview needs to show its "listing is partial" note.
 */
export function filterRelevantFilesWithMeta(
  tree: RepoTreeEntry[],
  subpath?: string,
): RelevantFiles {
  const prefix = normaliseSubpath(subpath);
  const seen = new Set<string>();
  const files: RepoTreeEntry[] = [];

  for (const entry of tree) {
    if (entry.type !== "blob") {
      continue;
    }

    const path = entry.path;
    if (path.length === 0 || seen.has(path)) {
      continue;
    }

    if (!isRelevantPathWithin(path, prefix)) {
      continue;
    }

    if (typeof entry.size === "number" && entry.size > MAX_FILE_BYTES) {
      continue;
    }

    seen.add(path);
    files.push(entry);
  }

  files.sort((a, b) => a.path.localeCompare(b.path));

  return {
    files: files.slice(0, MAX_CANDIDATE_FILES),
    truncated: files.length > MAX_CANDIDATE_FILES,
  };
}

/** Backwards-compatible wrapper for the analysis pipeline. */
export function filterRelevantFiles(
  tree: RepoTreeEntry[],
  subpath?: string,
): RepoTreeEntry[] {
  return filterRelevantFilesWithMeta(tree, subpath).files;
}

/**
 * Decodes one file through the Contents API. Binary payloads, directories and
 * oversized files are rejected rather than returned as garbage.
 */
export async function fetchFileContent(
  owner: string,
  repo: string,
  path: string,
  ref?: string,
): Promise<string> {
  const query =
    ref === undefined || ref.trim().length === 0
      ? ""
      : `?ref=${encodeURIComponent(ref.trim())}`;

  const payload = await githubRequest<{
    type?: unknown;
    encoding?: unknown;
    content?: unknown;
    size?: unknown;
  }>(
    `${repoPath(owner, repo)}/contents/${encodeContentPath(path)}${query}`,
  );

  if (typeof payload.size === "number" && payload.size > MAX_FILE_BYTES) {
    throw new GithubRepoError(
      "TOO_LARGE",
      `\`${path}\` is larger than 1 MB and was skipped.`,
    );
  }

  if (
    payload.type !== "file" ||
    payload.encoding !== "base64" ||
    typeof payload.content !== "string"
  ) {
    throw new GithubRepoError(
      "TOO_LARGE",
      `\`${path}\` could not be read as text (it may be binary or too large).`,
    );
  }

  const decoded = Buffer.from(
    payload.content.replace(/\s+/gu, ""),
    "base64",
  ).toString("utf8");

  if (decoded.length === 0) {
    throw new GithubRepoError(
      "NO_FILES",
      `\`${path}\` is empty and was skipped.`,
    );
  }

  return decoded;
}

export type SelectedFiles = {
  /** Readable files, in the caller's order. */
  files: KeyFile[];
  /** Paths that were requested but could not be read (deleted, binary, too large). */
  skipped: string[];
  /** The per-file or total prompt budget cut the content short. */
  truncated: boolean;
};

/**
 * Downloads exactly the files a teacher selected, never a scored subset.
 *
 * The request shape mirrors `fetchKeyFiles`: four concurrent Contents calls,
 * one unreadable file is skipped, and a rate limit, network or permission
 * failure aborts the run because every later request would fail too. Content is
 * then cut to the same prompt budget (12,000 characters per file, 80,000 in
 * total) so ten large files cannot overflow the course prompt.
 */
export async function fetchSelectedFiles(
  owner: string,
  repo: string,
  paths: string[],
  branch?: string,
): Promise<SelectedFiles> {
  const unique = [...new Set(paths.map((path) => path.trim()))].filter(
    (path) => path.length > 0,
  );

  if (unique.length === 0) {
    throw new GithubRepoError("NO_FILES", "No files were selected.");
  }

  const fetched: Array<{ path: string; content: string } | undefined> =
    new Array(unique.length);
  const skipped: string[] = [];
  const fatal: GithubRepoError[] = [];
  let cursor = 0;

  const worker = async (): Promise<void> => {
    for (;;) {
      if (fatal.length > 0) {
        return;
      }

      const index = cursor;
      cursor += 1;
      const path = unique[index];
      if (path === undefined) {
        return;
      }

      try {
        const content = await fetchFileContent(owner, repo, path, branch);
        fetched[index] = { path, content };
      } catch (error: unknown) {
        const failure =
          error instanceof GithubRepoError
            ? error
            : new GithubRepoError(
                "NETWORK",
                `Could not read \`${path}\` from GitHub.`,
              );

        if (
          failure.code === "RATE_LIMITED" ||
          failure.code === "ACCESS_DENIED" ||
          failure.code === "NETWORK"
        ) {
          fatal.push(failure);
          return;
        }

        skipped.push(path);
        console.warn(`[github] skipped ${path}: ${failure.message}`);
      }
    }
  };

  const workerCount = Math.min(4, unique.length);
  await Promise.all(
    Array.from({ length: workerCount }, () => worker()),
  );

  const firstFatal = fatal[0];
  if (firstFatal !== undefined) {
    throw firstFatal;
  }

  const files: KeyFile[] = [];
  let remaining = MAX_TOTAL_CHARS;
  let truncated = false;

  for (const file of fetched) {
    if (file === undefined) {
      continue;
    }

    if (remaining <= 0) {
      truncated = true;
      break;
    }

    const allowance = Math.min(
      file.content.length,
      MAX_FILE_CHARS,
      remaining,
    );

    // A sliver of a file teaches the model nothing; stop here instead.
    if (allowance < MIN_FILE_CHARS && file.content.length > allowance) {
      truncated = true;
      break;
    }

    const content = cutAtLineEnd(file.content, allowance);
    remaining -= content.length;
    truncated = truncated || content.length < file.content.length;
    files.push({
      path: file.path,
      content,
      truncated: content.length < file.content.length,
    });
  }

  if (files.length === 0) {
    throw new GithubRepoError(
      "NO_FILES",
      "None of the selected files could be read as text.",
    );
  }

  return { files, skipped, truncated };
}

const ENTRY_FILE_NAMES = new Set([
  "index.ts",
  "index.tsx",
  "index.js",
  "index.jsx",
  "index.mjs",
  "index.cjs",
  "main.ts",
  "main.tsx",
  "main.js",
  "main.jsx",
  "main.mjs",
  "main.py",
  "app.py",
  "manage.py",
  "__main__.py",
  "server.ts",
  "server.js",
  "app.ts",
  "app.tsx",
  "app.js",
  "app.jsx",
  "main.go",
  "main.rs",
  "lib.rs",
  "main.java",
  "main.kt",
  "program.cs",
  "main.cs",
  "index.php",
  "main.rb",
  "config.ru",
  "app.rb",
  "main.c",
  "main.cpp",
  "main.cc",
]);

const MANIFEST_FILE_NAMES = new Set([
  "package.json",
  "pyproject.toml",
  "requirements.txt",
  "go.mod",
  "cargo.toml",
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
  "composer.json",
  "gemfile",
  "deno.json",
  "tsconfig.json",
]);

const SOURCE_DIRECTORIES = [
  "src/",
  "app/",
  "lib/",
  "packages/",
  "server/",
  "api/",
  "components/",
];

function baseName(path: string): string {
  return (path.split("/").pop() ?? "").toLowerCase();
}

/**
 * README > entry files > manifests > files under a source directory > the rest.
 * The manifest tier sits between the first two so a root `package.json` survives
 * the 15-file limit, which is what lets the model recognise the stack.
 */
function keyFileScore(path: string): number {
  const base = baseName(path);

  if (base.startsWith("readme")) {
    return 100;
  }

  if (ENTRY_FILE_NAMES.has(base)) {
    return 90;
  }

  if (MANIFEST_FILE_NAMES.has(base)) {
    return 70;
  }

  const lower = path.toLowerCase();
  if (
    SOURCE_DIRECTORIES.some(
      (directory) =>
        lower.startsWith(directory) || lower.includes(`/${directory}`),
    )
  ) {
    return 60;
  }

  return 10;
}

function cutAtLineEnd(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }

  const slice = text.slice(0, maxChars);
  const lastBreak = slice.lastIndexOf("\n");
  const body =
    lastBreak > maxChars * 0.5 ? slice.slice(0, lastBreak) : slice;

  return body.trimEnd();
}

/**
 * Orders entries by teaching value: README > entry files > manifests > files
 * under a source directory > everything else, shallower paths first.
 *
 * Shared by the analysis pipeline (`fetchKeyFiles`) and by the AI file
 * suggestion fallback, so both fall back to the same notion of "important".
 */
export function sortByKeyFilePriority(
  entries: RepoTreeEntry[],
): RepoTreeEntry[] {
  return [...entries].sort((a, b) => {
    const byScore = keyFileScore(b.path) - keyFileScore(a.path);
    if (byScore !== 0) {
      return byScore;
    }

    const byDepth = a.path.split("/").length - b.path.split("/").length;

    return byDepth !== 0 ? byDepth : a.path.localeCompare(b.path);
  });
}

/**
 * Picks and downloads the files an analysis needs.
 *
 * Files are fetched in priority order with four concurrent requests; one
 * unreadable file is skipped, but a rate limit or network failure aborts the
 * whole run because every later request would fail too. Contents are then cut
 * to the prompt budget: 12,000 characters per file and 80,000 in total, with
 * truncation recorded on every file it applies to.
 */
export async function fetchKeyFiles(
  owner: string,
  repo: string,
  tree: RepoTree,
  branch: string,
  limit: number = DEFAULT_KEY_FILE_LIMIT,
): Promise<KeyFile[]> {
  const cap = Math.min(
    MAX_KEY_FILE_LIMIT,
    Math.max(1, Math.trunc(limit) || DEFAULT_KEY_FILE_LIMIT),
  );

  const selected = sortByKeyFilePriority(tree.entries).slice(0, cap);

  if (selected.length === 0) {
    throw new GithubRepoError(
      "NO_FILES",
      "No readable source files were found in this repository.",
    );
  }

  const fetched: Array<{ path: string; content: string } | undefined> =
    new Array(selected.length);
  const failures: GithubRepoError[] = [];
  const fatal: GithubRepoError[] = [];
  let cursor = 0;

  const worker = async (): Promise<void> => {
    for (;;) {
      if (fatal.length > 0) {
        return;
      }

      const index = cursor;
      cursor += 1;
      const entry = selected[index];
      if (entry === undefined) {
        return;
      }

      try {
        const content = await fetchFileContent(owner, repo, entry.path, branch);
        fetched[index] = { path: entry.path, content };
      } catch (error: unknown) {
        const failure =
          error instanceof GithubRepoError
            ? error
            : new GithubRepoError(
                "NETWORK",
                `Could not read \`${entry.path}\` from GitHub.`,
              );

        if (
          failure.code === "RATE_LIMITED" ||
          failure.code === "ACCESS_DENIED" ||
          failure.code === "NETWORK"
        ) {
          fatal.push(failure);
          return;
        }

        failures.push(failure);
        console.warn(`[github] skipped ${entry.path}: ${failure.message}`);
      }
    }
  };

  const workerCount = Math.min(4, selected.length);
  await Promise.all(
    Array.from({ length: workerCount }, () => worker()),
  );

  const firstFatal = fatal[0];
  if (firstFatal !== undefined) {
    throw firstFatal;
  }

  const keyFiles: KeyFile[] = [];
  let remaining = MAX_TOTAL_CHARS;

  for (const file of fetched) {
    if (file === undefined || remaining <= 0) {
      continue;
    }

    const allowance = Math.min(
      file.content.length,
      MAX_FILE_CHARS,
      remaining,
    );

    // A sliver of a file teaches the model nothing; stop here instead.
    if (allowance < MIN_FILE_CHARS && file.content.length > allowance) {
      break;
    }

    const content = cutAtLineEnd(file.content, allowance);
    remaining -= content.length;
    keyFiles.push({
      path: file.path,
      content,
      truncated: content.length < file.content.length,
    });
  }

  if (keyFiles.length === 0) {
    const allTooLarge =
      failures.length > 0 &&
      failures.every((failure) => failure.code === "TOO_LARGE");

    throw allTooLarge
      ? new GithubRepoError(
          "TOO_LARGE",
          "Every candidate file was too large to read (over 1 MB).",
        )
      : new GithubRepoError(
          "NO_FILES",
          "No readable text files were found in this repository.",
        );
  }

  return keyFiles;
}
