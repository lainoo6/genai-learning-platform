import { describe, expect, it } from "vitest";

import {
  gameActivitySchema,
  validateGameActivity,
  type GameActivity,
} from "./game-activity";

const challenge = (index: number): GameActivity[number] => ({
  id: `challenge-${index}`,
  title: `Challenge ${index}`,
  type: "game",
  payload: {
    variant: "choose",
    prompt: "Which statement is correct?",
    options: [
      { text: "The correct statement", correct: true },
      { text: "A plausible misconception", correct: false },
      { text: "Another plausible misconception", correct: false },
    ],
    feedback: {
      correct: "Correct: this matches the lesson.",
      incorrect: "Not quite. Review the lesson example.",
    },
    hint: "Look for the definition in the lesson.",
  },
});

describe("game activity validation", () => {
  it("accepts five complete challenges in one locale", () => {
    const activity = Array.from({ length: 5 }, (_, index) => challenge(index));

    expect(gameActivitySchema.safeParse(activity).success).toBe(true);
    expect(validateGameActivity(activity, "en")).toEqual({ ok: true });
  });

  it("rejects an incomplete activity and missing instructional feedback", () => {
    const activity = Array.from({ length: 4 }, (_, index) => challenge(index));
    const invalid = {
      ...challenge(4),
      payload: {
        ...challenge(4).payload,
        feedback: { correct: "", incorrect: "Try again." },
      },
    };

    expect(validateGameActivity(activity, "en").ok).toBe(false);
    expect(gameActivitySchema.safeParse([...activity, invalid]).success).toBe(
      false,
    );
  });

  it("rejects ambiguous choose answers and mixed-locale content", () => {
    const first = challenge(0);
    if (first.payload.variant !== "choose") throw new Error("Expected choose");
    const ambiguous = {
      ...first,
      payload: {
        ...first.payload,
        options: first.payload.options.map((option) => ({
          ...option,
          correct: true,
        })),
      },
    };
    const mixed = [
      challenge(0),
      ...Array.from({ length: 4 }, (_, index) => ({
        ...challenge(index + 1),
        title: `第 ${index + 1} 题`,
      })),
    ];

    expect(validateGameActivity([ambiguous, ...Array.from({ length: 4 }, (_, i) => challenge(i + 1))], "en").ok).toBe(false);
    expect(validateGameActivity(mixed, "en").ok).toBe(false);
  });
});
