import { z } from "zod";

import type { KeyFile } from "@/lib/github-repo";
import { mockText } from "@/lib/llm/mock";

/**
 * Repository analysis for repo-to-course generation (Phase 2).
 *
 * The model reads a curated subset of a repository and returns a structural
 * map: what the project does, which modules it is made of, and in what order a
 * learner should read the files. Nothing here generates course content — that
 * is Phase 3, which consumes `RepoAnalysis` plus the file list the server kept.
 *
 * Files are supplied as already-truncated text (see `fetchKeyFiles`), so the
 * prompt only has to state the contract: cite provided paths verbatim, and say
 * "unknown" instead of inventing code.
 */

/** One cohesive slice of the codebase. */
export const repoModuleSchema = z.object({
  name: z.string().min(2).max(80),
  /** A directory or an anchor file, copied from the provided paths. */
  path: z.string().min(1),
  purpose: z.string().min(10).max(300),
  /** Provided paths that belong to this module. */
  keyFiles: z.array(z.string().min(1)).min(1).max(12),
});

/** One step of the suggested reading order. */
export const repoLearningStepSchema = z.object({
  /** 1-based position; uniqueness is not required, order matters. */
  step: z.number().int().min(1),
  file: z.string().min(1),
  why: z.string().min(10).max(300),
});

/**
 * What `analyzeRepoAction` asks the model for.
 *
 * There is deliberately no refinement against the real file list: the schema
 * has to be static for `generateJson`, and path fidelity is enforced by the
 * prompt instead. `meta.analyzedFiles` on the action result lets Phase 3
 * cheaply verify the paths it actually received.
 */
export const repoAnalysisSchema = z.object({
  /** What the project does and how it is organised: three to six sentences. */
  summary: z.string().min(40).max(1_200),
  modules: z.array(repoModuleSchema).min(1).max(12),
  learningPath: z.array(repoLearningStepSchema).min(1).max(15),
  /** Where execution starts or a user enters the app. */
  entryPoints: z.array(z.string().min(1)).min(1).max(8),
});

export type RepoAnalysis = z.infer<typeof repoAnalysisSchema>;
export type RepoModule = z.infer<typeof repoModuleSchema>;
export type RepoLearningStep = z.infer<typeof repoLearningStepSchema>;

/** Line that `mocks.ts` reads back out of the prompt to label the demo. */
const REPO_LINE_PREFIX = "Repository:";

/**
 * Prompt for one repository analysis.
 *
 * `scope` optionally narrows the reading (for example "the auth module") and
 * is expected to come from the URL subpath or from Phase 3's form.
 */
export function repoAnalysisPrompt(
  repoName: string,
  files: KeyFile[],
  scope?: string,
): string {
  const name =
    repoName.trim().length > 0 ? repoName.trim() : "an unknown repository";
  const focus = scope?.trim() ?? "";

  const fileBlocks =
    files.length === 0
      ? ["(No files were provided.)"]
      : files.map((file) => {
          const marker = file.truncated ? " [truncated]" : "";
          return `--- ${file.path}${marker} ---\n${file.content}`;
        });

  return [
    "You are analyzing a GitHub repository so a short course can be built",
    "from it. You are shown a curated subset of its files, not the whole repo.",
    "",
    `${REPO_LINE_PREFIX} ${name}`,
    ...(focus.length > 0 ? [`Focus: ${focus}`] : []),
    "",
    "Hard rules:",
    "- Reference only the paths listed below. Copy them verbatim — never",
    "  invent, shorten, rename or normalise a path.",
    "- Everything you claim must be supported by the provided contents. When",
    "  the files do not answer something, write \"unknown\" and say what is",
    "  missing. Never guess at code you were not shown.",
    "- Do not describe the repository's history, popularity, licence, issue",
    "  tracker or contributor activity: none of that is provided.",
    "- The contents may be truncated; do not infer what the missing part says.",
    "- Use one or two sentences per `purpose` and per `why`. No emoji, no",
    "  markdown, no code fences, no prose outside the JSON value.",
    "",
    "Definitions:",
    "- `modules`: cohesive slices a learner can study separately (for example a",
    "  package, a feature folder or the CLI layer). `path` is a directory from",
    "  the listing (ending in \"/\") or one of the files below.",
    "- `learningPath`: the order to read the files in, from the entry point",
    "  outward. `step` starts at 1. Each step names one provided file and says",
    "  what the learner will understand there.",
    "- `entryPoints`: the provided files where execution starts or a user first",
    "  enters the app (for example a main file, a route root or a CLI entry).",
    "",
    "Files:",
    "",
    ...fileBlocks,
    "",
    "Reply with one JSON object of this exact shape:",
    '{"summary": string, "modules": [{"name": string, "path": string,',
    ' "purpose": string, "keyFiles": string[]}],',
    ' "learningPath": [{"step": number, "file": string, "why": string}],',
    ' "entryPoints": string[]}',
  ].join("\n");
}

/**
 * Fixed demo analysis for mock mode (no LLM key). It is intentionally small and
 * marked `[MOCK]` so a canned answer is never mistaken for a real reading of
 * the repository.
 */
export function mockRepoAnalysis(repoName: string): RepoAnalysis {
  const name =
    repoName.trim().length > 0 ? repoName.trim() : "demo/repo";
  const summary = mockText(
    `A canned walkthrough of ${name}, used to exercise the repo-to-course flow without an LLM key. No file in the repository has actually been read; the paths below are examples, not findings.`,
  );

  return {
    summary,
    modules: [
      {
        name: "Project overview",
        path: "README.md",
        purpose: mockText(
          "Example module: how the project is introduced and what it is for.",
        ),
        keyFiles: ["README.md", "package.json"],
      },
      {
        name: "Application entry",
        path: "src/",
        purpose: mockText(
          "Example module: the starting point that wires the app together.",
        ),
        keyFiles: ["src/index.ts"],
      },
    ],
    learningPath: [
      {
        step: 1,
        file: "README.md",
        why: mockText(
          "Example step: start with what the project says about itself.",
        ),
      },
      {
        step: 2,
        file: "package.json",
        why: mockText(
          "Example step: see the stack and the available scripts.",
        ),
      },
      {
        step: 3,
        file: "src/index.ts",
        why: mockText(
          "Example step: follow the code from its entry point outward.",
        ),
      },
    ],
    entryPoints: ["README.md", "src/index.ts"],
  };
}
