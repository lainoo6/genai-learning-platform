import { describe, expect, it } from "vitest";

import type { RepoTreeEntry } from "@/lib/github-repo";
import {
  buildRepoTree,
  collectFolderPaths,
  flattenFiles,
  formatBytes,
  toggleExpandedPath,
} from "@/lib/repo-tree";

function entry(path: string, size?: number): RepoTreeEntry {
  return size === undefined
    ? { path, type: "blob" }
    : { path, type: "blob", size };
}

describe("buildRepoTree", () => {
  const entries = [
    entry("README.md", 400),
    entry("src/app.ts", 900),
    entry("src/components/Button.tsx", 1_200),
    entry("src/z.ts"),
    entry("tests/a.test.ts", 300),
  ];

  it("creates folders from the flat path list, directories first", () => {
    const tree = buildRepoTree(entries);

    expect(tree.map((node) => node.name)).toEqual([
      "src",
      "tests",
      "README.md",
    ]);

    const src = tree[0];
    expect(src?.kind).toBe("dir");
    if (src?.kind !== "dir") {
      throw new Error("expected src to be a directory");
    }

    expect(src.children.map((node) => node.name)).toEqual([
      "components",
      "app.ts",
      "z.ts",
    ]);

    const app = src.children.find((node) => node.name === "app.ts");
    expect(app).toMatchObject({ kind: "file", path: "src/app.ts", size: 900 });
  });

  it("keeps the render order when flattened", () => {
    const files = flattenFiles(buildRepoTree(entries)).map((file) => file.path);

    expect(files).toEqual([
      "src/components/Button.tsx",
      "src/app.ts",
      "src/z.ts",
      "tests/a.test.ts",
      "README.md",
    ]);
  });

  it("ignores empty paths", () => {
    expect(buildRepoTree([entry("")])).toEqual([]);
  });
});

describe("collectFolderPaths", () => {
  it("lists every directory in render order, parents before children", () => {
    const tree = buildRepoTree([
      entry("README.md"),
      entry("src/app.ts"),
      entry("src/components/Button.tsx"),
    ]);

    expect(collectFolderPaths(tree)).toEqual([
      "src",
      "src/components",
    ]);
  });

  it("returns an empty list when the repository has no folders", () => {
    expect(collectFolderPaths(buildRepoTree([entry("README.md")]))).toEqual([]);
  });
});

describe("toggleExpandedPath", () => {
  it("expands a collapsed folder and collapses it again", () => {
    const collapsed = new Set<string>();
    const expanded = toggleExpandedPath(collapsed, "src");

    expect([...expanded]).toEqual(["src"]);
    expect(expanded.has("src")).toBe(true);
    expect(collapsed.size).toBe(0);

    expect(toggleExpandedPath(expanded, "src").has("src")).toBe(false);
  });

  it("leaves other expanded folders alone", () => {
    const current = new Set(["src", "tests"]);

    expect([...toggleExpandedPath(current, "src")]).toEqual(["tests"]);
  });
});

describe("formatBytes", () => {
  it("uses B, KB and MB with a readable precision", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(3_482)).toBe("3.4 KB");
    expect(formatBytes(10_240)).toBe("10 KB");
    expect(formatBytes(1_258_291)).toBe("1.2 MB");
  });

  it("returns an empty string for unusable values", () => {
    expect(formatBytes(-1)).toBe("");
    expect(formatBytes(Number.NaN)).toBe("");
  });
});
