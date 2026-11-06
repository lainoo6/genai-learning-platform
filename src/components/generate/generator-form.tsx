"use client";

import { Check, Circle, FileUp, GitBranch, ListChecks, Loader2, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { DocumentField } from "@/components/generate/document-field";
import { InstructionsField } from "@/components/generate/instructions-field";
import {
  ModeSwitch,
  type GenerationMode,
} from "@/components/generate/mode-switch";
import { RepoFileTree } from "@/components/generate/repo-file-tree";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/i18n/client";
import {
  courseFileKind,
  MAX_COURSE_FILE_BYTES,
  MAX_UPLOAD_BYTES,
  uploadTotalBytes,
} from "@/lib/course-file";
import {
  buildRepoTree,
  flattenFiles,
  formatBytes,
  MAX_SELECTED_FILES,
} from "@/lib/repo-tree";
import { cn } from "@/lib/utils";
import {
  generateCourseFromFileAction,
  enhanceTopicAction,
  generateLearnerCourse,
  type GenerateCourseResult,
} from "@/server/generate";
import {
  generateCourseFromRepoAction,
  getRepoTreeAction,
  suggestFilesAction,
  type RepoTreeResult,
} from "@/server/repo";

/**
 * Generator form for the /generate page (P4.7, document upload and repo
 * preview).
 *
 * Three mutually exclusive modes share one runner: a topic prompt, a PDF/PPTX
 * document with optional instructions, and a GitHub repository with an optional
 * document and instructions. Switching modes only changes which panel is
 * visible — every field, the repo preview and the file selection stay in state,
 * so nothing is lost. The server action returns the finished course, so the
 * three-step animation is paced here: the steps advance on a timer while the
 * request is in flight and the redirect waits until the last step has been
 * visible. Non-blocking warnings are shown for a moment before navigating, and
 * a failure keeps the learner's input on screen and offers a retry instead of a
 * blank page.
 */

const STEPS = [
  {
    labelKey: "generate.steps.outline.label",
    detailKey: "generate.steps.outline.detail",
  },
  {
    labelKey: "generate.steps.lessons.label",
    detailKey: "generate.steps.lessons.detail",
  },
  {
    labelKey: "generate.steps.blocks.label",
    detailKey: "generate.steps.blocks.detail",
  },
] as const;

const STEP_INTERVAL_MS = 1100;
const MIN_VISIBLE_MS = 2400;
/** Extra time to read server warnings before the redirect. */
const WARNINGS_VISIBLE_MS = 3500;

type RunMode = "prompt" | "file" | "repo";

/** The successful preview, exactly as the server action returns it. */
type RepoPreview = Extract<RepoTreeResult, { ok: true }>;

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

export function GeneratorForm({ isTeacher }: { isTeacher: boolean }) {
  const t = useT();
  const router = useRouter();

  const [mode, setMode] = useState<GenerationMode>("topic");
  const [topic, setTopic] = useState("");
  const [goal, setGoal] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [images, setImages] = useState<File[]>([]);
  /** Names the course when the upload is images only; ignored for documents. */
  const [imageTopic, setImageTopic] = useState("");
  const [instructions, setInstructions] = useState("");
  const [showInstructions, setShowInstructions] = useState(false);
  const [enhancedQuestions, setEnhancedQuestions] = useState<string[]>([]);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [repoUrl, setRepoUrl] = useState("");
  const [repoPreview, setRepoPreview] = useState<RepoPreview | null>(null);
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [suggestStatus, setSuggestStatus] = useState<string | null>(null);
  const [revealNonce, setRevealNonce] = useState(0);
  const [selectionWarning, setSelectionWarning] = useState<string | null>(null);
  const [stage, setStage] = useState(-1);
  const [activeMode, setActiveMode] = useState<RunMode | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const repoTrees = useMemo(
    () => (repoPreview === null ? [] : buildRepoTree(repoPreview.tree)),
    [repoPreview],
  );
  const repoFiles = useMemo(() => flattenFiles(repoTrees), [repoTrees]);
  const selectedSet = useMemo(() => new Set(selectedPaths), [selectedPaths]);
  const selectionLimitReached = selectedPaths.length >= MAX_SELECTED_FILES;

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  async function run(
    mode: RunMode,
    request: () => Promise<GenerateCourseResult>,
  ): Promise<void> {
    if (isRunning) {
      return;
    }

    setError(null);
    setWarnings([]);
    setIsRunning(true);
    setActiveMode(mode);
    setStage(0);

    const startedAt = Date.now();
    timerRef.current = setInterval(() => {
      setStage((current) => Math.min(current + 1, STEPS.length - 1));
    }, STEP_INTERVAL_MS);

    try {
      const result = await request();

      if (!result.ok) {
        setError(result.error);
        setStage(-1);
        return;
      }

      const nextWarnings = result.warnings ?? [];
      setWarnings(nextWarnings);

      const elapsed = Date.now() - startedAt;
      if (elapsed < MIN_VISIBLE_MS) {
        await sleep(MIN_VISIBLE_MS - elapsed);
      }

      if (nextWarnings.length > 0) {
        await sleep(WARNINGS_VISIBLE_MS);
      }

      setStage(STEPS.length);
      router.push(
        isTeacher
          ? `/teach/courses/${result.courseId}/edit`
          : `/learn/${result.courseId}/${result.lessonId}`,
      );
    } catch (cause: unknown) {
      setError(
        cause instanceof Error ? cause.message : t("generate.error.failed"),
      );
      setStage(-1);
    } finally {
      if (timerRef.current !== null) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setIsRunning(false);
      setActiveMode(null);
    }
  }

  async function generate(): Promise<void> {
    const trimmedTopic = topic.trim();
    if (isRunning) {
      return;
    }
    if (trimmedTopic.length < 3) {
      setError(t("generate.error.topic"));
      return;
    }

    await run("prompt", () =>
      generateLearnerCourse({
        topic: trimmedTopic,
        goal: goal.trim(),
        instructions: instructions.trim(),
      }),
    );
  }

  /**
   * Expands the topic into a goal plus instructions. The result lands in
   * editable fields — it is never submitted for the learner.
   */
  async function enhanceTopic(): Promise<void> {
    const trimmed = topic.trim();
    if (isRunning || isEnhancing || trimmed.length < 3) {
      return;
    }

    setError(null);
    setIsEnhancing(true);

    try {
      const result = await enhanceTopicAction(trimmed);

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setGoal(result.goal);
      setInstructions(result.instructions);
      setEnhancedQuestions(result.questions);
      setShowInstructions(true);
    } catch (cause: unknown) {
      setError(
        cause instanceof Error ? cause.message : t("generate.error.failed"),
      );
    } finally {
      setIsEnhancing(false);
    }
  }

  /** Shared client-side check for the optional document field. */
  function documentError(candidate: File | null): string | null {
    if (candidate === null) {
      return null;
    }
    if (courseFileKind(candidate.name) === null) {
      return t("generate.error.file");
    }
    if (candidate.size > MAX_COURSE_FILE_BYTES) {
      return t("generate.error.fileTooLarge");
    }
    return null;
  }

  async function generateFromFile(): Promise<void> {
    if (isRunning) {
      return;
    }
    if (file === null && images.length === 0) {
      setError(t("generate.error.file"));
      return;
    }

    const fileProblem = documentError(file);
    if (fileProblem !== null) {
      setError(fileProblem);
      return;
    }

    // The host rejects the body before any action can answer; stop here so the
    // form can explain the limit instead of showing a blank 413.
    if (uploadTotalBytes(file, images) > MAX_UPLOAD_BYTES) {
      setError(
        t("generate.form.images.totalTooLarge", {
          limit: formatBytes(MAX_UPLOAD_BYTES),
        }),
      );
      return;
    }

    // Images alone still need a subject; a filename is not a topic.
    if (file === null && imageTopic.trim().length < 3) {
      setError(t("generate.error.imagesTopic"));
      return;
    }

    const formData = new FormData();
    if (file !== null) {
      formData.append("files", file);
    }
    for (const image of images) {
      formData.append("files", image);
    }
    formData.append("instructions", instructions.trim());
    formData.append("topic", imageTopic.trim());

    await run("file", () => generateCourseFromFileAction(formData));
  }

  function resetRepoPreview(): void {
    setRepoPreview(null);
    setSelectedPaths([]);
    setSelectionWarning(null);
    setSuggestStatus(null);
    setRevealNonce(0);
  }

  async function previewRepoFiles(): Promise<void> {
    if (isRunning || isPreviewing || isSuggesting) {
      return;
    }

    const trimmed = repoUrl.trim();
    if (trimmed.length === 0) {
      setError(t("generate.form.repo.empty"));
      return;
    }

    setError(null);
    setWarnings([]);
    setIsPreviewing(true);
    resetRepoPreview();

    try {
      const result = await getRepoTreeAction({ repoUrl: trimmed });

      if (!result.ok) {
        // Rate-limit messages already include GitHub's reset time.
        setError(result.error);
        return;
      }

      setRepoPreview(result);
    } catch (cause: unknown) {
      setError(
        cause instanceof Error ? cause.message : t("generate.error.failed"),
      );
    } finally {
      setIsPreviewing(false);
    }
  }

  /**
   * Asks the model which files to teach. The answer overwrites the current
   * selection because the point of the button is a fresh, architecture-level
   * pick; the teacher can still untick anything before generating.
   */
  async function suggestRepoFiles(): Promise<void> {
    if (repoPreview === null || isRunning || isPreviewing || isSuggesting) {
      return;
    }

    setError(null);
    setSuggestStatus(null);
    setIsSuggesting(true);

    try {
      const result = await suggestFilesAction({
        repoUrl: repoUrl.trim(),
        branch: repoPreview.meta.branch,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setSelectedPaths(result.suggestedPaths);
      setSelectionWarning(null);
      setRevealNonce((current) => current + 1);
      setSuggestStatus(
        t("generate.form.repo.suggested", {
          count: result.suggestedPaths.length,
        }),
      );
    } catch (cause: unknown) {
      setError(
        cause instanceof Error ? cause.message : t("generate.error.failed"),
      );
    } finally {
      setIsSuggesting(false);
    }
  }

  function toggleRepoPath(path: string): void {
    setSuggestStatus(null);

    if (selectedPaths.includes(path)) {
      setSelectedPaths(selectedPaths.filter((selected) => selected !== path));
      setSelectionWarning(null);
      return;
    }

    if (selectionLimitReached) {
      setSelectionWarning(
        t("generate.form.repo.limit", { count: MAX_SELECTED_FILES }),
      );
      return;
    }

    setSelectedPaths([...selectedPaths, path]);
    setSelectionWarning(null);
  }

  function selectAllRepoFiles(): void {
    const next = repoFiles
      .slice(0, MAX_SELECTED_FILES)
      .map((entry) => entry.path);

    setSelectedPaths(next);
    setSuggestStatus(null);
    setSelectionWarning(
      repoFiles.length > MAX_SELECTED_FILES
        ? t("generate.form.repo.selectAllLimited", {
            max: MAX_SELECTED_FILES,
            total: repoFiles.length,
          })
        : null,
    );
  }

  function clearRepoSelection(): void {
    setSelectedPaths([]);
    setSelectionWarning(null);
    setSuggestStatus(null);
  }

  async function generateFromRepo(): Promise<void> {
    if (isRunning || repoPreview === null) {
      return;
    }
    if (selectedPaths.length === 0) {
      setError(t("generate.form.repo.noFiles"));
      return;
    }

    const fileProblem = documentError(file);
    if (fileProblem !== null) {
      setError(fileProblem);
      return;
    }

    // Repo mode sends the same document + images bundle, so it shares the
    // request-body cap with the document mode.
    if (uploadTotalBytes(file, images) > MAX_UPLOAD_BYTES) {
      setError(
        t("generate.form.images.totalTooLarge", {
          limit: formatBytes(MAX_UPLOAD_BYTES),
        }),
      );
      return;
    }

    await run("repo", () =>
      generateCourseFromRepoAction({
        repoUrl: repoUrl.trim(),
        branch: repoPreview.meta.branch,
        selectedPaths,
        instructions: instructions.trim(),
        document: file ?? undefined,
        images: images.length > 0 ? images : undefined,
      }),
    );
  }

  return (
    <div className="space-y-4 rounded-xl ring-1 ring-foreground/10">
      <div className="space-y-4 px-4 py-4 sm:px-5">
        <ModeSwitch
          disabled={isRunning || isPreviewing || isSuggesting}
          onChange={setMode}
          value={mode}
        />

        {mode === "topic" ? (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="topic">
                {t("generate.form.topic.label")}
              </label>
              <Input
                disabled={isRunning || isEnhancing}
                id="topic"
                maxLength={120}
                onChange={(event) => {
                  setTopic(event.target.value);
                }}
                placeholder={t("generate.form.topic.placeholder")}
                value={topic}
              />
              <p className="text-xs text-muted-foreground">
                {t("generate.form.topic.hint")}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted-foreground">
                {t("generate.form.enhance.examples")}
              </span>
              <Button
                disabled={isRunning || isEnhancing}
                onClick={() => {
                  setTopic(t("generate.form.enhance.example.kpop"));
                }}
                size="xs"
                type="button"
                variant="outline"
              >
                {t("generate.form.enhance.example.kpop")}
              </Button>
              <Button
                disabled={isRunning || isEnhancing}
                onClick={() => {
                  setTopic(t("generate.form.enhance.example.http"));
                }}
                size="xs"
                type="button"
                variant="outline"
              >
                {t("generate.form.enhance.example.http")}
              </Button>
              <Button
                disabled={isRunning || isEnhancing}
                onClick={() => {
                  setTopic(t("generate.form.enhance.example.flask"));
                }}
                size="xs"
                type="button"
                variant="outline"
              >
                {t("generate.form.enhance.example.flask")}
              </Button>
              <Button
                className="ml-auto"
                disabled={isRunning || isEnhancing || topic.trim().length < 3}
                onClick={() => {
                  void enhanceTopic();
                }}
                size="sm"
                type="button"
                variant="secondary"
              >
                {isEnhancing ? (
                  <>
                    <Loader2 aria-hidden="true" className="animate-spin" />
                    {t("generate.form.enhance.pending")}
                  </>
                ) : (
                  <>
                    <Sparkles aria-hidden="true" />
                    {t("generate.form.enhance.submit")}
                  </>
                )}
              </Button>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="goal">
                {t("generate.form.goal.label")}{" "}
                <span className="font-normal text-muted-foreground">
                  {t("generate.form.optional")}
                </span>
              </label>
              <Textarea
                disabled={isRunning || isEnhancing}
                id="goal"
                maxLength={300}
                onChange={(event) => {
                  setGoal(event.target.value);
                }}
                placeholder={t("generate.form.goal.placeholder")}
                rows={2}
                value={goal}
              />
            </div>

            {showInstructions ? (
              <div className="space-y-2">
                <InstructionsField
                  disabled={isRunning || isEnhancing}
                  id="topic-instructions"
                  onChange={setInstructions}
                  value={instructions}
                />
                {enhancedQuestions.length === 0 ? null : (
                  <div className="rounded-lg border border-dashed px-3 py-2">
                    <p className="text-xs font-medium">
                      {t("generate.form.enhance.questions")}
                    </p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
                      {enhancedQuestions.map((question) => (
                        <li key={question}>{question}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : null}

            <Button
              disabled={
                isRunning ||
                isEnhancing ||
                isPreviewing ||
                isSuggesting ||
                topic.trim().length < 3
              }
              onClick={() => {
                void generate();
              }}
            >
              {activeMode === "prompt" ? (
                <>
                  <Loader2 aria-hidden="true" className="animate-spin" />
                  {t("generate.form.pending")}
                </>
              ) : (
                <>
                  <Sparkles aria-hidden="true" />
                  {t("generate.form.submit")}
                </>
              )}
            </Button>
          </div>
        ) : null}

        {mode === "document" ? (
          <div className="space-y-4">
            <DocumentField
              disabled={isRunning}
              file={file}
              hint={t("generate.form.file.hint")}
              id="course-file"
              images={images}
              label={t("generate.form.document.label")}
              onChange={(next) => {
                setFile(next);
                setError(null);
              }}
              onImagesChange={(next) => {
                setImages(next);
                setError(null);
              }}
            />

            {images.length === 0 ? null : (
              <div className="space-y-1.5">
                <label className="text-sm font-medium" htmlFor="course-file-topic">
                  {t("generate.form.images.topic.label")}
                </label>
                <Input
                  disabled={isRunning}
                  id="course-file-topic"
                  maxLength={120}
                  onChange={(event) => {
                    setImageTopic(event.target.value);
                  }}
                  placeholder={t("generate.form.images.topic.placeholder")}
                  value={imageTopic}
                />
                <p className="text-xs text-muted-foreground">
                  {t("generate.form.images.topic.hint")}
                </p>
              </div>
            )}

            <InstructionsField
              disabled={isRunning}
              id="course-file-instructions"
              onChange={setInstructions}
              value={instructions}
            />

            <Button
              disabled={
                isRunning ||
                isPreviewing ||
                isSuggesting ||
                (file === null && images.length === 0)
              }
              onClick={() => {
                void generateFromFile();
              }}
              variant="outline"
            >
              {activeMode === "file" ? (
                <>
                  <Loader2 aria-hidden="true" className="animate-spin" />
                  {t("generate.form.pending")}
                </>
              ) : (
                <>
                  <FileUp aria-hidden="true" />
                  {t("generate.form.file.submit")}
                </>
              )}
            </Button>
          </div>
        ) : null}

        {mode === "repo" ? (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="repo-url">
                {t("generate.form.repo.label")}
              </label>
              <div className="flex flex-wrap gap-2">
                <Input
                  className="min-w-0 flex-1 basis-64"
                  disabled={isRunning || isPreviewing || isSuggesting}
                  id="repo-url"
                  maxLength={500}
                  onChange={(event) => {
                    setRepoUrl(event.target.value);
                    resetRepoPreview();
                  }}
                  placeholder={t("generate.form.repo.placeholder")}
                  value={repoUrl}
                />
                <Button
                  disabled={
                    isRunning ||
                    isPreviewing ||
                    isSuggesting ||
                    repoUrl.trim().length === 0
                  }
                  onClick={() => {
                    void previewRepoFiles();
                  }}
                  variant="outline"
                >
                  {isPreviewing ? (
                    <>
                      <Loader2 aria-hidden="true" className="animate-spin" />
                      {t("generate.form.repo.previewing")}
                    </>
                  ) : (
                    <>
                      <ListChecks aria-hidden="true" />
                      {t("generate.form.repo.preview")}
                    </>
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {t("generate.form.repo.hint")}
              </p>
            </div>

            {repoPreview === null ? null : (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <p className="flex items-center gap-1.5">
                    <GitBranch aria-hidden="true" className="size-3.5" />
                    {t("generate.form.repo.branch", {
                      branch: repoPreview.meta.branch,
                    })}
                    <span aria-hidden="true">·</span>
                    {t("generate.form.repo.fileCount", {
                      count: repoFiles.length,
                    })}
                  </p>
                  <div className="flex flex-wrap items-center gap-1">
                    <span>
                      {t("generate.form.repo.selected", {
                        selected: selectedPaths.length,
                        max: MAX_SELECTED_FILES,
                      })}
                    </span>
                    <Button
                      disabled={
                        isRunning ||
                        isPreviewing ||
                        isSuggesting ||
                        repoFiles.length === 0
                      }
                      onClick={() => {
                        void suggestRepoFiles();
                      }}
                      size="sm"
                      variant="secondary"
                    >
                      {isSuggesting ? (
                        <>
                          <Loader2
                            aria-hidden="true"
                            className="animate-spin"
                          />
                          {t("generate.form.repo.suggesting")}
                        </>
                      ) : (
                        <>
                          <Sparkles aria-hidden="true" />
                          {t("generate.form.repo.suggest")}
                        </>
                      )}
                    </Button>
                    <Button
                      disabled={
                        isRunning ||
                        isSuggesting ||
                        repoFiles.length === 0
                      }
                      onClick={selectAllRepoFiles}
                      size="sm"
                      variant="ghost"
                    >
                      {t("generate.form.repo.selectAll")}
                    </Button>
                    <Button
                      disabled={
                        isRunning ||
                        isSuggesting ||
                        selectedPaths.length === 0
                      }
                      onClick={clearRepoSelection}
                      size="sm"
                      variant="ghost"
                    >
                      {t("generate.form.repo.clear")}
                    </Button>
                  </div>
                </div>

                <div className="max-h-72 overflow-y-auto rounded-lg border p-2">
                  <RepoFileTree
                    key={`${repoPreview.meta.owner}/${repoPreview.meta.repo}@${repoPreview.meta.branch}`}
                    disabled={isRunning || isSuggesting}
                    limitReached={selectionLimitReached}
                    nodes={repoTrees}
                    onToggle={toggleRepoPath}
                    revealNonce={revealNonce}
                    selected={selectedSet}
                  />
                </div>

                {repoPreview.meta.truncated ? (
                  <p className="text-xs text-muted-foreground">
                    {t("generate.form.repo.truncated")}
                  </p>
                ) : null}

                {suggestStatus === null ? null : (
                  <p
                    className="flex items-center gap-1.5 text-xs text-muted-foreground"
                    role="status"
                  >
                    <Sparkles aria-hidden="true" className="size-3.5 shrink-0" />
                    {suggestStatus}
                  </p>
                )}

                {selectionWarning === null ? null : (
                  <p className="text-xs text-amber-700" role="status">
                    {selectionWarning}
                  </p>
                )}

                <div className="space-y-3 border-t pt-4">
                  <DocumentField
                    disabled={isRunning}
                    file={file}
                    hint={t("generate.form.repo.document.hint")}
                    id="repo-document"
                    images={images}
                    label={t("generate.form.repo.document.label")}
                    onChange={(next) => {
                      setFile(next);
                      setError(null);
                    }}
                    onImagesChange={(next) => {
                      setImages(next);
                      setError(null);
                    }}
                  />

                  <InstructionsField
                    disabled={isRunning}
                    id="repo-instructions"
                    onChange={setInstructions}
                    value={instructions}
                  />

                  <Button
                    disabled={
                      isRunning || isSuggesting || selectedPaths.length === 0
                    }
                    onClick={() => {
                      void generateFromRepo();
                    }}
                  >
                    {activeMode === "repo" ? (
                      <>
                        <Loader2 aria-hidden="true" className="animate-spin" />
                        {t("generate.form.pending")}
                      </>
                    ) : (
                      <>
                        <Sparkles aria-hidden="true" />
                        {t("generate.form.repo.generate")}
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : null}

        <p className="text-xs text-muted-foreground">
          {t("generate.form.note")}
        </p>
      </div>

      <div
        aria-live="polite"
        className={cn(
          "space-y-3 border-t px-4 py-4 sm:px-5",
          stage < 0 ? "hidden" : "",
        )}
      >
        <ol className="space-y-3">
          {STEPS.map((step, index) => {
            const done = stage > index;
            const active = stage === index;
            const Icon = done ? Check : active ? Loader2 : Circle;

            return (
              <li className="flex items-start gap-3" key={step.labelKey}>
                <Icon
                  aria-hidden="true"
                  className={cn(
                    "mt-0.5 size-4 shrink-0",
                    done ? "text-emerald-600" : "",
                    active ? "animate-spin text-primary" : "",
                    !done && !active ? "text-muted-foreground/50" : "",
                  )}
                />
                <div>
                  <p
                    className={cn(
                      "text-sm",
                      done || active ? "font-medium" : "text-muted-foreground",
                    )}
                  >
                    {t(step.labelKey)}
                  </p>
                  <p className="text-xs text-muted-foreground">{t(step.detailKey)}</p>
                </div>
              </li>
            );
          })}
        </ol>

        {stage >= STEPS.length ? (
          <p className="text-sm text-emerald-600">
            {t(isTeacher ? "generate.steps.readyTeacher" : "generate.steps.ready")}
          </p>
        ) : null}
      </div>

      {warnings.length === 0 ? null : (
        <div
          aria-live="polite"
          className="mx-4 mb-4 space-y-1 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 sm:mx-5"
        >
          <p className="font-medium">{t("generate.warnings.heading")}</p>
          <ul className="list-disc space-y-0.5 pl-5">
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      {error === null ? null : (
        <p
          aria-live="polite"
          className="mx-4 mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-700 sm:mx-5"
        >
          {error}
        </p>
      )}
    </div>
  );
}
