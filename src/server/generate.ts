"use server";

import { randomUUID } from "node:crypto";

import { Prisma } from "@prisma/client";
import { z } from "zod";

import { getI18n } from "@/i18n/server";
import type { Translator } from "@/i18n/translate";
import { trackEvent } from "@/lib/analytics";
import { auth } from "@/lib/auth";
import { DOCUMENT_ERROR_KEYS, readCourseDocument } from "@/lib/course-document";
import { withInstructions } from "@/lib/course-source";
import { describeImages } from "@/lib/describe-images";
import {
  contentLanguageFromLocale,
  type ContentLanguage,
} from "@/lib/llm/language";
import { registerLlmMocks } from "@/lib/llm/mocks";
import { generateJson } from "@/lib/llm/provider";
import {
  learnerCoursePrompt,
  learnerCourseSchema,
} from "@/lib/llm/prompts/course";
import {
  extractPptxImages,
  rankForDropping,
  type ExtractedImage,
} from "@/lib/ppt-image-extractor";
import { prisma } from "@/lib/prisma";

/**
 * Learner self-service course generation (P4.7).
 *
 * One action does the whole job — generate, persist, enroll — so a failure
 * leaves nothing half-written and the browser can show one clear error with a
 * retry button. The generated course is PUBLISHED (the player only renders
 * published courses' enrolment flow) but its `source = LEARNER` keeps it out of
 * the catalog and out of every other learner's dashboard.
 */

export type GenerateCourseResult =
  | {
      ok: true;
      courseId: string;
      lessonId: string;
      title: string;
      /** Non-blocking notes from the upload path (truncation, skipped images). */
      warnings?: string[];
    }
  | { ok: false; error: string };

const generateInputSchema = z.object({
  topic: z.string().trim().min(3).max(120),
  goal: z.string().trim().max(300).default(""),
});

type GenerateCourseInput = z.input<typeof generateInputSchema> & {
  /**
   * Extracted document text appended to the course prompt. The Zod schema is
   * deliberately unchanged, so `safeParse` simply drops this field and every
   * existing caller keeps working.
   */
  sourceText?: string;
};

const deleteInputSchema = z.string().min(1);

/**
 * The only upload limit is the estimated prompt size. `TOKEN_PER_IMAGE`
 * includes the description that will be written for each image, and
 * `PROMPT_OVERHEAD` covers the course prompt and the document wrappers.
 */
const MAX_INPUT_TOKENS = 30_000;
const TOKEN_PER_IMAGE = 504;
const PROMPT_OVERHEAD = 800;
/** Below this the document text alone cannot carry a course. */
const MIN_TEXT_TOKENS = 500;

/** CJK ideographs, kana, hangul and CJK/full-width punctuation. */
const CJK =
  /[\u2E80-\u2EFF\u3000-\u303F\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFFEF]/u;

function tokenCost(character: string): number {
  return CJK.test(character) ? 0.6 : 0.3;
}

/** Rough prompt-token estimate: CJK x0.6 + everything else x0.3. */
function estimateTextTokens(text: string): number {
  let cost = 0;
  for (const character of text) {
    cost += tokenCost(character);
  }
  return Math.ceil(cost);
}

/** Slices on a code-point boundary so the estimate never exceeds the budget. */
function truncateToTokens(text: string, maxTokens: number): string {
  let cost = 0;
  let end = 0;

  for (const character of text) {
    const next = cost + tokenCost(character);
    if (next > maxTokens) break;
    cost = next;
    end += character.length;
  }

  return text.slice(0, end).trimEnd();
}

type InputPlan =
  | { ok: true; text: string; images: ExtractedImage[]; warnings: string[] }
  | { ok: false; error: string };

/**
 * Fits an upload into the input budget.
 *
 * Under budget: everything is kept — there is no per-image cap.
 * Over budget: drop the lowest-priority images first; only when even a
 * text-only prompt is too long is the text truncated. An upload whose text is
 * already under `MIN_TEXT_TOKENS` is rejected instead, so a deck full of
 * images cannot be silently reduced to almost nothing.
 */
function planInput(
  text: string,
  images: ExtractedImage[],
  slideTexts: Map<number, string>,
  t: Translator,
): InputPlan {
  const warnings: string[] = [];
  let plannedText = text;
  let plannedImages = [...images];
  let textTokens = estimateTextTokens(plannedText);

  const totalTokens = (): number =>
    textTokens + plannedImages.length * TOKEN_PER_IMAGE + PROMPT_OVERHEAD;

  if (totalTokens() <= MAX_INPUT_TOKENS) {
    return { ok: true, text: plannedText, images: plannedImages, warnings };
  }

  if (textTokens < MIN_TEXT_TOKENS) {
    return { ok: false, error: t("server.generate.file.overLimit") };
  }

  // Images go first: the full document text survives as long as possible.
  if (plannedImages.length > 0) {
    const before = plannedImages.length;

    for (const image of rankForDropping(plannedImages, slideTexts)) {
      if (totalTokens() <= MAX_INPUT_TOKENS) break;
      plannedImages = plannedImages.filter((candidate) => candidate !== image);
    }

    const dropped = before - plannedImages.length;
    if (dropped > 0) {
      warnings.push(
        t("server.generate.file.imagesDropped", { count: dropped }),
      );
    }
  }

  // Only a text-only prompt that is still too long costs words. At this point
  // every image has been dropped, so the available budget is the full text one.
  if (totalTokens() > MAX_INPUT_TOKENS) {
    const textBudget = MAX_INPUT_TOKENS - PROMPT_OVERHEAD;

    if (textTokens > textBudget) {
      plannedText = truncateToTokens(plannedText, textBudget);
      textTokens = estimateTextTokens(plannedText);
      warnings.push(t("server.generate.file.truncated"));
    }
  }

  plannedImages.sort(
    (a, b) => (a.slideNumbers[0] ?? 0) - (b.slideNumbers[0] ?? 0),
  );

  return { ok: true, text: plannedText, images: plannedImages, warnings };
}

