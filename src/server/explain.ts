"use server";

import { z } from "zod";

import { getI18n } from "@/i18n/server";
import { auth } from "@/lib/auth";
import {
  GithubRepoError,
  fetchFileContent,
  fetchRepoTree,
  filterRelevantFilesWithMeta,
  isRelevantPath,
  parseRepoUrl,
  type RepoTreeEntry,
} from "@/lib/github-repo";
import { registerLlmMocks } from "@/lib/llm/mocks";
import { LlmError, generateJson } from "@/lib/llm/provider";

/**
 * "Explain this file" for the source-code explorer (Phase 4).
 *
 * The learner only sends the path of a file they can already see in the course
 * tree; the action resolves the repository, downloads the file and asks the
 * model for a short explanation. Like every other action on the platform it
 * never throws and turns each failure into a message that is safe to show.
 */

/** GitHub content is passed to the model in full up to this length. */
const MAX_EXPLAIN_CHARS = 3_000;
/** A highlighted snippet is small by design; the explorer caps it client-side too. */
const MAX_SELECTED_CHARS = 1_000;

const explainCodeInputSchema = z.object({
  repoUrl: z.string().trim().min(1).max(500),
  branch: z.string().trim().min(1).max(200),
  filePath: z.string().trim().min(1).max(500),
  /** Optional highlighted snippet from the file currently open in the explorer. */
  selectedCode: z.string().trim().max(MAX_SELECTED_CHARS).optional(),
});

export type ExplainCodeInput = z.input<typeof explainCodeInputSchema>;

export type ExplainCodeResult =
  | { ok: true; explanation: string }
  | { ok: false; error: string };

const explainCodeSchema = z.object({
  explanation: z.string().trim().min(1).max(8_000),
});

function explainFilePrompt(filePath: string, content: string): string {
  return `You are a helpful teaching assistant. Explain the following code from the file ${filePath} in the context of the repository. Focus on its purpose and how it fits into the project.

\`\`\`
${content}
\`\`\``;
}

function explainSelectionPrompt(
  filePath: string,
  selectedCode: string,
): string {
  return `The user selected the following code from ${filePath}. Explain what this specific snippet does and how it fits into the file.

\`\`\`
${selectedCode}
\`\`\``;
}

/**
 * Explains one repository file for a signed-in learner.
 *
 * Only paths that pass the same relevance rules as the file picker are read, so
 * a direct caller cannot ask for dotfiles, dependencies or build output. When
 * the explorer sends a highlighted snippet, that snippet is explained directly
 * and the Contents request is skipped.
 */
export async function explainCodeAction(
  input: ExplainCodeInput,
): Promise<ExplainCodeResult> {
  const { t } = await getI18n();

  const session = await auth();
  const userId = session?.user?.id;
  if (userId === undefined) {
    return { ok: false, error: t("server.explain.codeSignIn") };
  }

  const parsedInput = explainCodeInputSchema.safeParse(input);
  if (!parsedInput.success) {
    return { ok: false, error: t("server.explain.codeInvalid") };
  }

  const { repoUrl, branch, filePath, selectedCode } = parsedInput.data;
  const selection =
    selectedCode !== undefined && selectedCode.length > 0
      ? selectedCode
      : undefined;

  const ref = parseRepoUrl(repoUrl);
  if (ref === null) {
    return { ok: false, error: t("server.explain.codeInvalid") };
  }

  if (!isRelevantPath(filePath)) {
    return { ok: false, error: t("server.explain.codeInvalid") };
  }

  try {
    let prompt: string;
    let truncated = false;

    if (selection !== undefined) {
      // The snippet already contains everything the prompt needs, so the
      // extra Contents request is skipped for selected-code explanations.
      prompt = explainSelectionPrompt(filePath, selection);
    } else {
      const content = await fetchFileContent(
        ref.owner,
        ref.repo,
        filePath,
        branch,
      );

      const capped = content.slice(0, MAX_EXPLAIN_CHARS);
      truncated = content.length > capped.length;
      prompt = explainFilePrompt(filePath, capped);
    }

    registerLlmMocks();

    const result = await generateJson(explainCodeSchema, prompt, {
      usage: "explain-code",
      temperature: 0.3,
      userId,
      input: {
        repoUrl,
        branch,
        filePath,
        mode: selection === undefined ? "file" : "selection",
        selectedChars: selection?.length ?? 0,
        truncated,
      },
    });

    return { ok: true, explanation: result.explanation };
  } catch (error: unknown) {
    if (error instanceof GithubRepoError) {
      // The GitHub message already explains rate limits, private repos, etc.
      console.warn(
        `[explain] reading ${ref.owner}/${ref.repo}/${filePath} failed with ${error.code}: ${error.message}`,
      );
      return { ok: false, error: error.message };
    }

    if (error instanceof LlmError) {
      console.error("[explain] explanation generation failed", error);
      return { ok: false, error: t("server.explain.codeFailed") };
    }

    console.error("[explain] unexpected failure", error);
    return { ok: false, error: t("server.explain.codeFailed") };
  }
}

