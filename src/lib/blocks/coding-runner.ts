import type { CodingTest } from "@/lib/blocks/schema";

/**
 * Sandboxed runner for the coding block (P3.2).
 *
 * The learner's code is executed inside a throw-away Web Worker created from a
 * Blob URL: no DOM, no network and no access to the page, so the worst a
 * mistake can do is hang the worker — which the five-second watchdog handles by
 * terminating it.
 *
 * Kept out of the component so the worker contract (message shapes, timeout,
 * failure modes) is described in one place.
 */

/** How long a single run may take before the worker is killed. */
export const RUN_TIMEOUT_MS = 5000;

export type CodingTestResult = {
  name: string;
  passed: boolean;
  /** Why the test failed; rendered under a red `stderr ›` prefix. */
  error: string | null;
};

export type CodingRunOutcome =
  | { status: "ok"; results: CodingTestResult[] }
  | { status: "timeout" }
  | { status: "error"; message: string };

/**
 * Worker body, stringified at runtime into a Blob URL.
 *
 * Kept as plain ES5-flavoured JavaScript on purpose: it is never transpiled, so
 * no optional chaining, no `const`/`let` mixing with arrow functions, and no
 * imports.
 */
const WORKER_SOURCE = `
self.onmessage = function (event) {
  var data = event.data || {};
  var code = typeof data.code === "string" ? data.code : "";
  var tests = Array.isArray(data.tests) ? data.tests : [];

  var results = tests.map(function (test) {
    try {
      var runner = new Function(
        '"use strict";\\n' + code + "\\n;return (" + test.expression + ");"
      );
      var value = runner();
      if (value === true) {
        return { name: test.name, passed: true, error: null };
      }
      return {
        name: test.name,
        passed: false,
        error:
          "expected (" + test.expression + ") to be true, got " + String(value)
      };
    } catch (error) {
      var message = error instanceof Error ? error.message : String(error);
      var name = error instanceof Error && error.name ? error.name : "Error";
      return { name: test.name, passed: false, error: name + ": " + message };
    }
  });

  self.postMessage({ results: results });
};
`;

function isTestResult(value: unknown): value is CodingTestResult {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return typeof candidate.name === "string" && typeof candidate.passed === "boolean";
}

/**
 * Runs `code` against every assertion and resolves with the outcome.
 *
 * The worker is always terminated before this resolves — including on timeout,
 * which is the only way to stop `while (true) {}`.
 */
export function runCodingTests(
  code: string,
  tests: CodingTest[],
): Promise<CodingRunOutcome> {
  if (typeof Worker === "undefined" || typeof Blob === "undefined") {
    return Promise.resolve({
      status: "error",
      message: "This browser cannot run the code sandbox.",
    });
  }

  try {
    return new Promise<CodingRunOutcome>((resolve) => {
      const blob = new Blob([WORKER_SOURCE], { type: "text/javascript" });
      const url = URL.createObjectURL(blob);
      const worker = new Worker(url);
      let settled = false;

      const finish = (outcome: CodingRunOutcome): void => {
        if (settled) {
          return;
        }
        settled = true;
        window.clearTimeout(timer);
        worker.terminate();
        URL.revokeObjectURL(url);
        resolve(outcome);
      };

      const timer = window.setTimeout(() => {
        finish({ status: "timeout" });
      }, RUN_TIMEOUT_MS);

      worker.onmessage = (event: MessageEvent<unknown>) => {
        const payload = event.data;
        if (typeof payload !== "object" || payload === null) {
          finish({ status: "error", message: "The sandbox returned nothing." });
          return;
        }

        const rawResults = (payload as { results?: unknown }).results;
        if (!Array.isArray(rawResults) || !rawResults.every(isTestResult)) {
          finish({
            status: "error",
            message: "The sandbox returned an unexpected result.",
          });
          return;
        }

        finish({ status: "ok", results: rawResults });
      };

      worker.onerror = (event: ErrorEvent) => {
        finish({
          status: "error",
          message:
            event.message || "The sandbox crashed while running your code.",
        });
      };

      worker.postMessage({ code, tests });
    });
  } catch (error: unknown) {
    return Promise.resolve({
      status: "error",
      message:
        error instanceof Error ? error.message : "The sandbox failed to start.",
    });
  }
}