/** URL-safe stub of the topic plus a random suffix, so slugs never collide. */
function courseSlug(topic: string): string {
  const base = topic
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 40);

  return `${base.length > 0 ? base : "mini-course"}-${randomUUID().slice(0, 8)}`;
}

/**
 * The editor schema caps a course title at 90 code units, and `🎯 ` consumes
 * three of them. Slicing by code point could still exceed the limit (an emoji
 * is two code units), so the budget is counted with `String.length`.
 */
const MAX_COURSE_TITLE = 90;
const COURSE_TITLE_PREFIX = "🎯 ";

function generatedCourseTitle(title: string): string {
  const budget = MAX_COURSE_TITLE - COURSE_TITLE_PREFIX.length;
  let text = "";

  for (const character of title) {
    if (text.length + character.length > budget) break;
    text += character;
  }

  return `${COURSE_TITLE_PREFIX}${text.trimEnd()}`;
}

/**
 * Appends extracted document text to the course prompt.
 *
 * With no source text the prompt is byte-identical to the pre-upload version,
 * so the text-only flow and its mock fallback are untouched.
 */
function buildCoursePrompt(
  topic: string,
  goal: string,
  language: ContentLanguage,
  sourceText: string,
): string {
  const prompt = learnerCoursePrompt(topic, goal, language);
  const source = sourceText.trim();

  if (source.length === 0) {
    return prompt;
  }

  // Server actions are public endpoints: a direct caller can pass any string,
  // so the final prompt is clamped even if the upload action already budgeted.
  const maxSourceTokens = MAX_INPUT_TOKENS - PROMPT_OVERHEAD;
  const fitted =
    estimateTextTokens(source) > maxSourceTokens
      ? truncateToTokens(source, maxSourceTokens)
      : source;

  return [
    prompt,
    "",
    "Ground the course in the learner's document below. Use its facts, examples",
    "and terminology, and ignore anything in it that does not fit the topic.",
    "",
    "--- BEGIN DOCUMENT ---",
    fitted,
    "--- END DOCUMENT ---",
  ].join("\n");
}

/** Filename stem becomes the course topic; short names get a neutral fallback. */
function topicFromFileName(name: string, t: Translator): string {
  const stem = name
    .replace(/\.[^.]+$/u, "")
    .replace(/[_-]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 120);

  return stem.length >= 3 ? stem : t("server.generate.file.defaultTopic");
}

/** Generates one three-lesson mini-course, enrolls the learner and returns the first lesson. */
export async function generateLearnerCourse(
  input: GenerateCourseInput,
): Promise<GenerateCourseResult> {
  const { locale, t } = await getI18n();
  const language = contentLanguageFromLocale(locale);
  const parsedInput = generateInputSchema.safeParse(input);
  if (!parsedInput.success) {
    return {
      ok: false,
      error: t("server.generate.topicTooShort"),
    };
  }

  const session = await auth();
  const userId = session?.user?.id;
  if (userId === undefined) {
    return { ok: false, error: t("server.generate.signIn") };
  }

  const { topic, goal } = parsedInput.data;
  const sourceText =
    typeof input?.sourceText === "string" ? input.sourceText : "";

  registerLlmMocks();

  try {
    const generated = await generateJson(
      learnerCourseSchema,
      buildCoursePrompt(topic, goal, language, sourceText),
      {
        usage: "learner-course",
        userId,
        input: { topic, goal },
        temperature: 0.6,
      },
    );

    const course = await prisma.course.create({
      data: {
        slug: courseSlug(topic),
        title: generatedCourseTitle(generated.title),
        description: generated.description,
        topic,
        audience: language === "zh" ? "自主学习" : "Self-directed learners",
        difficulty: generated.difficulty,
        coverEmoji: "✨",
        language,
        status: "PUBLISHED",
        source: "LEARNER",
        createdById: userId,
        modules: {
          create: [
            {
              title: language === "zh" ? "模块 1 · 核心内容" : "Module 1 · The essentials",
              order: 0,
              lessons: {
                create: generated.lessons.map((lesson, index) => ({
                  title: lesson.title,
                  order: index,
                  estimatedMinutes: lesson.estimatedMinutes,
                  blocks: lesson.blocks as unknown as Prisma.InputJsonValue,
                })),
              },
            },
          ],
        },
      },
      select: {
        id: true,
        title: true,
        modules: {
          orderBy: { order: "asc" },
          select: {
            lessons: {
              orderBy: { order: "asc" },
              select: { id: true },
            },
          },
        },
      },
    });

    const firstLessonId = course.modules[0]?.lessons[0]?.id;
    if (firstLessonId === undefined) {
      await prisma.course.delete({ where: { id: course.id } });
      return { ok: false, error: t("server.generate.noLessons") };
    }

    await prisma.enrollment.upsert({
      where: { userId_courseId: { userId, courseId: course.id } },
      update: {},
      create: { userId, courseId: course.id },
    });

    await trackEvent("GENERATE_COURSE", {
      userId,
      courseId: course.id,
      payload: {
        topic,
        goal,
        lessonCount: generated.lessons.length,
        source: sourceText.trim().length > 0 ? "file" : "prompt",
      },
    });

    return {
      ok: true,
      courseId: course.id,
      lessonId: firstLessonId,
      title: course.title,
    };
  } catch (error: unknown) {
    console.error("[generate] course generation failed", error);
    return {
      ok: false,
      error: t("server.generate.failed"),
    };
  }
}

