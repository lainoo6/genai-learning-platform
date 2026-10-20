"use client";

import {
  ChevronDown,
  ChevronRight,
  CircleCheck,
  Eye,
  ExternalLink,
  Loader2,
  Save,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { ZodError } from "zod";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Block, BlockType } from "@/lib/blocks/schema";
import {
  AUDIENCE_SUGGESTIONS,
  AUDIENCE_SUGGESTIONS_ZH,
  EDITOR_DIFFICULTIES,
  EDITOR_DIFFICULTY_KEYS,
  EDITOR_STATUSES,
  EDITOR_STATUS_KEYS,
  editorCourseSchema,
  type EditorCourse,
  type EditorCourseInput,
  type EditorDifficulty,
  type EditorLesson,
  type EditorModule,
} from "@/lib/teach-editor";
import { cn } from "@/lib/utils";
import type { SaveCourseResult } from "@/server/editor";
import { postJson } from "@/lib/post-json";
import { BlockEditorPanel } from "./block-editor-panel";
import { BlockListPanel } from "./block-list-panel";
import { useI18n } from "@/i18n/client";
import { createBlock } from "./block-templates";
import { StructurePanel } from "./structure-panel";

/**
 * Three-column course editor (P5.1).
 *
 *   left   — modules and lessons, with ordering and deletion
 *   middle — the blocks of the selected lesson
 *   right  — the form of the selected block
 *
 * The whole course is one draft in this component's state. Nothing is written
 * until "Save changes": that is what makes a delete or a reorder reversible,
 * and it is also why validation runs over the entire course here before the
 * server action is called. The action repeats the same validation, because a
 * server action is a public endpoint.
 */

type IssueMap = {
  course: string[];
  modules: Record<string, string[]>;
  lessons: Record<string, string[]>;
  blocks: Record<string, string[]>;
};

type PendingDelete = {
  kind: "module" | "lesson";
  id: string;
  label: string;
};

type SaveState = "idle" | "saving" | "saved" | "error";

function emptyIssues(): IssueMap {
  return { course: [], modules: {}, lessons: {}, blocks: {} };
}

function countIssues(issues: IssueMap): number {
  const sum = (map: Record<string, string[]>): number =>
    Object.values(map).reduce((total, list) => total + list.length, 0);

  return (
    issues.course.length +
    sum(issues.modules) +
    sum(issues.lessons) +
    sum(issues.blocks)
  );
}

function findLesson(
  course: EditorCourse,
  lessonId: string | null,
): EditorLesson | null {
  if (lessonId === null) {
    return null;
  }

  for (const courseModule of course.modules) {
    const lesson = courseModule.lessons.find((entry) => entry.id === lessonId);
    if (lesson !== undefined) {
      return lesson;
    }
  }

  return null;
}

function findBlock(course: EditorCourse, blockId: string): Block | null {
  for (const courseModule of course.modules) {
    for (const lesson of courseModule.lessons) {
      const block = lesson.blocks.find((entry) => entry.id === blockId);
      if (block !== undefined) {
        return block;
      }
    }
  }

  return null;
}

function findBlockLocation(
  course: EditorCourse,
  blockId: string,
): { lesson: EditorLesson; index: number } | null {
  for (const courseModule of course.modules) {
    for (const lesson of courseModule.lessons) {
      const index = lesson.blocks.findIndex((entry) => entry.id === blockId);
      if (index >= 0) {
        return { lesson, index };
      }
    }
  }

  return null;
}

function swap<T>(items: T[], index: number, delta: number): T[] {
  const target = index + delta;
  if (target < 0 || target >= items.length) {
    return items;
  }

  const next = [...items];
  const moved = next[index];
  const displaced = next[target];
  if (moved === undefined || displaced === undefined) {
    return items;
  }

  next[index] = displaced;
  next[target] = moved;
  return next;
}

function updateLesson(
  course: EditorCourse,
  lessonId: string,
  updater: (lesson: EditorLesson) => EditorLesson,
): EditorCourse {
  return {
    ...course,
    modules: course.modules.map((courseModule) => ({
      ...courseModule,
      lessons: courseModule.lessons.map((lesson) =>
        lesson.id === lessonId ? updater(lesson) : lesson,
      ),
    })),
  };
}

