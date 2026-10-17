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

import { Button } from "@/components/ui/button";
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
  onComplete,
}: BlockRenderProps<CodingBlockData>) {
  const { problem, starter, tests, hints } = block.payload;

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

  const storageKey = draftKey(context.lessonId, block.id);

  const scheduleSave = useCallback(
    (value: string) => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
      }
      saveTimerRef.current = window.setTimeout(() => {
        window.localStorage.setItem(storageKey, value);
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
    const saved = window.localStorage.getItem(storageKey);
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

    window.localStorage.removeItem(storageKey);
    setResults(null);
    setFailure(null);
    setStatus("idle");
    setHintsShown(0);
  }

  async function handleRun(): Promise<void> {
    setStatus("running");
    setFailure(null);
    setResults(null);

    const outcome = await runCodingTests(codeRef.current, tests);

    if (outcome.status === "ok") {
      setResults(outcome.results);
      setStatus("idle");
      return;
    }

    setStatus("failed");
    setFailure(
      outcome.status === "timeout"
        ? `Execution stopped after ${RUN_TIMEOUT_MS / 1000} seconds — check for a loop that never ends.`
        : outcome.message,
    );
  }

  const allPassed =
    results !== null
    && results.length === tests.length
    && results.every((result) => result.passed);

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
          {status === "running" ? "Running…" : "Run tests"}
        </Button>

        <Button onClick={handleReset} variant="outline">
          <RotateCcw aria-hidden="true" />
          Reset
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
            {hintsShown === 0 ? "Show a hint" : "Show another hint"}
          </Button>
        ) : null}

        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
          {results === null
            ? `${tests.length} test${tests.length === 1 ? "" : "s"} to pass`
            : `${results.filter((result) => result.passed).length} / ${tests.length} passing`}
        </span>
      </div>

      {hintsShown > 0 ? (
        <ul className="space-y-1.5 rounded-lg bg-muted/50 px-3 py-2 text-xs">
          {hints.slice(0, hintsShown).map((hint) => (
            <li className="flex gap-2" key={hint}>
              <Lightbulb aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
              <span>{hint}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {failure === null ? null : (
        <p className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
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
                  {result.passed ? "passed" : "failed"}
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
            onComplete(block.id);
          }}
          variant={completed ? "secondary" : "default"}
        >
          {completed ? (
            <>
              <Check aria-hidden="true" />
              Completed
            </>
          ) : (
            "Mark as complete"
          )}
        </Button>
        <p className="text-xs text-muted-foreground">
          {allPassed || completed
            ? "All tests pass — nice work."
            : "Run the tests and get every one of them passing to finish."}
        </p>
      </div>
    </div>
  );
}
