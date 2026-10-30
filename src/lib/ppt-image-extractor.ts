import { imageSize } from "image-size";
import JSZip from "jszip";

/**
 * Content-image extraction for PPTX uploads.
 *
 * Ported from `scripts/test-vision.ts` (which stays a standalone smoke test):
 * only media actually placed on a slide counts, divider/title slides are
 * ignored, icons below 128x128 are dropped, duplicates are collapsed, and the
 * result stays in slide order. There is no fixed image cap: `generate.ts`
 * decides how many images fit the token budget and this module supplies the
 * priority order used when some have to go.
 */

/** Icons, bullets and rules are below this on either axis. */
const MIN_DIMENSION = 128;

/** Raster formats every vision-capable model accepts. SVG/EMF/WMF are skipped. */
const MEDIA_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
};

export type ExtractedImage = {
  mediaPath: string;
  /** Every content slide that references this media file, in slide order. */
  slideNumbers: number[];
  bytes: Uint8Array;
  mediaType: string;
  size: number;
  width: number;
  height: number;
};

export type PptxImageExtraction = {
  /** Deduped, pixel-filtered, slide-ordered content images. */
  images: ExtractedImage[];
  /** Total media files in the archive, including skipped ones. */
  mediaTotal: number;
  /** Full drawing text of each slide, keyed by 1-based slide number. */
  slideTexts: Map<number, string>;
  /** Title/section-divider slides that were skipped. */
  dividerSlides: number[];
};

type ImageContent = {
  type: "image";
  format: string;
  base64: string;
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
    candidate.type === "image"
    && typeof candidate.base64 === "string"
    && typeof candidate.format === "string"
  );
}

function isTextContent(value: unknown): value is TextContent {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<TextContent>;
  return candidate.type === "text" && typeof candidate.content === "string";
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

  const runs = [...entry.content.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map(
    (match) => decodeXml(match[1]),
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
  const slash = slidePath.lastIndexOf("/");
  const dir = slash === -1 ? "" : slidePath.slice(0, slash);
  const file = slash === -1 ? slidePath : slidePath.slice(slash + 1);
  return `${dir}/_rels/${file}.rels`;
}

/**
 * Reads the XML parts the relationship walk needs plus every raster media
 * file, mirroring the `Record<path, content>` shape `pptxToFiles` returned.
 */
async function readArchive(
  bytes: Uint8Array,
): Promise<Record<string, unknown>> {
  const zip = await JSZip.loadAsync(bytes);
  const content: Record<string, unknown> = {};

  for (const [name, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;

    if (name.startsWith("ppt/media/")) {
      const format = /\.([^./]+)$/.exec(name)?.[1]?.toLowerCase() ?? "";
      if (MEDIA_TYPES[format] === undefined) continue;

      content[name] = {
        type: "image",
        format,
        base64: await entry.async("base64"),
      } satisfies ImageContent;
      continue;
    }

    if (/\.(xml|rels)$/iu.test(name)) {
      content[name] = {
        type: "text",
        content: await entry.async("string"),
      } satisfies TextContent;
    }
  }

  return content;
}

export async function extractPptxImages(
  bytes: Uint8Array,
): Promise<PptxImageExtraction> {
  const content = await readArchive(bytes);

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

      const mediaPath = resolveTarget(
        slidePath.slice(0, Math.max(0, slidePath.lastIndexOf("/"))),
        rel.target,
      );
      const entry = content[mediaPath];
      if (!isImageContent(entry)) continue;

      const mediaType = MEDIA_TYPES[entry.format.toLowerCase()];
      if (mediaType === undefined) continue;

      const existing = images.get(mediaPath);
      if (existing !== undefined) {
        existing.slideNumbers.push(slideNumber);
        continue;
      }

      const fileBytes = Buffer.from(entry.base64, "base64");
      const buffer = new Uint8Array(fileBytes);

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
        size: fileBytes.length,
        width,
        height,
      });
    }
  });

  const ordered = [...images.values()]
    .filter(
      (image) => image.width >= MIN_DIMENSION && image.height >= MIN_DIMENSION,
    )
    .sort((a, b) => (a.slideNumbers[0] ?? 0) - (b.slideNumbers[0] ?? 0));

  return { images: ordered, mediaTotal, slideTexts, dividerSlides };
}

function slideTextLength(
  image: ExtractedImage,
  slideTexts: Map<number, string>,
): number {
  return slideTexts.get(image.slideNumbers[0] ?? 0)?.length ?? 0;
}

/**
 * Lowest-priority images first, for the token-budget drop step.
 *
 * Images on slides with the least explanatory text are the least likely to be
 * useful on their own; on a tie the later slide goes first, which keeps the
 * opening of a deck intact. Callers drop from the head of this list and then
 * re-sort the survivors into slide order.
 */
export function rankForDropping(
  images: ExtractedImage[],
  slideTexts: Map<number, string>,
): ExtractedImage[] {
  return [...images].sort((a, b) => {
    const byText =
      slideTextLength(a, slideTexts) - slideTextLength(b, slideTexts);
    if (byText !== 0) return byText;
    return (b.slideNumbers[0] ?? 0) - (a.slideNumbers[0] ?? 0);
  });
}
