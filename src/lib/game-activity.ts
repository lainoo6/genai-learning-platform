import { z } from "zod";

import {
  gameChallengeBlockSchema,
  type Block,
  type GameChallengeBlock,
} from "@/lib/blocks/schema";
import type { ContentLanguage } from "@/lib/llm/language";

export const gameChallengeSchema = gameChallengeBlockSchema.superRefine((block, ctx) => {
  if (block.payload.feedback === undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["payload", "feedback"],
      message: "Every Challenge needs correct and incorrect feedback.",
    });
  }
});

/**
 * First-class Game Activity boundary: identity, title, and ordered Challenges.
 */
export const gameActivityContainerSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    challenges: z.array(gameChallengeSchema).length(5),
  })
  .superRefine((activity, ctx) => {
    const ids = activity.challenges.map((challenge) => challenge.id);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({
        code: "custom",
        path: ["challenges"],
        message: "Game Activity Challenges must have unique ids.",
      });
    }
  });

/** Challenge list shape used inside a Game Activity container. */
export const gameActivitySchema = z.array(gameChallengeSchema).length(5);
export type GameActivity = z.infer<typeof gameActivitySchema>;
export type GameActivityContainer = z.infer<typeof gameActivityContainerSchema>;

/**
 * Moves standalone `game` Challenges out of lesson blocks into one Game
 * Activity container so learners and editors share a single activity boundary.
 */
export function normalizeLessonGameActivity(input: {
  lessonId: string;
  lessonTitle: string;
  blocks: Block[];
  gameActivity?: GameActivityContainer | null;
}): { blocks: Block[]; gameActivity?: GameActivityContainer } {
  const existing = input.gameActivity
    ? gameActivityContainerSchema.safeParse(input.gameActivity)
    : null;
  if (existing?.success) {
    return {
      blocks: input.blocks.filter((block) => block.type !== "game" || block.payload.variant === "programming"),
      gameActivity: existing.data,
    };
  }

  const legacyChallenges = input.blocks.filter(
    (block): block is GameChallengeBlock => block.type === "game" && block.payload.variant !== "programming",
  );
  if (legacyChallenges.length !== 5) {
    return {
      blocks: input.blocks,
      ...(input.gameActivity ? { gameActivity: input.gameActivity } : {}),
    };
  }

  const migrated = gameActivityContainerSchema.safeParse({
    id: `legacy-${input.lessonId}`,
    title: input.lessonTitle,
    challenges: legacyChallenges,
  });
  if (!migrated.success) {
    return { blocks: input.blocks };
  }

  return {
    blocks: input.blocks.filter((block) => block.type !== "game" || block.payload.variant === "programming"),
    gameActivity: migrated.data,
  };
}

/**
 * Locale mismatches are reported as warnings, not errors: a Chinese course that
 * quotes a command or an English course that mentions one Chinese term is a
 * quality problem, not a reason to discard an otherwise valid course.
 */
export type ActivityWarning =
  | { code: "activityTitleLocale" }
  | { code: "challengeLocale"; challenge: number };

type ValidationResult =
  | { ok: true; warnings?: ActivityWarning[] }
  | { ok: false; errors: string[]; warnings?: ActivityWarning[] };

function hasChinese(value: string): boolean {
  return /[\u3400-\u9fff]/u.test(value);
}

/**
 * Code samples are not prose. Fenced blocks go first: the inline pattern would
 * otherwise eat the opening and closing fences and leave the sample in place.
 */
