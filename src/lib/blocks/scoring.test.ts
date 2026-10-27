import { describe, expect, it } from "vitest";

import {
  gradeQuestion,
  gradeQuiz,
  isChoiceCorrect,
  isShortAnswerCorrect,
  type QuizResponses,
} from "./scoring";
import type { QuizQuestion } from "./schema";

const single: QuizQuestion = {
  id: "q1",
  kind: "single",
  prompt: "Which phase comes first?",
  options: ["Requirements", "Deployment"],
  answer: [0],
  explanation: "Requirements come first.",
};

const multi: QuizQuestion = {
  id: "q2",
  kind: "multi",
  prompt: "Which are lifecycle phases?",
  options: ["Design", "Launch party", "Testing"],
  answer: [0, 2],
  explanation: "Design and testing belong to the lifecycle.",
};

const trueFalse: QuizQuestion = {
  id: "q3",
  kind: "truefalse",
  prompt: "Estimation is always exact.",
  answer: [1],
  explanation: "Estimation is a range, never exact.",
};

const short: QuizQuestion = {
  id: "q4",
  kind: "short",
  prompt: "Name one thing a software engineer does.",
  answer: "requirements, testing, code review",
  explanation: "Any of those is fine.",
};

describe("isChoiceCorrect", () => {
  it("accepts the exact answer set regardless of order", () => {
    expect(isChoiceCorrect([2, 0], [0, 2])).toBe(true);
  });

  it("rejects a partially correct set", () => {
    expect(isChoiceCorrect([0], [0, 2])).toBe(false);
    expect(isChoiceCorrect([0, 1], [0, 2])).toBe(false);
  });

  it("rejects duplicates that inflate the count", () => {
    expect(isChoiceCorrect([0, 0], [0, 2])).toBe(false);
  });

  it("rejects an empty selection", () => {
    expect(isChoiceCorrect([], [0])).toBe(false);
  });
});

describe("isShortAnswerCorrect", () => {
  it("accepts a response containing any keyword", () => {
    expect(isShortAnswerCorrect("They gather requirements", "requirements, design")).toBe(
      true,
    );
  });

  it("ignores case and extra whitespace", () => {
    expect(isShortAnswerCorrect("  CODE   Review ", "code review")).toBe(true);
  });

  it("rejects a response with no keyword", () => {
    expect(isShortAnswerCorrect("They drink coffee", "requirements, design")).toBe(false);
  });

  it("rejects an empty response", () => {
    expect(isShortAnswerCorrect("   ", "requirements")).toBe(false);
  });

  it("rejects everything when the keyword list is empty", () => {
    expect(isShortAnswerCorrect("anything", " , ")).toBe(false);
  });
});

describe("gradeQuestion", () => {
  it("grades single, multi and true/false choices", () => {
    expect(gradeQuestion(single, { kind: "choice", choices: [0] })).toBe(true);
    expect(gradeQuestion(single, { kind: "choice", choices: [1] })).toBe(false);
    expect(gradeQuestion(multi, { kind: "choice", choices: [0, 2] })).toBe(true);
    expect(gradeQuestion(trueFalse, { kind: "choice", choices: [1] })).toBe(true);
    expect(gradeQuestion(trueFalse, { kind: "choice", choices: [0] })).toBe(false);
  });

  it("grades short answers from text responses", () => {
    expect(gradeQuestion(short, { kind: "text", text: "testing" })).toBe(true);
    expect(gradeQuestion(short, { kind: "text", text: "nothing" })).toBe(false);
  });

  it("treats an unanswered question as wrong", () => {
    expect(gradeQuestion(single, undefined)).toBe(false);
  });

  it("treats a mismatched response kind as wrong", () => {
    expect(gradeQuestion(short, { kind: "choice", choices: [0] })).toBe(false);
    expect(gradeQuestion(single, { kind: "text", text: "0" })).toBe(false);
  });
});

describe("gradeQuiz", () => {
  const questions = [single, multi, trueFalse, short];

  const allCorrect: QuizResponses = {
    q1: { kind: "choice", choices: [0] },
    q2: { kind: "choice", choices: [2, 0] },
    q3: { kind: "choice", choices: [1] },
    q4: { kind: "text", text: "code review" },
  };

  it("scores a perfect attempt", () => {
    const result = gradeQuiz(questions, allCorrect, 0.6);

    expect(result).toEqual({ correct: 4, total: 4, score: 1, passed: true });
  });

  it("counts only the correct answers", () => {
    const result = gradeQuiz(
      questions,
      { ...allCorrect, q2: { kind: "choice", choices: [0] } },
      0.6,
    );

    expect(result.correct).toBe(3);
    expect(result.score).toBeCloseTo(0.75);
    expect(result.passed).toBe(true);
  });

  it("fails when the score is below passScore", () => {
    const result = gradeQuiz(questions, { q1: { kind: "choice", choices: [1] } }, 0.6);

    expect(result.correct).toBe(0);
    expect(result.score).toBe(0);
    expect(result.passed).toBe(false);
  });

  it("passes exactly on the threshold", () => {
    const half: QuizResponses = {
      q1: { kind: "choice", choices: [0] },
      q2: { kind: "choice", choices: [0] },
      q3: { kind: "choice", choices: [0] },
      q4: { kind: "text", text: "testing" },
    };

    expect(gradeQuiz(questions, half, 0.5).passed).toBe(true);
    expect(gradeQuiz(questions, half, 0.6).passed).toBe(false);
  });

  it("returns a zero score for an empty quiz", () => {
    expect(gradeQuiz([], {}, 0.5)).toEqual({
      correct: 0,
      total: 0,
      score: 0,
      passed: false,
    });
  });
});
