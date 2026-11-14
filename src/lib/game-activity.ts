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

type ValidationResult =
  | { ok: true }
  | { ok: false; errors: string[] };

function hasChinese(value: string): boolean {
  return /[\u3400-\u9fff]/u.test(value);
}

function hasLatin(value: string): boolean {
  return /[A-Za-z]/u.test(value);
}

const technicalTerms =
  /\b(?:AI|API|Bash|CSS|Docker|Git|GitHub|GraphQL|HTML|HTTP|Java|JavaScript|JSON|Kubernetes|Markdown|Next\.js|Node\.js|npm|Python|React|SQL|TypeScript|URL)\b/giu;
const technicalIdentifier = /\b[A-Za-z]+(?:[A-Z][A-Za-z]+|[_-][A-Za-z0-9]+|\d)[A-Za-z0-9_-]*\b/gu;

function localeText(value: string): string {
  return value
    .replace(/https?:\/\/\S+/gu, " ")
    .replace(/`[^`]*`/gu, " ")
    .replace(/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/gu, " ")
    .replace(technicalTerms, " ")
    .replace(technicalIdentifier, " ");
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

const CUE_PATTERN = /audio-only|sound-only|click|colou?r/giu;

function replacementForCue(match: string): string {
  const lower = match.toLowerCase();
  if (lower === "audio-only") return "audio-based";
  if (lower === "sound-only") return "sound-based";
  if (lower.startsWith("click")) {
    return `select${lower.slice("click".length)}`; // select / selects / selected / selecting
  }
  const suffix = lower.replace(/^colou?r/u, "");
  if (suffix === "s") return "appearances";
  if (suffix === "ed") return "with a distinct appearance";
  return "appearance";
}

function sanitizeCueText(text: string): string {
  return text.replace(CUE_PATTERN, (match) => {
    const replacement = replacementForCue(match);
    if (match === match.toUpperCase()) return replacement.toUpperCase();
    if (match[0] === match[0]?.toUpperCase()) {
      return replacement[0]!.toUpperCase() + replacement.slice(1);
    }
    return replacement;
  });
}

/**
 * Rewrites generated Challenge wording that would trip the accessibility
 * validation. Generation-only fallback; stored editor data is not touched.
 */
export function sanitizeGameActivityCues(
  activity: GameActivityContainer,
): GameActivityContainer {
  return {
    ...activity,
    title: sanitizeCueText(activity.title),
    challenges: activity.challenges.map((block) => {
      const payload = block.payload;
      const base = {
        ...payload,
        ...(payload.feedback === undefined
          ? {}
          : {
              feedback: {
                correct: sanitizeCueText(payload.feedback.correct),
                incorrect: sanitizeCueText(payload.feedback.incorrect),
              },
            }),
        ...(payload.hint === undefined
          ? {}
          : { hint: sanitizeCueText(payload.hint) }),
        ...(payload.supportingMedia === undefined
          ? {}
          : {
              supportingMedia: {
                ...payload.supportingMedia,
                ...(payload.supportingMedia.altText === undefined
                  ? {}
                  : {
                      altText: sanitizeCueText(
                        payload.supportingMedia.altText,
                      ),
                    }),
              },
            }),
      };

      const sanitizedPayload =
        payload.variant === "sort"
          ? {
              ...base,
              items: payload.items.map((item) => ({
                ...item,
                text: sanitizeCueText(item.text),
              })),
            }
          : payload.variant === "match"
            ? {
                ...base,
                pairs: payload.pairs.map((pair) => ({
                  ...pair,
                  left: sanitizeCueText(pair.left),
                  right: sanitizeCueText(pair.right),
                })),
              }
            : {
                ...base,
                prompt: sanitizeCueText(payload.prompt),
                options: payload.options.map((option) => ({
                  ...option,
                  text: sanitizeCueText(option.text),
                })),
              };

      return {
        ...block,
        title: sanitizeCueText(block.title),
        payload: sanitizedPayload,
      };
    }),
  };
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
  const title = localeText(activity.title);
  if (
    (language === "en" && hasChinese(title)) ||
    (language === "zh" && hasLatin(title))
  )
    errors.push("The Game Activity title does not match the lesson locale.");
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

      const text = localeText([
        ...stringsFor(block),
        block.payload.feedback?.correct ?? "",
        block.payload.feedback?.incorrect ?? "",
        block.payload.hint ?? "",
      ].join(" "));
      if ((language === "en" && hasChinese(text)) || (language === "zh" && hasLatin(text)))
        errors.push(`Challenge ${index + 1} does not match the lesson locale.`);
      if (/(?:click|color|colour|audio-only|sound-only)/iu.test(text))
        errors.push(`Challenge ${index + 1} contains an inaccessible interaction cue.`);
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}
