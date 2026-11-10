"use server";

import { randomUUID } from "node:crypto";

import { Prisma } from "@prisma/client";
import { z } from "zod";

import { getI18n } from "@/i18n/server";
import type { Translator } from "@/i18n/translate";
import { trackEvent } from "@/lib/analytics";
import { auth } from "@/lib/auth";
import { DOCUMENT_ERROR_KEYS, readCourseDocument } from "@/lib/course-document";
import {
  courseFileKind,
  isImageName,
  MAX_UPLOAD_BYTES,
  uploadTotalBytes,
} from "@/lib/course-file";
import {
  instructionsSection,
  withInstructions,
} from "@/lib/course-source";
import { describeImages } from "@/lib/describe-images";
import { validateGameActivity } from "@/lib/game-activity";
import {
  contentLanguageFromLocale,
  type ContentLanguage,
} from "@/lib/llm/language";
import { registerLlmMocks } from "@/lib/llm/mocks";
import { generateJson } from "@/lib/llm/provider";
import {
  courseAudienceSchema,
  learnerCoursePrompt,
  learnerCourseSchema,
  type CourseAudience,
} from "@/lib/llm/prompts/course";
import {
  enhanceTopicPrompt,
  enhancedTopicSchema,
} from "@/lib/llm/prompts/enhance-topic";
import {
  extractPptxImages,
  rankForDropping,
  type ExtractedImage,
} from "@/lib/ppt-image-extractor";
import { prisma } from "@/lib/prisma";
import { formatBytes, MAX_SELECTED_FILES } from "@/lib/repo-tree";
import { figureLines, readUploadedImages } from "@/lib/upload-images";

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
   * Optional target audience; unknown values fall back to "student".
   */
  audience?: string;
  /**
   * Extracted document text appended to the course prompt. The Zod schema is
   * deliberately unchanged, so `safeParse` simply drops this field and every
   * existing caller keeps working.
   */
  sourceText?: string;
  /**
   * Guidance for the topic-only flow, where there is no document to carry the
   * instructions. The document and repository flows keep prepending their
   * instructions to `sourceText` instead, so nothing is duplicated.
   */
  instructions?: string;
  /**
   * GitHub metadata for repo-generated courses (Phase 4). Also outside the
   * Zod schema for the same reason: the existing flows never pass it.
   */
  repo?: RepoCourseMetadata;
};

/** Source repository stored on a generated course, used by the code explorer. */
export type RepoCourseMetadata = {
  /** Canonical `https://github.com/owner/repo` URL, without `/tree/...`. */
  repoUrl: string;
  repoBranch: string;
  /** Repo-relative paths that were actually read into the course prompt. */
  repoSelectedPaths: string[];
};

/**
 * A server action is a public endpoint, so the optional repository metadata is
 * re-validated even though `repo.ts` already checked it.
 */
