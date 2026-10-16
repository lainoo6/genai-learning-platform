import { describe, expect, it } from "vitest";

import { blockListSchema, blockSchema, questionSchema } from "./schema";

const validReading = {
  id: "blk_reading",
  title: "What Is GenAI?",
  type: "reading",
  payload: {
    markdown: "# Hello\n\nSome **markdown**.",
  },
};

const validQuiz = {
  id: "blk_quiz",
  title: "Check yourself",
  type: "quiz",
  payload: {
    passScore: 0.6,
    questions: [
      {
        id: "q1",
        kind: "single",
        prompt: "Pick one",
        options: ["A", "B"],
        answer: [1],
        explanation: "B is right.",
      },
    ],
  },
};

describe("blockSchema", () => {
  it("accepts a reading block without an image", () => {
    expect(blockSchema.safeParse(validReading).success).toBe(true);
  });

  it("accepts a reading block with an image", () => {
    const result = blockSchema.safeParse({
      ...validReading,
      payload: { markdown: "text", imageUrl: "/cover.svg" },
    });

    expect(result.success).toBe(true);
  });

  it("accepts a quiz block", () => {
    expect(blockSchema.safeParse(validQuiz).success).toBe(true);
  });

  it("rejects an unknown block type", () => {
    const result = blockSchema.safeParse({ ...validReading, type: "slides" });

    expect(result.success).toBe(false);
  });

  it("rejects a block without an id", () => {
    const result = blockSchema.safeParse({ ...validReading, id: "" });

    expect(result.success).toBe(false);
  });

  it("rejects a payload that does not match the block type", () => {
    const result = blockSchema.safeParse({
      ...validQuiz,
      payload: { markdown: "wrong shape" },
    });

    expect(result.success).toBe(false);
  });

  it("rejects a passScore outside [0, 1]", () => {
    const result = blockSchema.safeParse({
      ...validQuiz,
      payload: { ...validQuiz.payload, passScore: 6 },
    });

    expect(result.success).toBe(false);
  });

  it("rejects a choice answer that points outside the options", () => {
    const result = blockSchema.safeParse({
      ...validQuiz,
      payload: {
        ...validQuiz.payload,
        questions: [{ ...validQuiz.payload.questions[0], answer: [5] }],
      },
    });

    expect(result.success).toBe(false);
  });

  it("rejects non-integer choice answers", () => {
    const result = blockSchema.safeParse({
      ...validQuiz,
      payload: {
        ...validQuiz.payload,
        questions: [{ ...validQuiz.payload.questions[0], answer: [0.5] }],
      },
    });

    expect(result.success).toBe(false);
  });

  it("rejects a single-choice question with two answers", () => {
    const result = blockSchema.safeParse({
      ...validQuiz,
      payload: {
        ...validQuiz.payload,
        questions: [{ ...validQuiz.payload.questions[0], answer: [0, 1] }],
      },
    });

    expect(result.success).toBe(false);
  });

  it("rejects a quiz with no questions", () => {
    const result = blockSchema.safeParse({
      ...validQuiz,
      payload: { passScore: 0.5, questions: [] },
    });

    expect(result.success).toBe(false);
  });

  it("rejects raw JSON that is not an object", () => {
    expect(blockSchema.safeParse("reading").success).toBe(false);
    expect(blockSchema.safeParse(null).success).toBe(false);
  });
});

describe("questionSchema", () => {
  it("accepts every question kind", () => {
    expect(
      questionSchema.safeParse({
        id: "q2",
        kind: "multi",
        prompt: "Pick many",
        options: ["A", "B", "C"],
        answer: [0, 2],
        explanation: "A and C.",
      }).success,
    ).toBe(true);

    expect(
      questionSchema.safeParse({
        id: "q3",
        kind: "truefalse",
        prompt: "Is this true?",
        answer: [1],
        explanation: "Nope.",
      }).success,
    ).toBe(true);

    expect(
      questionSchema.safeParse({
        id: "q4",
        kind: "short",
        prompt: "Name one phase",
        answer: "requirements, design",
        explanation: "Either works.",
      }).success,
    ).toBe(true);
  });

  it("rejects a true/false answer outside 0 and 1", () => {
    const result = questionSchema.safeParse({
      id: "q3",
      kind: "truefalse",
      prompt: "Is this true?",
      answer: [2],
      explanation: "Out of range.",
    });

    expect(result.success).toBe(false);
  });

  it("rejects a missing explanation", () => {
    const result = questionSchema.safeParse({
      id: "q5",
      kind: "short",
      prompt: "Name one phase",
      answer: "design",
    });

    expect(result.success).toBe(false);
  });
});

describe("blockListSchema", () => {
  it("accepts a mixed lesson block list", () => {
    expect(blockListSchema.safeParse([validReading, validQuiz]).success).toBe(true);
  });

  it("rejects a list containing one invalid block", () => {
    const result = blockListSchema.safeParse([validReading, { id: "x" }]);

    expect(result.success).toBe(false);
  });

  it("rejects a non-array value", () => {
    expect(blockListSchema.safeParse({ blocks: [] }).success).toBe(false);
  });
});
