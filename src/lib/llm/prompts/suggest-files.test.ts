import { describe, expect, it } from "vitest";

import {
  mockSuggestedFiles,
  samplePathsForPrompt,
  suggestFilesPrompt,
  suggestedFilesSchema,
} from "@/lib/llm/prompts/suggest-files";
import { MAX_SELECTED_FILES } from "@/lib/repo-tree";

const paths = [
  "README.md",
  "package.json",
  "src/app/page.tsx",
  "src/lib/auth.ts",
  "server/api/routes.ts",
];

describe("suggestFilesPrompt", () => {
  it("names the repository, branch, focus and every offered path", () => {
    const prompt = suggestFilesPrompt({
      repoName: "acme/widgets",
      branch: "main",
      focus: "packages/api",
      paths,
      pathsTruncated: false,
    });

    expect(prompt).toContain("Repository: acme/widgets");
    expect(prompt).toContain("Branch: main");
    expect(prompt).toContain("Focus: packages/api");

    for (const path of paths) {
      expect(prompt).toContain(`- ${path}`);
    }
  });

  it("includes a README excerpt when one was read", () => {
    const prompt = suggestFilesPrompt({
      repoName: "acme/widgets",
      branch: "main",
      readme: "# Widgets\nA demo project.",
      paths,
      pathsTruncated: false,
    });

    expect(prompt).toContain("README excerpt:");
    expect(prompt).toContain("A demo project.");
    expect(prompt).toContain("Repository: acme/widgets");
  });

  it("forbids inventing paths and asks for a JSON array", () => {
    const prompt = suggestFilesPrompt({
      repoName: "acme/widgets",
      branch: "main",
      paths,
      pathsTruncated: false,
    });

    expect(prompt).toContain("Copy paths verbatim from the list.");
    expect(prompt).toContain("Never invent, shorten or rename a path.");
    expect(prompt).toContain("Reply with ONLY a JSON array of paths:");
    expect(prompt).not.toContain("the listing is partial");
  });

  it("flags a partial listing", () => {
    const prompt = suggestFilesPrompt({
      repoName: "acme/widgets",
      branch: "main",
      paths,
      pathsTruncated: true,
    });

    expect(prompt).toContain("; the listing is partial)");
    expect(prompt).toContain("The listing is partial;");
  });
});

describe("samplePathsForPrompt", () => {
  it("returns short lists untouched", () => {
    expect(samplePathsForPrompt(paths)).toEqual({
      paths,
      truncated: false,
    });
  });

  it("keeps landmarks and spreads the cap across top-level directories", () => {
    const many = Array.from({ length: 400 }, (_, index) => {
      const directory = ["pkg-a", "pkg-b", "pkg-c", "pkg-d"][index % 4];
      return `${directory}/file-${index}.ts`;
    });

    const result = samplePathsForPrompt(
      ["README.md", "package.json", ...many],
      50,
    );

    expect(result.truncated).toBe(true);
    expect(result.paths).toHaveLength(50);
    expect(result.paths).toContain("README.md");
    expect(result.paths).toContain("package.json");

    for (const directory of ["pkg-a", "pkg-b", "pkg-c", "pkg-d"]) {
      expect(
        result.paths.some((path) => path.startsWith(`${directory}/`)),
      ).toBe(true);
    }
  });
});

describe("suggestedFilesSchema", () => {
  it("accepts a course-sized selection", () => {
    expect(suggestedFilesSchema.safeParse(paths).success).toBe(true);
  });

  it("rejects more than ten paths or an empty list", () => {
    const eleven = Array.from(
      { length: MAX_SELECTED_FILES + 1 },
      (_, index) => `src/file-${index}.ts`,
    );

    expect(suggestedFilesSchema.safeParse(eleven).success).toBe(false);
    expect(suggestedFilesSchema.safeParse([]).success).toBe(false);
  });

  it("rejects prose instead of an array", () => {
    expect(
      suggestedFilesSchema.safeParse("README.md, package.json").success,
    ).toBe(false);
  });
});

describe("mockSuggestedFiles", () => {
  const prompt = suggestFilesPrompt({
    repoName: "acme/widgets",
    branch: "main",
    paths,
    pathsTruncated: false,
  });

  it("only returns paths that were offered to the model", () => {
    const suggestion = mockSuggestedFiles(prompt);

    expect(suggestion.length).toBeGreaterThan(0);
    expect(suggestion.length).toBeLessThanOrEqual(MAX_SELECTED_FILES);

    for (const path of suggestion) {
      expect(paths).toContain(path);
    }
  });

  it("starts with the README and never repeats a path", () => {
    const suggestion = mockSuggestedFiles(prompt);

    expect(suggestion[0]).toBe("README.md");
    expect(new Set(suggestion).size).toBe(suggestion.length);
  });

  it("does not mistake the rule bullets for paths", () => {
    const suggestion = mockSuggestedFiles(prompt);

    expect(suggestion).not.toContain("Choose at most 10 files, ordered the way a learner should meet them.");
  });
});
