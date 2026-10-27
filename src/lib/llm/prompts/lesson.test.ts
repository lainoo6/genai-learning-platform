import { describe, expect, it } from "vitest";

import {
  generatedLessonSchema,
  lessonPrompt,
  mockLesson,
  type LessonRequest,
} from "@/lib/llm/prompts/lesson";

const request: LessonRequest = {
  courseTitle: "Introduction to Git for beginners",
  courseDescription:
    "A short, hands-on introduction to version control with Git.",
  topic: "Introduction to Git for beginners",
  audience: "All learners",
  difficulty: "beginner",
  notes: "",
  moduleTitle: "The history of a project",
  lessonTitle: "Why version control exists",
  lessonSummary:
    "Explain the problem Git solves so work can be undone and shared safely.",
  suggestedBlocks: ["reading", "slides", "quiz"],
  lessonNumber: 1,
  lessonCount: 3,
};

const prompt = lessonPrompt(request);

describe("lessonPrompt", () => {
  it("carries the lesson plan and the block reference", () => {
    expect(prompt).toContain("Lesson title: Why version control exists");
    expect(prompt).toContain("Lesson number: 1 of 3");
    expect(prompt).toContain('"type": "quiz"');
    expect(prompt).toContain('"variant": "match"');
  });

  it("mentions the author's notes when there are some", () => {
    const withNotes = lessonPrompt({ ...request, notes: "Add a diagram." });
    expect(withNotes).toContain("Add a diagram.");
  });
});

describe("mockLesson", () => {
  it("writes a lesson that satisfies the schema", () => {
    const lesson = generatedLessonSchema.parse(mockLesson(prompt));

    expect(lesson.blocks.length).toBeGreaterThanOrEqual(3);
    expect(lesson.estimatedMinutes).toBeGreaterThan(0);
  });

  it("matches the fixed demo lesson for the first outline lesson", () => {
    const lesson = generatedLessonSchema.parse(mockLesson(prompt));

    expect(lesson.title).toBe("Why version control exists");
    expect(lesson.blocks.map((block) => block.type)).toEqual([
      "reading",
      "slides",
      "quiz",
    ]);
  });

  it("falls back to a placeholder when the outline title was edited", () => {
    const edited = lessonPrompt({
      ...request,
      lessonTitle: "A lesson the mock does not know",
      lessonSummary: "",
    });
    const lesson = generatedLessonSchema.parse(mockLesson(edited));

    expect(lesson.title).toBe("A lesson the mock does not know");
    expect(lesson.blocks.length).toBeGreaterThanOrEqual(3);
  });
});

describe("generatedLessonSchema", () => {
  const lesson = generatedLessonSchema.parse(mockLesson(prompt));

  it("rejects duplicate block ids", () => {
    const [first, ...rest] = lesson.blocks;
    const invalid = {
      ...lesson,
      blocks: [first, { ...rest[0], id: first.id }, ...rest.slice(1)],
    };

    expect(generatedLessonSchema.safeParse(invalid).success).toBe(false);
  });

  it("rejects a lesson without a reading or slides block", () => {
    const quizzes = lesson.blocks
      .filter((block) => block.type === "quiz")
      .map((block, index) => ({ ...block, id: `blk_quiz_${index}` }));

    const invalid = {
      ...lesson,
      blocks: [quizzes[0], { ...quizzes[0], id: "blk_quiz_copy" }, quizzes[0]],
    };

    expect(generatedLessonSchema.safeParse(invalid).success).toBe(false);
  });
});
