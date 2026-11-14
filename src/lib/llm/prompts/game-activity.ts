import { z } from "zod";

import {
  gameActivityContainerSchema,
  type GameActivityContainer,
} from "@/lib/game-activity";
import {
  CONTENT_LANGUAGE_LABEL,
  contentLanguageLine,
  type ContentLanguage,
} from "@/lib/llm/language";

export const generatedGameActivitySchema = gameActivityContainerSchema;
export type GeneratedGameActivity = z.infer<typeof generatedGameActivitySchema>;

export function gameActivityPrompt(input: {
  lessonTitle: string;
  objectives: string;
  sourceContent: string;
  language: ContentLanguage;
}): string {
  return [
    "Create one structured Game Activity for the lesson below.",
    "Return exactly five ordered Challenges. payload.variant must be lowercase",
    '"sort", "match", or "choose" only — include at least one of each across the five.',
    "Every Challenge must be answerable from the source content, with deterministic",
    "answer metadata, correct and incorrect instructional feedback, and a hint.",
    "Choose Challenges must contain exactly one correct option and at least two distractors.",
    "Challenge strings (titles, prompts, options, pairs, hints, feedback) must be",
    "interaction-neutral: never write \"click\", \"color\" / \"colour\",",
    "\"audio-only\", or \"sound-only\". Use \"select\" or \"choose\" instead of",
    "\"click\", and identify items by name or meaning rather than by color or sound.",
    "Do not make media the sole answer key, option distinction, Correction, Hint, or feedback source.",
    "Supporting media is optional; if included, it must be approved, safety-moderated, and carry provenance.",
    "Animations must be optional, skippable, non-blocking, and no longer than five seconds.",
    `Write every string in ${CONTENT_LANGUAGE_LABEL[input.language]}.`,
    contentLanguageLine(input.language),
    "",
    `Lesson title: ${input.lessonTitle}`,
    `Objectives: ${input.objectives}`,
    `Source content: ${input.sourceContent}`,
    "",
    'Reply shape: {"id": string, "title": string, "challenges": [Challenge x5]}',
    'Challenge: {"id": string, "title": string, "type": "game", "payload": Payload}',
    'sort: {"variant": "sort", "items": [{"text": string, "order": number}, ...],',
    '       "feedback": {"correct": string, "incorrect": string}, "hint": string}',
    'match: {"variant": "match", "pairs": [{"left": string, "right": string}, ...],',
    '        "feedback": {"correct": string, "incorrect": string}, "hint": string}',
    'choose: {"variant": "choose", "prompt": string,',
    '         "options": [{"text": string, "correct": boolean}, ...],',
    '         "feedback": {"correct": string, "incorrect": string}, "hint": string}',
    "Do not use placeholders.",
  ].join("\n");
}

export function mockGameActivity(language: ContentLanguage): GameActivityContainer {
  const zh = language === "zh";
  const challenges = Array.from({ length: 5 }, (_, index) => {
    const common = {
      id: `mock-challenge-${index + 1}`,
      title: zh ? `练习 ${index + 1}` : `Practice ${index + 1}`,
      feedback: {
        correct: zh ? "正确，这与课程内容一致。" : "Correct. This matches the lesson.",
        incorrect: zh ? "再想想，复习课程中的例子。" : "Not quite. Review the lesson example.",
      },
      hint: zh ? "查看课程中的定义。" : "Look for the definition in the lesson.",
    };
    if (index === 0) {
      return {
        ...common,
        type: "game" as const,
        payload: {
          variant: "sort" as const,
          items: [
            { text: zh ? "第一步" : "First step", order: 0 },
            { text: zh ? "第二步" : "Second step", order: 1 },
          ],
          feedback: common.feedback,
          hint: common.hint,
        },
      };
    }
    if (index === 1) {
      return {
        ...common,
        type: "game" as const,
        payload: {
          variant: "match" as const,
          pairs: [
            { left: zh ? "概念" : "Concept", right: zh ? "定义" : "Definition" },
            { left: zh ? "例子" : "Example", right: zh ? "应用" : "Application" },
          ],
          feedback: common.feedback,
          hint: common.hint,
        },
      };
    }
    return {
      ...common,
      type: "game" as const,
      payload: {
        variant: "choose" as const,
        prompt: zh ? "哪一项符合课程内容？" : "Which statement matches the lesson?",
        options: [
          { text: zh ? "课程中的正确概念" : "The lesson concept", correct: true },
          { text: zh ? "常见误解一" : "A plausible misconception", correct: false },
          { text: zh ? "常见误解二" : "Another plausible misconception", correct: false },
        ],
        feedback: common.feedback,
        hint: common.hint,
      },
    };
  });

  return {
    id: "mock-game-activity",
    title: zh ? "课程练习" : "Lesson Practice",
    challenges,
  };
}
