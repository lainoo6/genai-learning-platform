/**
 * Standalone vision smoke test for the PPTX ingestion feature.
 *
 * NOT part of the app build — nothing under `src/` imports this file.
 *
 *   npx tsx --env-file=.env scripts/test-vision.ts "C:\path\to\deck.pptx"
 *
 * Pipeline:
 *   1. parse slide relationships so only media actually placed on slides counts;
 *   2. skip title/section-divider slides (no text, or just a slide number);
 *   3. drop images smaller than 128x128 (icons/bullets), regardless of bytes;
 *   4. when more than MAX_IMAGES survive, prefer the slides with the most text;
 *   5. describe the winners in slide order, one model call per image.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

import { pptxToFiles } from "@fefeding/ppt-parser";
import { generateText } from "ai";
import { imageSize } from "image-size";

import {
  isMockMode,
  llmBaseUrl,
  llmClient,
  llmModel,
  llmProviderOptions,
} from "../src/lib/llm/provider";

const MAX_IMAGES = 3;
const MIN_DIMENSION = 128;
const MAX_OUTPUT_TOKENS = 300;
const TEXT_PREVIEW_CHARS = 160;

/** Raster formats every vision-capable model accepts. SVG/EMF/WMF are skipped. */
const MEDIA_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
};

type ExtractedImage = {
  mediaPath: string;
  /** Every content slide that references this media file, in slide order. */
  slideNumbers: number[];
  bytes: Uint8Array;
  mediaType: string;
  size: number;
  width: number;
  height: number;
};

type ImageContent = {
  type: "image";
  format: string;
  base64: string;
  dataUrl: string;
};

type TextContent = {
  type: "text";
  content: string;
};

type Relationship = {
  id: string;
  type: string;
  target: string;
  external: boolean;
};

function isImageContent(value: unknown): value is ImageContent {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<ImageContent>;
  return (
    candidate.type === "image" &&
    typeof candidate.base64 === "string" &&
    typeof candidate.format === "string"
  );
}

function isTextContent(value: unknown): value is TextContent {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<TextContent>;
  return candidate.type === "text" && typeof candidate.content === "string";
}

function formatSize(bytes: number): string {
  return bytes >= 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${bytes} B`;
}

function formatDimensions(width: number, height: number): string {
  return width > 0 && height > 0 ? `${width}x${height}` : "unknown";
}

function preview(text: string): string {
  return text.length > TEXT_PREVIEW_CHARS
    ? `${text.slice(0, TEXT_PREVIEW_CHARS - 3)}...`
    : text;
}

function decodeXml(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/** Full plain text of a slide (drawing text runs only). */
function slideText(content: Record<string, unknown>, slidePath: string): string {
  const entry = content[slidePath];
  if (!isTextContent(entry)) return "";

  const runs = [...entry.content.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((match) =>
    decodeXml(match[1]),
  );
  return runs.join(" ").replace(/\s+/g, " ").trim();
}

/** Title/section dividers carry no text, or nothing but their slide number. */
function isDividerSlide(text: string): boolean {
  return text.length === 0 || /^\d+$/.test(text);
}

function attr(attrs: string, name: string): string | null {
  const match = new RegExp(`\\b${name}="([^"]*)"`).exec(attrs);
  return match === null ? null : match[1];
}

/** Resolves an OPC relationship target relative to the part's directory. */
function resolveTarget(baseDir: string, target: string): string {
  let decoded = target;
  try {
    decoded = decodeURIComponent(target);
  } catch {
    // Keep the raw target when it is not valid percent-encoding.
  }

  const segments = `${baseDir}/${decoded}`.split("/");
  const resolved: string[] = [];
  for (const segment of segments) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      resolved.pop();
      continue;
    }
    resolved.push(segment);
  }
  return resolved.join("/");
}

function parseRelationships(xml: string): Relationship[] {
  const relationships: Relationship[] = [];
  for (const match of xml.matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const attrs = match[1];
    const id = attr(attrs, "Id");
    const type = attr(attrs, "Type");
    const target = attr(attrs, "Target");
    if (id === null || type === null || target === null) continue;

    relationships.push({
      id,
      type,
      target,
      external: (attr(attrs, "TargetMode") ?? "").toLowerCase() === "external",
    });
  }
  return relationships;
}

/**
 * Slide paths in presentation order. Falls back to numeric filenames when
 * presentation.xml is unavailable.
 */
