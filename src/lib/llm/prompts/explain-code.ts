/**
 * Prompts for "explain this file" and "explain this snippet".
 *
 * Both receive an optional list of neighbouring paths so the model can place
 * the code in the project. The list is labelled as partial on purpose: the
 * explorer sends at most 50 of the repository's files, and the model must not
 * mistake that sample for the whole tree.
 */

const ROLE = "You are a helpful teaching assistant.";

/** The learner's tone rule, or nothing when no profile is available. */
function styleLines(audienceRule: string): string[] {
  const rule = audienceRule.trim();
  return rule.length === 0 ? [] : [`Style for this learner: ${rule}`, ""];
}

function neighborContext(filePath: string, fileTree: string[]): string[] {
  if (fileTree.length === 0) {
    return [];
  }

  return [
    `The user is exploring a file at '${filePath}'. Here are some of the other files in the same project/module (partial list):`,
    ...fileTree.map((path) => `- ${path}`),
    "",
  ];
}

/** Whole-file explanation, with or without neighbouring paths. */
export function explainFilePrompt(
  filePath: string,
  content: string,
  fileTree: string[] = [],
  audienceRule: string = "",
): string {
  const context = neighborContext(filePath, fileTree);
  const style = styleLines(audienceRule);

  if (context.length === 0) {
    return [
      ...style,
      `${ROLE} Explain the following code from the file ${filePath} in the context of the repository. Focus on its purpose and how it fits into the project.`,
      "",
      "```",
      content,
      "```",
    ].join("\n");
  }

  return [
    ROLE,
    "",
    ...style,
    ...context,
    "Based on the file's content and its neighboring files, explain its purpose and how it fits into the project.",
    "",
    "```",
    content,
    "```",
  ].join("\n");
}

/** Selected-snippet explanation, with or without neighbouring paths. */
export function explainSelectionPrompt(
  filePath: string,
  selectedCode: string,
  fileTree: string[] = [],
  audienceRule: string = "",
): string {
  const context = neighborContext(filePath, fileTree);
  const style = styleLines(audienceRule);

  if (context.length === 0) {
    return [
      ...style,
      `The user selected the following code from ${filePath}. Explain what this specific snippet does and how it fits into the file.`,
      "",
      "```",
      selectedCode,
      "```",
    ].join("\n");
  }

  return [
    ROLE,
    "",
    ...style,
    ...context,
    `The user selected the following code from '${filePath}'. Based on the neighboring files, explain what this specific snippet does.`,
    "",
    "```",
    selectedCode,
    "```",
  ].join("\n");
}
