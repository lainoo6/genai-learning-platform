"use client";

import { Check, RotateCcw, X } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  gradeQuestion,
  gradeQuiz,
  type QuizResponse,
  type QuizResponses,
} from "@/lib/blocks/scoring";
import type {
  BlockRenderProps,
  QuizBlock as QuizBlockData,
  QuizQuestion,
} from "@/lib/blocks/schema";
import { trackBlockEvent } from "@/server/progress";

/**
 * Quiz block.
 *
 * Flow: answer one question at a time → "Check answer" reveals whether it was
 * right plus the explanation → move on. Once every question has been checked the
 * score is shown; "Mark complete" only unlocks when `score >= passScore`
 * (both are ratios in [0, 1]), otherwise the learner can retry the whole quiz.
 *
 * `short` questions are graded by keyword: the stored answer is a
 * comma-separated keyword list and the response counts as correct when it
 * contains any keyword (case-insensitive). See lib/blocks/scoring.ts.
 */

const TRUE_FALSE_OPTIONS = ["True", "False"];

/** Options to display, or an empty list for free-text questions. */
function optionsOf(question: QuizQuestion): string[] {
  if (question.kind === "short") {
    return [];
  }
  return question.options ?? TRUE_FALSE_OPTIONS;
}

export function QuizBlock({
  block,
  completed,
  context,
  onComplete,
}: BlockRenderProps<QuizBlockData>) {
  const { questions, passScore } = block.payload;

  const [index, setIndex] = useState(0);
  const [responses, setResponses] = useState<QuizResponses>({});
  const [revealed, setRevealed] = useState<string[]>([]);

  const question = questions[index];
  const isLastQuestion = index === questions.length - 1;
  const isRevealed = revealed.includes(question.id);
  const allRevealed = revealed.length === questions.length;

  const result = useMemo(
    () => gradeQuiz(questions, responses, passScore),
    [questions, responses, passScore],
  );

  const currentResponse = responses[question.id];
  const isCorrect = gradeQuestion(question, currentResponse);

  function setResponse(questionId: string, response: QuizResponse): void {
    setResponses((previous) => ({ ...previous, [questionId]: response }));
  }

  function toggleChoice(optionIndex: number): void {
    if (question.kind === "multi") {
      const previous =
        currentResponse?.kind === "choice" ? currentResponse.choices : [];
      const next = previous.includes(optionIndex)
        ? previous.filter((value) => value !== optionIndex)
        : [...previous, optionIndex];

      setResponse(question.id, { kind: "choice", choices: next });
      return;
    }

    setResponse(question.id, { kind: "choice", choices: [optionIndex] });
  }

  /**
   * Remembers which questions the learner got wrong on this attempt.
   *
   * "Explain for me" (P4.4) reads the newest QUIZ_ATTEMPT event back, so the
   * explanation can quote the learner's own mistakes instead of the block in
   * general. Recorded when the last question is checked, whether or not the
   * learner reaches the pass mark.
   */
  function recordAttempt(): void {
    const wrongQuestionIds = questions
      .filter((entry) => !gradeQuestion(entry, responses[entry.id]))
      .map((entry) => entry.id);

    void trackBlockEvent(context.lessonId, block.id, "QUIZ_ATTEMPT", {
      wrongQuestionIds,
      score: gradeQuiz(questions, responses, passScore).score,
    });
  }

  function checkAnswer(): void {
    if (!revealed.includes(question.id)) {
      setRevealed((previous) => [...previous, question.id]);
    }

    if (isLastQuestion) {
      recordAttempt();
    }
  }

  function tryAgain(): void {
    setResponses({});
    setRevealed([]);
    setIndex(0);
  }

  const options = optionsOf(question);
  const canCheck =
    !isRevealed
    && currentResponse !== undefined
    && (currentResponse.kind !== "text" || currentResponse.text.trim().length > 0);

  return (
    <div className="space-y-5">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Question {index + 1} of {questions.length}
      </p>

      <div>
        <p className="text-sm font-medium">{question.prompt}</p>

        {question.kind === "short" ? (
          <Input
            className="mt-3"
            disabled={isRevealed}
            onChange={(event) => {
              setResponse(question.id, { kind: "text", text: event.target.value });
            }}
            placeholder="Type your answer"
            value={currentResponse?.kind === "text" ? currentResponse.text : ""}
          />
        ) : (
          <div className="mt-3 space-y-2">
            {options.map((option, optionIndex) => (
              <label
                className="flex items-start gap-3 rounded-lg border border-border px-3 py-2 text-sm transition-colors has-[:checked]:border-primary has-[:checked]:bg-accent"
                key={option}
              >
                <input
                  checked={
                    currentResponse?.kind === "choice"
                    && currentResponse.choices.includes(optionIndex)
                  }
                  className="mt-0.5 size-4 accent-primary"
                  disabled={isRevealed}
                  name={question.id}
                  onChange={() => {
                    toggleChoice(optionIndex);
                  }}
                  type={question.kind === "multi" ? "checkbox" : "radio"}
                />
                <span>{option}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      {isRevealed ? (
        <div
          className={
            isCorrect
              ? "rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm"
              : "rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm"
          }
        >
          <p className="flex items-center gap-1.5 font-medium">
            {isCorrect ? (
              <>
                <Check aria-hidden="true" className="size-4 text-emerald-600" />
                Correct
              </>
            ) : (
              <>
                <X aria-hidden="true" className="size-4 text-red-600" />
                Not quite
              </>
            )}
          </p>
          <p className="mt-1 text-muted-foreground">{question.explanation}</p>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {isRevealed ? (
          <Button
            disabled={isLastQuestion}
            onClick={() => {
              setIndex(index + 1);
            }}
            variant="secondary"
          >
            Next question
          </Button>
        ) : (
          <Button disabled={!canCheck} onClick={checkAnswer}>
            Check answer
          </Button>
        )}

        {index > 0 ? (
          <Button
            onClick={() => {
              setIndex(index - 1);
            }}
            variant="ghost"
          >
            Previous
          </Button>
        ) : null}
      </div>

      {allRevealed ? (
        <div className="rounded-lg border bg-muted/40 px-3 py-3">
          <p className="text-sm font-medium">
            Score: {result.correct} / {result.total} (
            {Math.round(result.score * 100)}%)
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {result.passed
              ? `You reached the pass mark of ${Math.round(passScore * 100)}%.`
              : `You need ${Math.round(passScore * 100)}% to pass. Review the explanations and try again.`}
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              disabled={!result.passed || completed}
              onClick={() => {
                onComplete(block.id, result.score);
              }}
            >
              {completed ? (
                <>
                  <Check aria-hidden="true" />
                  Completed
                </>
              ) : (
                "Mark complete"
              )}
            </Button>
            <Button onClick={tryAgain} variant="outline">
              <RotateCcw aria-hidden="true" />
              Try again
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