function slideOrder(content: Record<string, unknown>): string[] {
  const presentationXml = isTextContent(content["ppt/presentation.xml"])
    ? content["ppt/presentation.xml"].content
    : null;
  const presentationRels = isTextContent(
    content["ppt/_rels/presentation.xml.rels"],
  )
    ? content["ppt/_rels/presentation.xml.rels"].content
    : null;

  if (presentationXml !== null && presentationRels !== null) {
    const relsById = new Map(
      parseRelationships(presentationRels).map((rel) => [rel.id, rel]),
    );

    const ordered: string[] = [];
    for (const match of presentationXml.matchAll(/<p:sldId\b([^>]*)\/?>/g)) {
      const relId = attr(match[1], "r:id");
      const rel = relId === null ? undefined : relsById.get(relId);
      if (rel === undefined || rel.external) continue;
      ordered.push(resolveTarget("ppt", rel.target));
    }
    if (ordered.length > 0) return ordered;
  }

  return Object.keys(content)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => {
      const na = Number(/slide(\d+)\.xml$/.exec(a)?.[1] ?? 0);
      const nb = Number(/slide(\d+)\.xml$/.exec(b)?.[1] ?? 0);
      return na - nb;
    });
}

function slideRelsPath(slidePath: string): string {
  const dir = path.posix.dirname(slidePath);
  const file = path.posix.basename(slidePath);
  return `${dir}/_rels/${file}.rels`;
}

async function extractSlideImages(
  pptxPath: string,
): Promise<{
  images: ExtractedImage[];
  mediaTotal: number;
  slideTexts: Map<number, string>;
  dividerSlides: number[];
}> {
  const file = await readFile(pptxPath);
  const { content } = await pptxToFiles(file);

  const mediaTotal = Object.keys(content).filter(
    (name) => name.startsWith("ppt/media/") && isImageContent(content[name]),
  ).length;

  const images = new Map<string, ExtractedImage>();
  const slideTexts = new Map<number, string>();
  const dividerSlides: number[] = [];
  const slides = slideOrder(content);

  slides.forEach((slidePath, index) => {
    const slideNumber = index + 1;
    const text = slideText(content, slidePath);
    slideTexts.set(slideNumber, text);

    // Divider slides are decorative: never pull images from them.
    if (isDividerSlide(text)) {
      dividerSlides.push(slideNumber);
      return;
    }

    const relsEntry = content[slideRelsPath(slidePath)];
    if (!isTextContent(relsEntry)) return;

    for (const rel of parseRelationships(relsEntry.content)) {
      if (rel.external) continue;
      if (!/\/image$/i.test(rel.type)) continue;

      const mediaPath = resolveTarget(path.posix.dirname(slidePath), rel.target);
      const entry = content[mediaPath];
      if (!isImageContent(entry)) continue;

      const mediaType = MEDIA_TYPES[entry.format.toLowerCase()];
      if (mediaType === undefined) continue;

      const existing = images.get(mediaPath);
      if (existing !== undefined) {
        existing.slideNumbers.push(slideNumber);
        continue;
      }

      const bytes = Buffer.from(entry.base64, "base64");
      const buffer = new Uint8Array(bytes);

      let width = 0;
      let height = 0;
      try {
        const dimensions = imageSize(buffer);
        width = dimensions.width ?? 0;
        height = dimensions.height ?? 0;
      } catch {
        // Leave 0x0: unreadable dimensions are dropped by the pixel filter.
      }

      images.set(mediaPath, {
        mediaPath,
        slideNumbers: [slideNumber],
        bytes: buffer,
        mediaType,
        size: bytes.length,
        width,
        height,
      });
    }
  });

  const ordered = [...images.values()].sort(
    (a, b) => (a.slideNumbers[0] ?? 0) - (b.slideNumbers[0] ?? 0),
  );

  return { images: ordered, mediaTotal, slideTexts, dividerSlides };
}

function usageLine(usage: {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}): string {
  const input = usage.inputTokens ?? 0;
  const output = usage.outputTokens ?? 0;
  const total = usage.totalTokens ?? input + output;
  return `tokens: input=${input} output=${output} total=${total}`;
}

/**
 * `deepseek-flash` is a reasoning model: with a 300-token cap it spends the
 * entire budget on hidden reasoning and returns empty text. Disabling reasoning
 * keeps the requested maxOutputTokens=300 usable. Same model, same gateway.
 */
const baseProviderOptions = llmProviderOptions();
const PROVIDER_OPTIONS = {
  ...baseProviderOptions,
  openai: {
    ...baseProviderOptions?.openai,
    reasoningEffort: "none" as const,
  },
};

async function describeImage(
  openai: ReturnType<typeof llmClient>,
  image: ExtractedImage,
): Promise<{ text: string; usage: string; finishReason: string }> {
  const slideNumber = image.slideNumbers[0] ?? 0;
  const result = await generateText({
    model: openai.chat(llmModel()),
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text:
              `This image is from slide ${slideNumber}. What does it show? ` +
              "Which part of a software engineering course would it be useful for? " +
              "Answer in 2-3 sentences.",
          },
          {
            type: "image",
            image: image.bytes,
            mediaType: image.mediaType,
          },
        ],
      },
    ],
    temperature: 0.2,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    providerOptions: PROVIDER_OPTIONS,
  });

  return {
    text: result.text,
    usage: usageLine(result.usage),
    finishReason: result.finishReason,
  };
}

