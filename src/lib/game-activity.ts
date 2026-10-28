import { z } from "zod";

import { gameBlockSchema, type GameBlock } from "@/lib/blocks/schema";
import type { ContentLanguage } from "@/lib/llm/language";

export const gameChallengeSchema = gameBlockSchema.superRefine((block, ctx) => {
  if (block.payload.feedback === undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["payload", "feedback"],
      message: "Every Challenge needs correct and incorrect feedback.",
    });
  }
});

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
  const variants = new Set(parsed.data.map((block) => block.payload.variant));
  for (const variant of ["sort", "match", "choose"] as const) {
    if (!variants.has(variant))
      errors.push(`The activity needs at least one ${variant} Challenge.`);
  }
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

      const text = [
        ...stringsFor(block),
        block.payload.feedback?.correct ?? "",
        block.payload.feedback?.incorrect ?? "",
        block.payload.hint ?? "",
      ].join(" ");
      if ((language === "en" && hasChinese(text)) || (language === "zh" && hasLatin(text)))
        errors.push(`Challenge ${index + 1} does not match the lesson locale.`);
      if (/(?:click|color|colour|audio-only|sound-only)/iu.test(text))
        errors.push(`Challenge ${index + 1} contains an inaccessible interaction cue.`);
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}
