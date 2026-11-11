import { describe, expect, it } from "vitest";

import {
  learnerCoursePrompt,
  learnerCourseSchema,
  mockLearnerCourse,
} from "@/lib/llm/prompts/course";

const course = learnerCourseSchema.parse(mockLearnerCourse());

describe("learnerCoursePrompt", () => {
  it("carries the topic and the optional goal", () => {
    const prompt = learnerCoursePrompt("K-pop fandom economics", "Why fans buy merch");

    expect(prompt).toContain("K-pop fandom economics");
    expect(prompt).toContain("Why fans buy merch");
    expect(prompt).toContain("Game Activity container");
  });

  it("says when no goal was given", () => {
    expect(learnerCoursePrompt("Tea history", "  ")).toContain(
      "No specific goal was given",
    );
  });

  it("spells out lowercase Challenge variants and payload shapes", () => {
    const prompt = learnerCoursePrompt("Tea history", "");

    expect(prompt).toContain('"variant": "sort"');
    expect(prompt).toContain('"variant": "match"');
    expect(prompt).toContain('"variant": "choose"');
    expect(prompt).toContain('lowercase only');
  });
});

describe("learnerCoursePrompt audience", () => {
  it("defaults to the student rule", () => {
    expect(learnerCoursePrompt("Tea history", "")).toContain(
      "some foundational knowledge",
    );
  });

  it.each([
    ["beginner", "complete beginner"],
    ["student", "some foundational knowledge"],
    ["developer", "experienced developer"],
  ] as const)("injects the %s rule", (audience, phrase) => {
    expect(
      learnerCoursePrompt("Tea history", "", "en", audience),
    ).toContain(phrase);
  });
});

describe("learnerCourseSchema variant coercion", () => {
  it("lowercases Challenge variants when the payload shape already matches", () => {
    const sample = structuredClone(course) as {
      lessons: Array<{
        gameActivity: {
          challenges: Array<{ payload: { variant: string } }>;
        };
      }>;
    };
    const original = sample.lessons[0]!.gameActivity.challenges.map(
      (challenge) => challenge.payload.variant,
    );
    for (const lesson of sample.lessons) {
      for (const challenge of lesson.gameActivity.challenges) {
        challenge.payload.variant = challenge.payload.variant.toUpperCase();
      }
    }

    const parsed = learnerCourseSchema.safeParse(sample);
    expect(parsed.success).toBe(true);
    if (!parsed.success) {
      return;
    }
    expect(
      parsed.data.lessons[0]!.gameActivity.challenges.map(
        (challenge) => challenge.payload.variant,
      ),
    ).toEqual(original);
  });

  it("nests flattened Challenge fields under payload", () => {
    const sample = structuredClone(course);
    const first = sample.lessons[0]!.gameActivity.challenges[0]!;
    const flat = {
      id: first.id,
      title: first.title,
      variant: "SORT",
      items: first.payload.variant === "sort" ? first.payload.items : [],
      feedback: first.payload.feedback,
      hint: first.payload.hint,
    };
    sample.lessons[0]!.gameActivity.challenges[0] = flat as never;

    const parsed = learnerCourseSchema.safeParse(sample);
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.lessons[0]!.gameActivity.challenges[0]!.payload.variant).toBe(
      "sort",
    );
  });
});

describe("mockLearnerCourse", () => {
  it("satisfies the generation schema", () => {
    expect(course.title.length).toBeGreaterThan(0);
    expect(course.lessons).toHaveLength(3);
  });

  it("gives every lesson reading, quiz, and a Game Activity container", () => {
    for (const lesson of course.lessons) {
      const types = lesson.blocks.map((block) => block.type);
      expect(types).toHaveLength(2);
      expect(types[0]).toBe("reading");
      expect(types[1]).toBe("quiz");
      expect(lesson.gameActivity.challenges).toHaveLength(5);
    }
  });

  it("uses unique block and question ids", () => {
    const blockIds = course.lessons.flatMap((lesson) =>
      lesson.blocks.map((block) => block.id),
    );
    expect(new Set(blockIds).size).toBe(blockIds.length);

    const questionIds = course.lessons.flatMap((lesson) =>
      lesson.blocks.flatMap((block) =>
        block.type === "quiz"
          ? block.payload.questions.map((question) => question.id)
          : [],
      ),
    );
    expect(new Set(questionIds).size).toBe(questionIds.length);
  });

  it("rejects a lesson that is missing its Game Activity blocks", () => {
    const first = course.lessons[0];
    const invalid = {
      ...course,
      lessons: [
        { ...first, blocks: [first.blocks[0]] },
        course.lessons[1],
        course.lessons[2],
      ],
    };

    expect(learnerCourseSchema.safeParse(invalid).success).toBe(false);
  });
});
