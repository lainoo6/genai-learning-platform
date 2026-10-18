import { describe, expect, it } from "vitest";

import { parseCsv, toCsvDocument, toCsvRow } from "@/lib/csv";

describe("parseCsv", () => {
  it("reads a plain header and rows", () => {
    expect(parseCsv("name,email\nAda,ada@example.com\n")).toEqual([
      ["name", "email"],
      ["Ada", "ada@example.com"],
    ]);
  });

  it("handles CRLF endings, a BOM and blank trailing lines", () => {
    expect(parseCsv("\uFEFFname,email\r\nAda,ada@example.com\r\n\r\n")).toEqual([
      ["name", "email"],
      ["Ada", "ada@example.com"],
      [""],
    ]);
  });

  it("keeps commas, quotes and newlines inside quoted cells", () => {
    expect(
      parseCsv(
        'name,note\n"Hopper, Grace","She said ""hello""\nand left"\n',
      ),
    ).toEqual([
      ["name", "note"],
      ["Hopper, Grace", 'She said "hello"\nand left'],
    ]);
  });

  it("returns an empty list for empty input", () => {
    expect(parseCsv("")).toEqual([]);
  });
});

describe("toCsvRow", () => {
  it("leaves plain cells untouched", () => {
    expect(toCsvRow(["Ada", "ada@example.com"])).toBe("Ada,ada@example.com");
  });

  it("quotes cells with commas, quotes or newlines", () => {
    expect(toCsvRow(["Hopper, Grace", 'a "quote"', "line\nbreak"])).toBe(
      '"Hopper, Grace","a ""quote""","line\nbreak"',
    );
  });
});

describe("toCsvDocument", () => {
  it("starts with a BOM and uses CRLF line endings", () => {
    expect(toCsvDocument([["name", "email"], ["Ada", "ada@example.com"]])).toBe(
      '\uFEFFname,email\r\nAda,ada@example.com\r\n',
    );
  });
});
