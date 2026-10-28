import { z } from "zod";

import { gameActivitySchema } from "@/lib/game-activity";
import {
  CONTENT_LANGUAGE_LABEL,
  contentLanguageLine,
  type ContentLanguage,
} from "@/lib/llm/language";

export const generatedGameActivitySchema = gameActivitySchema;
export type GeneratedGameActivity = z.infer<typeof generatedGameActivitySchema>;

export function gameActivityPrompt(input: {
  lessonTitle: string;
  objectives: string;
  sourceContent: string;
  language: ContentLanguage;
}): string {
  return [
    "Create one structured Game Activity for the lesson below.",
    "Return exactly five ordered game Challenges: use Sort, Match, and Choose formats.",
    "Every Challenge must be answerable from the source content, with deterministic",
    "answer metadata, correct and incorrect instructional feedback, and an optional hint.",
    "Choose Challenges must contain at least two plausible distractors.",
    "Use accessible plain-language labels and avoid relying on color, position, or sound.",
    `Write every string in ${CONTENT_LANGUAGE_LABEL[input.language]}.`,
    contentLanguageLine(input.language),
    "",
    `Lesson title: ${input.lessonTitle}`,
    `Objectives: ${input.objectives}`,
    `Source content: ${input.sourceContent}`,
    "",
    "Reply with a JSON array of five Game blocks. Do not use placeholders.",
  ].join("\n");
}

export function mockGameActivity(language: ContentLanguage): GeneratedGameActivity {
  const zh = language === "zh";
  return Array.from({ length: 5 }, (_, index) => ({
    id: `mock-challenge-${index + 1}`,
    title: zh ? `练习 ${index + 1}` : `Practice ${index + 1}`,
    type: "game" as const,
    payload: {
      variant: "choose" as const,
      prompt: zh ? "哪一项符合课程内容？" : "Which statement matches the lesson?",
      options: [
        { text: zh ? "课程中的正确概念" : "The lesson concept", correct: true },
        { text: zh ? "常见误解一" : "A plausible misconception", correct: false },
        { text: zh ? "常见误解二" : "Another plausible misconception", correct: false },
      ],
      feedback: {
        correct: zh ? "正确，这与课程内容一致。" : "Correct. This matches the lesson.",
        incorrect: zh ? "再想想，复习课程中的例子。" : "Not quite. Review the lesson example.",
      },
      hint: zh ? "查看课程中的定义。" : "Look for the definition in the lesson.",
    },
  }));
}
