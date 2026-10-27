"use client";

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";
import {
  generateCourseOutline,
  generateLessonBlocks,
  saveCourseDraft,
} from "@/server/teach";
import { CourseBasicsForm } from "./course-basics-form";
import { CoursePreview } from "./course-preview";
import { LessonBuilder } from "./lesson-builder";
import { OutlineEditor } from "./outline-editor";
import {
  INITIAL_FORM,
  flattenWizardLessons,
  toDraftModules,
  toWizardOutline,
  type CourseFormValues,
  type FlattenedLesson,
  type LessonJob,
  type WizardOutline,
} from "./wizard-types";

/**
 * Four-step AI course wizard for instructors (P4.6).
 *
 * The whole draft lives in this component's state: the outline, every generated
 * lesson, and the brief it came from. Steps only move forward when their work
 * is complete, and a failed request never destroys what is already on screen —
 * which is what lets an instructor retry a single lesson instead of starting
 * over.
 *
 * Only the final "Save as draft" touches the database; every LLM call in
 * between is audited automatically by `generateJson` (GenerationJob).
 */

const STEPS = [
  { id: 1, labelKey: "wizard.steps.basics" },
  { id: 2, labelKey: "wizard.steps.outline" },
  { id: 3, labelKey: "wizard.steps.lessons" },
  { id: 4, labelKey: "wizard.steps.review" },
] as const;

type Step = (typeof STEPS)[number]["id"];

