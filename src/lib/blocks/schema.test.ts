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

const validFlashcards = {
  id: "blk_cards",
  title: "Terms to remember",
  type: "flashcards",
  payload: {
    cards: [{ front: "Requirement", back: "What the software must do." }],
  },
};

const validReflection = {
  id: "blk_reflection",
  title: "Your turn",
  type: "reflection",
  payload: {
    prompt: "Which part of today's lesson would you use at work?",
    minWords: 40,
  },
};

const validSortGame = {
  id: "blk_game_sort",
  title: "Prioritise the backlog",
  type: "game",
  payload: {
    variant: "sort",
    items: [
      { text: "Checkout is down for everyone", order: 1 },
      { text: "Add a dark mode toggle", order: 4 },
      { text: "Fix the broken password email", order: 2 },
      { text: "Rename a menu label", order: 5 },
      { text: "Speed up the search page", order: 3 },
    ],
  },
};

const validMatchGame = {
  id: "blk_game_match",
  title: "Good practice, bad practice",
  type: "game",
  payload: {
    variant: "match",
    pairs: [
      { left: "Paste the error message", right: "Good: the agent needs evidence" },
      { left: "Ship the first diff untouched", right: "Bad: nobody reviewed it" },
      { left: "Ask for tests alongside the fix", right: "Good: proves it works" },
    ],
  },
};

const validCoding = {
  id: "blk_coding",
  title: "Warm up: sums",
  type: "coding",
  payload: {
    problem: "Write a function sum(a, b) that returns the sum.",
    starter: "function sum(a, b) {\n  // your code\n}",
    tests: [
      { name: "sums 1+2", expression: "sum(1,2) === 3" },
      { name: "handles negatives", expression: "sum(-1,1) === 0" },
    ],
    hints: ["Return the two arguments added together."],
  },
};

const validSlides = {
  id: "blk_slides",
  title: "How an agent reads your request",
  type: "slides",
  payload: {
    autoPlay: false,
    slides: [
      {
        title: "It starts with the context you gave it",
        bullets: ["Files you opened", "The error you pasted"],
        narration: "It starts with the context you gave it.",
      },
      {
        title: "Then it proposes a change",
        bullets: ["A diff, not a rewrite"],
        narration: "Then it proposes a change.",
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
    // `roleplay` is the next block on the roadmap and has no schema yet.
    const result = blockSchema.safeParse({ ...validReading, type: "roleplay" });

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

  it("accepts a flashcards block", () => {
    expect(blockSchema.safeParse(validFlashcards).success).toBe(true);
  });

  it("rejects a flashcard with an empty side", () => {
    const result = blockSchema.safeParse({
      ...validFlashcards,
      payload: { cards: [{ front: "", back: "Back" }] },
    });

    expect(result.success).toBe(false);
  });

  it("rejects a flashcard deck with no cards", () => {
    const result = blockSchema.safeParse({
      ...validFlashcards,
      payload: { cards: [] },
    });

    expect(result.success).toBe(false);
  });

  it("accepts a reflection block", () => {
    expect(blockSchema.safeParse(validReflection).success).toBe(true);
  });

  it("rejects a reflection with a minWords below one word", () => {
    const result = blockSchema.safeParse({
      ...validReflection,
      payload: { prompt: "Say something", minWords: 0 },
    });

    expect(result.success).toBe(false);
  });

  it("accepts a slides block", () => {
    expect(blockSchema.safeParse(validSlides).success).toBe(true);
  });

  it("rejects a slides deck with no slides", () => {
    const result = blockSchema.safeParse({
      ...validSlides,
      payload: { ...validSlides.payload, slides: [] },
    });

    expect(result.success).toBe(false);
  });

  it("rejects a slide without a narration script", () => {
    const result = blockSchema.safeParse({
      ...validSlides,
      payload: {
        ...validSlides.payload,
        slides: [{ title: "One", bullets: ["Only a bullet"] }],
      },
    });

    expect(result.success).toBe(false);
  });

  it("rejects a slide whose bullet list is empty", () => {
    const result = blockSchema.safeParse({
      ...validSlides,
      payload: {
        ...validSlides.payload,
        slides: [{ title: "One", bullets: [], narration: "One." }],
      },
    });

    expect(result.success).toBe(false);
  });

  it("rejects a slides payload that forgets the autoPlay flag", () => {
    const result = blockSchema.safeParse({
      ...validSlides,
      payload: { slides: validSlides.payload.slides },
    });

    expect(result.success).toBe(false);
  });

  it("accepts a coding block", () => {
    expect(blockSchema.safeParse(validCoding).success).toBe(true);
  });

  it("accepts a coding block that starts from an empty editor", () => {
    const result = blockSchema.safeParse({
      ...validCoding,
      payload: { ...validCoding.payload, starter: "" },
    });

    expect(result.success).toBe(true);
  });

  it("rejects a coding block without any test", () => {
    const result = blockSchema.safeParse({
      ...validCoding,
      payload: { ...validCoding.payload, tests: [] },
    });

    expect(result.success).toBe(false);
  });

  it("rejects a coding test with an empty expression", () => {
    const result = blockSchema.safeParse({
      ...validCoding,
      payload: {
        ...validCoding.payload,
        tests: [{ name: "always true", expression: "" }],
      },
    });

    expect(result.success).toBe(false);
  });

  it("rejects a coding block without a problem statement", () => {
    const result = blockSchema.safeParse({
      ...validCoding,
      payload: { ...validCoding.payload, problem: "" },
    });

    expect(result.success).toBe(false);
  });

  it("accepts a sort game", () => {
    expect(blockSchema.safeParse(validSortGame).success).toBe(true);
  });

  it("accepts a match game", () => {
    expect(blockSchema.safeParse(validMatchGame).success).toBe(true);
  });

  it("rejects a sort game whose items share an order value", () => {
    const result = blockSchema.safeParse({
      ...validSortGame,
      payload: {
        variant: "sort",
        items: [
          { text: "First", order: 1 },
          { text: "Second", order: 1 },
        ],
      },
    });

    expect(result.success).toBe(false);
  });

  it("rejects a sort game with a single item", () => {
    const result = blockSchema.safeParse({
      ...validSortGame,
      payload: { variant: "sort", items: [{ text: "Only one", order: 1 }] },
    });

    expect(result.success).toBe(false);
  });

  it("rejects a match game whose payload carries sort items instead of pairs", () => {
    const result = blockSchema.safeParse({
      ...validMatchGame,
      payload: { variant: "match", items: [{ text: "Nope", order: 1 }] },
    });

    expect(result.success).toBe(false);
  });

  it("rejects a game with an unknown variant", () => {
    const result = blockSchema.safeParse({
      ...validMatchGame,
      payload: { variant: "hangman", pairs: [] },
    });

    expect(result.success).toBe(false);
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

  it("accepts a list mixing the newer block types", () => {
    expect(
      blockListSchema.safeParse([validFlashcards, validReflection, validQuiz]).success,
    ).toBe(true);
  });

  it("rejects a list containing one invalid block", () => {
    const result = blockListSchema.safeParse([validReading, { id: "x" }]);

    expect(result.success).toBe(false);
  });

  it("rejects a non-array value", () => {
    expect(blockListSchema.safeParse({ blocks: [] }).success).toBe(false);
  });
});
