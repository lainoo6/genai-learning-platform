import { z } from "zod";

import {
  gameBlockSchema,
  type GameBlock,
} from "@/lib/blocks/schema";
import type { ContentLanguage } from "@/lib/llm/language";

const feedbackSchema = z.object({
  correct: z.string().trim().min(1),
  incorrect: z.string().trim().min(1),
});

const challengeMetadataSchema = z.object({
  feedback: feedbackSchema,
  hint: z.string().trim().min(1).optional(),
});

const generatedGameBlockSchema = gameBlockSchema.superRefine((block, ctx) => {
  const payload = block.payload;
  const metadata = "feedback" in payload ? payload.feedback : undefined;
  if (metadata === undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["payload", "feedback"],
      message: "Every Challenge needs correct and incorrect feedback.",
    });
  }
});

export const gameChallengeSchema = z.intersection(
  generatedGameBlockSchema,
  z.object({
    type: z.literal("game"),
    payload: z.union([
      z.intersection(
        z.object({
          variant: z.literal("sort"),
          items: z.array(z.object({ text: z.string(), order: z.number() })),
        }),
        challengeMetadataSchema,
      ),
      z.intersection(
        z.object({
          variant: z.literal("match"),
          pairs: z.array(z.object({ left: z.string(), right: z.string() })),
        }),
        challengeMetadataSchema,
      ),
      z.intersection(
        z.object({
          variant: z.literal("choose"),
          prompt: z.string(),
          options: z.array(z.object({ text: z.string(), correct: z.boolean() })),
        }),
        challengeMetadataSchema,
      ),
    ]),
  }),
);

export const gameActivitySchema = z.array(gameChallengeSchema).length(5);
export type GameActivity = z.infer<typeof gameActivitySchema>;

type ValidationResult =
  | { ok: true }
  | { ok: false; errors: string[] };

function hasChinese(value: string): boolean {
  return /[\u3400-\u9fff]/u.test(value);
}

function hasLatin(value: string): boolean {
  return /[A-Za-z]/u.test(value);
}

function stringsFor(block: GameBlock): string[] {
  const payload = block.payload;
  if (payload.variant === "sort") return [block.title, ...payload.items.map((item) => item.text)];
  if (payload.variant === "match")
    return [block.title, ...payload.pairs.flatMap((pair) => [pair.left, pair.right])];
  return [block.title, payload.prompt, ...payload.options.map((option) => option.text)];
}

export function validateGameActivity(
  input: unknown,
  language: ContentLanguage,
): ValidationResult {
  const parsed = gameActivitySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map((issue) => issue.message) };
  }

  const errors: string[] = [];
  for (const [index, block] of parsed.data.entries()) {
    const payload = block.payload;
    if (payload.variant === "choose" && payload.options.filter((option) => !option.correct).length < 2)
      errors.push(`Challenge ${index + 1} needs at least two plausible distractors.`);
    if (payload.variant === "match") {
      const left = payload.pairs.map((pair) => pair.left);
      const right = payload.pairs.map((pair) => pair.right);
      if (new Set(left).size !== left.length || new Set(right).size !== right.length)
        errors.push(`Challenge ${index + 1} has ambiguous matching keys.`);
    }

    const text = stringsFor(block).join(" ");
    if ((language === "en" && hasChinese(text)) || (language === "zh" && hasLatin(text)))
      errors.push(`Challenge ${index + 1} does not match the lesson locale.`);
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

