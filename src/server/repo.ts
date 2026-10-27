"use server";

import { z } from "zod";

import { getI18n } from "@/i18n/server";
import { auth } from "@/lib/auth";
import { DOCUMENT_ERROR_KEYS, readCourseDocument } from "@/lib/course-document";
import {
  composeRepoSourceText,
  MAX_INSTRUCTIONS_CHARS,
} from "@/lib/course-source";
import {
  GithubRepoError,
  fetchKeyFiles,
  fetchRepoTree,
  fetchSelectedFiles,
  filterRelevantFiles,
  filterRelevantFilesWithMeta,
  isRelevantPath,
  parseRepoUrl,
  type GithubErrorCode,
  type RepoTreeEntry,
} from "@/lib/github-repo";
import { registerLlmMocks } from "@/lib/llm/mocks";
import { LlmError, generateJson } from "@/lib/llm/provider";
import {
  repoAnalysisPrompt,
  repoAnalysisSchema,
  type RepoAnalysis,
} from "@/lib/llm/prompts/repo";
import { MAX_SELECTED_FILES } from "@/lib/repo-tree";
import {
  generateLearnerCourse,
  type GenerateCourseResult,
} from "@/server/generate";

/**
 * Repository reading for repo-to-course generation (Phases 1–3).
 *
 * `analyzeRepoAction` is the automatic pipeline: it picks the key files itself
 * and asks the model for a structural map. Phase 3 replaces that choice with a
 * teacher-driven one: `getRepoTreeAction` lists the readable files and
 * `generateCourseFromRepoAction` turns the selected ones into a course. None of
 * these actions throw — every failure becomes `{ ok: false, error }` with a
 * message that is safe to show in the form.
 */

const MAX_ANALYZED_FILES = 15;

export type RepoMeta = {
  owner: string;
  repo: string;
  /** Branch that was read: the URL's branch, otherwise the default one. */
  branch: string;
  /** Files that reached the prompt, in priority order. */
  analyzedFiles: string[];
  /** Files left after filtering, before the 15-file selection. */
  candidateCount: number;
  /** GitHub's tree was too large to list completely (analysis is partial). */
  treeTruncated: boolean;
};

export type AnalyzeRepoResult =
  | { ok: true; analysis: RepoAnalysis; meta: RepoMeta }
  | { ok: false; error: string; code?: GithubErrorCode };

const analyzeRepoInputSchema = z.object({
  repoUrl: z.string().trim().min(1).max(500),
  /** Optional focus, e.g. "the auth module"; Phase 3 will collect it. */
  scope: z.string().trim().max(200).optional(),
});

export type AnalyzeRepoInput = z.input<typeof analyzeRepoInputSchema>;

const INVALID_URL_MESSAGE =
  "That is not a GitHub repository URL. Use https://github.com/owner/repo or https://github.com/owner/repo/tree/<branch>/<path>.";

/**
 * Analyzes one GitHub repository and returns the model's structural map.
 *
 * Mock mode (no LLM key or `LLM_MOCK=true`) still reads GitHub — public repos
 * work without `GITHUB_TOKEN` at 60 requests/hour — and returns the fixed
 * analysis registered for the `repo-analysis` usage.
 */
export async function analyzeRepoAction(
  input: AnalyzeRepoInput,
): Promise<AnalyzeRepoResult> {
  const parsedInput = analyzeRepoInputSchema.safeParse(input);
  if (!parsedInput.success) {
    return { ok: false, error: INVALID_URL_MESSAGE, code: "INVALID_URL" };
  }

  const { repoUrl, scope } = parsedInput.data;

  const ref = parseRepoUrl(repoUrl);
  if (ref === null) {
    return { ok: false, error: INVALID_URL_MESSAGE, code: "INVALID_URL" };
  }

  const repoName = `${ref.owner}/${ref.repo}`;

  try {
    const tree = await fetchRepoTree(ref.owner, ref.repo, ref.branch);

    if (tree.entries.length === 0) {
      return {
        ok: false,
        error: `${repoName} is empty, so there is nothing to analyze yet.`,
        code: "EMPTY_REPO",
      };
    }

    const candidates = filterRelevantFiles(tree.entries, ref.subpath);
    if (candidates.length === 0) {
      return {
        ok: false,
        error: `No readable source files were found in ${repoName}. It may only contain generated, binary or documentation assets.`,
        code: "NO_FILES",
      };
    }

    const files = await fetchKeyFiles(
      ref.owner,
      ref.repo,
      {
        branch: tree.branch,
        entries: candidates,
        truncated: tree.truncated,
      },
      tree.branch,
      MAX_ANALYZED_FILES,
    );

    if (files.length === 0) {
      return {
        ok: false,
        error: `None of the source files in ${repoName} could be read.`,
        code: "NO_FILES",
      };
    }

    // A direct scope from the caller wins; the URL subpath is the fallback.
    const focus =
      scope !== undefined && scope.length > 0 ? scope : ref.subpath;

    registerLlmMocks();

    const analysis = await generateJson(
      repoAnalysisSchema,
      repoAnalysisPrompt(repoName, files, focus),
      {
        usage: "repo-analysis",
        temperature: 0.2,
        input: {
          repoUrl,
          branch: tree.branch,
          files: files.map((file) => file.path),
        },
      },
    );

    return {
      ok: true,
      analysis,
      meta: {
        owner: ref.owner,
        repo: ref.repo,
        branch: tree.branch,
        analyzedFiles: files.map((file) => file.path),
        candidateCount: candidates.length,
        treeTruncated: tree.truncated,
      },
    };
  } catch (error: unknown) {
    if (error instanceof GithubRepoError) {
      console.warn(
        `[repo] ${repoName} failed with ${error.code}: ${error.message}`,
      );
      return { ok: false, error: error.message, code: error.code };
    }

    if (error instanceof LlmError) {
      console.error("[repo] analysis generation failed", error);
      return {
        ok: false,
        error:
          "The repository could not be analyzed into a usable structure. Try a smaller scope or a different repository.",
      };
    }

    console.error("[repo] unexpected analysis failure", error);
    return {
      ok: false,
      error: "The repository analysis failed. Please try again.",
    };
  }
}