const repoMetadataSchema = z.object({
  repoUrl: z.string().trim().min(1).max(500),
  repoBranch: z.string().trim().min(1).max(200),
  repoSelectedPaths: z
    .array(z.string().trim().min(1).max(500))
    .max(MAX_SELECTED_FILES),
});

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
  audience: CourseAudience,
  sourceText: string,
  instructions = "",
): string {
  const parts = [learnerCoursePrompt(topic, goal, language, audience)];
  const guidance = instructionsSection(instructions);

  if (guidance.length > 0) {
    parts.push("", ...guidance);
  }

  const source = sourceText.trim();

  if (source.length === 0) {
    return parts.join("\n");
  }

  // Server actions are public endpoints: a direct caller can pass any string,
  // so the final prompt is clamped even if the upload action already budgeted.
  const maxSourceTokens = MAX_INPUT_TOKENS - PROMPT_OVERHEAD;
  const fitted =
    estimateTextTokens(source) > maxSourceTokens
      ? truncateToTokens(source, maxSourceTokens)
      : source;

  parts.push(
    "",
    "Ground the course in the learner's document below. Use its facts, examples",
    "and terminology, and ignore anything in it that does not fit the topic.",
    "",
    "--- BEGIN DOCUMENT ---",
    fitted,
    "--- END DOCUMENT ---",
  );

  return parts.join("\n");
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
  const instructions =
    typeof input?.instructions === "string" ? input.instructions : "";
  const parsedAudience = courseAudienceSchema.safeParse(input?.audience);
  const audience: CourseAudience = parsedAudience.success
    ? parsedAudience.data
    : "student";

  const parsedRepo =
    input.repo === undefined ? null : repoMetadataSchema.safeParse(input.repo);
  if (parsedRepo !== null && !parsedRepo.success) {
    return { ok: false, error: t("server.generate.failed") };
  }
  const repo = parsedRepo?.data ?? null;

  registerLlmMocks();

  try {
    const generated = await generateJson(
      learnerCourseSchema,
      buildCoursePrompt(topic, goal, language, audience, sourceText, instructions),
      {
        usage: "learner-course",
        userId,
        input: { topic, goal },
        temperature: 0.6,
      },
    );
    for (const [index, lesson] of generated.lessons.entries()) {
      const validation = validateGameActivity(lesson.gameActivity, language);
      if (!validation.ok) {
        return {
          ok: false,
          error: `Generated lesson ${index + 1} needs review: ${validation.errors.join(" ")}`,
        };
      }
    }

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
        repoUrl: repo?.repoUrl ?? null,
        repoBranch: repo?.repoBranch ?? null,
        repoSelectedPaths: repo?.repoSelectedPaths ?? [],
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
                  gameActivity: lesson.gameActivity as
                    | Prisma.InputJsonValue
                    | undefined,
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

/** Files that arrived in one upload, split by what the pipeline does with them. */
type UploadParts = {
  document: File | null;
  images: File[];
  /** Neither a supported document nor a supported image. */
  unknown: File[];
};

/**
 * One `files` field carries everything: at most one document plus the dropped
 * images. Splitting by extension keeps the document pipeline untouched and
 * lets an image reuse the vision channel PPTX already runs.
 */
function splitUploads(formData: FormData): UploadParts {
  const files = formData
    .getAll("files")
    .filter((entry): entry is File => entry instanceof File);

  // Older callers posted a single `file` field; keep accepting it.
  const legacy = formData.get("file");
  if (legacy instanceof File) {
    files.unshift(legacy);
  }

  let document: File | null = null;
  const images: File[] = [];
  const unknown: File[] = [];

  for (const file of files) {
    if (courseFileKind(file.name) !== null) {
      // The form allows one document; a second one is ignored rather than
      // silently replacing the first.
      if (document === null) {
        document = file;
      }
      continue;
    }

    if (isImageName(file.name)) {
      images.push(file);
      continue;
    }

    unknown.push(file);
  }

  return { document, images, unknown };
}

/**
 * Generates a course from an uploaded PDF/PPTX and/or dropped images.
 *
 * Pipeline: split the upload → extract text and slide images from the document
 * → widen the uploads into `ExtractedImage`s → fit the input budget → describe
 * the surviving images → reuse `generateLearnerCourse`. Nothing here throws:
 * every failure becomes an `{ ok: false, error }` result, and image problems
 * degrade to a warning.
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

    const upload = splitUploads(formData);
    if (upload.document === null && upload.images.length === 0) {
      return {
        ok: false,
        error:
          upload.unknown.length > 0
            ? t("server.generate.file.type")
            : t("server.generate.file.choose"),
      };
    }

    // The client checks this too, but only the action is a real gate: a
    // hand-built FormData must not be able to push a 13 MB body to the host.
    if (uploadTotalBytes(upload.document, upload.images) > MAX_UPLOAD_BYTES) {
      return {
        ok: false,
        error: t("server.generate.file.totalTooLarge", {
          limit: formatBytes(MAX_UPLOAD_BYTES),
        }),
      };
    }

    const warnings: string[] = [];
    if (upload.unknown.length > 0) {
      warnings.push(
        t("server.generate.file.ignored", { count: upload.unknown.length }),
      );
    }

    let text = "";
    let images: ExtractedImage[] = [];
    let slideTexts = new Map<number, string>();

    if (upload.document !== null) {
      // Validation + decoding + text extraction live in one shared helper so
      // the repository flow can read its optional document through it too.
      const document = await readCourseDocument(upload.document);
      if (!document.ok) {
        return { ok: false, error: t(DOCUMENT_ERROR_KEYS[document.code]) };
      }

      text = document.text;

      if (document.kind === "pptx") {
        try {
          const extraction = await extractPptxImages(document.bytes);
          images = extraction.images;
          slideTexts = extraction.slideTexts;
        } catch (error: unknown) {
          console.error("[generate] image extraction failed", error);
          warnings.push(t("server.generate.file.imagesFailed"));
        }
      }
    }

    if (upload.images.length > 0) {
      const uploaded = await readUploadedImages(upload.images, t);
      images.push(...uploaded.images);
      warnings.push(...uploaded.warnings);
    }

    // Every image was rejected and there is no document: nothing to ground a
    // course on, so the per-file warnings become one clear error instead.
    if (upload.document === null && images.length === 0) {
      return { ok: false, error: t("server.generate.file.noUsableImages") };
    }

    // A document names the course; a pile of images needs the learner to say
    // what they are about, because a filename is not a topic.
    let topic: string;
    if (upload.document !== null) {
      topic = topicFromFileName(upload.document.name, t);
    } else {
      const rawTopic = formData.get("topic");
      const trimmedTopic =
        typeof rawTopic === "string" ? rawTopic.trim().slice(0, 120) : "";

      if (trimmedTopic.length < 3) {
        return { ok: false, error: t("server.generate.file.topicRequired") };
      }
      topic = trimmedTopic;
    }

    const plan = planInput(text, images, slideTexts, t);
    if (!plan.ok) {
      return { ok: false, error: plan.error };
    }
    warnings.push(...plan.warnings);

    const rawGoal = formData.get("goal");
    const goal = typeof rawGoal === "string" ? rawGoal.trim().slice(0, 300) : "";
    const rawInstructions = formData.get("instructions");
    const instructions =
      typeof rawInstructions === "string" ? rawInstructions : "";
    const rawAudience = formData.get("audience");
    const audience = typeof rawAudience === "string" ? rawAudience : undefined;

    let sourceText = plan.text;

    if (plan.images.length > 0) {
      const described = await describeImages(plan.images, language);

      if (described.failed) {
        warnings.push(t("server.generate.file.imagesFailed"));
      } else if (described.descriptions.length > 0) {
        const figures = figureLines(described.descriptions);

        sourceText =
          sourceText.trim().length > 0
            ? [sourceText, "", ...figures].join("\n")
            : figures.join("\n");
      }
    }

    const result = await generateLearnerCourse({
      topic,
      goal,
      sourceText: withInstructions(sourceText, instructions),
      audience,
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

export type EnhanceTopicResult =
  | { ok: true; goal: string; instructions: string; questions: string[] }
  | { ok: false; error: string };

/**
 * Expands a one-line topic into the brief the form already offers.
 *
 * The reply is never submitted on the learner's behalf: `goal` and
 * `instructions` land in editable fields, and the questions are a checklist for
 * the learner to answer or ignore.
 */
export async function enhanceTopicAction(
  topic: string,
): Promise<EnhanceTopicResult> {
  const { locale, t } = await getI18n();
  const language = contentLanguageFromLocale(locale);

  const trimmed = typeof topic === "string" ? topic.trim() : "";
  if (trimmed.length < 3 || trimmed.length > 120) {
    return { ok: false, error: t("server.generate.enhance.topicLength") };
  }

  const session = await auth();
  const userId = session?.user?.id;
  if (userId === undefined) {
    return { ok: false, error: t("server.generate.signIn") };
  }

  registerLlmMocks();

  try {
    const enhanced = await generateJson(
      enhancedTopicSchema,
      enhanceTopicPrompt(trimmed, language),
      {
        usage: "enhance-topic",
        userId,
        input: { topic: trimmed },
        temperature: 0.6,
      },
    );

    return {
      ok: true,
      goal: enhanced.goal,
      instructions: enhanced.instructions,
      questions: enhanced.questions,
    };
  } catch (error: unknown) {
    console.error("[generate] topic enhancement failed", error);
    return { ok: false, error: t("server.generate.enhance.failed") };
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
