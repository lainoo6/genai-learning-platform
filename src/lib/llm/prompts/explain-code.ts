/**
 * Prompts for "explain this file" and "explain this snippet".
 *
 * Both receive an optional list of neighbouring paths so the model can place
 * the code in the project. The list is labelled as partial on purpose: the
 * explorer sends at most 50 of the repository's files, and the model must not
 * mistake that sample for the whole tree.
 */

const ROLE = "You are a helpful teaching assistant.";

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
): string {
  const context = neighborContext(filePath, fileTree);

  if (context.length === 0) {
    return `You are a helpful teaching assistant. Explain the following code from the file ${filePath} in the context of the repository. Focus on its purpose and how it fits into the project.

\`\`\`
${content}
\`\`\``;
  }

  return [
    ROLE,
    "",
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
): string {
  const context = neighborContext(filePath, fileTree);

  if (context.length === 0) {
    return `The user selected the following code from ${filePath}. Explain what this specific snippet does and how it fits into the file.

\`\`\`
${selectedCode}
\`\`\``;
  }

  return [
    ROLE,
    "",
    ...context,
    `The user selected the following code from '${filePath}'. Based on the neighboring files, explain what this specific snippet does.`,
    "",
    "```",
    selectedCode,
    "```",
  ].join("\n");
}
