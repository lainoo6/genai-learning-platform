import { describe, expect, it } from "vitest";

import { MAX_IMAGE_BYTES, MAX_IMAGES } from "@/lib/course-file";
import { figureLines, readUploadedImage, readUploadedImages } from "@/lib/upload-images";

/**
 * `image-size` needs real headers, so the fixture is a real 1x1 PNG.
 */
const ONE_PIXEL_PNG = new Uint8Array(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
    "base64",
  ),
);

/** Minimal translator: returns the key plus the values it was given. */
const t = (key: string, values?: Record<string, string | number>): string =>
  values === undefined ? key : `${key}:${JSON.stringify(values)}`;

function pngFile(
  name: string,
  bytes: Uint8Array<ArrayBuffer> = ONE_PIXEL_PNG,
): File {
  return new File([bytes], name, { type: "image/png" });
}

describe("readUploadedImage", () => {
  it("wraps a real image with its dimensions and the direct-upload marker", async () => {
    const result = await readUploadedImage(pngFile("chart.png"), t);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.image.mediaPath).toBe("chart.png");
    expect(result.image.mediaType).toBe("image/png");
    expect(result.image.slideNumbers).toEqual([0]);
    expect(result.image.width).toBe(1);
    expect(result.image.height).toBe(1);
  });

  it("rejects an image above the per-image cap", async () => {
    const big = pngFile("huge.png", new Uint8Array(MAX_IMAGE_BYTES + 1));
    const result = await readUploadedImage(big, t);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.warning).toContain("server.generate.file.imageTooLarge");
    expect(result.warning).toContain("huge.png");
  });

  it("rejects a format the vision channel cannot read", async () => {
    const gif = new File([ONE_PIXEL_PNG], "anim.gif", { type: "image/gif" });
    const result = await readUploadedImage(gif, t);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.warning).toContain("server.generate.file.imageUnsupported");
  });
});

describe("readUploadedImages", () => {
  it("keeps the first six images and reports the overflow once", async () => {
    const files = Array.from({ length: MAX_IMAGES + 2 }, (_, index) =>
      pngFile(`image-${index}.png`),
    );

    const result = await readUploadedImages(files, t);

    expect(result.images).toHaveLength(MAX_IMAGES);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("server.generate.file.imagesLimit");
  });

  it("keeps going when one file in the batch is bad", async () => {
    const files = [
      pngFile("good.png"),
      pngFile("huge.png", new Uint8Array(MAX_IMAGE_BYTES + 1)),
    ];

    const result = await readUploadedImages(files, t);

    expect(result.images.map((image) => image.mediaPath)).toEqual(["good.png"]);
    expect(result.warnings).toHaveLength(1);
  });
});

describe("figureLines", () => {
  it("labels a slide image as a slide and a direct upload as an upload", () => {
    const lines = figureLines([
      { slideNumber: 0, text: "A bar chart of rainfall." },
      { slideNumber: 4, text: "The water cycle diagram." },
    ]);

    expect(lines[0]).toContain("Figures from the uploaded material");
    expect(lines[1]).toBe("- Uploaded image: A bar chart of rainfall.");
    expect(lines[2]).toBe("- Slide 4: The water cycle diagram.");
  });
});
