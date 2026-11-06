import { z } from "zod";

/**
 * Upload contract shared by the generator form and its server action.
 *
 * Deliberately free of Node-only imports so the browser can read the size caps
 * without pulling `pdf-parse` or `jszip` into the client bundle.
 */

/**
 * Vercel rejects request bodies above ~4.5 MB, so the app cap stays below it.
 * Self-hosted deployments inherit the same limit to keep behaviour identical.
 */
export const MAX_COURSE_FILE_BYTES = 4 * 1024 * 1024;

export const COURSE_FILE_EXTENSIONS = [".pdf", ".pptx"] as const;

export type CourseFileKind = "pdf" | "pptx";

/**
 * The whole request body (document + every dropped image) must stay under the
 * host cap. A per-image cap alone would still let a 4 MB document plus six
 * images reach the platform as a 413, before the form could show an error.
 */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

/**
 * A dropped image becomes one vision call and one prompt paragraph, so one
 * file must not be able to eat the entire shared upload budget.
 */
export const MAX_IMAGE_BYTES = 1.5 * 1024 * 1024;
export const MAX_IMAGES = 6;

export const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp"] as const;

export type ImageMediaType = "image/png" | "image/jpeg" | "image/webp";

/**
 * File type is decided by extension: browsers report PPTX MIME types
 * unreliably, and the same is true of the few image formats we accept.
 */
export function courseFileKind(name: string): CourseFileKind | null {
  const lower = name.trim().toLowerCase();
  if (lower.endsWith(".pdf")) return "pdf";
  if (lower.endsWith(".pptx")) return "pptx";
  return null;
}

export function isImageName(name: string): boolean {
  const lower = name.trim().toLowerCase();
  return IMAGE_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

/** Vision models need the real media type; the filename is the only signal. */
export function imageMediaType(name: string): ImageMediaType | null {
  const lower = name.trim().toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  return null;
}

/**
 * Validates the browser-supplied metadata before any bytes are read.
 *
 * Issue messages are stable tokens (`type` / `tooLarge`) that the action maps
 * to translated strings, so the schema itself stays language-free.
 */
export const courseFileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { message: "type" })
    .refine((name) => courseFileKind(name) !== null, { message: "type" }),
  size: z
    .number()
    .int()
    .positive()
    .max(MAX_COURSE_FILE_BYTES, { message: "tooLarge" }),
});

/** Sum of the document and all dropped images, checked on both sides of the wire. */
export function uploadTotalBytes(
  document: { size: number } | null,
  images: readonly { size: number }[],
): number {
  return (
    (document?.size ?? 0) +
    images.reduce((total, image) => total + image.size, 0)
  );
}

/** Same contract for a dropped image, with its own size cap. */
export const imageFileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { message: "type" })
    .refine((name) => isImageName(name), { message: "type" }),
  size: z
    .number()
    .int()
    .positive()
    .max(MAX_IMAGE_BYTES, { message: "tooLarge" }),
});
