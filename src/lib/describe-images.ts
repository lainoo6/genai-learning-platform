import { generateText } from "ai";

import {
  CONTENT_LANGUAGE_LABEL,
  type ContentLanguage,
} from "@/lib/llm/language";
import {
  isMockMode,
  llmClient,
  llmModel,
  llmProviderOptions,
} from "@/lib/llm/provider";
import type { ExtractedImage } from "@/lib/ppt-image-extractor";

/**
 * Turns slide images into prompt-ready notes: verbatim visible text plus a
 * short summary of what the figure shows.
 *
 * One model call per image. A failing image (or an empty reply) is skipped
 * rather than failing the whole upload, so the course can still be generated
 * from the document text alone.
 */

/** `deepseek-flash` spends a small output cap on hidden reasoning; keep it low. */
const MAX_OUTPUT_TOKENS = 300;

/** Enough parallelism to keep a 20-image deck responsive without a rate spike. */
const CONCURRENCY = 4;

export type ImageDescription = {
  slideNumber: number;
  text: string;
};

export type DescribeImagesResult = {
  descriptions: ImageDescription[];
  /** True when at least one image existed but none could be described. */
  failed: boolean;
};

function promptFor(slideNumber: number, language: ContentLanguage): string {
  return [
    `This image appears on slide ${slideNumber} of a course document.`,
    "First, transcribe every piece of visible text in the image verbatim.",
    "Then, in one or two sentences, describe what the image shows and which",
    "part of a course it would help explain.",
    `Write the summary in ${CONTENT_LANGUAGE_LABEL[language]}.`,
    "Do not add commentary about the image format.",
  ].join(" ");
}

/**
 * `deepseek-flash` is a reasoning model: with a 300-token cap it can spend the
 * whole budget on hidden reasoning and return empty text. Disabling reasoning
 * keeps the requested cap usable. Same gateway and client as every other call.
 */
function imageProviderOptions(): ReturnType<typeof llmProviderOptions> {
  const base = llmProviderOptions();
  return {
    ...base,
    openai: {
      ...base?.openai,
      reasoningEffort: "none" as const,
    },
  };
}

async function describeImage(
  openai: ReturnType<typeof llmClient>,
  image: ExtractedImage,
  language: ContentLanguage,
): Promise<ImageDescription | null> {
  const slideNumber = image.slideNumbers[0] ?? 0;

  try {
    const result = await generateText({
      model: openai.chat(llmModel()),
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: promptFor(slideNumber, language) },
            { type: "image", image: image.bytes, mediaType: image.mediaType },
          ],
        },
      ],
      temperature: 0.2,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      providerOptions: imageProviderOptions(),
    });

    const text = result.text.trim();
    if (text.length === 0) {
      console.error(
        `[describe-images] empty description for ${image.mediaPath} (slide ${slideNumber})`,
      );
      return null;
    }

    return { slideNumber, text };
  } catch (error: unknown) {
    console.error(
      `[describe-images] failed to describe ${image.mediaPath} (slide ${slideNumber})`,
      error,
    );
    return null;
  }
}

/** Runs `describeImage` over the list with a small fixed concurrency. */
async function describeAll(
  openai: ReturnType<typeof llmClient>,
  images: ExtractedImage[],
  language: ContentLanguage,
): Promise<ImageDescription[]> {
  const results: Array<ImageDescription | null> = Array.from(
    { length: images.length },
    () => null,
  );

  let next = 0;

  async function worker(): Promise<void> {
    while (next < images.length) {
      const index = next;
      next += 1;
      results[index] = await describeImage(openai, images[index], language);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, images.length) }, () =>
      worker(),
    ),
  );

  return results.filter((entry): entry is ImageDescription => entry !== null);
}

export async function describeImages(
  images: ExtractedImage[],
  language: ContentLanguage,
): Promise<DescribeImagesResult> {
  if (images.length === 0) {
    return { descriptions: [], failed: false };
  }

  // No key (or LLM_MOCK) means no vision call at all; the caller falls back to
  // the text-only path with a warning.
  if (isMockMode()) {
    return { descriptions: [], failed: true };
  }

  let openai: ReturnType<typeof llmClient>;
  try {
    openai = llmClient();
  } catch (error: unknown) {
    console.error("[describe-images] LLM client unavailable", error);
    return { descriptions: [], failed: true };
  }

  const descriptions = await describeAll(openai, images, language);
  const ordered = [...descriptions].sort(
    (a, b) => a.slideNumber - b.slideNumber,
  );

  return { descriptions: ordered, failed: ordered.length === 0 };
}
