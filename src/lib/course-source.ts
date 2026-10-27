/**
 * Prompt composition for the grounded generation flows.
 *
 * Pure string building: the actions decide what to fetch, this module decides
 * where each block goes. Instructions are placed before the source material so
 * `buildCoursePrompt`'s final token clamp (which cuts from the end) can never
 * drop them.
 */

/** Free-text guidance cap, shared by the form, the schema and the composer. */
export const MAX_INSTRUCTIONS_CHARS = 1_000;

/** `["Additional instructions…", text]`, or nothing when the field is blank. */
export function instructionsSection(
  instructions: string | undefined,
): string[] {
  const trimmed = (instructions ?? "").trim().slice(0, MAX_INSTRUCTIONS_CHARS);
  return trimmed.length === 0
    ? []
    : ["Additional instructions from the teacher:", trimmed];
}

/** Prepends the instructions block to an existing source text. */
export function withInstructions(
  text: string,
  instructions: string | undefined,
): string {
  const section = instructionsSection(instructions);
  return section.length === 0 ? text : [...section, "", text].join("\n");
}

export type RepoSourceInput = {
  owner: string;
  repo: string;
  branch: string;
  instructions?: string;
  files: Array<{ path: string; content: string }>;
  documentText?: string;
};

/**
 * Repository header → instructions → selected files → optional document.
 *
 * The document comes last because the files the teacher picked are the primary
 * source; if the prompt clamp has to cut something, it should be the document.
 */
export function composeRepoSourceText(input: RepoSourceInput): string {
  const parts = [
    `Repository: ${input.owner}/${input.repo}`,
    `Branch: ${input.branch}`,
  ];

  const instructions = instructionsSection(input.instructions);
  if (instructions.length > 0) {
    parts.push("", ...instructions);
  }

  parts.push("", `Files selected by the teacher: ${input.files.length}.`);

  for (const file of input.files) {
    parts.push("", `=== ${file.path} ===`, file.content);
  }

  const documentText = (input.documentText ?? "").trim();
  if (documentText.length > 0) {
    parts.push("", "Document supplied by the teacher (text):", documentText);
  }

  return parts.join("\n");
}
