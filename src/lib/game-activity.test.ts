import { describe, expect, it } from "vitest";

import {
  gameActivityContainerSchema,
  gameActivitySchema,
  normalizeLessonGameActivity,
  validateGameActivity,
  type GameActivity,
} from "./game-activity";
import {
  gameActivityPrompt,
  mockGameActivity,
} from "./llm/prompts/game-activity";

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
  it("accepts an explicit container with ordered challenges", () => {
    const container = {
      id: "activity-1",
      title: "API design practice",
      challenges: mockGameActivity("en").challenges,
    };

    expect(gameActivityContainerSchema.safeParse(container).success).toBe(true);
    expect(validateGameActivity(container, "en")).toEqual({ ok: true });
  });

  it("rejects a container with duplicate Challenge identities", () => {
    const challenges = mockGameActivity("en").challenges;
    const container = {
      id: "activity-1",
      title: "API design practice",
      challenges: [
        challenges[0],
        { ...challenges[1], id: challenges[0].id },
        ...challenges.slice(2),
      ],
    };

    expect(gameActivityContainerSchema.safeParse(container).success).toBe(false);
    expect(validateGameActivity(container, "en").ok).toBe(false);
  });

  it("validates the activity title against the lesson locale", () => {
    const activity = {
      ...mockGameActivity("en"),
      title: "课程练习",
    };

    expect(validateGameActivity(activity, "en").ok).toBe(false);
  });

  it("uses canonical Game Activity terminology in generation guidance", () => {
    const prompt = gameActivityPrompt({
      lessonTitle: "API design",
      objectives: "Recognize safe API patterns",
      sourceContent: "An API defines a contract.",
      language: "en",
    });

    expect(prompt).toContain("Game Activity");
    expect(prompt).toContain('"variant": "sort"');
    expect(prompt).toContain('"variant": "match"');
    expect(prompt).toContain('"variant": "choose"');
    expect(prompt).toContain("challenges");
  });

  it("generates one explicit Game Activity container", () => {
    const activity = mockGameActivity("en");

    expect(activity).toMatchObject({
      id: expect.any(String),
      title: expect.any(String),
      challenges: expect.any(Array),
    });
    expect(activity.challenges).toHaveLength(5);
  });

  it("accepts five complete challenges in one locale", () => {
    const activity = mockGameActivity("en");

    expect(gameActivityContainerSchema.safeParse(activity).success).toBe(true);
    expect(validateGameActivity(activity, "en")).toEqual({ ok: true });
  });

  it("requires Sort, Match, and Choose formats", () => {
    const activity = {
      id: "activity-1",
      title: "Practice",
      challenges: Array.from({ length: 5 }, (_, index) => challenge(index)),
    };

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

    expect(
      validateGameActivity(
        { id: "activity-1", title: "Practice", challenges: activity },
        "en",
      ).ok,
    ).toBe(false);
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
    const mixed = {
      id: "activity-1",
      title: "Practice",
      challenges: [
        challenge(0),
        ...Array.from({ length: 4 }, (_, index) => ({
          ...challenge(index + 1),
          title: `第 ${index + 1} 题`,
        })),
      ],
    };

    expect(
      validateGameActivity(
        {
          id: "activity-1",
          title: "Practice",
          challenges: [
            ambiguous,
            ...Array.from({ length: 4 }, (_, i) => challenge(i + 1)),
          ],
        },
        "en",
      ).ok,
    ).toBe(false);
    expect(validateGameActivity(mixed, "en").ok).toBe(false);
  });

  it("accepts Chinese content with isolated latin letters", () => {
    const base = mockGameActivity("zh");
    const activity = {
      ...base,
      title: "单元练习 B",
      challenges: base.challenges.map((block, index) => ({
        ...block,
        title: `第 ${index + 1} 题：比较 A 与 B，并记录 C`,
      })),
    };

    expect(validateGameActivity(activity, "zh")).toEqual({ ok: true });
  });

  it("still rejects English challenge text for a Chinese lesson", () => {
    const base = mockGameActivity("zh");
    const activity = {
      ...base,
      title: "课程练习",
      challenges: base.challenges.map((block) => ({
        ...block,
        title: "Which statement is correct for this lesson?",
      })),
    };

    const result = validateGameActivity(activity, "zh");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.errors.filter((error) =>
          error.includes("does not match the lesson locale"),
        ),
      ).toHaveLength(5);
    }
  });

  it("rejects an English activity title for a Chinese lesson", () => {
    const activity = { ...mockGameActivity("zh"), title: "Lesson Practice" };

    expect(validateGameActivity(activity, "zh").ok).toBe(false);
  });

  it("migrates five standalone game blocks into one Game Activity container", () => {
    const source = mockGameActivity("en");
    const normalized = normalizeLessonGameActivity({
      lessonId: "lesson-1",
      lessonTitle: "Lesson practice",
      blocks: [
        {
          id: "reading-1",
          title: "Read",
          type: "reading",
          payload: { markdown: "Hello" },
        },
        ...source.challenges,
      ],
    });

    expect(normalized.blocks).toEqual([
      {
        id: "reading-1",
        title: "Read",
        type: "reading",
        payload: { markdown: "Hello" },
      },
    ]);
    expect(normalized.gameActivity).toEqual({
      id: "legacy-lesson-1",
      title: "Lesson practice",
      challenges: gameActivityContainerSchema.parse(source).challenges,
    });
  });

  it("allows technical terms, identifiers, URLs, and code in localized content", () => {
    const activity = mockGameActivity("zh");
    const first = activity.challenges.find(
      (challenge) => challenge.payload.variant === "choose",
    );
    if (!first || first.payload.variant !== "choose")
      throw new Error("Expected choose");
    first.payload.prompt =
      "使用 API v2 和 `useState`，访问 https://example.com/docs。";
    first.payload.options[0].text = "JSON";
    first.payload.options[1].text = "Docker 和 GraphQL";
    first.payload.feedback = {
      correct: "正确：React 会保留这个状态。",
      incorrect: "不完全正确，请检查 TypeScript 类型。",
    };

    expect(validateGameActivity(activity, "zh")).toEqual({ ok: true });
  });

  it("requires approved, moderated, accessible supporting media", () => {
    const activity = mockGameActivity("en");
    activity.challenges[0].payload.supportingMedia = {
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
      ...activity.challenges[0],
      payload: {
        ...activity.challenges[0].payload,
        supportingMedia: {
          ...activity.challenges[0].payload.supportingMedia,
          approvalStatus: "pending",
          moderationStatus: "pending",
          altText: undefined,
          decorative: false,
        },
      },
    };
    expect(
      validateGameActivity(
        { ...activity, challenges: [invalid, ...activity.challenges.slice(1)] },
        "en",
      ).ok,
    ).toBe(
      false,
    );
  });

  it("caps animations at five seconds and keeps challenge text independent", () => {
    const activity = mockGameActivity("en");
    activity.challenges[1].payload.supportingMedia = {
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
      ...activity.challenges[1],
      payload: {
        ...activity.challenges[1].payload,
        supportingMedia: {
          ...activity.challenges[1].payload.supportingMedia,
          durationSeconds: 5.1,
        },
      },
    };
    expect(
      validateGameActivity(
        { ...activity, challenges: [activity.challenges[0], overLimit, ...activity.challenges.slice(2)] },
        "en",
      ).ok,
    ).toBe(false);
  });
});
