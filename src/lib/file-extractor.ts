import JSZip from "jszip";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

/**
 * Plain-text extraction for the two upload formats the generator accepts.
 *
 * Text only: there is no OCR, so a scanned PDF simply yields an empty string
 * and the action reports that the file has no readable text. Both readers are
 * pure functions over the uploaded bytes and never touch the network.
 */

/** PPTX stores text as `<a:t>` runs inside each slide part. */
const SLIDE_PART = /^ppt\/slides\/slide(\d+)\.xml$/u;
const TEXT_RUN = /<a:t>([\s\S]*?)<\/a:t>/gu;

function decodeXml(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/** Collapses the whitespace XML keeps for readability, not for meaning. */
function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r\n?/gu, "\n")
    .replace(/[ \t]+/gu, " ")
    .replace(/ *\n */gu, "\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

function textRuns(xml: string): string {
  const runs: string[] = [];
  for (const match of xml.matchAll(TEXT_RUN)) {
    runs.push(decodeXml(match[1]));
  }
  return normalizeWhitespace(runs.join(" "));
}

/**
 * Extracts the text layer of every PDF page.
 *
 * `isEvalSupported: false` is required under Next's server runtime: the
 * default evaluates embedded font programs with `new Function`, which is
 * blocked. Fonts are also left unresolved because only the text is needed.
 */
export async function extractPdfText(bytes: Uint8Array): Promise<string> {
  // pdf.js transfers (and detaches) the typed array it receives, so hand it a
  // copy and keep the caller's bytes usable for the PPTX image reader.
  const data = new Uint8Array(bytes);

  const task = getDocument({
    data,
    isEvalSupported: false,
    disableFontFace: true,
    useSystemFonts: false,
    useWorkerFetch: false,
    verbosity: 0,
  });

  const pdf = await task.promise;

  try {
    const pages: string[] = [];

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      try {
        const content = await page.getTextContent();
        let pageText = "";

        for (const item of content.items) {
          if (!("str" in item)) continue;
          pageText += item.str;
          pageText += item.hasEOL ? "\n" : " ";
        }

        const normalized = normalizeWhitespace(pageText);
        if (normalized.length > 0) pages.push(normalized);
      } finally {
        page.cleanup();
      }
    }

    return pages.join("\n\n");
  } finally {
    await pdf.destroy();
  }
}

/**
 * Extracts every slide's drawing text in slide-file order.
 *
 * Slides are prefixed with their number so the course prompt can attribute
 * facts to a place in the deck.
 */
export async function extractPptxText(bytes: Uint8Array): Promise<string> {
  const zip = await JSZip.loadAsync(bytes);

  const slides = Object.keys(zip.files)
    .map((name) => ({ name, number: Number(SLIDE_PART.exec(name)?.[1] ?? 0) }))
    .filter((slide) => slide.number > 0 && !zip.files[slide.name].dir)
    .sort((a, b) => a.number - b.number);

  const parts: string[] = [];

  for (const slide of slides) {
    const entry = zip.file(slide.name);
    if (entry === null) continue;

    const text = textRuns(await entry.async("string"));
    if (text.length > 0) {
      parts.push(`[Slide ${slide.number}] ${text}`);
    }
  }

  return parts.join("\n\n");
}