const fileContentInputSchema = z.object({
  repoUrl: z.string().trim().min(1).max(500),
  /** Null/empty for legacy courses; GitHub then reads the default branch. */
  branch: z.string().trim().max(200).nullish(),
  filePath: z.string().trim().min(1).max(500),
});

export type FetchFileContentInput = z.input<typeof fileContentInputSchema>;

export type FetchFileContentResult =
  | { ok: true; content: string; truncated: boolean }
  | { ok: false; error: string };

/**
 * Reads one repository file for the source explorer (Phase 4, part 2).
 *
 * The explorer sends the same path it renders in the tree, so the relevance
 * guard is repeated here: a server action is a public endpoint and must not
 * hand out dotfiles, dependencies or binary payloads. Content is capped at the
 * same 3,000 characters used by the explanation prompt, which keeps the sheet
 * responsive for large files.
 */
export async function fetchFileContentAction(
  input: FetchFileContentInput,
): Promise<FetchFileContentResult> {
  const { t } = await getI18n();

  const session = await auth();
  if (session?.user?.id === undefined) {
    return { ok: false, error: t("server.explain.codeSignIn") };
  }

  const parsedInput = fileContentInputSchema.safeParse(input);
  if (!parsedInput.success) {
    return { ok: false, error: t("server.explain.codeInvalid") };
  }

  const { repoUrl, branch, filePath } = parsedInput.data;

  const ref = parseRepoUrl(repoUrl);
  if (ref === null || !isRelevantPath(filePath)) {
    return { ok: false, error: t("server.explain.codeInvalid") };
  }

  try {
    const content = await fetchFileContent(
      ref.owner,
      ref.repo,
      filePath,
      branch ?? undefined,
    );

    const capped = content.slice(0, MAX_EXPLAIN_CHARS);

    return {
      ok: true,
      content: capped,
      truncated: content.length > capped.length,
    };
  } catch (error: unknown) {
    if (error instanceof GithubRepoError) {
      console.warn(
        `[explain] reading ${ref.owner}/${ref.repo}/${filePath} failed with ${error.code}: ${error.message}`,
      );
      return { ok: false, error: error.message };
    }

    console.error("[explain] unexpected file read failure", error);
    return { ok: false, error: t("server.explain.fileFailed") };
  }
}

const repoTreeInputSchema = z.object({
  repoUrl: z.string().trim().min(1).max(500),
  /** The branch stored on the course; null for legacy rows. */
  branch: z.string().trim().max(200).nullish(),
});

export type FetchRepoTreeInput = z.input<typeof repoTreeInputSchema>;

export type FetchRepoTreeResult =
  | {
      ok: true;
      entries: RepoTreeEntry[];
      /** Branch that was actually read, used by every follow-up file read. */
      branch: string;
      /** GitHub's tree was partial, or the 400-file preview cap was reached. */
      truncated: boolean;
    }
  | { ok: false; error: string };

/**
 * Lists the readable source files of a course repository.
 *
 * Reuses the generator's relevance filter (`isRelevantPath` and friends), so the
 * explorer never offers lockfiles, build output or binaries that would fail to
 * open. The course's `repoUrl` is canonical, which is why the stored branch is
 * passed explicitly instead of relying on a branch in the URL.
 */
export async function fetchRepoTreeAction(
  input: FetchRepoTreeInput,
): Promise<FetchRepoTreeResult> {
  const { t } = await getI18n();

  const session = await auth();
  if (session?.user?.id === undefined) {
    return { ok: false, error: t("server.explain.codeSignIn") };
  }

  const parsedInput = repoTreeInputSchema.safeParse(input);
  if (!parsedInput.success) {
    return { ok: false, error: t("server.explain.codeInvalid") };
  }

  const { repoUrl, branch } = parsedInput.data;

  const ref = parseRepoUrl(repoUrl);
  if (ref === null) {
    return { ok: false, error: t("server.explain.codeInvalid") };
  }

  try {
    const tree = await fetchRepoTree(
      ref.owner,
      ref.repo,
      branch ?? ref.branch,
    );

    const { files, truncated } = filterRelevantFilesWithMeta(
      tree.entries,
      ref.subpath,
    );

    if (files.length === 0) {
      return { ok: false, error: t("server.explain.treeEmpty") };
    }

    return {
      ok: true,
      entries: files,
      branch: tree.branch,
      truncated: truncated || tree.truncated,
    };
  } catch (error: unknown) {
    if (error instanceof GithubRepoError) {
      console.warn(
        `[explain] listing ${ref.owner}/${ref.repo} failed with ${error.code}: ${error.message}`,
      );
      return { ok: false, error: error.message };
    }

    console.error("[explain] unexpected tree failure", error);
    return { ok: false, error: t("server.explain.treeFailed") };
  }
}
