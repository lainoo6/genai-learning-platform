import { afterEach, describe, expect, it, vi } from "vitest";

import {
  fetchFileContent,
  fetchKeyFiles,
  fetchRepoTree,
  fetchSelectedFiles,
  filterRelevantFiles,
  filterRelevantFilesWithMeta,
  isRelevantPath,
  parseRepoUrl,
  type RepoTreeEntry,
} from "@/lib/github-repo";

function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: {
      "content-type": "application/json",
      ...(init.headers as Record<string, string> | undefined),
    },
  });
}

function base64(content: string): string {
  return Buffer.from(content, "utf8").toString("base64");
}

function entry(
  path: string,
  size?: number,
  type: RepoTreeEntry["type"] = "blob",
): RepoTreeEntry {
  return size === undefined ? { path, type } : { path, type, size };
}

/** Replaces fetch and hands each call the parsed URL. */
function stubFetch(handler: (url: URL) => Response): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => {
      const raw =
        input instanceof URL
          ? input.href
          : typeof input === "string"
            ? input
            : input.url;
      return handler(new URL(raw));
    }),
  );
}

/** Contents API response for one already-encoded file. */
function contentsResponse(
  path: string,
  content: string,
  size?: number,
): Response {
  return json({
    type: "file",
    path,
    encoding: "base64",
    content: base64(content),
    size: size ?? content.length,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("parseRepoUrl", () => {
  it("reads the owner and repo from the common URL forms", () => {
    const expected = { owner: "acme", repo: "widgets" };

    expect(parseRepoUrl("https://github.com/acme/widgets")).toEqual(expected);
    expect(parseRepoUrl("github.com/acme/widgets")).toEqual(expected);
    expect(parseRepoUrl("https://www.github.com/acme/widgets/")).toEqual(
      expected,
    );
    expect(parseRepoUrl("https://github.com/acme/widgets.git")).toEqual(
      expected,
    );
    expect(parseRepoUrl("https://github.com/acme/widgets?tab=readme")).toEqual(
      expected,
    );
  });

  it("extracts the branch and subpath from a tree URL", () => {
    expect(
      parseRepoUrl("https://github.com/acme/widgets/tree/main/packages/api"),
    ).toEqual({
      owner: "acme",
      repo: "widgets",
      branch: "main",
      subpath: "packages/api",
    });

    expect(
      parseRepoUrl("https://github.com/acme/widgets/tree/develop"),
    ).toEqual({
      owner: "acme",
      repo: "widgets",
      branch: "develop",
    });
  });

  it("ignores other repository sub-pages", () => {
    expect(
      parseRepoUrl("https://github.com/acme/widgets/blob/main/src/a.ts"),
    ).toEqual({ owner: "acme", repo: "widgets" });
  });

  it("rejects anything that is not a GitHub repository URL", () => {
    expect(parseRepoUrl("   ")).toBeNull();
    expect(parseRepoUrl("https://gitlab.com/acme/widgets")).toBeNull();
    expect(parseRepoUrl("https://github.com/acme")).toBeNull();
    expect(parseRepoUrl("not a url")).toBeNull();
  });
});

describe("filterRelevantFiles", () => {
  const tree: RepoTreeEntry[] = [
    entry("README.md", 400),
    entry("src/index.ts", 900),
    entry("src/app.ts", 700),
    entry("src/logo.png", 2_000),
    entry("src/huge.bundle.js", 2_000_000),
    entry("node_modules/left-pad/index.js", 500),
    entry("dist/bundle.js", 500),
    entry("build/out.js", 500),
    entry(".git/config", 30),
    entry("package-lock.json", 5_000),
    entry("yarn.lock", 5_000),
    entry("assets/logo.svg", 300),
    entry("fonts/inter.woff2", 300),
    entry("src", undefined, "tree"),
  ];

  it("drops dependencies, build output, lockfiles, binaries and big files", () => {
    const paths = filterRelevantFiles(tree).map((file) => file.path);

    expect(paths).toEqual(
      expect.arrayContaining(["README.md", "src/app.ts", "src/index.ts"]),
    );

    for (const ignored of [
      "src/logo.png",
      "src/huge.bundle.js",
      "node_modules/left-pad/index.js",
      "dist/bundle.js",
      "build/out.js",
      ".git/config",
      "package-lock.json",
      "yarn.lock",
      "assets/logo.svg",
      "fonts/inter.woff2",
    ]) {
      expect(paths).not.toContain(ignored);
    }
  });

  it("narrows to a subpath when given", () => {
    const paths = filterRelevantFiles(tree, "src").map((file) => file.path);

    expect(paths).toEqual(["src/app.ts", "src/index.ts"]);
  });

  it("reports when the 400-file preview cap hides files", () => {
    const many = Array.from({ length: 401 }, (_, index) =>
      entry(`src/file-${String(index).padStart(3, "0")}.ts`),
    );

    const capped = filterRelevantFilesWithMeta(many);
    expect(capped.files).toHaveLength(400);
    expect(capped.truncated).toBe(true);

    const exact = filterRelevantFilesWithMeta(many.slice(0, 400));
    expect(exact.files).toHaveLength(400);
    expect(exact.truncated).toBe(false);
  });
});

describe("isRelevantPath", () => {
  it("accepts source files and rejects everything the preview hides", () => {
    expect(isRelevantPath("src/app.ts")).toBe(true);
    expect(isRelevantPath("README.md")).toBe(true);

    for (const path of [
      "",
      "node_modules/left-pad/index.js",
      "dist/bundle.js",
      ".env",
      ".git/config",
      "package-lock.json",
      "yarn.lock",
      "src/logo.png",
      "src/app.min.js",
      "src/../secrets.ts",
    ]) {
      expect(isRelevantPath(path), path).toBe(false);
    }
  });

  it("rejects paths outside the subpath", () => {
    expect(isRelevantPath("packages/api/src/index.ts", "packages/api")).toBe(
      true,
    );
    expect(isRelevantPath("packages/web/src/index.ts", "packages/api")).toBe(
      false,
    );
  });
});

describe("fetchRepoTree", () => {
  it("resolves the default branch when none was given", async () => {
    stubFetch((url) => {
      if (url.pathname === "/repos/acme/widgets") {
        return json({ default_branch: "trunk" });
      }

      return json({
        truncated: false,
        tree: [{ path: "README.md", type: "blob", size: 10 }],
      });
    });

    const tree = await fetchRepoTree("acme", "widgets");

    expect(tree.branch).toBe("trunk");
    expect(tree.entries).toEqual([
      { path: "README.md", type: "blob", size: 10 },
    ]);
    expect(tree.truncated).toBe(false);
  });

  it("keeps the truncation flag GitHub reports", async () => {
    stubFetch(() => json({ truncated: true, tree: [] }));

    const tree = await fetchRepoTree("acme", "widgets", "main");

    expect(tree.truncated).toBe(true);
  });

  it("fails with a clear message when the rate limit is exhausted", async () => {
    stubFetch(() =>
      json(
        { message: "API rate limit exceeded" },
        {
          status: 403,
          headers: {
            "x-ratelimit-remaining": "0",
            "x-ratelimit-reset": String(
              Math.floor(Date.now() / 1_000) + 600,
            ),
          },
        },
      ),
    );

    await expect(
      fetchRepoTree("acme", "widgets", "main"),
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });

    await expect(
      fetchRepoTree("acme", "widgets", "main"),
    ).rejects.toThrow(/GITHUB_TOKEN/u);
  });

  it("maps a missing (or private) repository to NOT_FOUND", async () => {
    stubFetch(() => json({ message: "Not Found" }, { status: 404 }));

    await expect(
      fetchRepoTree("acme", "widgets", "main"),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("maps an empty repository to EMPTY_REPO", async () => {
    stubFetch(() => json({ message: "Git Repository is empty." }, { status: 409 }));

    await expect(
      fetchRepoTree("acme", "widgets", "main"),
    ).rejects.toMatchObject({ code: "EMPTY_REPO" });
  });
});

describe("fetchFileContent", () => {
  it("decodes a base64 file", async () => {
    stubFetch((url) => {
      expect(url.searchParams.get("ref")).toBe("main");
      return contentsResponse("src/index.ts", "export const x = 1;\n");
    });

    await expect(
      fetchFileContent("acme", "widgets", "src/index.ts", "main"),
    ).resolves.toBe("export const x = 1;\n");
  });

  it("refuses a file larger than 1 MB without decoding it", async () => {
    stubFetch(() =>
      json({
        type: "file",
        encoding: "none",
        content: "",
        size: 2_000_000,
      }),
    );

    await expect(
      fetchFileContent("acme", "widgets", "data.bin"),
    ).rejects.toMatchObject({ code: "TOO_LARGE" });
  });
});

describe("fetchKeyFiles", () => {
  const tree = {
    branch: "main",
    truncated: false,
    entries: [
      entry("docs/guide.md"),
      entry("package.json"),
      entry("README.md"),
      entry("src/index.ts"),
      entry("src/utils/helper.ts"),
    ],
  };

  it("reads README first, then entry files, manifests and src", async () => {
    stubFetch((url) => {
      const path = decodeURIComponent(
        url.pathname.replace("/repos/acme/widgets/contents/", ""),
      );
      return contentsResponse(path, `content of ${path}`);
    });

    const files = await fetchKeyFiles("acme", "widgets", tree, "main");

    expect(files.map((file) => file.path)).toEqual([
      "README.md",
      "src/index.ts",
      "package.json",
      "src/utils/helper.ts",
      "docs/guide.md",
    ]);
  });

  it("stops at the requested number of files", async () => {
    stubFetch((url) => {
      const path = decodeURIComponent(
        url.pathname.replace("/repos/acme/widgets/contents/", ""),
      );
      return contentsResponse(path, `content of ${path}`);
    });

    const files = await fetchKeyFiles("acme", "widgets", tree, "main", 2);

    expect(files.map((file) => file.path)).toEqual([
      "README.md",
      "src/index.ts",
    ]);
  });

  it("truncates a file that exceeds the per-file budget", async () => {
    const huge = "x".repeat(20_000);
    stubFetch(() => contentsResponse("README.md", huge, huge.length));

    const files = await fetchKeyFiles(
      "acme",
      "widgets",
      { branch: "main", truncated: false, entries: [entry("README.md")] },
      "main",
    );

    expect(files).toHaveLength(1);
    expect(files[0]?.truncated).toBe(true);
    expect(files[0]?.content.length).toBeLessThanOrEqual(12_000);
  });

  it("skips one unreadable file but keeps the rest", async () => {
    stubFetch((url) => {
      const path = decodeURIComponent(
        url.pathname.replace("/repos/acme/widgets/contents/", ""),
      );

      if (path === "src/index.ts") {
        return json({ message: "Server Error" }, { status: 500 });
      }

      return contentsResponse(path, `content of ${path}`);
    });

    const files = await fetchKeyFiles("acme", "widgets", tree, "main");

    expect(files.map((file) => file.path)).toContain("README.md");
    expect(files.map((file) => file.path)).not.toContain("src/index.ts");
  });

  it("aborts the run when GitHub rate limits a file read", async () => {
    stubFetch(() =>
      json(
        { message: "API rate limit exceeded" },
        {
          status: 403,
          headers: { "x-ratelimit-remaining": "0" },
        },
      ),
    );

    await expect(
      fetchKeyFiles("acme", "widgets", tree, "main"),
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });
});

describe("fetchSelectedFiles", () => {
  function requestedPath(url: URL): string {
    return decodeURIComponent(
      url.pathname.replace("/repos/acme/widgets/contents/", ""),
    );
  }

  it("reads only the selected paths, in the order given", async () => {
    const requested: string[] = [];

    stubFetch((url) => {
      const path = requestedPath(url);
      requested.push(path);
      return contentsResponse(path, `content of ${path}`);
    });

    const result = await fetchSelectedFiles(
      "acme",
      "widgets",
      ["src/app.ts", "README.md"],
      "main",
    );

    expect(result.files.map((file) => file.path)).toEqual([
      "src/app.ts",
      "README.md",
    ]);
    expect(result.files[0]?.content).toBe("content of src/app.ts");
    expect(result.skipped).toEqual([]);
    expect(result.truncated).toBe(false);
    expect([...requested].sort()).toEqual(["README.md", "src/app.ts"]);
  });

  it("deduplicates paths and skips unreadable files", async () => {
    stubFetch((url) => {
      const path = requestedPath(url);

      if (path === "src/broken.ts") {
        return json({ message: "Not Found" }, { status: 404 });
      }

      return contentsResponse(path, `content of ${path}`);
    });

    const result = await fetchSelectedFiles(
      "acme",
      "widgets",
      ["src/app.ts", "src/broken.ts", "src/app.ts"],
      "main",
    );

    expect(result.files.map((file) => file.path)).toEqual(["src/app.ts"]);
    expect(result.skipped).toEqual(["src/broken.ts"]);
  });

  it("flags truncation when a file exceeds the per-file budget", async () => {
    const huge = "x".repeat(20_000);
    stubFetch(() => contentsResponse("src/big.ts", huge, huge.length));

    const result = await fetchSelectedFiles(
      "acme",
      "widgets",
      ["src/big.ts"],
      "main",
    );

    expect(result.files[0]?.truncated).toBe(true);
    expect(result.truncated).toBe(true);
    expect(result.files[0]?.content.length).toBeLessThanOrEqual(12_000);
  });

  it("aborts when GitHub rate limits a selected file", async () => {
    stubFetch(() =>
      json(
        { message: "API rate limit exceeded" },
        {
          status: 403,
          headers: {
            "x-ratelimit-remaining": "0",
            "x-ratelimit-reset": "1893456000",
          },
        },
      ),
    );

    await expect(
      fetchSelectedFiles("acme", "widgets", ["src/app.ts"], "main"),
    ).rejects.toMatchObject({
      code: "RATE_LIMITED",
      message: expect.stringContaining("resets at"),
    });
  });

  it("fails when nothing selected can be read", async () => {
    stubFetch(() => json({ message: "Not Found" }, { status: 404 }));

    await expect(
      fetchSelectedFiles("acme", "widgets", ["src/gone.ts"], "main"),
    ).rejects.toMatchObject({ code: "NO_FILES" });
  });
});

