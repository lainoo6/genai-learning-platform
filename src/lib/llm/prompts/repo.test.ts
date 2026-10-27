import { describe, expect, it } from "vitest";

import type { KeyFile } from "@/lib/github-repo";
import {
  mockRepoAnalysis,
  repoAnalysisPrompt,
  repoAnalysisSchema,
} from "@/lib/llm/prompts/repo";

const files: KeyFile[] = [
  { path: "README.md", content: "# Widgets", truncated: false },
  { path: "src/index.ts", content: "export const widgets = 1;", truncated: true },
];

describe("repoAnalysisPrompt", () => {
  it("names the repository and every provided file", () => {
    const prompt = repoAnalysisPrompt("acme/widgets", files, "the CLI layer");

    expect(prompt).toContain("Repository: acme/widgets");
    expect(prompt).toContain("Focus: the CLI layer");
    expect(prompt).toContain("--- README.md ---");
    expect(prompt).toContain("--- src/index.ts [truncated] ---");
    expect(prompt).toContain("export const widgets = 1;");
  });

  it("forbids inventing paths and guessing at unseen code", () => {
    const prompt = repoAnalysisPrompt("acme/widgets", files);

    expect(prompt).toContain("Reference only the paths listed below");
    expect(prompt).toContain('"unknown"');
    expect(prompt).toContain("Never guess at code you were not shown.");
    expect(prompt).not.toContain("Focus:");
  });

  it("says so when no files were provided", () => {
    expect(repoAnalysisPrompt("acme/widgets", [])).toContain(
      "(No files were provided.)",
    );
  });
});

describe("repoAnalysisSchema", () => {
  const analysis = repoAnalysisSchema.parse(mockRepoAnalysis("acme/widgets"));

  it("accepts the fixed demo analysis", () => {
    expect(analysis.summary.startsWith("[MOCK]")).toBe(true);
    expect(analysis.modules.length).toBeGreaterThan(0);
    expect(analysis.learningPath.length).toBeGreaterThan(0);
    expect(analysis.entryPoints.length).toBeGreaterThan(0);
  });

  it("labels every mock string so demo content is never mistaken for real", () => {
    expect(analysis.summary).toContain("[MOCK]");

    for (const courseModule of analysis.modules) {
      expect(courseModule.purpose).toContain("[MOCK]");
    }

    for (const step of analysis.learningPath) {
      expect(step.why).toContain("[MOCK]");
    }
  });

  it("rejects an analysis with no entry points", () => {
    expect(
      repoAnalysisSchema.safeParse({ ...analysis, entryPoints: [] }).success,
    ).toBe(false);
  });

  it("rejects a learning step below 1", () => {
    expect(
      repoAnalysisSchema.safeParse({
        ...analysis,
        learningPath: [{ step: 0, file: "README.md", why: "Start here." }],
      }).success,
    ).toBe(false);
  });

  it("rejects a summary that is too short to be useful", () => {
    expect(
      repoAnalysisSchema.safeParse({ ...analysis, summary: "A repo." }).success,
    ).toBe(false);
  });
});
