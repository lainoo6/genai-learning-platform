"use client";

import { Loader2, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  AUDIENCES,
  AUTHORING_DIFFICULTIES,
  LESSON_COUNT_MAX,
  LESSON_COUNT_MIN,
  type Audience,
  type AuthoringDifficulty,
} from "@/lib/llm/prompts/outline";
import type { CourseFormValues } from "./wizard-types";

/**
 * Step 1 of the course wizard: the brief.
 *
 * Everything the outline prompt needs is collected here — topic, audience,
 * difficulty, length and free-text requirements — so the generator never has
 * to invent context the instructor cares about.
 */

const SELECT_CLASS =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50";

const DIFFICULTY_LABELS: Record<AuthoringDifficulty, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

const LESSON_COUNTS = Array.from(
  { length: LESSON_COUNT_MAX - LESSON_COUNT_MIN + 1 },
  (_, offset) => LESSON_COUNT_MIN + offset,
);

export type CourseBasicsFormProps = {
  value: CourseFormValues;
  onChange: (next: CourseFormValues) => void;
  onSubmit: () => void;
  isGenerating: boolean;
  error: string | null;
};

export function CourseBasicsForm(props: CourseBasicsFormProps) {
  const { value, onChange, onSubmit, isGenerating, error } = props;

  function patch(changes: Partial<CourseFormValues>): void {
    onChange({ ...value, ...changes });
  }

  const canSubmit = value.topic.trim().length >= 3 && !isGenerating;

  return (
    <section className="space-y-5 rounded-xl ring-1 ring-foreground/10">
      <div className="space-y-4 px-4 py-5 sm:px-5">
        <div className="space-y-1.5">
          <label className="text-sm font-medium" htmlFor="wizard-topic">
            What is the course about?
          </label>
          <Input
            disabled={isGenerating}
            id="wizard-topic"
            maxLength={120}
            onChange={(event) => {
              patch({ topic: event.target.value });
            }}
            placeholder="Introduction to Git for beginners"
            value={value.topic}
          />
          <p className="text-xs text-muted-foreground">
            A topic and a level is enough. The outline is planned first, and you
            edit it before any lesson is written.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="wizard-audience">
              Audience
            </label>
            <select
              className={SELECT_CLASS}
              disabled={isGenerating}
              id="wizard-audience"
              onChange={(event) => {
                patch({ audience: event.target.value as Audience });
              }}
              value={value.audience}
            >
              {AUDIENCES.map((audience) => (
                <option key={audience} value={audience}>
                  {audience}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="wizard-difficulty">
              Difficulty
            </label>
            <select
              className={SELECT_CLASS}
              disabled={isGenerating}
              id="wizard-difficulty"
              onChange={(event) => {
                patch({ difficulty: event.target.value as AuthoringDifficulty });
              }}
              value={value.difficulty}
            >
              {AUTHORING_DIFFICULTIES.map((difficulty) => (
                <option key={difficulty} value={difficulty}>
                  {DIFFICULTY_LABELS[difficulty]}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="wizard-lessons">
              Lessons
            </label>
            <select
              className={SELECT_CLASS}
              disabled={isGenerating}
              id="wizard-lessons"
              onChange={(event) => {
                patch({ lessonCount: Number.parseInt(event.target.value, 10) });
              }}
              value={value.lessonCount}
            >
              {LESSON_COUNTS.map((count) => (
                <option key={count} value={count}>
                  {count} lessons
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium" htmlFor="wizard-notes">
            Anything specific?{" "}
            <span className="font-normal text-muted-foreground">(optional)</span>
          </label>
          <Textarea
            disabled={isGenerating}
            id="wizard-notes"
            maxLength={800}
            onChange={(event) => {
              patch({ notes: event.target.value });
            }}
            placeholder="Use short paragraphs, assume the reader has never used a terminal, and include one exercise per lesson."
            rows={3}
            value={value.notes}
          />
        </div>

        {error === null ? null : (
          <p
            aria-live="polite"
            className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-700"
          >
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button
            disabled={!canSubmit}
            onClick={() => {
              onSubmit();
            }}
          >
            {isGenerating ? (
              <>
                <Loader2 aria-hidden="true" className="animate-spin" />
                Planning the outline…
              </>
            ) : (
              <>
                <Sparkles aria-hidden="true" />
                Generate outline
              </>
            )}
          </Button>
          <p className="text-xs text-muted-foreground">
            Nothing is saved until you review the lessons and press “Save as
            draft”.
          </p>
        </div>
      </div>
    </section>
  );
}
