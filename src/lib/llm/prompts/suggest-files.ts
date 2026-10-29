import { z } from "zod";

import { MAX_SELECTED_FILES } from "@/lib/repo-tree";

/**
 * File suggestion for repo-to-course generation.
 *
 * The model receives the same readable file list the teacher's preview shows
 * plus a short README excerpt, and picks the files that best explain the
 * project's architecture. It never sees file contents, so the prompt is cheap
 * and the action only has to verify that every returned path exists.
 */

/** Paths put in front of the model; beyond this the listing is sampled. */
const PROMPT_PATH_CAP = 300;

/** At most one course-sized selection, in learner order. */
export const suggestedFilesSchema = z
  .array(z.string().trim().min(1).max(500))
  .min(1)
  .max(MAX_SELECTED_FILES);

export type SuggestFilesContext = {
  /** `owner/repo`, as shown to the model. */
  repoName: string;
  branch: string;
  /** URL subpath or teacher focus, when the repository is narrowed. */
  focus?: string;
  /** First characters of the root README, when one could be read. */
  readme?: string;
  /** Readable paths, already filtered by the server. */
  paths: string[];
  /** The 300-path prompt cap dropped files. */
  pathsTruncated: boolean;
};

const MANIFEST_BASENAMES = new Set([
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
  "dockerfile",
  "makefile",
]);

const ENTRY_BASENAMES = new Set([
  "index.ts",
  "index.tsx",
  "index.js",
  "index.jsx",
  "main.ts",
  "main.tsx",
  "main.js",
  "main.jsx",
  "main.py",
  "app.py",
  "server.ts",
  "server.js",
  "app.ts",
  "app.tsx",
  "main.go",
  "main.rs",
  "lib.rs",
  "main.java",
  "program.cs",
  "main.rb",
  "config.ru",
]);

function baseName(path: string): string {
  return (path.split("/").pop() ?? "").toLowerCase();
}

function topLevelDirectory(path: string): string {
  const index = path.indexOf("/");
  return index === -1 ? "" : path.slice(0, index);
}

/** Files a curriculum usually starts from, regardless of depth. */
function isLandmarkPath(path: string): boolean {
  const base = baseName(path);
  return (
    !path.includes("/") ||
    base.startsWith("readme") ||
    MANIFEST_BASENAMES.has(base) ||
    ENTRY_BASENAMES.has(base)
  );
}

/**
 * Caps the listing sent to the model without losing its shape.
 *
 * Landmarks (root files, README, manifests, entry points) always survive, then
 * the remaining budget is filled round-robin across top-level directories so a
 * large monorepo is represented by every package instead of the alphabetically
 * first one. The result keeps the original path order.
 */
export function samplePathsForPrompt(
  paths: string[],
  cap: number = PROMPT_PATH_CAP,
): { paths: string[]; truncated: boolean } {
  const unique = [...new Set(paths)];

  if (unique.length <= cap) {
    return { paths: unique, truncated: false };
  }

  const kept = new Set<string>();

  for (const path of unique) {
    if (kept.size >= cap) {
      break;
    }
    if (isLandmarkPath(path)) {
      kept.add(path);
    }
  }

  const groups = new Map<string, string[]>();
  for (const path of unique) {
    if (kept.has(path)) {
      continue;
    }

    const key = topLevelDirectory(path);
    const queue = groups.get(key);
    if (queue === undefined) {
      groups.set(key, [path]);
    } else {
      queue.push(path);
    }
  }

  const queues = [...groups.values()];
  let added = true;

  while (kept.size < cap && added) {
    added = false;

    for (const queue of queues) {
      if (kept.size >= cap) {
        break;
      }

      const next = queue.shift();
      if (next !== undefined) {
        kept.add(next);
        added = true;
      }
    }
  }

  return {
    paths: unique.filter((path) => kept.has(path)),
    truncated: true,
  };
}

/**
 * Prompt for one file-suggestion pass.
 *
 * The model may only copy paths from the listing, which the action then checks
 * again: a hallucinated path would otherwise select a file the tree does not
 * contain and break the generation request later.
 */
export function suggestFilesPrompt(context: SuggestFilesContext): string {
  const { repoName, branch, focus, readme, paths, pathsTruncated } = context;
  const fileLines =
    paths.length === 0
      ? ["(No readable files were provided.)"]
      : paths.map((path) => `- ${path}`);

  return [
    "You are an expert curriculum designer selecting source files to teach a",
    "course about this repository's architecture.",
    "",
    `Repository: ${repoName}`,
    `Branch: ${branch}`,
    ...(focus === undefined || focus.trim().length === 0
      ? []
      : [`Focus: ${focus.trim()}`]),
    "",
    ...(readme === undefined || readme.trim().length === 0
      ? []
      : ["README excerpt:", '"""', readme.trim(), '"""', ""]),
    `Readable files (the only files you may choose${pathsTruncated ? "; the listing is partial" : ""}):`,
    ...fileLines,
    "",
    "Rules:",
    `- Choose at most ${MAX_SELECTED_FILES} files, ordered the way a learner should meet them.`,
    "- Copy paths verbatim from the list. Never invent, shorten or rename a path.",
    "- Maximise architectural coverage: entry points, routing, core domain",
    "  logic, the data model, shared state, and build or runtime configuration.",
    "- Prefer files a teacher would read aloud to explain how the project works.",
    "- Avoid tests, stories, fixtures, docs-only files, lockfiles, generated",
    "  code, and several near-duplicate files from the same layer.",
    ...(pathsTruncated
      ? [
          "- The listing is partial; pick the most representative files that are listed.",
        ]
      : []),
    "- Reply with ONLY a JSON array of paths: [\"src/app/page.tsx\", ...]",
  ].join("\n");
}

/** Extracts the `- path` lines of the listing (never the rule bullets). */
function offeredPathsFromPrompt(prompt: string): string[] {
  const section =
    /Readable files[^\n]*:\n([\s\S]*?)\n\nRules:/u.exec(prompt)?.[1] ?? "";

  return [
    ...new Set(
      [...section.matchAll(/^- (.+)$/gmu)]
        .map((match) => match[1]?.trim() ?? "")
        .filter((path) => path.length > 0),
    ),
  ];
}

/**
 * Fixed demo suggestion for mock mode (no LLM key).
 *
 * Only paths that appear in the prompt are returned, so the browser path is
 * exercised exactly like a real answer. README comes first, then one file per
 * top-level directory to spread the demo selection across the project.
 */
export function mockSuggestedFiles(prompt: string): string[] {
  const offered = offeredPathsFromPrompt(prompt);

  if (offered.length === 0) {
    return ["README.md"];
  }

  const picked = offered.filter((path) => baseName(path).startsWith("readme")).slice(0, 1);
  const pickedSet = new Set(picked);
  const groups = new Map<string, string[]>();

  for (const path of offered) {
    if (pickedSet.has(path)) {
      continue;
    }

    const key = topLevelDirectory(path);
    const queue = groups.get(key);
    if (queue === undefined) {
      groups.set(key, [path]);
    } else {
      queue.push(path);
    }
  }

  const queues = [...groups.values()];
  let added = true;

  while (picked.length < MAX_SELECTED_FILES && added) {
    added = false;

    for (const queue of queues) {
      if (picked.length >= MAX_SELECTED_FILES) {
        break;
      }

      const next = queue.shift();
      if (next !== undefined) {
        picked.push(next);
        added = true;
      }
    }
  }

  return picked.slice(0, MAX_SELECTED_FILES);
}
