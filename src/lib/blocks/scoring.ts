import type { QuizQuestion } from "./schema";

/**
 * Pure quiz grading helpers. Kept free of React so the rules below can be unit
 * tested directly (P2.2 acceptance).
 */

/** A learner answer to one question: chosen option indices or free text. */
export type QuizResponse =
  { kind: "choice"; choices: number[] } | { kind: "text"; text: string };

/** Learner answers keyed by question id. Unanswered questions are `undefined`. */
export type QuizResponses = Readonly<Record<string, QuizResponse | undefined>>;

export type QuizResult = {
  correct: number;
  total: number;
  /** Correct answers divided by total questions, in [0, 1]. */
  score: number;
  passed: boolean;
};

/** Lower-cases, trims and collapses whitespace before comparing text. */
export function normaliseText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Short-answer rule: `keywords` is a comma-separated list stored in
 * `question.answer`. The response is correct when it **contains any** keyword
 * (case-insensitive, whitespace-insensitive, with Latin word boundaries). Empty responses
 * and empty keyword lists are always wrong.
 */
export function isShortAnswerCorrect(
  response: string,
  keywords: string,
): boolean {
  const normalisedResponse = normaliseText(response);
  if (normalisedResponse.length === 0) {
    return false;
  }

  return keywords
    .split(/[,，]/)
    .map((keyword) => normaliseText(keyword))
    .some((keyword) => {
      if (!keyword) return false;
      // Latin/numeric keywords must be whole words: "AI" must not match "email".
      // CJK has no whitespace word boundaries, so preserve phrase matching there.
      const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const left = /^[a-z0-9_]/i.test(keyword) ? "(?<![a-z0-9_])" : "";
      const right = /[a-z0-9_]$/i.test(keyword) ? "(?![a-z0-9_])" : "";
      return new RegExp(`${left}${escaped}${right}`, "i").test(
        normalisedResponse,
      );
    });
}

/** Choice questions are correct when the selected set equals the answer set. */
export function isChoiceCorrect(selected: number[], answer: number[]): boolean {
  if (selected.length !== answer.length) {
    return false;
  }

  const sortedSelected = [...selected].sort((a, b) => a - b);
  const sortedAnswer = [...answer].sort((a, b) => a - b);

  return sortedSelected.every((value, index) => value === sortedAnswer[index]);
}

/** Grades one question; an unanswered question is always wrong. */
export function gradeQuestion(
  question: QuizQuestion,
  response: QuizResponse | undefined,
): boolean {
  if (response === undefined) {
    return false;
  }

  if (question.kind === "short") {
    return (
      response.kind === "text" &&
      isShortAnswerCorrect(response.text, question.answer)
    );
  }

  return (
    response.kind === "choice" &&
    isChoiceCorrect(response.choices, question.answer)
  );
}

/** Grades a whole quiz. `passScore` is a ratio in [0, 1]. */
export function gradeQuiz(
  questions: readonly QuizQuestion[],
  responses: QuizResponses,
  passScore: number,
): QuizResult {
  const correct = questions.filter((question) =>
    gradeQuestion(question, responses[question.id]),
  ).length;

  const total = questions.length;
  const score = total === 0 ? 0 : correct / total;

  return { correct, total, score, passed: score >= passScore };
}
