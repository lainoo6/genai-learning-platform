"use client";

import { javascript } from "@codemirror/lang-javascript";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { basicSetup } from "codemirror";
import {
  Check,
  Lightbulb,
  Play,
  RotateCcw,
  TriangleAlert,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import type { CodeReview } from "@/lib/llm/prompts/code-review";
import type { requestCodeReview } from "@/server/code-review";
import { postJson } from "@/lib/post-json";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/client";
import {
  RUN_TIMEOUT_MS,
  runCodingTests,
  type CodingTestResult,
} from "@/lib/blocks/coding-runner";
import type {
  BlockRenderProps,
  CodingBlock as CodingBlockData,
} from "@/lib/blocks/schema";

/**
 * Coding block: a JavaScript exercise with a live editor and assertions.
 *
 * The editor is CodeMirror 6 (line numbers, JavaScript highlighting). "Run
 * tests" ships the current document to a throw-away Web Worker created from a
 * Blob URL, so learner code never runs with access to the page — see
 * `lib/blocks/coding-runner.ts` for the sandbox and its watchdog.
 *
 * Drafts survive navigation and refresh: the document is written to
 * `localStorage` under `lessonId + blockId`, and restored when the block mounts.
 */

/** Debounce for writing the draft, in milliseconds. */
const DRAFT_SAVE_DELAY_MS = 400;

function draftKey(lessonId: string, blockId: string): string {
  return `coding-draft:${lessonId}:${blockId}`;
}

export function CodingBlock({
  block,
  completed,
  context,
  onAttempt,
}: BlockRenderProps<CodingBlockData>) {
  const t = useT();
  const { problem, starter, tests, hints } = block.payload;

  const [review, setReview] = useState<CodeReview | null>(null);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [mockReview, setMockReview] = useState(false);
  const finalizedCodeRef = useRef<string | null>(null);
  const versionRef = useRef(0);
  const runningRef = useRef(false);
  const reviewingRef = useRef(false);
  const [results, setResults] = useState<CodingTestResult[] | null>(null);
  const [status, setStatus] = useState<"idle" | "running" | "failed">("idle");
  const [failure, setFailure] = useState<string | null>(null);
  const [hintsShown, setHintsShown] = useState(0);

  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  /** Latest document, read by "Run tests" without re-creating the editor. */
  const codeRef = useRef(starter);
  const starterRef = useRef(starter);
  const saveTimerRef = useRef<number | null>(null);

  const storageKey = `${context.preview ? "preview:" : ""}${draftKey(context.lessonId, block.id)}`;

  const scheduleSave = useCallback(
    (value: string) => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
      }
      saveTimerRef.current = window.setTimeout(() => {
        try {
          window.localStorage.setItem(storageKey, value);
        } catch {
          /* Storage may be disabled. */
        }
      }, DRAFT_SAVE_DELAY_MS);
    },
    [storageKey],
  );

  useEffect(() => {
    const host = hostRef.current;
    if (host === null) {
      return undefined;
    }

    // Reading localStorage in the render pass would break hydration, so the
    // draft is only picked up once, here, before the editor is created.
    let saved: string | null = null;
    try {
      saved = window.localStorage.getItem(storageKey);
    } catch {
      /* Use starter when storage is disabled. */
    }
    const initialCode = saved ?? starterRef.current;

    codeRef.current = initialCode;

    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: initialCode,
        extensions: [
          basicSetup,
          javascript(),
          EditorView.theme({
            "&": { fontSize: "13px", maxHeight: "340px" },
            ".cm-scroller": {
              fontFamily: "var(--font-mono), monospace",
              lineHeight: "1.6",
            },
            "&.cm-focused": { outline: "none" },
          }),
          EditorView.updateListener.of((update) => {
            if (!update.docChanged) {
              return;
            }
            const next = update.state.doc.toString();
            codeRef.current = next;
            finalizedCodeRef.current = null;
            versionRef.current += 1;
            setResults(null);
            setFailure(null);
            setReview(null);
            setReviewError(null);
            scheduleSave(next);
          }),
        ],
      }),
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [scheduleSave, storageKey]);

  // A pending draft write must not outlive the block.
  useEffect(
    () => () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
      }
    },
    [],
  );

  function handleReset(): void {
    const view = viewRef.current;

    if (view !== null) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: starter },
      });
    }

    if (saveTimerRef.current !== null)
      window.clearTimeout(saveTimerRef.current);
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      /* Optional draft. */
    }
    setResults(null);
    setFailure(null);
    setStatus("idle");
    setHintsShown(0);
  }

  async function handleRun(): Promise<void> {
    if (runningRef.current) return;
    runningRef.current = true;
    const code = codeRef.current;
    const version = versionRef.current;
    setStatus("running");
    setFailure(null);
    setResults(null);

    const outcome = await runCodingTests(code, tests);
    runningRef.current = false;
    if (outcome.status === "ok") {
      onAttempt?.({
        answer: { code, results: outcome.results, failure: null },
      });
      if (version !== versionRef.current) {
        setStatus("idle");
        return;
      }
      setResults(outcome.results);
      setStatus("idle");
      return;
    }

    onAttempt?.({
      answer: {
        code,
        results: [],
        failure: outcome.status === "timeout" ? "timeout" : outcome.message,
      },
    });
    if (version !== versionRef.current) {
      setStatus("idle");
      return;
    }
    setStatus("failed");
    setFailure(
      outcome.status === "timeout"
        ? t("block.coding.timeout", { seconds: RUN_TIMEOUT_MS / 1000 })
        : outcome.message,
    );
  }

  async function handleReview() {
    if (reviewingRef.current || !codeRef.current.trim()) return;
    reviewingRef.current = true;
    setReviewBusy(true);
    setReviewError(null);
    const version = versionRef.current;
    try {
      const result = await postJson<
        Awaited<ReturnType<typeof requestCodeReview>>
      >(
        "/api/code-review",
        {
          attemptId: crypto.randomUUID(),
          lessonId: context.lessonId,
          blockId: block.id,
          code: codeRef.current,
          evidence: { results, failure },
          ...(context.preview ? { previewBlock: block } : {}),
        },
        {
          timeoutMs: 60_000,
          timeoutMessage: t("activity.reviewTimeout"),
          failureMessage: t("activity.reviewFailed"),
        },
      );
      if (version !== versionRef.current) return;
      if (result.ok) {
        setReview(result.report);
        setMockReview(result.mock);
      } else setReviewError(result.error);
    } catch (cause) {
      setReviewError(
        cause instanceof Error ? cause.message : t("activity.reviewFailed"),
      );
    } finally {
      reviewingRef.current = false;
      setReviewBusy(false);
    }
  }

  const allPassed =
    results !== null &&
    results.length === tests.length &&
    results.every((result) => result.passed);

  return (
    <div className="space-y-4">
      <p className="text-sm">{problem}</p>

      <div className="overflow-hidden rounded-lg ring-1 ring-foreground/15">
        {/* CodeMirror owns this node; it is filled in by the mount effect. */}
        <div ref={hostRef} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          disabled={status === "running"}
          onClick={() => {
            void handleRun();
          }}
        >
          <Play aria-hidden="true" />
          {status === "running"
            ? t("block.coding.running")
            : t("block.coding.run")}
        </Button>

        <Button
          variant="outline"
          disabled={reviewBusy || status === "running"}
          onClick={() => void handleReview()}
        >
          {t(reviewBusy ? "activity.reviewing" : "activity.codeReview")}
        </Button>
        <Button
          disabled={status === "running"}
          onClick={handleReset}
          variant="outline"
        >
          <RotateCcw aria-hidden="true" />
          {t("block.coding.reset")}
        </Button>

        {hints.length > 0 ? (
          <Button
            disabled={hintsShown >= hints.length}
            onClick={() => {
              setHintsShown((previous) => previous + 1);
            }}
            variant="ghost"
          >
            <Lightbulb aria-hidden="true" />
            {hintsShown === 0
              ? t("block.coding.hint")
              : t("block.coding.hintMore")}
          </Button>
        ) : null}

        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
          {results === null
            ? t("block.coding.testsToPass", { count: tests.length })
            : t("block.coding.passing", {
                passed: results.filter((result) => result.passed).length,
                total: tests.length,
              })}
        </span>
      </div>

      {reviewError ? (
        <p role="alert" className="text-sm text-destructive">
          {reviewError}
        </p>
      ) : null}
      {review ? (
        <section className="space-y-2 rounded-lg border bg-muted/40 p-3 text-sm">
          {mockReview ? (
            <p className="font-medium">{t("activity.mockReview")}</p>
          ) : null}
          <p>{review.summary}</p>
          {(
            [
              ["activity.errors", review.errors],
              ["activity.improvements", review.improvements],
              ["activity.edgeCases", review.edgeCases],
            ] as const
          ).map(([key, entries]) => (
            <div key={key}>
              <h4 className="font-medium">{t(key)}</h4>
              <ul className="list-disc pl-5">
                {entries.map((entry, index) => (
                  <li key={index}>{entry}</li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ) : null}
      {hintsShown > 0 ? (
        <ul className="space-y-1.5 rounded-lg bg-muted/50 px-3 py-2 text-xs">
          {hints.slice(0, hintsShown).map((hint) => (
            <li className="flex gap-2" key={hint}>
              <Lightbulb
                aria-hidden="true"
                className="mt-0.5 size-3.5 shrink-0"
              />
              <span>{hint}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {failure === null ? null : (
        <p className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">
          <TriangleAlert
            aria-hidden="true"
            className="mt-0.5 size-3.5 shrink-0"
          />
          {failure}
        </p>
      )}

      {results === null ? null : (
        <ul className="space-y-2 rounded-lg bg-muted/50 px-3 py-3 text-xs">
          {results.map((result) => (
            <li key={result.name}>
              <span className="flex items-center gap-2">
                {result.passed ? (
                  <Check
                    aria-hidden="true"
                    className="size-3.5 shrink-0 text-emerald-600"
                  />
                ) : (
                  <X
                    aria-hidden="true"
                    className="size-3.5 shrink-0 text-red-600"
                  />
                )}
                <span className="font-medium">{result.name}</span>
                <span className="text-muted-foreground">
                  {result.passed
                    ? t("block.coding.passed")
                    : t("block.coding.failed")}
                </span>
              </span>
              {result.passed || result.error === null ? null : (
                <span className="mt-0.5 block pl-5.5 font-mono text-red-600">
                  stderr › {result.error}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t pt-4">
        <Button
          disabled={!allPassed || completed}
          onClick={() => {
            if (finalizedCodeRef.current === codeRef.current) return;
            finalizedCodeRef.current = codeRef.current;
            onAttempt?.({
              answer: {
                code: codeRef.current,
                results: results ?? [],
                failure,
                finalize: true,
              },
            });
          }}
          variant={completed ? "secondary" : "default"}
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
        <p className="text-xs text-muted-foreground">
          {allPassed || completed
            ? t("block.coding.allPass")
            : t("block.coding.needPass")}
        </p>
      </div>
    </div>
  );
}
