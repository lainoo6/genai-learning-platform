import JSZip from "jszip";
import { CanvasFactory } from "pdf-parse/worker";
import { PDFParse } from "pdf-parse";

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
 * pdf-parse runs pdf.js inside a worker and injects its own polyfills, so it
 * works under the Node/Vercel server runtime where importing `pdfjs-dist`
 * directly failed (`Module not found`, missing `DOMMatrix`). The worker entry
 * must be imported before the main module to register those polyfills, and the
 * canvas factory supplies the DOM canvas APIs pdf.js expects.
 */
export async function extractPdfText(bytes: Uint8Array): Promise<string> {
  // pdf.js takes ownership of the data it receives, so pass a copy and keep
  // the caller's bytes usable for the PPTX image reader.
  const parser = new PDFParse({
    data: Buffer.from(bytes),
    CanvasFactory,
  });

  try {
    // The default marker is "-- page N of M --"; page breaks are enough here.
    const result = await parser.getText({ pageJoiner: "\n\n" });
    return normalizeWhitespace(result.text);
  } finally {
    await parser.destroy();
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
