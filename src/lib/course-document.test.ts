import { describe, expect, it } from "vitest";

import { MAX_COURSE_FILE_BYTES } from "@/lib/course-file";
import { readCourseDocument } from "@/lib/course-document";

/**
 * The shared document reader is the single validation path for both grounded
 * flows. These tests cover the metadata checks, which run before any bytes are
 * parsed; a real PDF/PPTX round-trip is exercised through the actions instead.
 */

function upload(name: string, size: number): File {
  return new File([new Uint8Array(size)], name);
}

describe("readCourseDocument", () => {
  it("rejects an empty file", async () => {
    await expect(readCourseDocument(upload("empty.pdf", 0))).resolves.toEqual({
      ok: false,
      code: "empty",
    });
  });

  it("rejects an unsupported extension", async () => {
    await expect(readCourseDocument(upload("notes.txt", 10))).resolves.toEqual({
      ok: false,
      code: "type",
    });
  });

  it("rejects a file above the shared size cap", async () => {
    await expect(
      readCourseDocument(upload("huge.pdf", MAX_COURSE_FILE_BYTES + 1)),
    ).resolves.toEqual({ ok: false, code: "tooLarge" });
  });
});
