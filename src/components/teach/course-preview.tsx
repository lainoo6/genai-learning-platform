"use client";

import { ArrowLeft, Check, Clock, Save } from "lucide-react";
import { type ComponentType, useState } from "react";

import { blockRegistry } from "@/components/blocks/registry";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Block, BlockRenderProps } from "@/lib/blocks/schema";
import type {
  Audience,
  AuthoringDifficulty,
} from "@/lib/llm/prompts/outline";
import {
  countWizardLessons,
  flattenWizardLessons,
  totalWizardMinutes,
  type LessonJob,
  type WizardOutline,
} from "./wizard-types";

/**
 * Step 4 of the course wizard: read the course the way a learner will.
 *
 * The blocks are the real components from the player registry — a reading looks
 * like a reading, a quiz can be answered, a game can be played. Only completion
 * is stubbed out: nothing here is persisted, because the course does not exist
 * in the database until "Save as draft" succeeds.
 */

export type CoursePreviewProps = {
  outline: WizardOutline;
  jobs: Record<string, LessonJob>;
  audience: Audience;
  difficulty: AuthoringDifficulty;
  isSaving: boolean;
  error: string | null;
  onBack: () => void;
  onSave: () => void;
};

function capitalise(value: string): string {
  return value.length === 0 ? value : value[0].toUpperCase() + value.slice(1);
}

function PreviewBlock({ block, lessonId }: { block: Block; lessonId: string }) {
  const Component = blockRegistry[block.type] as unknown as ComponentType<
    BlockRenderProps<Block>
  >;

  return (
    <section className="rounded-xl ring-1 ring-foreground/10">
      <header className="flex items-center gap-2 border-b px-4 py-3">
        <h4 className="text-sm font-medium">{block.title}</h4>
        <Badge variant="secondary">{block.type}</Badge>
      </header>
      <div className="px-4 py-4">
        <Component
          block={block}
          completed={false}
          context={{ courseId: "preview-course", lessonId }}
          onComplete={() => {
            // Preview only: completion is not recorded until the course exists.
          }}
        />
      </div>
    </section>
  );
}

export function CoursePreview(props: CoursePreviewProps) {
  const { outline, jobs, audience, difficulty, isSaving, error, onBack, onSave } =
    props;

  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const flattened = flattenWizardLessons(outline);
  const selected =
    flattened.find((item) => item.lesson.key === selectedKey) ?? flattened[0];
  const selectedJob = selected === undefined ? null : jobs[selected.lesson.key] ?? null;
  const totalMinutes = totalWizardMinutes(outline, jobs);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-lg font-medium">Review the course</h2>
          <p className="text-sm text-muted-foreground">
            Exactly what a learner will see. Pick a lesson on the left to read it.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{audience}</Badge>
          <Badge variant="outline">{capitalise(difficulty)}</Badge>
          <Badge variant="secondary">
            {countWizardLessons(outline)} lessons
          </Badge>
          <Badge variant="secondary">
            <Clock aria-hidden="true" />~{totalMinutes} min
          </Badge>
        </div>
      </div>

      <div className="space-y-2 border-b pb-4">
        <h3 className="text-xl font-semibold">{outline.title}</h3>
        <p className="max-w-2xl text-sm text-muted-foreground">
          {outline.description}
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <nav aria-label="Course outline" className="space-y-4">
          {outline.modules.map((courseModule, moduleIndex) => (
            <div className="space-y-1.5" key={courseModule.key}>
              <p className="text-xs font-medium text-muted-foreground">
                Module {moduleIndex + 1} · {courseModule.title}
              </p>
              <ul className="space-y-1">
                {courseModule.lessons.map((lesson) => {
                  const isSelected = selected?.lesson.key === lesson.key;
                  const isReady = jobs[lesson.key]?.lesson != null;

                  return (
                    <li key={lesson.key}>
                      <button
                        aria-current={isSelected ? "true" : undefined}
                        className={
                          isSelected
                            ? "flex w-full items-start gap-1.5 rounded-lg bg-primary/10 px-2 py-1.5 text-left text-xs font-medium text-primary"
                            : "flex w-full items-start gap-1.5 rounded-lg px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                        }
                        onClick={() => {
                          setSelectedKey(lesson.key);
                        }}
                        type="button"
                      >
                        {isReady ? (
                          <Check aria-hidden="true" className="mt-0.5 size-3 shrink-0" />
                        ) : (
                          <span className="mt-0.5 size-3 shrink-0 rounded-full border" />
                        )}
                        <span className="min-w-0">{lesson.title}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="min-w-0 space-y-4">
          {selected === undefined || selectedJob?.lesson == null ? (
            <p className="rounded-xl px-4 py-8 text-sm text-muted-foreground ring-1 ring-foreground/10">
              This lesson has not been written yet. Go back and generate it.
            </p>
          ) : (
            <>
              <header className="space-y-2 border-b pb-4">
                <p className="text-xs text-muted-foreground">
                  {selected.moduleTitle} · lesson {selected.index + 1} of{" "}
                  {flattened.length}
                </p>
                <h3 className="text-xl font-semibold">
                  {selectedJob.lesson.title}
                </h3>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">
                    {selectedJob.lesson.estimatedMinutes} min
                  </Badge>
                  <Badge variant="outline">
                    {selectedJob.lesson.blocks.length} blocks
                  </Badge>
                </div>
              </header>

              <div className="space-y-4">
                {selectedJob.lesson.blocks.map((block) => (
                  <PreviewBlock
                    block={block}
                    key={block.id}
                    lessonId={`preview-${selected.lesson.key}`}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {error === null ? null : (
        <p
          aria-live="polite"
          className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-700"
        >
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <Button disabled={isSaving} onClick={onBack} variant="outline">
          <ArrowLeft aria-hidden="true" />
          Back to lessons
        </Button>

        <div className="flex flex-wrap items-center gap-3">
          <p className="text-xs text-muted-foreground">
            Saved as a draft owned by you. The full editor arrives in P5.1.
          </p>
          <Button
            disabled={isSaving}
            onClick={() => {
              onSave();
            }}
          >
            <Save aria-hidden="true" />
            {isSaving ? "Saving…" : "Save as draft"}
          </Button>
        </div>
      </div>
    </div>
  );
}
