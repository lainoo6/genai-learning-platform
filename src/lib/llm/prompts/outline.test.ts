import { describe, expect, it } from "vitest";

import {
  courseOutlinePrompt,
  courseOutlineSchema,
  mockCourseOutline,
} from "@/lib/llm/prompts/outline";

const outline = courseOutlineSchema.parse(mockCourseOutline());
const lessons = outline.modules.flatMap((courseModule) => courseModule.lessons);

describe("courseOutlinePrompt", () => {
  it("carries the brief", () => {
    const prompt = courseOutlinePrompt({
      topic: "Introduction to Git for beginners",
      audience: "All learners",
      difficulty: "beginner",
      lessonCount: 4,
      notes: "Use short paragraphs.",
    });

    expect(prompt).toContain("Topic: Introduction to Git for beginners");
    expect(prompt).toContain("Audience: All learners");
    expect(prompt).toContain("exactly 4 lessons");
    expect(prompt).toContain("Use short paragraphs.");
  });

  it("says when the author left no notes", () => {
    const prompt = courseOutlinePrompt({
      topic: "Git",
      audience: "CS students",
      difficulty: "intermediate",
      lessonCount: 3,
      notes: "   ",
    });

    expect(prompt).toContain("Author's notes:\nNone.");
  });
});

describe("mockCourseOutline", () => {
  it("satisfies the outline schema", () => {
    expect(outline.title.length).toBeGreaterThan(0);
    expect(outline.description.length).toBeGreaterThanOrEqual(20);
  });

  it("is a three-lesson example course", () => {
    expect(outline.modules).toHaveLength(1);
    expect(lessons).toHaveLength(3);
  });

  it("plans a reading and a quiz for every lesson", () => {
    for (const lesson of lessons) {
      expect(lesson.suggestedBlocks).toContain("reading");
      expect(lesson.suggestedBlocks).toContain("quiz");
      expect(lesson.suggestedBlocks.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("rejects an outline with fewer than three lessons", () => {
    const first = lessons[0];
    const invalid = {
      ...outline,
      modules: [{ title: "Only module", lessons: [first, lessons[1]] }],
    };

    expect(courseOutlineSchema.safeParse(invalid).success).toBe(false);
  });
});
