"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/client";
import { loadActivityAttempts } from "@/server/activities";
type Row = { id: string; createdAt: string; result: unknown };
export function AttemptHistory({
  lessonId,
  blockId,
}: {
  lessonId: string;
  blockId: string;
}) {
  const t = useT();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function load(more = false) {
    setBusy(true);
    try {
      const result = await loadActivityAttempts(
        lessonId,
        blockId,
        more ? (cursor ?? undefined) : undefined,
      );
      if (result.ok) {
        setRows((prev) =>
          more ? [...(prev ?? []), ...result.attempts] : result.attempts,
        );
        setCursor(result.nextCursor);
        setError(null);
      } else setError(result.error);
    } catch {
      setError(t("activity.loadFailed"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-2 border-t px-4 py-3">
      <Button
        size="sm"
        variant="ghost"
        disabled={busy}
        onClick={() => void load()}
      >
        {t("activity.history")}
      </Button>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
      {rows?.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {t("activity.noAttempts")}
        </p>
      ) : null}
      {rows?.map((row) => {
        const result = row.result as {
          score?: { raw: number; max: number; normalized: number };
          completed?: boolean;
          answer?: unknown;
          feedback?: unknown;
        };
        return (
          <details key={row.id} className="rounded-lg border p-2 text-xs">
            <summary className="cursor-pointer">
              {new Date(row.createdAt).toLocaleString()} ·{" "}
              {result.score
                ? `${Math.round(result.score.normalized * 100)}% (${result.score.raw}/${result.score.max})`
                : t("activity.ungraded")}{" "}
              ·{" "}
              {result.completed ? t("common.completed") : t("activity.attempt")}
            </summary>
            <p className="mt-2 font-medium">{t("activity.answer")}</p>
            <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words">
              {JSON.stringify(result.answer, null, 2)}
            </pre>
            <p className="mt-2 font-medium">{t("activity.feedback")}</p>
            <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words">
              {JSON.stringify(result.feedback, null, 2)}
            </pre>
          </details>
        );
      })}
      {cursor && rows ? (
        <Button
          size="xs"
          variant="outline"
          disabled={busy}
          onClick={() => void load(true)}
        >
          {t("activity.more")}
        </Button>
      ) : null}
    </div>
  );
}
