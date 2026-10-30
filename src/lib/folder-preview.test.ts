import { describe, expect, it } from "vitest";

import {
  MAX_FOLDER_FILES,
  directChildFiles,
  folderExplanationPrompt,
  folderPreviewCandidates,
  isPreviewableCodePath,
  previewExcerpt,
  previewLines,
} from "@/lib/folder-preview";

describe("isPreviewableCodePath", () => {
  it("accepts common source extensions", () => {
    for (const path of [
      "src/index.ts",
      "src/App.tsx",
      "lib/main.py",
      "cmd/server/main.go",
      "src/lib.rs",
    ]) {
      expect(isPreviewableCodePath(path), path).toBe(true);
    }
  });

  it("rejects docs, data, styles and assets", () => {
    for (const path of [
      "README.md",
      "package.json",
      "src/styles.css",
      "public/logo.svg",
      "assets/photo.png",
      "LICENSE",
    ]) {
      expect(isPreviewableCodePath(path), path).toBe(false);
    }
  });
});

describe("folderPreviewCandidates", () => {
  it("keeps code files, puts entry points first and caps at five", () => {
    const candidates = folderPreviewCandidates([
      "src/components/Button.tsx",
      "src/components/README.md",
      "src/components/index.ts",
      "src/components/use-theme.ts",
      "src/components/card.tsx",
      "src/components/modal.tsx",
      "src/components/package.json",
      "src/components/form.tsx",
    ]);

    expect(candidates).toHaveLength(5);
    expect(candidates[0]).toBe("src/components/index.ts");

    for (const path of candidates) {
      expect(isPreviewableCodePath(path), path).toBe(true);
    }
  });

  it("prefers regular code over tests", () => {
    const candidates = folderPreviewCandidates(
      [
        "src/auth/auth.test.ts",
        "src/auth/auth.ts",
        "src/auth/AuthProvider.tsx",
      ],
      2,
    );

    expect(candidates).toHaveLength(2);
    expect(candidates).toContain("src/auth/auth.ts");
    expect(candidates).toContain("src/auth/AuthProvider.tsx");
    expect(candidates).not.toContain("src/auth/auth.test.ts");
  });

  it("deduplicates paths and never exceeds the preview limit", () => {
    const candidates = folderPreviewCandidates(
      Array.from({ length: 20 }, () => "src/file.ts"),
    );

    expect(candidates).toEqual(["src/file.ts"]);
  });
});

describe("directChildFiles", () => {
  it("keeps direct children and drops nested or outside paths", () => {
    const files = directChildFiles("src/components", [
      "src/components/Button.tsx",
      "src/components/learn/Card.tsx",
      "src/components",
      "src/server/action.ts",
      "src/components/Button.tsx",
    ]);

    expect(files).toEqual(["src/components/Button.tsx"]);
  });

  it("normalises trailing slashes and caps the list", () => {
    const files = directChildFiles(
      "src/",
      Array.from({ length: MAX_FOLDER_FILES + 10 }, (_, index) => `src/file-${index}.ts`),
    );

    expect(files).toHaveLength(MAX_FOLDER_FILES);
  });

  it("returns nothing for an empty folder path", () => {
    expect(directChildFiles("", ["src/file.ts"])).toEqual([]);
  });
});

describe("previewLines", () => {
  it("returns at most fifteen lines and normalises CRLF", () => {
    const content = Array.from(
      { length: 20 },
      (_, index) => `line ${index + 1}`,
    ).join("\r\n");

    const lines = previewLines(content);

    expect(lines).toHaveLength(15);
    expect(lines[0]).toBe("line 1");
    expect(lines[14]).toBe("line 15");
  });

  it("cuts very long lines instead of flooding the prompt", () => {
    const lines = previewLines(`${"x".repeat(1_000)}\nsecond`);

    expect(lines[0]).toHaveLength(200);
    expect(lines[1]).toBe("second");
  });

  it("caps the joined excerpt", () => {
    const excerpt = previewExcerpt(
      Array.from({ length: 15 }, () => "y".repeat(200)).join("\n"),
    );

    expect(excerpt.length).toBeLessThanOrEqual(1_500);
  });
});

describe("folderExplanationPrompt", () => {
  it("names the folder, repository, files and previews", () => {
    const prompt = folderExplanationPrompt({
      folderPath: "src/components/learn",
      repoUrl: "https://github.com/acme/widgets",
      filePaths: [
        "src/components/learn/index.ts",
        "src/components/learn/Card.tsx",
      ],
      previews: [
        {
          path: "src/components/learn/index.ts",
          excerpt: 'export { Card } from "./Card";',
        },
      ],
    });

    expect(prompt).toContain("folder 'src/components/learn'");
    expect(prompt).toContain("'https://github.com/acme/widgets'");
    expect(prompt).toContain("- index.ts");
    expect(prompt).toContain("- Card.tsx");
    expect(prompt).toContain("--- index.ts ---");
    expect(prompt).toContain('export { Card } from "./Card";');
    expect(prompt).toContain("Keep it concise.");
  });

  it("omits the preview section when nothing could be read", () => {
    const prompt = folderExplanationPrompt({
      folderPath: "src/empty",
      repoUrl: "https://github.com/acme/widgets",
      filePaths: [],
      previews: [],
    });

    expect(prompt).toContain("(No files were provided.)");
    expect(prompt).not.toContain("first few lines");
  });
});