function replaceBlock(course: EditorCourse, next: Block): EditorCourse {
  return {
    ...course,
    modules: course.modules.map((courseModule) => ({
      ...courseModule,
      lessons: courseModule.lessons.map((lesson) =>
        lesson.blocks.some((block) => block.id === next.id)
          ? {
              ...lesson,
              blocks: lesson.blocks.map((block) =>
                block.id === next.id ? next : block,
              ),
            }
          : lesson,
      ),
    })),
  };
}

function removeBlock(course: EditorCourse, blockId: string): EditorCourse {
  return {
    ...course,
    modules: course.modules.map((courseModule) => ({
      ...courseModule,
      lessons: courseModule.lessons.map((lesson) =>
        lesson.blocks.some((block) => block.id === blockId)
          ? {
              ...lesson,
              blocks: lesson.blocks.filter((block) => block.id !== blockId),
            }
          : lesson,
      ),
    })),
  };
}

/**
 * Turns zod issues into messages attached to the thing that caused them.
 *
 * The schema is validated against a payload built from this exact draft, so a
 * path like `modules[1].lessons[0].blocks[2].payload.markdown` can be resolved
 * back to the ids the panels render — that is what makes a failing block turn
 * red instead of producing one opaque banner.
 */
function mapIssues(error: ZodError, course: EditorCourse): IssueMap {
  const issues = emptyIssues();

  for (const issue of error.issues) {
    const path = issue.path;
    const format = (segments: PropertyKey[]): string => {
      const field = segments.map((segment) => String(segment)).join(".");
      return field.length === 0 ? issue.message : `${field} — ${issue.message}`;
    };

    if (path[0] !== "modules" || typeof path[1] !== "number") {
      issues.course.push(format(path));
      continue;
    }

    const courseModule = course.modules[path[1]];
    if (courseModule === undefined) {
      issues.course.push(format(path));
      continue;
    }

    if (path[2] !== "lessons" || typeof path[3] !== "number") {
      issues.modules[courseModule.id] = [
        ...(issues.modules[courseModule.id] ?? []),
        format(path.slice(2)),
      ];
      continue;
    }

    const lesson = courseModule.lessons[path[3]];
    if (lesson === undefined) {
      issues.course.push(format(path));
      continue;
    }

    if (path[4] !== "blocks" || typeof path[5] !== "number") {
      issues.lessons[lesson.id] = [
        ...(issues.lessons[lesson.id] ?? []),
        format(path.slice(4)),
      ];
      continue;
    }

    const block = lesson.blocks[path[5]];
    if (block === undefined) {
      issues.course.push(format(path));
      continue;
    }

    issues.blocks[block.id] = [
      ...(issues.blocks[block.id] ?? []),
      format(path.slice(6)),
    ];
  }

  return issues;
}

/** The payload the server action expects, built from the draft. */
function toCourseInput(course: EditorCourse): EditorCourseInput {
  return {
    title: course.title,
    description: course.description,
    audience: course.audience,
    // The select only offers the three known values; a legacy value outside
    // the enum is rejected by the schema with a readable message.
    difficulty: course.difficulty as EditorDifficulty,
    coverEmoji: course.coverEmoji,
    status: course.status,
    modules: course.modules.map((courseModule) => ({
      id: courseModule.id,
      title: courseModule.title,
      lessons: courseModule.lessons.map((lesson) => ({
        id: lesson.id,
        title: lesson.title,
        estimatedMinutes: lesson.estimatedMinutes,
        blocks: lesson.blocks,
      })),
    })),
  };
}

function SettingsField({
  label,
  hint,
  className,
  children,
}: {
  label: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={cn("block space-y-1.5", className)}>
      <span className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium">{label}</span>
        {hint === undefined ? null : (
          <span className="text-[11px] font-normal text-muted-foreground">
            {hint}
          </span>
        )}
      </span>
      {children}
    </label>
  );
}