/**
 * What a preview returns besides the file list.
 */
export type RepoTreeMeta = {
  owner: string;
  repo: string;
  /** Branch that was read: the URL's branch, otherwise the default one. */
  branch: string;
  /** GitHub's tree was partial, or the 400-file preview cap was reached. */
  truncated: boolean;
};

export type RepoTreeResult =
  | { ok: true; tree: RepoTreeEntry[]; meta: RepoTreeMeta }
  | { ok: false; error: string; code?: GithubErrorCode };

const repoTreeInputSchema = z.object({
  repoUrl: z.string().trim().min(1).max(500),
  /** Optional focus, e.g. a monorepo package; the URL subpath is the fallback. */
  subpath: z.string().trim().max(500).optional(),
});

export type RepoTreeInput = z.input<typeof repoTreeInputSchema>;

/**
 * Lists the files a teacher can pick from (Phase 3, step A).
 *
 * Only the tree is read — no Contents call and no model call — so previewing a
 * repository is cheap. The flat, path-sorted list is capped by
 * `filterRelevantFilesWithMeta` (400 files); `meta.truncated` is true when
 * GitHub's tree was partial or the cap hid files, so the form can say the
 * listing is incomplete.
 */
export async function getRepoTreeAction(
  input: RepoTreeInput,
): Promise<RepoTreeResult> {
  const { t } = await getI18n();

  const session = await auth();
  if (session?.user?.id === undefined) {
    return { ok: false, error: t("server.generate.signIn") };
  }

  const parsedInput = repoTreeInputSchema.safeParse(input);
  if (!parsedInput.success) {
    return { ok: false, error: INVALID_URL_MESSAGE, code: "INVALID_URL" };
  }

  const { repoUrl, subpath } = parsedInput.data;

  const ref = parseRepoUrl(repoUrl);
  if (ref === null) {
    return { ok: false, error: INVALID_URL_MESSAGE, code: "INVALID_URL" };
  }

  const repoName = `${ref.owner}/${ref.repo}`;

  try {
    const tree = await fetchRepoTree(ref.owner, ref.repo, ref.branch);

    if (tree.entries.length === 0) {
      return {
        ok: false,
        error: `${repoName} is empty, so there is nothing to teach from it yet.`,
        code: "EMPTY_REPO",
      };
    }

    const { files, truncated } = filterRelevantFilesWithMeta(
      tree.entries,
      subpath ?? ref.subpath,
    );

    if (files.length === 0) {
      return {
        ok: false,
        error: `No readable source files were found in ${repoName}. It may only contain generated, binary or documentation assets.`,
        code: "NO_FILES",
      };
    }

    return {
      ok: true,
      tree: files,
      meta: {
        owner: ref.owner,
        repo: ref.repo,
        branch: tree.branch,
        truncated: truncated || tree.truncated,
      },
    };
  } catch (error: unknown) {
    if (error instanceof GithubRepoError) {
      // The message already carries the rate-limit reset time when relevant.
      console.warn(
        `[repo] listing ${repoName} failed with ${error.code}: ${error.message}`,
      );
      return { ok: false, error: error.message, code: error.code };
    }

    console.error("[repo] unexpected tree failure", error);
    return {
      ok: false,
      error: "The repository files could not be listed. Please try again.",
    };
  }
}