export function CourseWizard({ mockMode }: { mockMode: boolean }) {
  const t = useT();
  const router = useRouter();

  const [step, setStep] = useState<Step>(1);
  const [form, setForm] = useState<CourseFormValues>(INITIAL_FORM);
  const [outline, setOutline] = useState<WizardOutline | null>(null);
  const [jobs, setJobs] = useState<Record<string, LessonJob>>({});

  const [isGeneratingOutline, setIsGeneratingOutline] = useState(false);
  const [outlineError, setOutlineError] = useState<string | null>(null);
  const [isBatchRunning, setIsBatchRunning] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function buildOutline(extraNotes: string): Promise<void> {
    setIsGeneratingOutline(true);
    setOutlineError(null);

    const notes = [form.notes.trim(), extraNotes.trim()]
      .filter((part) => part.length > 0)
      .join("\n");

    try {
      const result = await generateCourseOutline({ ...form, notes });

      if (!result.ok) {
        setOutlineError(result.error);
        return;
      }

      setOutline(toWizardOutline(result.outline));
      setJobs({});
      setSaveError(null);
      setStep(2);
    } catch (cause: unknown) {
      // Only transport failures reach here; the action reports its own errors
      // as `{ ok: false }`. Keep the brief on screen so a retry is one click.
      console.error("[teach] outline request failed", cause);
      setOutlineError(t("wizard.outlineFailed"));
    } finally {
      setIsGeneratingOutline(false);
    }
  }

  function buildLesson(item: FlattenedLesson): Promise<void> {
    if (outline === null) {
      return Promise.resolve();
    }

    const key = item.lesson.key;

    setJobs((previous) => ({
      ...previous,
      [key]: {
        status: "running",
        error: null,
        lesson: previous[key]?.lesson ?? null,
      },
    }));

    return generateLessonBlocks({
      courseTitle: outline.title,
      courseDescription: outline.description,
      topic: form.topic,
      audience: form.audience,
      difficulty: form.difficulty,
      notes: form.notes,
      moduleTitle: item.moduleTitle,
      lessonTitle: item.lesson.title,
      lessonSummary: item.lesson.summary,
      suggestedBlocks: item.lesson.suggestedBlocks,
      lessonNumber: item.index + 1,
      lessonCount: flattenWizardLessons(outline).length,
    })
      .then((result) => {
        setJobs((previous) => ({
          ...previous,
          [key]: result.ok
            ? { status: "done", error: null, lesson: result.lesson }
            : {
                status: "error",
                error: result.error,
                lesson: previous[key]?.lesson ?? null,
              },
        }));
      })
      .catch((cause: unknown) => {
        console.error("[teach] lesson request failed", cause);
        setJobs((previous) => ({
          ...previous,
          [key]: {
            status: "error",
            error: t("wizard.lessonFailed"),
            lesson: previous[key]?.lesson ?? null,
          },
        }));
      });
  }

  function handleGenerate(lessonKey: string): void {
    if (outline === null) {
      return;
    }

    const item = flattenWizardLessons(outline).find(
      (candidate) => candidate.lesson.key === lessonKey,
    );

    if (item !== undefined) {
      void buildLesson(item);
    }
  }

  async function handleGenerateAll(): Promise<void> {
    if (outline === null || isBatchRunning) {
      return;
    }

    setIsBatchRunning(true);

    try {
      for (const item of flattenWizardLessons(outline)) {
        if (jobs[item.lesson.key]?.lesson != null) {
          continue;
        }
        await buildLesson(item);
      }
    } finally {
      setIsBatchRunning(false);
    }
  }

  async function handleSave(): Promise<void> {
    if (outline === null) {
      return;
    }

    const modules = toDraftModules(outline, jobs);
    if (modules === null) {
      setSaveError(t("wizard.generateAllFirst"));
      return;
    }

    setIsSaving(true);
    setSaveError(null);

    try {
      const result = await saveCourseDraft({
        title: outline.title,
        description: outline.description,
        topic: form.topic,
        audience: form.audience,
        difficulty: form.difficulty,
        modules,
      });

      if (!result.ok) {
        setSaveError(result.error);
        return;
      }

      router.push(`/teach?created=${encodeURIComponent(result.title)}`);
    } catch (cause: unknown) {
      console.error("[teach] save request failed", cause);
      setSaveError(t("wizard.saveFailed"));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-primary">
            {t("wizard.eyebrow")}
          </p>
          {mockMode ? (
            <Badge variant="outline">{t("wizard.mockBadge")}</Badge>
          ) : null}
        </div>
        <h1 className="text-2xl font-semibold">{t("wizard.title")}</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          {t("wizard.subtitle")}
        </p>
      </header>

      <ol
        aria-label={t("wizard.stepsAria")}
        className="flex flex-wrap items-center gap-2 text-xs"
      >
        {STEPS.map((entry) => {
          const isCurrent = entry.id === step;
          const isDone = entry.id < step;

          return (
            <li className="flex items-center gap-2" key={entry.id}>
              <span
                className={cn(
                  "flex size-5 items-center justify-center rounded-full text-[11px] font-medium",
                  isCurrent ? "bg-primary text-primary-foreground" : "",
                  isDone ? "bg-emerald-500/15 text-emerald-700" : "",
                  !isCurrent && !isDone ? "bg-muted text-muted-foreground" : "",
                )}
              >
                {isDone ? <Check aria-hidden="true" className="size-3" /> : entry.id}
              </span>
              <span className={isCurrent ? "font-medium" : "text-muted-foreground"}>
                {t(entry.labelKey)}
              </span>
              {entry.id === STEPS.length ? null : (
                <span aria-hidden="true" className="text-muted-foreground/40">
                  /
                </span>
              )}
            </li>
          );
        })}
      </ol>

      {step === 1 ? (
        <CourseBasicsForm
          error={outlineError}
          isGenerating={isGeneratingOutline}
          onChange={setForm}
          onSubmit={() => {
            void buildOutline("");
          }}
          value={form}
        />
      ) : null}

      {step === 2 && outline !== null ? (
        <OutlineEditor
          error={outlineError}
          isRegenerating={isGeneratingOutline}
          onBack={() => {
            setOutlineError(null);
            setStep(1);
          }}
          onChange={setOutline}
          onContinue={() => {
            setOutlineError(null);
            setStep(3);
          }}
          onRegenerate={(extraNotes) => {
            void buildOutline(extraNotes);
          }}
          outline={outline}
        />
      ) : null}

      {step === 3 && outline !== null ? (
        <LessonBuilder
          isBatchRunning={isBatchRunning}
          jobs={jobs}
          onBack={() => {
            setStep(2);
          }}
          onContinue={() => {
            setSaveError(null);
            setStep(4);
          }}
          onGenerate={handleGenerate}
          onGenerateAll={() => {
            void handleGenerateAll();
          }}
          outline={outline}
        />
      ) : null}

      {step === 4 && outline !== null ? (
        <CoursePreview
          audience={form.audience}
          difficulty={form.difficulty}
          error={saveError}
          isSaving={isSaving}
          jobs={jobs}
          onBack={() => {
            setSaveError(null);
            setStep(3);
          }}
          onSave={() => {
            void handleSave();
          }}
          outline={outline}
        />
      ) : null}
    </div>
  );
}
