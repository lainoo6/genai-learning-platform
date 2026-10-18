"use client";

import { Download, FileUp, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  MAX_IMPORT_BYTES,
  MAX_IMPORT_ROWS,
  toCsvDocument,
} from "@/lib/csv";
import type { ImportCredential, ImportStudentsResult } from "@/lib/students";
import { importStudents } from "@/server/students";

/**
 * CSV import panel for the roster page (P5.2).
 *
 * The file never leaves this component's state until "Import CSV" is pressed.
 * The result panel reports the four outcomes separately, lists the failed rows
 * with their file row numbers, and offers the one-time credentials download for
 * accounts created in this run.
 */

const TEMPLATE = `name,email
Ada Lovelace,ada.lovelace@example.com
Alan Turing,alan.turing@example.com
Grace Hopper,grace.hopper@example.com`;

type Tone = "default" | "success" | "danger";

function Stat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: Tone;
}) {
  return (
    <div className="rounded-lg bg-background px-3 py-2 ring-1 ring-foreground/10">
      <p
        className={
          tone === "success"
            ? "text-lg font-semibold tabular-nums text-emerald-600"
            : tone === "danger"
              ? "text-lg font-semibold tabular-nums text-destructive"
              : "text-lg font-semibold tabular-nums"
        }
      >
        {value}
      </p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function downloadCredentials(
  credentials: ImportCredential[],
  slug: string,
): void {
  const document_ = toCsvDocument([
    ["name", "email", "temporary password"],
    ...credentials.map((entry) => [entry.name, entry.email, entry.password]),
  ]);
  const url = URL.createObjectURL(
    new Blob([document_], { type: "text/csv;charset=utf-8" }),
  );
  const anchor = window.document.createElement("a");
  anchor.href = url;
  anchor.download = `course-${slug}-credentials.csv`;
  window.document.body.append(anchor);
  anchor.click();
  anchor.remove();
  // Revoking too early cancels the blob download in Chrome; give the browser
  // a minute to finish writing the file, then release the object URL.
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 60_000);
}

type StudentImportPanelProps = {
  courseId: string;
  slug: string;
};

export function StudentImportPanel({
  courseId,
  slug,
}: StudentImportPanelProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<ImportStudentsResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleImport(): Promise<void> {
    if (file === null) {
      return;
    }

    if (file.size > MAX_IMPORT_BYTES) {
      setResult(null);
      setError(
        "The file is larger than 1 MB. Split it into smaller files and try again.",
      );
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    setPending(true);
    setError(null);

    try {
      const next = await importStudents(courseId, formData);
      setResult(next);

      if (next.ok) {
        setFile(null);
        if (inputRef.current !== null) {
          inputRef.current.value = "";
        }
        router.refresh();
      }
    } catch (importError: unknown) {
      console.error("[students] import request failed", importError);
      setResult(null);
      setError(
        "The import could not be completed. Check the connection and try again.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <section
      aria-labelledby="import-students-heading"
      className="space-y-4 rounded-xl p-5 ring-1 ring-foreground/10"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2
            className="flex items-center gap-2 text-base font-medium"
            id="import-students-heading"
          >
            <Upload aria-hidden="true" className="size-4" />
            Import students
          </h2>
          <p className="max-w-xl text-sm text-muted-foreground">
            Upload a CSV with <code className="font-mono">name</code> and{" "}
            <code className="font-mono">email</code> columns. Existing accounts
            are enrolled; new emails get a learner account with a temporary
            password.
          </p>
        </div>

        <p className="text-xs text-muted-foreground">
          Max {MAX_IMPORT_ROWS.toLocaleString("en-GB")} rows · 1 MB
        </p>
      </div>

      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer font-medium text-foreground">
          Show the CSV template
        </summary>
        <pre className="mt-2 overflow-x-auto rounded-lg bg-muted/60 p-3 font-mono text-xs">
          {TEMPLATE}
        </pre>
      </details>

      <div className="flex flex-wrap items-center gap-3">
        <label className="sr-only" htmlFor="student-csv">
          Student CSV file
        </label>
        <input
          accept=".csv,text/csv"
          className="block w-full max-w-sm cursor-pointer rounded-lg border border-border bg-background text-sm file:mr-3 file:cursor-pointer file:rounded-l-lg file:border-0 file:bg-muted file:px-3 file:py-2 file:text-sm file:font-medium hover:file:bg-muted/80"
          id="student-csv"
          onChange={(event) => {
            setFile(event.target.files?.[0] ?? null);
            setError(null);
          }}
          ref={inputRef}
          type="file"
        />

        <Button
          className="gap-1.5"
          disabled={file === null || pending}
          onClick={() => {
            void handleImport();
          }}
        >
          <FileUp aria-hidden="true" />
          {pending ? "Importing…" : "Import CSV"}
        </Button>
      </div>

      {error === null ? null : (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {result === null ? null : result.ok ? (
        <div className="space-y-3 rounded-xl bg-muted/30 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-medium">
              {result.imported > 0
                ? `Imported ${result.imported} of ${result.total} rows.`
                : `No rows were enrolled (${result.total} read).`}
            </p>

            {result.credentials.length === 0 ? null : (
              <Button
                className="gap-1.5"
                onClick={() => {
                  downloadCredentials(result.credentials, slug);
                }}
                size="sm"
                variant="outline"
              >
                <Download aria-hidden="true" />
                Download credentials ({result.credentials.length})
              </Button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Imported" tone="success" value={result.imported} />
            <Stat label="New accounts" value={result.newAccounts} />
            <Stat label="Already enrolled" value={result.alreadyEnrolled} />
            <Stat
              label="Failed"
              tone={result.failed.length > 0 ? "danger" : "default"}
              value={result.failed.length}
            />
          </div>

          {result.credentials.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No new accounts were created — every imported row belonged to an
              existing user.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Temporary passwords are shown only in this download. Save the file
              before leaving the page.
            </p>
          )}

          {result.failed.length === 0 ? null : (
            <div className="space-y-1.5">
              <p className="text-xs font-medium uppercase tracking-wide text-destructive">
                Failed rows
              </p>
              <ul className="max-h-44 space-y-1 overflow-y-auto rounded-lg bg-background p-2 text-xs ring-1 ring-foreground/10">
                {result.failed.map((failure) => (
                  <li
                    className="flex flex-wrap gap-x-2"
                    key={`${failure.row}-${failure.email}`}
                  >
                    <span className="font-medium tabular-nums">
                      Row {failure.row}
                    </span>
                    {failure.email.length === 0 ? null : (
                      <span className="text-muted-foreground">
                        {failure.email}
                      </span>
                    )}
                    <span className="text-destructive">{failure.reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {result.error}
        </p>
      )}
    </section>
  );
}