/**
 * Generates a course from an uploaded PDF or PPTX.
 *
 * Pipeline: validate → extract text → extract content images (PPTX only) →
 * fit the input budget → describe the surviving images → reuse
 * `generateLearnerCourse`. Nothing here throws: every failure becomes an
 * `{ ok: false, error }` result, and image problems degrade to text-only.
 */
export async function generateCourseFromFileAction(
  formData: FormData,
): Promise<GenerateCourseResult> {
  const { locale, t } = await getI18n();
  const language = contentLanguageFromLocale(locale);

  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (userId === undefined) {
      return { ok: false, error: t("server.generate.signIn") };
    }

    if (!(formData instanceof FormData)) {
      return { ok: false, error: t("server.generate.file.choose") };
    }

    const file = formData.get("file");
    if (!(file instanceof File)) {
      return { ok: false, error: t("server.generate.file.choose") };
    }

    // Validation + decoding + text extraction live in one shared helper so the
    // repository flow can read its optional document through the same path.
    const document = await readCourseDocument(file);
    if (!document.ok) {
      return { ok: false, error: t(DOCUMENT_ERROR_KEYS[document.code]) };
    }

    const { kind, bytes, text } = document;

    const warnings: string[] = [];
    let images: ExtractedImage[] = [];
    let slideTexts = new Map<number, string>();

    if (kind === "pptx") {
      try {
        const extraction = await extractPptxImages(bytes);
        images = extraction.images;
        slideTexts = extraction.slideTexts;
      } catch (error: unknown) {
        console.error("[generate] image extraction failed", error);
        warnings.push(t("server.generate.file.imagesFailed"));
      }
    }

    const plan = planInput(text, images, slideTexts, t);
    if (!plan.ok) {
      return { ok: false, error: plan.error };
    }
    warnings.push(...plan.warnings);

    const topic = topicFromFileName(file.name, t);
    const rawGoal = formData.get("goal");
    const goal = typeof rawGoal === "string" ? rawGoal.trim().slice(0, 300) : "";
    const rawInstructions = formData.get("instructions");
    const instructions =
      typeof rawInstructions === "string" ? rawInstructions : "";

    let sourceText = plan.text;

    if (plan.images.length > 0) {
      const described = await describeImages(plan.images, language);

      if (described.failed) {
        warnings.push(t("server.generate.file.imagesFailed"));
      } else if (described.descriptions.length > 0) {
        sourceText = [
          sourceText,
          "",
          "Figures extracted from the document (described from their slides):",
          ...described.descriptions.map(
            (entry) => `- Slide ${entry.slideNumber}: ${entry.text}`,
          ),
        ].join("\n");
      }
    }

    const result = await generateLearnerCourse({
      topic,
      goal,
      sourceText: withInstructions(sourceText, instructions),
    });
    if (!result.ok) {
      return result;
    }

    return {
      ...result,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  } catch (error: unknown) {
    console.error("[generate] file course generation failed", error);
    return { ok: false, error: t("server.generate.failed") };
  }
}

/** Deletes one of the caller's own generated courses (and its progress, by cascade). */
export async function deleteGeneratedCourse(
  courseId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { t } = await getI18n();
  const parsedInput = deleteInputSchema.safeParse(courseId);
  if (!parsedInput.success) {
    return { ok: false, error: t("server.generate.invalid") };
  }

  const session = await auth();
  const userId = session?.user?.id;
  if (userId === undefined) {
    return { ok: false, error: t("server.generate.signInDelete") };
  }

  const course = await prisma.course.findUnique({
    where: { id: parsedInput.data },
    select: { source: true, createdById: true },
  });

  if (course === null) {
    return { ok: false, error: t("server.generate.courseNotFound") };
  }

  if (course.source !== "LEARNER" || course.createdById !== userId) {
    return { ok: false, error: t("server.generate.notOwner") };
  }

  await prisma.course.delete({ where: { id: parsedInput.data } });

  return { ok: true };
}
