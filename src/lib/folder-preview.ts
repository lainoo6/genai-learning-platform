/**
 * Folder explanation helpers for the repository explorer.
 *
 * Pure functions only: the server action owns the network calls, while
 * everything here (path filtering, preview selection, the prompt) is easy to
 * unit-test. Keeping the prompt here also keeps `src/server/explain.ts` a
 * "use server" module that exports nothing but async actions.
 */

/** A course-sized folder listing; anything beyond this is not shown. */
export const MAX_FOLDER_FILES = 50;
/** Previewed files per explanation: keeps the Contents API budget small. */
export const FOLDER_PREVIEW_FILES = 5;
/** Lines shown per previewed file: enough for imports and exports. */
export const FOLDER_PREVIEW_LINES = 15;

/** One hard-wrapped line cannot flood the prompt. */
const MAX_PREVIEW_LINE_CHARS = 200;
/** Total characters per previewed file, after line slicing. */
const MAX_PREVIEW_CHARS = 1_500;

const PREVIEW_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".py",
  ".rb",
  ".go",
  ".rs",
  ".java",
  ".kt",
  ".kts",
  ".cs",
  ".php",
  ".c",
  ".h",
  ".cpp",
  ".hpp",
  ".cc",
  ".swift",
  ".scala",
  ".sh",
  ".sql",
  ".vue",
  ".svelte",
] as const;

/** Files whose first lines usually reveal the module's role. */
const ENTRY_BASENAMES = new Set([
  "index",
  "main",
  "app",
  "server",
  "mod",
  "lib",
  "router",
  "routes",
  "entry",
  "__init__",
  "manage",
  "program",
]);

function baseName(path: string): string {
  return (path.split("/").pop() ?? "").toLowerCase();
}

function extensionOf(path: string): string {
  const base = baseName(path);
  const dot = base.lastIndexOf(".");
  return dot < 0 ? "" : base.slice(dot);
}

/** Code files worth fetching a preview from (never images, docs or lockfiles). */
export function isPreviewableCodePath(path: string): boolean {
  return (PREVIEW_EXTENSIONS as readonly string[]).includes(extensionOf(path));
}

function isTestPath(path: string): boolean {
  const lower = path.toLowerCase();

  if (/(^|\/)(__tests__|__mocks__|tests?|specs?)\//u.test(lower)) {
    return true;
  }

  return /\.(test|spec|stories|snap)\.[^.]+$/u.test(baseName(lower));
}

/** Entry points first, then regular code, tests last. */
function previewRank(path: string): number {
  const stem = baseName(path).replace(/\.[^.]+$/u, "");

  if (ENTRY_BASENAMES.has(stem)) {
    return 0;
  }

  return isTestPath(path) ? 3 : 1;
}

/**
 * Picks at most five code files to preview: entry points first, then code,
 * then tests. Non-code files are dropped, duplicates are ignored and the path
 * order breaks ties so the choice is deterministic.
 */
export function folderPreviewCandidates(
  filePaths: string[],
  limit: number = FOLDER_PREVIEW_FILES,
): string[] {
  const capped = Math.max(0, Math.min(limit, FOLDER_PREVIEW_FILES));

  return [...new Set(filePaths)]
    .filter(isPreviewableCodePath)
    .sort((a, b) => {
      const byRank = previewRank(a) - previewRank(b);
      return byRank !== 0 ? byRank : a.localeCompare(b);
    })
    .slice(0, capped);
}

/**
 * Keeps only paths that are direct children of `folderPath`: the explorer sends
 * the folder's own file list, and a server action is a public endpoint, so
 * nested paths and paths outside the folder are dropped rather than trusted.
 */
export function directChildFiles(
  folderPath: string,
  filePaths: string[],
): string[] {
  const normalized = folderPath.replace(/^\/+|\/+$/gu, "");

  if (normalized.length === 0) {
    return [];
  }

  const prefix = `${normalized}/`;
  const seen = new Set<string>();
  const direct: string[] = [];

  for (const candidate of filePaths) {
    const path = candidate.trim();

    if (!path.startsWith(prefix)) {
      continue;
    }

    const rest = path.slice(prefix.length);
    if (rest.length === 0 || rest.includes("/") || seen.has(path)) {
      continue;
    }

    seen.add(path);
    direct.push(path);
  }

  return direct.slice(0, MAX_FOLDER_FILES);
}

/**
 * First lines of a file, normalised to `\n`. Long lines are cut so a minified
 * bundle cannot dominate the prompt.
 */
export function previewLines(
  content: string,
  lineCount: number = FOLDER_PREVIEW_LINES,
): string[] {
  const count = Math.max(0, Math.min(lineCount, FOLDER_PREVIEW_LINES));

  return content
    .replace(/\r\n?/gu, "\n")
    .split("\n")
    .slice(0, count)
    .map((line) => line.slice(0, MAX_PREVIEW_LINE_CHARS));
}

/** The preview block for one file, capped again after joining. */
export function previewExcerpt(content: string): string {
  return previewLines(content).join("\n").trimEnd().slice(0, MAX_PREVIEW_CHARS);
}

export type FolderFilePreview = {
  /** Repository-relative path; only the basename reaches the prompt. */
  path: string;
  /** First lines of the file. */
  excerpt: string;
};

/**
 * Prompt for one folder explanation.
 *
 * Previews are shown under their basenames, which keeps the prompt compact and
 * avoids repeating the folder prefix on every line. When no preview could be
 * read, the section is omitted and the model explains from the folder's name
 * and file list alone.
 */
export function folderExplanationPrompt(input: {
  folderPath: string;
  repoUrl: string;
  filePaths: string[];
  previews: FolderFilePreview[];
}): string {
  const { folderPath, repoUrl, filePaths, previews } = input;

  const fileLines =
    filePaths.length === 0
      ? ["(No files were provided.)"]
      : filePaths.map((path) => `- ${path.split("/").pop() ?? path}`);

  const previewBlocks = previews.map(
    (preview) =>
      `--- ${preview.path.split("/").pop() ?? preview.path} ---\n${preview.excerpt}`,
  );

  return [
    `The user wants to understand the purpose of the folder '${folderPath}' in '${repoUrl}'.`,
    "",
    "Here are the files in this folder:",
    ...fileLines,
    ...(previewBlocks.length === 0
      ? []
      : [
          "",
          "Here are the first few lines of the core files to show imports and exports:",
          "",
          previewBlocks.join("\n\n"),
        ]),
    "",
    "Based on this, explain what this module is responsible for and how it fits into the project. Keep it concise.",
  ].join("\n");
}
