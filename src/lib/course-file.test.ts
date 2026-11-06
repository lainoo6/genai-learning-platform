import { describe, expect, it } from "vitest";

import {
  MAX_IMAGE_BYTES,
  MAX_IMAGES,
  MAX_UPLOAD_BYTES,
  uploadTotalBytes,
} from "@/lib/course-file";

/**
 * The per-image cap is only half the story: the host rejects the whole request
 * body, so the document and every image have to share one budget.
 */
describe("upload size contract", () => {
  it("keeps one image well below the shared budget", () => {
    expect(MAX_IMAGE_BYTES).toBe(1.5 * 1024 * 1024);
    expect(MAX_IMAGE_BYTES * MAX_IMAGES).toBeGreaterThan(MAX_UPLOAD_BYTES);
  });

  it("counts the document and every image together", () => {
    const total = uploadTotalBytes({ size: 3 * 1024 * 1024 }, [
      { size: 600 * 1024 },
      { size: 600 * 1024 },
    ]);

    expect(total).toBeGreaterThan(MAX_UPLOAD_BYTES);
    expect(uploadTotalBytes(null, [])).toBe(0);
  });

  it("lets six small images through when there is no document", () => {
    const images = Array.from({ length: MAX_IMAGES }, () => ({
      size: 600 * 1024,
    }));

    expect(uploadTotalBytes(null, images)).toBeLessThanOrEqual(
      MAX_UPLOAD_BYTES,
    );
  });
});
