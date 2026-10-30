import { describe, expect, it } from "vitest";

import {
  composeRepoSourceText,
  instructionsSection,
  MAX_INSTRUCTIONS_CHARS,
  withInstructions,
} from "@/lib/course-source";

/**
 * Prompt composition is pure string building, so these tests pin the order the
 * model sees: header, instructions, files, document. Order matters because the
 * prompt builder clamps from the end.
 */

describe("instructionsSection", () => {
  it("returns nothing for blank input", () => {
    expect(instructionsSection(undefined)).toEqual([]);
    expect(instructionsSection("")).toEqual([]);
    expect(instructionsSection("   ")).toEqual([]);
  });

  it("labels and trims the teacher's instructions", () => {
    expect(instructionsSection("  Keep it practical.  ")).toEqual([
      "Additional instructions from the teacher:",
      "Keep it practical.",
    ]);
  });

  it("caps the instructions at the shared limit", () => {
    const section = instructionsSection("a".repeat(MAX_INSTRUCTIONS_CHARS + 50));
    expect(section[1]).toHaveLength(MAX_INSTRUCTIONS_CHARS);
  });
});

describe("withInstructions", () => {
  it("leaves the source untouched when there are no instructions", () => {
    expect(withInstructions("source", undefined)).toBe("source");
    expect(withInstructions("source", "  ")).toBe("source");
  });

  it("prepends the instructions before the source material", () => {
    expect(withInstructions("source", "Be brief.")).toBe(
      "Additional instructions from the teacher:\nBe brief.\n\nsource",
    );
  });
});

describe("composeRepoSourceText", () => {
  const files = [
    { path: "README.md", content: "Intro" },
    { path: "src/app.ts", content: "const app = 1;" },
  ];

  it("lists the repository header and every selected file", () => {
    const source = composeRepoSourceText({
      owner: "acme",
      repo: "demo",
      branch: "main",
      files,
    });

    expect(source).toBe(
      [
        "Repository: acme/demo",
        "Branch: main",
        "",
        "Files selected by the teacher: 2.",
        "",
        "=== README.md ===",
        "Intro",
        "",
        "=== src/app.ts ===",
        "const app = 1;",
      ].join("\n"),
    );
  });

  it("places instructions before the files and the document last", () => {
    const source = composeRepoSourceText({
      owner: "acme",
      repo: "demo",
      branch: "main",
      instructions: "Focus on the API.",
      files,
      documentText: "Extra context.",
    });

    const instructionsAt = source.indexOf("Additional instructions");
    const filesAt = source.indexOf("Files selected by the teacher");
    const documentAt = source.indexOf("Document supplied by the teacher");

    expect(instructionsAt).toBeGreaterThan(-1);
    expect(instructionsAt).toBeLessThan(filesAt);
    expect(filesAt).toBeLessThan(documentAt);
  });

  it("omits the document block when there is no document text", () => {
    const source = composeRepoSourceText({
      owner: "acme",
      repo: "demo",
      branch: "main",
      files,
      documentText: "   ",
    });

    expect(source).not.toContain("Document supplied by the teacher");
  });
});
