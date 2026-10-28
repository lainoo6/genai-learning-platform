import {
  courseFileKind,
  courseFileSchema,
  type CourseFileKind,
} from "@/lib/course-file";
import { extractPdfText, extractPptxText } from "@/lib/file-extractor";

/**
 * Server-side PDF/PPTX reading, shared by both grounded generation flows.
 *
 * This is the validation and extraction block that used to live inside
 * `generateCourseFromFileAction`, lifted out unchanged so the repository flow
 * can read an optional document without a second copy. The module pulls in
 * `pdf-parse` and `jszip`, so only server actions may import it.
 */

export type CourseDocumentFailure =
  | "empty"
  | "type"
  | "tooLarge"
  | "unreadable"
  | "noText";

export type CourseDocument =
  | { ok: true; kind: CourseFileKind; bytes: Uint8Array; text: string }
  | { ok: false; code: CourseDocumentFailure };

/** Existing dictionary keys, so both actions report upload failures the same way. */
export const DOCUMENT_ERROR_KEYS: Record<CourseDocumentFailure, string> = {
  empty: "server.generate.file.empty",
  type: "server.generate.file.type",
  tooLarge: "server.generate.file.tooLarge",
  unreadable: "server.generate.file.unreadable",
  noText: "server.generate.file.noText",
};

/**
 * Validates the browser-supplied metadata, decodes the bytes and extracts plain
 * text. The bytes are returned too because the document flow still describes
 * PPTX images. `text` is trimmed; an empty result is a failure, not a warning.
 */
export async function readCourseDocument(
  file: File,
): Promise<CourseDocument> {
  if (file.size === 0) {
    return { ok: false, code: "empty" };
  }

  const parsedFile = courseFileSchema.safeParse({
    name: file.name,
    size: file.size,
  });
  if (!parsedFile.success) {
    const reason = parsedFile.error.issues[0]?.message;
    return { ok: false, code: reason === "tooLarge" ? "tooLarge" : "type" };
  }

  const kind = courseFileKind(file.name);
  if (kind === null) {
    return { ok: false, code: "type" };
  }

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch (error: unknown) {
    console.error("[course-document] failed to read the uploaded file", error);
    return { ok: false, code: "unreadable" };
  }

  let text: string;
  try {
    text =
      kind === "pdf"
        ? await extractPdfText(bytes)
        : await extractPptxText(bytes);
  } catch (error: unknown) {
    console.error("[course-document] text extraction failed", error);
    return { ok: false, code: "unreadable" };
  }

  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return { ok: false, code: "noText" };
  }

  return { ok: true, kind, bytes, text: trimmed };
}
