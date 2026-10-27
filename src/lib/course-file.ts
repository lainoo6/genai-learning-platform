import { z } from "zod";

/**
 * Upload contract shared by the generator form and its server action.
 *
 * Deliberately free of Node-only imports so the browser can read the size cap
 * without pulling `pdfjs-dist` or `jszip` into the client bundle.
 */

/**
 * Vercel rejects request bodies above ~4.5 MB, so the app cap stays below it.
 * Self-hosted deployments inherit the same limit to keep behaviour identical.
 */
export const MAX_COURSE_FILE_BYTES = 4 * 1024 * 1024;

export const COURSE_FILE_EXTENSIONS = [".pdf", ".pptx"] as const;

export type CourseFileKind = "pdf" | "pptx";

/** File type is decided by extension: browsers report PPTX MIME types unreliably. */
export function courseFileKind(name: string): CourseFileKind | null {
  const lower = name.trim().toLowerCase();
  if (lower.endsWith(".pdf")) return "pdf";
  if (lower.endsWith(".pptx")) return "pptx";
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