/** Humanized repository name as the course topic; `owner/repo` if too short. */
function topicFromRepo(owner: string, repo: string): string {
  const humanized = repo
    .replace(/[-_.]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 120);

  return humanized.length >= 3 ? humanized : `${owner}/${repo}`.slice(0, 120);
}

const generateFromRepoInputSchema = z.object({
  repoUrl: z.string().trim().min(1).max(500),
  /** The resolved branch returned by `getRepoTreeAction`. */
  branch: z.string().trim().min(1).max(200),
  selectedPaths: z
    .array(z.string().trim().min(1).max(500))
    .min(1)
    .max(MAX_SELECTED_FILES),
  /** Optional guidance; placed before the source material in the prompt. */
  instructions: z.string().trim().max(MAX_INSTRUCTIONS_CHARS).optional(),
});

export type GenerateCourseFromRepoInput = z.input<
  typeof generateFromRepoInputSchema
> & {
  /**
   * Optional PDF/PPTX. Not part of the Zod schema (it is a `File`, not JSON),
   * and validated by the shared document reader instead.
   */
  document?: File;
};

/** Text budget for the optional document, leaving room for the selected files. */
const MAX_REPO_DOCUMENT_CHARS = 8_000;

/**
 * Generates a course from the files a teacher selected (Phase 3, step B).
 *
 * Pipeline: auth → validate → guard every path → read the optional document →
 * download only the selected files → build one grounded document → reuse
 * `generateLearnerCourse`. The path guard is defense in depth: a server action
 * is a public endpoint, so a direct caller could otherwise ask for
 * `node_modules` or a binary file the preview never offered. Failures never
 * throw; a rate-limit message reaches the form intact.
 */
export async function generateCourseFromRepoAction(
  input: GenerateCourseFromRepoInput,
): Promise<GenerateCourseResult> {
  const { t } = await getI18n();

  const session = await auth();
  const userId = session?.user?.id;
  if (userId === undefined) {
    return { ok: false, error: t("server.generate.signIn") };
  }

  const parsedInput = generateFromRepoInputSchema.safeParse(input);
  if (!parsedInput.success) {
    return { ok: false, error: t("server.generate.repo.invalidSelection") };
  }

  const { repoUrl, branch, selectedPaths, instructions } = parsedInput.data;

  const ref = parseRepoUrl(repoUrl);
  if (ref === null) {
    return { ok: false, error: INVALID_URL_MESSAGE };
  }

  const document = input.document;
  if (document !== undefined && !(document instanceof File)) {
    return { ok: false, error: t("server.generate.repo.invalidSelection") };
  }

  const paths = [...new Set(selectedPaths)];
  const rejected = paths.filter((path) => !isRelevantPath(path, ref.subpath));
  if (rejected.length > 0) {
    console.warn(
      `[repo] rejected ${rejected.length} path(s) outside the preview rules for ${ref.owner}/${ref.repo}`,
    );
    return { ok: false, error: t("server.generate.repo.invalidSelection") };
  }

  const repoName = `${ref.owner}/${ref.repo}`;

  try {
    const warnings: string[] = [];

    let documentText = "";
    if (document !== undefined) {
      const extracted = await readCourseDocument(document);
      if (!extracted.ok) {
        return { ok: false, error: t(DOCUMENT_ERROR_KEYS[extracted.code]) };
      }

      documentText = extracted.text;
      if (documentText.length > MAX_REPO_DOCUMENT_CHARS) {
        documentText = documentText.slice(0, MAX_REPO_DOCUMENT_CHARS);
        warnings.push(t("server.generate.repo.documentTruncated"));
      }
    }

    const selected = await fetchSelectedFiles(
      ref.owner,
      ref.repo,
      paths,
      branch,
    );

    if (selected.skipped.length > 0) {
      warnings.push(
        t("server.generate.repo.skipped", { count: selected.skipped.length }),
      );
    }
    if (selected.truncated) {
      warnings.push(t("server.generate.repo.truncated"));
    }

    const sourceText = composeRepoSourceText({
      owner: ref.owner,
      repo: ref.repo,
      branch,
      instructions,
      files: selected.files,
      documentText,
    });

    const result = await generateLearnerCourse({
      topic: topicFromRepo(ref.owner, ref.repo),
      sourceText,
    });

    if (!result.ok) {
      return result;
    }

    return {
      ...result,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  } catch (error: unknown) {
    if (error instanceof GithubRepoError) {
      if (error.code === "NO_FILES" || error.code === "TOO_LARGE") {
        return { ok: false, error: t("server.generate.repo.noFiles") };
      }

      // Rate limits keep their reset time, which the form shows verbatim.
      console.warn(
        `[repo] reading selected files of ${repoName} failed with ${error.code}: ${error.message}`,
      );
      return { ok: false, error: error.message };
    }

    console.error("[repo] repo course generation failed", error);
    return { ok: false, error: t("server.generate.failed") };
  }
}