const SELECT_CLASS =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function CourseEditor({ course }: { course: EditorCourse }) {
  const { locale, t } = useI18n();
  const [draft, setDraft] = useState<EditorCourse>(course);
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(
    course.modules[0]?.lessons[0]?.id ?? null,
  );
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [issues, setIssues] = useState<IssueMap>(emptyIssues);
  const [blockProblems, setBlockProblems] = useState<Record<string, string>>(
    {},
  );
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(true);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(
    null,
  );

  const selectedLesson = findLesson(draft, selectedLessonId);
  const selectedBlock =
    selectedLesson?.blocks.find((block) => block.id === selectedBlockId) ??
    null;
  const lessonCount = draft.modules.reduce(
    (total, courseModule) => total + courseModule.lessons.length,
    0,
  );
  const blockCount = draft.modules.reduce(
    (total, courseModule) =>
      total +
      courseModule.lessons.reduce(
        (lessonTotal, lesson) => lessonTotal + lesson.blocks.length,
        0,
      ),
    0,
  );

  /** Applies an edit: the draft changes, stale errors are cleared, nothing is saved. */
  function commit(updater: (previous: EditorCourse) => EditorCourse): void {
    setDraft(updater);
    setIsDirty(true);
    setSaveState("idle");
    setSaveError(null);
    setIssues(emptyIssues());
  }

  function setProblem(blockId: string, message: string | null): void {
    setBlockProblems((previous) => {
      if (message === null) {
        if (!(blockId in previous)) {
          return previous;
        }

        const next = { ...previous };
        delete next[blockId];
        return next;
      }

      return { ...previous, [blockId]: message };
    });
  }

  function selectBlock(blockId: string | null): void {
    // The invalid textarea of a simulation only exists while its form is
    // mounted; switching away drops that text, so the block is valid again.
    if (selectedBlockId !== null) {
      setProblem(selectedBlockId, null);
    }

    setSelectedBlockId(blockId);
  }

  function selectLesson(lessonId: string): void {
    selectBlock(null);
    setSelectedLessonId(lessonId);
  }

  function updateSettings(
    patch: Partial<
      Pick<
        EditorCourse,
        | "title"
        | "description"
        | "audience"
        | "difficulty"
        | "coverEmoji"
        | "status"
      >
    >,
  ): void {
    commit((previous) => ({ ...previous, ...patch }));
  }

  function addModule(): void {
    const moduleId = crypto.randomUUID();
    const lessonId = crypto.randomUUID();

    const courseModule: EditorModule = {
      id: moduleId,
      title: `Module ${draft.modules.length + 1}`,
      lessons: [
        {
          id: lessonId,
          title: "New lesson",
          estimatedMinutes: 10,
          blocks: [],
          droppedBlocks: 0,
        },
      ],
    };

    commit((previous) => ({
      ...previous,
      modules: [...previous.modules, courseModule],
    }));
    selectBlock(null);
    setSelectedLessonId(lessonId);
  }

  function deleteModule(moduleId: string): void {
    if (draft.modules.length <= 1) {
      return;
    }

    const removed = draft.modules.find(
      (courseModule) => courseModule.id === moduleId,
    );
    const remaining = draft.modules.filter(
      (courseModule) => courseModule.id !== moduleId,
    );

    commit((previous) => ({
      ...previous,
      modules: previous.modules.filter(
        (courseModule) => courseModule.id !== moduleId,
      ),
    }));

    const selectionRemoved =
      removed?.lessons.some((lesson) => lesson.id === selectedLessonId) ??
      false;

    if (selectionRemoved) {
      selectBlock(null);
      setSelectedLessonId(remaining[0]?.lessons[0]?.id ?? null);
    }
  }

  function moveModule(index: number, delta: number): void {
    commit((previous) => ({
      ...previous,
      modules: swap(previous.modules, index, delta),
    }));
  }

  function addLesson(moduleId: string): void {
    const lessonId = crypto.randomUUID();

    commit((previous) => ({
      ...previous,
      modules: previous.modules.map((courseModule) =>
        courseModule.id === moduleId
          ? {
              ...courseModule,
              lessons: [
                ...courseModule.lessons,
                {
                  id: lessonId,
                  title: "New lesson",
                  estimatedMinutes: 10,
                  blocks: [],
                  droppedBlocks: 0,
                },
              ],
            }
          : courseModule,
      ),
    }));

    selectBlock(null);
    setSelectedLessonId(lessonId);
  }

  function moveLesson(moduleId: string, index: number, delta: number): void {
    commit((previous) => ({
      ...previous,
      modules: previous.modules.map((courseModule) =>
        courseModule.id === moduleId
          ? {
              ...courseModule,
              lessons: swap(courseModule.lessons, index, delta),
            }
          : courseModule,
      ),
    }));
  }

  function deleteLesson(lessonId: string): void {
    const courseModule = draft.modules.find((entry) =>
      entry.lessons.some((lesson) => lesson.id === lessonId),
    );

    if (courseModule === undefined || courseModule.lessons.length <= 1) {
      return;
    }

    const index = courseModule.lessons.findIndex(
      (lesson) => lesson.id === lessonId,
    );
    const remaining = courseModule.lessons.filter(
      (lesson) => lesson.id !== lessonId,
    );

    commit((previous) => ({
      ...previous,
      modules: previous.modules.map((entry) =>
        entry.id === courseModule.id
          ? {
              ...entry,
              lessons: entry.lessons.filter((lesson) => lesson.id !== lessonId),
            }
          : entry,
      ),
    }));

    if (selectedLessonId === lessonId) {
      const nextLesson = remaining[Math.min(index, remaining.length - 1)];
      selectBlock(null);
      setSelectedLessonId(nextLesson?.id ?? null);
    }
  }

  function addBlock(type: BlockType): void {
    if (selectedLessonId === null) {
      return;
    }

    const block = createBlock(type, locale);

    commit((previous) =>
      updateLesson(previous, selectedLessonId, (lesson) => ({
        ...lesson,
        blocks: [...lesson.blocks, block],
      })),
    );
    setSelectedBlockId(block.id);
  }

  function duplicateBlock(blockId: string): void {
    const location = findBlockLocation(draft, blockId);
    if (location === null) {
      return;
    }

    const copy = structuredClone(location.lesson.blocks[location.index]);
    if (copy === undefined) {
      return;
    }

    copy.id = crypto.randomUUID();
    copy.title = `${copy.title} (copy)`;

    commit((previous) =>
      updateLesson(previous, location.lesson.id, (lesson) => {
        const index = lesson.blocks.findIndex((block) => block.id === blockId);
        if (index < 0) {
          return lesson;
        }

        return {
          ...lesson,
          blocks: [
            ...lesson.blocks.slice(0, index + 1),
            copy,
            ...lesson.blocks.slice(index + 1),
          ],
        };
      }),
    );
    setSelectedBlockId(copy.id);
  }

  function deleteBlock(blockId: string): void {
    const location = findBlockLocation(draft, blockId);
    if (location === null) {
      return;
    }

    const remaining = location.lesson.blocks.filter(
      (block) => block.id !== blockId,
    );

    commit((previous) => removeBlock(previous, blockId));
    setProblem(blockId, null);

    if (selectedBlockId === blockId) {
      const next = remaining[Math.min(location.index, remaining.length - 1)];
      setSelectedBlockId(next?.id ?? null);
    }
  }

  function moveBlock(lessonId: string, index: number, delta: number): void {
    commit((previous) =>
      updateLesson(previous, lessonId, (lesson) => ({
        ...lesson,
        blocks: swap(lesson.blocks, index, delta),
      })),
    );
  }

  function focusFirstIssue(mapped: IssueMap): void {
    for (const courseModule of draft.modules) {
      for (const lesson of courseModule.lessons) {
        if ((mapped.lessons[lesson.id]?.length ?? 0) > 0) {
          selectLesson(lesson.id);
          return;
        }

        const failing = lesson.blocks.find(
          (block) => (mapped.blocks[block.id]?.length ?? 0) > 0,
        );

        if (failing !== undefined) {
          setSelectedLessonId(lesson.id);
          setSelectedBlockId(failing.id);
          return;
        }
      }

      if ((mapped.modules[courseModule.id]?.length ?? 0) > 0) {
        selectLesson(courseModule.lessons[0]?.id ?? "");
        return;
      }
    }
  }

  async function handleSave(): Promise<void> {
    if (saveState === "saving") {
      return;
    }

    // A simulation textarea whose JSON does not parse never reached the block,
    // so the payload alone would look valid. Refuse before that matters.
    const liveProblems = Object.entries(blockProblems).filter(
      ([blockId]) => findBlock(draft, blockId) !== null,
    );

    if (liveProblems.length > 0) {
      const mapped = emptyIssues();
      for (const [blockId, message] of liveProblems) {
        mapped.blocks[blockId] = [message];
      }

      setIssues(mapped);
      setSaveState("error");
      setSaveError(
        "Nothing was saved. The highlighted block contains text that is not valid JSON.",
      );
      focusFirstIssue(mapped);
      return;
    }

    const parsed = editorCourseSchema.safeParse(toCourseInput(draft));

    if (!parsed.success) {
      const mapped = mapIssues(parsed.error, draft);
      const total = countIssues(mapped);

      setIssues(mapped);
      setSaveState("error");
      setSaveError(
        `Nothing was saved. Fix ${total} highlighted ${total === 1 ? "problem" : "problems"} and try again.`,
      );
      focusFirstIssue(mapped);
      return;
    }

    setSaveState("saving");
    setSaveError(null);

    try {
      const result = await postJson<SaveCourseResult>(
        `/api/teach/courses/${encodeURIComponent(draft.id)}`,
        parsed.data,
        {
          timeoutMs: 45_000,
          timeoutMessage: t("editor.course.saveTimeout"),
          failureMessage: t("editor.course.saveRequestFailed"),
        },
      );

      if (!result.ok) {
        setSaveError(result.error);
        setSaveState("error");
        return;
      }

      setDraft(result.course);
      setIssues(emptyIssues());
      setBlockProblems({});
      setIsDirty(false);
      setSaveState("saved");
    } catch (cause: unknown) {
      console.error("[editor] save request failed", cause);
      setSaveError(
        cause instanceof Error
          ? cause.message
          : t("editor.course.saveRequestFailed"),
      );
      setSaveState("error");
    }
  }

  function confirmDelete(): void {
    if (pendingDelete === null) {
      return;
    }

    if (pendingDelete.kind === "module") {
      deleteModule(pendingDelete.id);
    } else {
      deleteLesson(pendingDelete.id);
    }

    setPendingDelete(null);
  }

  const lessonIssues =
    selectedLesson === null ? [] : (issues.lessons[selectedLesson.id] ?? []);

  return (
    <div className="space-y-4">
      <header className="space-y-3">
        <nav
          aria-label={t("lesson.breadcrumb")}
          className="flex items-center gap-1 text-xs text-muted-foreground"
        >
          <Link className="hover:text-foreground" href="/teach">
            {t("nav.teach")}
          </Link>
          <ChevronRight aria-hidden="true" className="size-3" />
          <span className="truncate text-foreground">{draft.title}</span>
        </nav>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <h1 className="text-2xl font-semibold">
              {t("editor.course.edit")}
            </h1>
            <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge
                variant={draft.status === "PUBLISHED" ? "default" : "secondary"}
              >
                {t(EDITOR_STATUS_KEYS[draft.status])}
              </Badge>
              <span>
                {t("editor.course.modulesCount", {
                  count: draft.modules.length,
                })}
              </span>
              <span aria-hidden="true">·</span>
              <span>
                {t("editor.course.lessonsCount", { count: lessonCount })}
              </span>
              <span aria-hidden="true">·</span>
              <span>
                {t("editor.course.blocksCount", { count: blockCount })}
              </span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              className={cn(buttonVariants({ variant: "outline" }), "gap-1.5")}
              href={`/learn/${draft.id}?preview=1`}
              target="_blank"
            >
              <Eye aria-hidden="true" />
              {t("course.previewAsStudent")}
            </Link>

            {draft.status === "PUBLISHED" ? (
              <Link
                className={cn(
                  buttonVariants({ variant: "outline" }),
                  "gap-1.5",
                )}
                href={`/courses/${draft.slug}`}
                target="_blank"
              >
                <ExternalLink aria-hidden="true" />
                {t("editor.course.viewPublic")}
              </Link>
            ) : null}

            <Button
              disabled={saveState === "saving"}
              onClick={() => {
                void handleSave();
              }}
            >
              {saveState === "saving" ? (
                <>
                  <Loader2 aria-hidden="true" className="animate-spin" />
                  {t("editor.course.saving")}
                </>
              ) : (
                <>
                  <Save aria-hidden="true" />
                  {t("editor.course.save")}
                </>
              )}
            </Button>
          </div>
        </div>

        {saveError === null ? null : (
          <div
            aria-live="polite"
            className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-700"
          >
            <p className="flex items-start gap-1.5 font-medium">
              <TriangleAlert
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0"
              />
              {saveError}
            </p>
            {issues.course.length === 0 ? null : (
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs">
                {issues.course.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {saveState === "saved" && !isDirty ? (
          <p
            aria-live="polite"
            className="flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800"
          >
            <CircleCheck aria-hidden="true" className="size-4" />
            {t("editor.course.saved")}
            {draft.status === "PUBLISHED"
              ? t("editor.course.savedLive")
              : t("editor.course.savedHidden")}
          </p>
        ) : null}

        {isDirty && saveState !== "saving" ? (
          <p className="text-xs text-muted-foreground">
            {t("editor.course.unsaved")}
          </p>
        ) : null}
      </header>

      <section className="rounded-xl ring-1 ring-foreground/10">
        <button
          aria-expanded={settingsOpen}
          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
          onClick={() => {
            setSettingsOpen((open) => !open);
          }}
          type="button"
        >
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("editor.course.settings")}
          </span>
          <ChevronDown
            aria-hidden="true"
            className={cn(
              "size-4 text-muted-foreground transition-transform",
              settingsOpen ? "rotate-180" : "",
            )}
          />
        </button>

        {settingsOpen ? (
          <div className="grid gap-3 border-t px-3 py-3 sm:grid-cols-6">
            <SettingsField
              className="sm:col-span-5"
              label={t("editor.settings.title")}
            >
              <Input
                aria-label={t("editor.settings.titleAria")}
                maxLength={90}
                onChange={(event) => {
                  updateSettings({ title: event.target.value });
                }}
                value={draft.title}
              />
            </SettingsField>

            <SettingsField
              hint={t("editor.settings.coverHint")}
              label={t("editor.settings.cover")}
            >
              <Input
                aria-label={t("editor.settings.coverAria")}
                className="text-center text-lg"
                maxLength={4}
                onChange={(event) => {
                  updateSettings({ coverEmoji: event.target.value });
                }}
                value={draft.coverEmoji}
              />
            </SettingsField>

            <SettingsField
              className="sm:col-span-6"
              hint={t("editor.settings.descriptionHint")}
              label={t("editor.settings.description")}
            >
              <Textarea
                aria-label={t("editor.settings.descriptionAria")}
                maxLength={600}
                onChange={(event) => {
                  updateSettings({ description: event.target.value });
                }}
                rows={2}
                value={draft.description}
              />
            </SettingsField>

            <SettingsField
              className="sm:col-span-2"
              label={t("editor.settings.audience")}
            >
              <Input
                aria-label={t("editor.settings.audienceAria")}
                list="editor-audience-suggestions"
                maxLength={80}
                onChange={(event) => {
                  updateSettings({ audience: event.target.value });
                }}
                value={draft.audience}
              />
            </SettingsField>

            <SettingsField
              className="sm:col-span-2"
              label={t("editor.settings.difficulty")}
            >
              <select
                aria-label={t("editor.settings.difficultyAria")}
                className={SELECT_CLASS}
                onChange={(event) => {
                  updateSettings({ difficulty: event.target.value });
                }}
                value={draft.difficulty}
              >
                {EDITOR_DIFFICULTIES.map((difficulty) => (
                  <option key={difficulty} value={difficulty}>
                    {t(EDITOR_DIFFICULTY_KEYS[difficulty])}
                  </option>
                ))}
              </select>
            </SettingsField>

            <SettingsField
              className="sm:col-span-2"
              hint={t("editor.settings.statusHint")}
              label={t("editor.settings.status")}
            >
              <select
                aria-label={t("editor.settings.statusAria")}
                className={SELECT_CLASS}
                onChange={(event) => {
                  updateSettings({
                    status: event.target.value as EditorCourse["status"],
                  });
                }}
                value={draft.status}
              >
                {EDITOR_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {t(EDITOR_STATUS_KEYS[status])}
                  </option>
                ))}
              </select>
            </SettingsField>
          </div>
        ) : null}
      </section>

      <datalist id="editor-audience-suggestions">
        {(locale === "zh" ? AUDIENCE_SUGGESTIONS_ZH : AUDIENCE_SUGGESTIONS).map(
          (audience) => (
            <option key={audience} value={audience} />
          ),
        )}
      </datalist>

      <div className="grid gap-4 xl:grid-cols-[13rem_minmax(0,1fr)_22rem]">
        <StructurePanel
          course={draft}
          lessonIssues={issues.lessons}
          moduleIssues={issues.modules}
          onAddLesson={addLesson}
          onAddModule={addModule}
          onMoveLesson={moveLesson}
          onMoveModule={moveModule}
          onRenameModule={(moduleId, title) => {
            commit((previous) => ({
              ...previous,
              modules: previous.modules.map((courseModule) =>
                courseModule.id === moduleId
                  ? { ...courseModule, title }
                  : courseModule,
              ),
            }));
          }}
          onRequestDeleteLesson={(lessonId, title) => {
            setPendingDelete({ kind: "lesson", id: lessonId, label: title });
          }}
          onRequestDeleteModule={(moduleId, title) => {
            setPendingDelete({ kind: "module", id: moduleId, label: title });
          }}
          onSelectLesson={selectLesson}
          selectedLessonId={selectedLessonId}
        />

        <BlockListPanel
          blockIssues={issues.blocks}
          lesson={selectedLesson}
          lessonIssues={lessonIssues}
          onAddBlock={addBlock}
          onChangeMinutes={(minutes) => {
            if (selectedLessonId === null) {
              return;
            }

            commit((previous) =>
              updateLesson(previous, selectedLessonId, (lesson) => ({
                ...lesson,
                estimatedMinutes: minutes,
              })),
            );
          }}
          onDeleteBlock={deleteBlock}
          onDuplicateBlock={duplicateBlock}
          onMoveBlock={(index, delta) => {
            if (selectedLessonId === null) {
              return;
            }

            moveBlock(selectedLessonId, index, delta);
          }}
          onRenameLesson={(title) => {
            if (selectedLessonId === null) {
              return;
            }

            commit((previous) =>
              updateLesson(previous, selectedLessonId, (lesson) => ({
                ...lesson,
                title,
              })),
            );
          }}
          onSelectBlock={(blockId) => {
            selectBlock(blockId);
          }}
          selectedBlockId={selectedBlockId}
        />

        <BlockEditorPanel
          block={selectedBlock}
          errors={
            selectedBlock === null
              ? []
              : (issues.blocks[selectedBlock.id] ?? [])
          }
          onChange={(next) => {
            commit((previous) => replaceBlock(previous, next));
          }}
          onDelete={() => {
            if (selectedBlock !== null) {
              deleteBlock(selectedBlock.id);
            }
          }}
          onProblem={(message) => {
            if (selectedBlock !== null) {
              setProblem(selectedBlock.id, message);
            }
          }}
        />
      </div>

      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            setPendingDelete(null);
          }
        }}
        open={pendingDelete !== null}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {pendingDelete?.kind === "module"
                ? t("editor.delete.moduleTitle")
                : t("editor.delete.lessonTitle")}
            </DialogTitle>
            <DialogDescription>
              {t("editor.delete.description", {
                label: pendingDelete?.label ?? "",
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              onClick={() => {
                setPendingDelete(null);
              }}
              variant="outline"
            >
              {t("editor.delete.cancel")}
            </Button>
            <Button onClick={confirmDelete} variant="destructive">
              {t("editor.delete.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