function slideTextLength(
  image: ExtractedImage,
  slideTexts: Map<number, string>,
): number {
  return slideTexts.get(image.slideNumbers[0] ?? 0)?.length ?? 0;
}

/**
 * Prefer slides with the most text when the deck has more usable images than
 * MAX_IMAGES; the final list is always displayed in slide order.
 */
function selectImages(
  candidates: ExtractedImage[],
  slideTexts: Map<number, string>,
): ExtractedImage[] {
  const selected =
    candidates.length <= MAX_IMAGES
      ? [...candidates]
      : [...candidates]
          .sort((a, b) => {
            const byText =
              slideTextLength(b, slideTexts) - slideTextLength(a, slideTexts);
            if (byText !== 0) return byText;
            return (a.slideNumbers[0] ?? 0) - (b.slideNumbers[0] ?? 0);
          })
          .slice(0, MAX_IMAGES);

  return selected.sort(
    (a, b) => (a.slideNumbers[0] ?? 0) - (b.slideNumbers[0] ?? 0),
  );
}

async function main(): Promise<void> {
  const pptxPath = process.argv[2] ?? process.env.TEST_PPTX_PATH;

  console.log("=== PPTX vision test ===");
  console.log(`model:   ${llmModel()}`);
  console.log(`baseURL: ${llmBaseUrl() ?? "https://api.openai.com/v1 (default)"}`);

  if (pptxPath === undefined || pptxPath.trim().length === 0) {
    console.error(
      '\nUsage: npx tsx --env-file=.env scripts/test-vision.ts "C:\\path\\to\\deck.pptx"',
    );
    process.exitCode = 1;
    return;
  }

  if (isMockMode()) {
    console.error(
      "\nLLM_API_KEY is empty or LLM_MOCK is on — no real model call possible.",
    );
    process.exitCode = 1;
    return;
  }

  const absolutePath = path.resolve(pptxPath);
  console.log(`file:    ${absolutePath}`);

  const { images: onContentSlides, mediaTotal, slideTexts, dividerSlides } =
    await extractSlideImages(absolutePath);

  const sized = onContentSlides.filter(
    (image) => image.width >= MIN_DIMENSION && image.height >= MIN_DIMENSION,
  );
  const selected = selectImages(sized, slideTexts);
  const selectedPaths = new Set(selected.map((image) => image.mediaPath));

  const dividerLabel =
    dividerSlides.length > 0 ? ` (slide ${dividerSlides.join(", ")})` : "";
  console.log(
    `\nmedia files: ${mediaTotal} · on content slides: ${onContentSlides.length} · ` +
      `divider slides skipped: ${dividerSlides.length}${dividerLabel} · ` +
      `>= ${MIN_DIMENSION}x${MIN_DIMENSION}: ${sized.length} · sending: ${selected.length}`,
  );

  if (selected.length === 0) {
    console.error("\nNo slide images passed the pixel filter.");
    process.exitCode = 1;
    return;
  }

  console.log("\nCandidates (slide order, * = selected):");
  for (const image of sized) {
    const slideNumber = image.slideNumbers[0] ?? 0;
    const extraSlides =
      image.slideNumbers.length > 1
        ? ` +slide ${image.slideNumbers.slice(1).join(",")}`
        : "";
    console.log(
      `  ${selectedPaths.has(image.mediaPath) ? "*" : " "} slide ${String(slideNumber).padStart(2)}  ` +
        `${image.mediaPath.padEnd(26)} ` +
        `${formatDimensions(image.width, image.height).padStart(9)}  ` +
        `${formatSize(image.size).padStart(9)}  ` +
        `text=${slideTextLength(image, slideTexts)} chars${extraSlides}`,
    );
  }

  const openai = llmClient();

  for (const image of selected) {
    const slideNumber = image.slideNumbers[0] ?? 0;
    const text = slideTexts.get(slideNumber) ?? "";
    console.log(
      `\n=== Slide ${slideNumber} — ${image.mediaPath} ` +
        `(${formatDimensions(image.width, image.height)}, ${formatSize(image.size)}) ===`,
    );
    console.log(
      `slide type: ${isDividerSlide(text) ? "divider" : "content"} (${text.length} chars)`,
    );
    if (text.length > 0) console.log(`slide text: ${preview(text)}`);

    const response = await describeImage(openai, image);
    console.log(response.text);
    console.log(`(${response.usage}, finishReason=${response.finishReason})`);
  }
}

main().catch((error: unknown) => {
  console.error("\n[test-vision] failed:");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
