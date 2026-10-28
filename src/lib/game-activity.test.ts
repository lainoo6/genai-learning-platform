import { describe, expect, it } from "vitest";

import {
  gameActivitySchema,
  validateGameActivity,
  type GameActivity,
} from "./game-activity";
import { mockGameActivity } from "./llm/prompts/game-activity";

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
    const activity = mockGameActivity("en");

    expect(gameActivitySchema.safeParse(activity).success).toBe(true);
    expect(validateGameActivity(activity, "en")).toEqual({ ok: true });
  });

  it("requires Sort, Match, and Choose formats", () => {
    const activity = Array.from({ length: 5 }, (_, index) => challenge(index));

    expect(validateGameActivity(activity, "en").ok).toBe(false);
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

  it("requires approved, moderated, accessible supporting media", () => {
    const activity = mockGameActivity("en");
    activity[0].payload.supportingMedia = {
      kind: "image",
      url: "https://example.com/diagram.png",
      approvalStatus: "approved",
      moderationStatus: "passed",
      provenance: {
        source: "model-generated",
        model: "image-model-v1",
        generatedAt: "2026-10-28T12:00:00.000Z",
      },
      altText: "A diagram showing the sequence",
      decorative: false,
    };

    expect(validateGameActivity(activity, "en")).toEqual({ ok: true });

    const invalid = {
      ...activity[0],
      payload: {
        ...activity[0].payload,
        supportingMedia: {
          ...activity[0].payload.supportingMedia,
          approvalStatus: "pending",
          moderationStatus: "pending",
          altText: undefined,
          decorative: false,
        },
      },
    };
    expect(validateGameActivity([invalid, ...activity.slice(1)], "en").ok).toBe(
      false,
    );
  });

  it("caps animations at five seconds and keeps challenge text independent", () => {
    const activity = mockGameActivity("en");
    activity[1].payload.supportingMedia = {
      kind: "animation",
      url: "https://example.com/sequence.mp4",
      approvalStatus: "approved",
      moderationStatus: "passed",
      provenance: { source: "instructor-provided" },
      altText: "The sequence in motion",
      decorative: false,
      durationSeconds: 5,
    };
    expect(validateGameActivity(activity, "en")).toEqual({ ok: true });

    const overLimit = {
      ...activity[1],
      payload: {
        ...activity[1].payload,
        supportingMedia: {
          ...activity[1].payload.supportingMedia,
          durationSeconds: 5.1,
        },
      },
    };
    expect(validateGameActivity([activity[0], overLimit, ...activity.slice(2)], "en").ok).toBe(
      false,
    );
  });
});
