import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import en from "@/i18n/en.json";
import zh from "@/i18n/zh.json";

/**
 * Dictionary integrity.
 *
 * Two guarantees keep the platform honest in Chinese:
 * 1. both dictionaries define exactly the same keys, so nothing silently
 *    renders English because a translation was forgotten;
 * 2. every literal `t("…")` in the source exists, so a typo cannot hide behind
 *    the fallback.
 */

const enKeys = Object.keys(en).sort();
const zhKeys = Object.keys(zh).sort();

const SRC = fileURLToPath(new URL("..", import.meta.url));

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      return entry === "node_modules" ? [] : sourceFiles(path);
    }
    return /\.(ts|tsx)$/.test(entry) && !entry.endsWith(".test.ts") ? [path] : [];
  });
}

const SOURCE = sourceFiles(SRC)
  .map((path) => readFileSync(path, "utf8"))
  .join("\n");

const LITERAL_KEYS = [...SOURCE.matchAll(/\bt\(\s*"([^"]+)"/g)].map(
  (match) => match[1] as string,
);

describe("dictionaries", () => {
  it("define exactly the same keys in both languages", () => {
    expect(zhKeys.filter((key) => !(key in en))).toEqual([]);
    expect(enKeys.filter((key) => !(key in zh))).toEqual([]);
    expect(zhKeys).toHaveLength(enKeys.length);
  });

  it("never ship an empty translation", () => {
    for (const key of zhKeys) {
      expect((zh as Record<string, string>)[key]?.trim().length, key).toBeGreaterThan(0);
      expect((en as Record<string, string>)[key]?.trim().length, key).toBeGreaterThan(0);
    }
  });

  it("keeps the same placeholders in both languages", () => {
    const placeholders = (value: string): string[] =>
      [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1] as string).sort();

    for (const key of enKeys) {
      expect(
        placeholders((zh as Record<string, string>)[key] ?? ""),
        key,
      ).toEqual(placeholders((en as Record<string, string>)[key] ?? ""));
    }
  });

  it("defines every key used literally in the source", () => {
    const missing = [...new Set(LITERAL_KEYS.filter((key) => !(key in en)))];

    expect(missing).toEqual([]);
  });
});
