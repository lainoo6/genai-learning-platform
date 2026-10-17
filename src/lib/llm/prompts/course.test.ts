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
    expect(prompt).toContain("exactly one module of three lessons");
  });

  it("says when no goal was given", () => {
    expect(learnerCoursePrompt("Tea history", "  ")).toContain(
      "No specific goal was given",
    );
  });
});

describe("mockLearnerCourse", () => {
  it("satisfies the generation schema", () => {
    expect(course.title.length).toBeGreaterThan(0);
    expect(course.lessons).toHaveLength(3);
  });

  it("gives every lesson a reading, an interactive block and a quiz", () => {
    for (const lesson of course.lessons) {
      const types = lesson.blocks.map((block) => block.type);
      expect(types).toHaveLength(3);
      expect(types[0]).toBe("reading");
      expect(types[2]).toBe("quiz");
      expect(["flashcards", "game"]).toContain(types[1]);
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

  it("rejects a lesson that is missing its interactive block", () => {
    const first = course.lessons[0];
    const invalid = {
      ...course,
      lessons: [
        { ...first, blocks: [first.blocks[0], first.blocks[2]] },
        course.lessons[1],
        course.lessons[2],
      ],
    };

    expect(learnerCourseSchema.safeParse(invalid).success).toBe(false);
  });
});