const fencedCodeBlock = /```[\s\S]*?```/gu;
const inlineCodeSpan = /`[^`\n]*`/gu;

const technicalTerms =
  /\b(?:AI|API|Bash|CSS|Docker|Git|GitHub|GraphQL|HTML|HTTP|Java|JavaScript|JSON|Kubernetes|Markdown|Next\.js|Node\.js|npm|Python|React|SQL|TypeScript|URL)\b/giu;
const technicalIdentifier = /\b[A-Za-z]+(?:[A-Z][A-Za-z]+|[_-][A-Za-z0-9]+|\d)[A-Za-z0-9_-]*\b/gu;
/** Standalone latin letters are not a language signal on their own. */
const singleLetterToken = /\b[A-Za-z]\b/gu;

function localeText(value: string): string {
  return value
    .replace(fencedCodeBlock, " ")
    .replace(inlineCodeSpan, " ")
    .replace(/https?:\/\/\S+/gu, " ")
    .replace(/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/gu, " ")
    .replace(technicalTerms, " ")
    .replace(technicalIdentifier, " ")
    .replace(singleLetterToken, " ");
}

/**
 * True when a field reads as a foreign sentence rather than as subject
 * terminology or a quoted command.
 *
 * The old rule failed any Chinese field holding two adjacent latin words, so
 * "先运行 pip install requests 安装依赖" was rejected and every Chinese
 * technical course failed to generate. The rule is now the inverse: a Chinese
 * field only fails when it carries no Chinese at all and still reads as a
 * sentence (two or more words, ten or more letters) after code, URLs and
 * identifiers are removed. Isolated terms ("Python", "HTML", "Pod") and prose
 * with an embedded command stay valid.
 */
function readsAsForeign(value: string): boolean {
  const text = localeText(value);

  if (hasChinese(text)) {
    return false;
  }

  const words = text.match(/[A-Za-z]{2,}/gu) ?? [];

  if (words.length < 2) {
    return false;
  }

  return (text.match(/[A-Za-z]/gu) ?? []).length >= 10;
}

/** The inverse check: an English field must not carry Chinese characters. */
function readsAsChinese(value: string): boolean {
  return hasChinese(localeText(value));
}

function mismatchesLocale(value: string, language: ContentLanguage): boolean {
  return language === "zh" ? readsAsForeign(value) : readsAsChinese(value);
}

function stringsFor(block: GameChallengeBlock): string[] {
  const payload = block.payload;
  const mediaText =
    payload.supportingMedia?.decorative === true
      ? []
      : [payload.supportingMedia?.altText ?? ""];
  if (payload.variant === "sort")
    return [block.title, ...payload.items.map((item) => item.text), ...mediaText];
  if (payload.variant === "match")
    return [
      block.title,
      ...payload.pairs.flatMap((pair) => [pair.left, pair.right]),
      ...mediaText,
    ];
  return [
    block.title,
    payload.prompt,
    ...payload.options.map((option) => option.text),
    ...mediaText,
  ];
}

/** Every field of one Challenge that carries human-readable text. */
function challengeTextFields(block: GameChallengeBlock): string[] {
  return [
    ...stringsFor(block),
    block.payload.feedback?.correct ?? "",
    block.payload.feedback?.incorrect ?? "",
    block.payload.hint ?? "",
  ];
}

export function validateGameActivity(
  input: unknown,
  language: ContentLanguage,
): ValidationResult {
  const parsed = gameActivityContainerSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map((issue) => issue.message) };
  }

  const activity = parsed.data;
  const challenges: GameActivity = activity.challenges;
  const errors: string[] = [];
  const warnings: ActivityWarning[] = [];

  if (mismatchesLocale(activity.title, language)) {
    warnings.push({ code: "activityTitleLocale" });
  }

  const variants = new Set(challenges.map((block) => block.payload.variant));
  for (const variant of ["sort", "match", "choose"] as const) {
    if (!variants.has(variant))
      errors.push(`The activity needs at least one ${variant} Challenge.`);
  }
  for (const [index, block] of challenges.entries()) {
    const payload = block.payload;
    if (payload.variant === "choose" && payload.options.filter((option) => !option.correct).length < 2)
      errors.push(`Challenge ${index + 1} needs at least two plausible distractors.`);
    if (payload.variant === "match") {
      const left = payload.pairs.map((pair) => pair.left);
      const right = payload.pairs.map((pair) => pair.right);
      if (new Set(left).size !== left.length || new Set(right).size !== right.length)
        errors.push(`Challenge ${index + 1} has ambiguous matching keys.`);
    }

    const fields = challengeTextFields(block);
    if (fields.some((field) => mismatchesLocale(field, language))) {
      warnings.push({ code: "challengeLocale", challenge: index + 1 });
    }

    const text = localeText(fields.join(" "));
    if (/(?:click|color|colour|audio-only|sound-only)/iu.test(text))
      errors.push(`Challenge ${index + 1} contains an inaccessible interaction cue.`);
  }

  if (errors.length > 0) {
    return warnings.length > 0
      ? { ok: false, errors, warnings }
      : { ok: false, errors };
  }

  return warnings.length > 0 ? { ok: true, warnings } : { ok: true };
}
