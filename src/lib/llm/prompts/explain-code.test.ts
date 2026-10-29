import { describe, expect, it } from "vitest";

import {
  explainFilePrompt,
  explainSelectionPrompt,
} from "@/lib/llm/prompts/explain-code";

const tree = ["src/lib/session.ts", "src/app/login/page.tsx"];

describe("explainFilePrompt", () => {
  it("adds a partial neighbour list and the context-aware instruction", () => {
    const prompt = explainFilePrompt(
      "src/lib/auth.ts",
      "export function signIn() {}",
      tree,
    );

    expect(prompt).toContain(
      "The user is exploring a file at 'src/lib/auth.ts'.",
    );
    expect(prompt).toContain(
      "Here are some of the other files in the same project/module (partial list):",
    );
    expect(prompt).toContain("- src/lib/session.ts");
    expect(prompt).toContain("- src/app/login/page.tsx");
    expect(prompt).toContain(
      "Based on the file's content and its neighboring files, explain its purpose and how it fits into the project.",
    );
    expect(prompt).toContain("export function signIn() {}");
  });

  it("falls back to the original prompt without a tree", () => {
    const prompt = explainFilePrompt("src/lib/auth.ts", "const x = 1;");

    expect(prompt).toContain(
      "Explain the following code from the file src/lib/auth.ts in the context of the repository.",
    );
    expect(prompt).not.toContain("partial list");
    expect(prompt).not.toContain("neighboring files");
  });
});

describe("explainSelectionPrompt", () => {
  it("places the snippet in the project using the partial list", () => {
    const prompt = explainSelectionPrompt(
      "src/lib/auth.ts",
      "await signIn(email)",
      tree,
    );

    expect(prompt).toContain(
      "The user is exploring a file at 'src/lib/auth.ts'.",
    );
    expect(prompt).toContain("(partial list):");
    expect(prompt).toContain(
      "The user selected the following code from 'src/lib/auth.ts'. Based on the neighboring files, explain what this specific snippet does.",
    );
    expect(prompt).toContain("await signIn(email)");
  });

  it("falls back to the original prompt without a tree", () => {
    const prompt = explainSelectionPrompt("src/lib/auth.ts", "await signIn()");

    expect(prompt).toContain(
      "The user selected the following code from src/lib/auth.ts. Explain what this specific snippet does and how it fits into the file.",
    );
    expect(prompt).not.toContain("partial list");
  });
});
