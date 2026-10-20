"use client";

import { Check, RotateCcw, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/i18n/client";
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

const TRUE_FALSE_KEYS = ["block.quiz.true", "block.quiz.false"];

/** Options to display, or an empty list for free-text questions. */
function optionsOf(
  question: QuizQuestion,
  t: (key: string) => string,
): string[] {
  if (question.kind === "short") {
    return [];
  }
  return question.options ?? TRUE_FALSE_KEYS.map((key) => t(key));
}

export function QuizBlock({
  block,
  completed,
  onAttempt,
  onComplete,
}: BlockRenderProps<QuizBlockData>) {
  const t = useT();
  const { questions, passScore } = block.payload;

  const savedAttemptRef = useRef(false);
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
    if (savedAttemptRef.current) return;
    savedAttemptRef.current = true;
    onAttempt?.({ answer: { responses } });
  }

  function checkAnswer(): void {
    if (!revealed.includes(question.id)) {
      setRevealed((previous) => [...previous, question.id]);
    }

    if (
      !isRevealed &&
      new Set([...revealed, question.id]).size === questions.length
    ) {
      recordAttempt();
    }
  }

  function tryAgain(): void {
    savedAttemptRef.current = false;
    setResponses({});
    setRevealed([]);
    setIndex(0);
  }

  const options = optionsOf(question, t);
  const canCheck =
    !isRevealed &&
    currentResponse !== undefined &&
    (currentResponse.kind !== "text" || currentResponse.text.trim().length > 0);

  return (
    <div className="space-y-5">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {t("block.quiz.question", {
          current: index + 1,
          total: questions.length,
        })}
      </p>

      <div>
        <p className="text-sm font-medium">{question.prompt}</p>

        {question.kind === "short" ? (
          <Input
            className="mt-3"
            disabled={isRevealed}
            onChange={(event) => {
              setResponse(question.id, {
                kind: "text",
                text: event.target.value,
              });
            }}
            placeholder={t("block.quiz.placeholder")}
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
                    currentResponse?.kind === "choice" &&
                    currentResponse.choices.includes(optionIndex)
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
                {t("block.quiz.correct")}
              </>
            ) : (
              <>
                <X aria-hidden="true" className="size-4 text-red-600" />
                {t("block.quiz.incorrect")}
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
            {t("block.quiz.next")}
          </Button>
        ) : (
          <Button disabled={!canCheck} onClick={checkAnswer}>
            {t("block.quiz.check")}
          </Button>
        )}

        {index > 0 ? (
          <Button
            onClick={() => {
              setIndex(index - 1);
            }}
            variant="ghost"
          >
            {t("block.quiz.previous")}
          </Button>
        ) : null}
      </div>

      {allRevealed ? (
        <div className="rounded-lg border bg-muted/40 px-3 py-3">
          <p className="text-sm font-medium">
            {t("block.quiz.score", {
              correct: result.correct,
              total: result.total,
              percent: Math.round(result.score * 100),
            })}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {result.passed
              ? t("block.quiz.passed", { percent: Math.round(passScore * 100) })
              : t("block.quiz.failed", {
                  percent: Math.round(passScore * 100),
                })}
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
                  {t("common.completed")}
                </>
              ) : (
                t("common.markComplete")
              )}
            </Button>
            <Button onClick={tryAgain} variant="outline">
              <RotateCcw aria-hidden="true" />
              {t("block.quiz.tryAgain")}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
