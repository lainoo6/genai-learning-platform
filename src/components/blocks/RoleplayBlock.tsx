"use client";

import {
  Check,
  Loader2,
  MessageSquare,
  RotateCcw,
  SendHorizontal,
  Target,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/i18n/client";
import type {
  BlockRenderProps,
  RoleplayBlock as RoleplayBlockData,
} from "@/lib/blocks/schema";
import {
  ROLEPLAY_MAX_TRANSCRIPT,
  type RoleplayFeedback,
  type RoleplayTurn,
} from "@/lib/llm/prompts/roleplay";
import { cn } from "@/lib/utils";
import { requestRoleplayFeedback } from "@/server/roleplay";

/**
 * Roleplay block (P4.5): a chat with an AI character plus a graded debrief.
 *
 * Each completed conversation is saved with its transcript and feedback, so
 * "Play again" is a real reset. Replies stream from `/api/roleplay`; "End & get
 * feedback" sends the transcript back to a server action, which reads the
 * rubric from the stored lesson and returns one score per criterion.
 */

type ChatMessage = RoleplayTurn & { id: string };

export function RoleplayBlock({
  block,
  completed,
  onComplete,
  context,
}: BlockRenderProps<RoleplayBlockData>) {
  const t = useT();
  const { scenario, persona, goal, rubric } = block.payload;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  const [report, setReport] = useState<RoleplayFeedback | null>(null);
  const [isReporting, setIsReporting] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  const streamingRef = useRef(false);
  const reportingRef = useRef(false);
  const attemptIdRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = scrollRef.current;
    if (container !== null) {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages]);

  const ended = report !== null;
  const atTurnLimit = messages.length >= ROLEPLAY_MAX_TRANSCRIPT;

  async function send(text: string): Promise<void> {
    const trimmed = text.trim();
    if (
      trimmed.length === 0 ||
      streamingRef.current ||
      reportingRef.current ||
      ended ||
      atTurnLimit
    ) {
      return;
    }

    streamingRef.current = true;
    setChatError(null);
    setDraft("");
    setIsStreaming(true);

    const history = messages.map(({ role, content }) => ({ role, content }));
    const replyId = `reply-${Date.now()}`;

    setMessages((previous) => [
      ...previous,
      { id: `user-${Date.now()}`, role: "user", content: trimmed },
      { id: replyId, role: "assistant", content: "" },
    ]);

    let accumulated = "";

    try {
      const response = await fetch("/api/roleplay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lessonId: context.lessonId,
          blockId: block.id,
          message: trimmed,
          history,
          ...(context.preview ? { previewBlock: block } : {}),
        }),
      });

      if (!response.ok || response.body === null) {
        throw new Error(
          t("block.roleplay.unavailable", { status: response.status }),
        );
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      // Raw UTF-8 text deltas; `stream: true` keeps split multi-byte characters.
      for (;;) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        const delta = decoder.decode(value, { stream: true });
        accumulated += delta;
        setMessages((previous) =>
          previous.map((message) =>
            message.id === replyId
              ? { ...message, content: message.content + delta }
              : message,
          ),
        );
      }

      const tail = decoder.decode();
      if (tail.length > 0) {
        accumulated += tail;
        setMessages((previous) =>
          previous.map((message) =>
            message.id === replyId
              ? { ...message, content: message.content + tail }
              : message,
          ),
        );
      }

      if (accumulated.trim().length === 0) {
        setMessages((previous) =>
          previous.filter((message) => message.id !== replyId),
        );
        setChatError(t("block.roleplay.emptyAnswer"));
      }
    } catch (cause: unknown) {
      setMessages((previous) =>
        previous.filter((message) => message.id !== replyId),
      );
      setChatError(
        cause instanceof Error
          ? cause.message
          : t("block.roleplay.failedAnswer"),
      );
    } finally {
      streamingRef.current = false;
      setIsStreaming(false);
    }
  }

  async function endAndGetFeedback(): Promise<void> {
    const transcript = messages
      .filter((message) => message.content.trim().length > 0)
      .map(({ role, content }) => ({ role, content }));

    if (
      transcript.length === 0 ||
      reportingRef.current ||
      streamingRef.current
    ) {
      return;
    }

    reportingRef.current = true;
    setReportError(null);
    setIsReporting(true);

    try {
      attemptIdRef.current ??= crypto.randomUUID();
      const result = await requestRoleplayFeedback({
        attemptId: attemptIdRef.current,
        ...(context.preview ? { previewBlock: block } : {}),
        lessonId: context.lessonId,
        blockId: block.id,
        transcript,
      });

      if (result.ok) {
        setReport(result.report);
        if (!context.preview) onComplete(block.id);
      } else {
        setReportError(result.error);
      }
    } catch (cause: unknown) {
      setReportError(
        cause instanceof Error
          ? cause.message
          : t("block.roleplay.failedReport"),
      );
    } finally {
      reportingRef.current = false;
      setIsReporting(false);
    }
  }

  function playAgain(): void {
    attemptIdRef.current = null;
    setMessages([]);
    setDraft("");
    setChatError(null);
    setReport(null);
    setReportError(null);
  }

  const canSend =
    draft.trim().length > 0 && !isStreaming && !ended && !atTurnLimit;

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-muted/50 px-4 py-3 ring-1 ring-foreground/10">
        <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <MessageSquare aria-hidden="true" className="size-3.5" />
          {t("block.roleplay.scenario")}
        </p>
        <p className="mt-1.5 text-sm leading-relaxed">{scenario}</p>
        <p className="mt-2 flex items-start gap-1.5 text-sm">
          <Target aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span>
            <span className="font-medium">{t("block.roleplay.goal")}</span>
            {goal}
          </span>
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          {t("block.roleplay.partner", { persona })}
        </p>
      </div>

      <div
        aria-label={t("block.roleplay.conversation")}
        aria-live="polite"
        className="max-h-96 min-h-44 space-y-2 overflow-y-auto rounded-lg border px-3 py-3"
        ref={scrollRef}
        role="log"
      >
        {messages.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {t("block.roleplay.empty")}
          </p>
        ) : null}

        {messages.map((message) => (
          <div
            className={cn(
              "max-w-[85%] rounded-lg px-3 py-2 text-sm",
              message.role === "user"
                ? "ml-auto bg-primary text-primary-foreground"
                : "bg-muted",
            )}
            key={message.id}
          >
            {message.content.length === 0 ? (
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
                {t("block.roleplay.inCharacter")}
              </span>
            ) : (
              <p className="whitespace-pre-wrap">{message.content}</p>
            )}
          </div>
        ))}
      </div>

      {chatError === null ? null : (
        <p
          aria-live="polite"
          className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-700"
        >
          {chatError}
        </p>
      )}

      {atTurnLimit && !ended ? (
        <p className="text-xs text-muted-foreground">
          {t("block.roleplay.limit")}
        </p>
      ) : null}

      <form
        className="flex items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void send(draft);
        }}
      >
        <Textarea
          aria-label={t("block.roleplay.yourMessage")}
          className="min-h-10 flex-1"
          disabled={isStreaming || ended}
          onChange={(event) => {
            setDraft(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void send(draft);
            }
          }}
          placeholder={
            ended
              ? t("block.roleplay.overPlaceholder")
              : t("block.roleplay.replyPlaceholder")
          }
          rows={2}
          value={draft}
        />
        <Button
          aria-label={t("block.roleplay.send")}
          disabled={!canSend}
          size="icon"
          type="submit"
        >
          {isStreaming ? (
            <Loader2 aria-hidden="true" className="animate-spin" />
          ) : (
            <SendHorizontal aria-hidden="true" />
          )}
        </Button>
      </form>

      <div className="flex flex-wrap items-center gap-2 border-t pt-4">
        {ended ? (
          <Button onClick={playAgain} variant="outline">
            <RotateCcw aria-hidden="true" />
            {t("block.roleplay.playAgain")}
          </Button>
        ) : (
          <>
            <Button
              disabled={isStreaming || isReporting}
              onClick={() => {
                void endAndGetFeedback();
              }}
            >
              {isReporting ? (
                <>
                  <Loader2 aria-hidden="true" className="animate-spin" />
                  {t("block.roleplay.marking")}
                </>
              ) : (
                t("block.roleplay.end")
              )}
            </Button>
            <p className="text-xs text-muted-foreground">
              {t("block.roleplay.criteriaNote", { count: rubric.length })}
            </p>
          </>
        )}
      </div>

      {reportError === null ? null : (
        <p
          aria-live="polite"
          className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-700"
        >
          {reportError}
        </p>
      )}

      {report === null ? null : (
        <div className="space-y-3 rounded-lg border border-emerald-500/40 bg-emerald-500/5 px-4 py-4">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium">
              {t("block.roleplay.report")}
            </h3>
            <Badge variant="secondary">
              {t("block.roleplay.criteriaCount", {
                count: report.criteria.length,
              })}
            </Badge>
          </div>

          <ul className="space-y-3">
            {report.criteria.map((criterion) => (
              <li className="space-y-1" key={criterion.criterion}>
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-medium">{criterion.criterion}</p>
                  <Badge
                    aria-label={t("block.roleplay.score", {
                      score: criterion.score,
                    })}
                    variant="outline"
                    className="shrink-0 tabular-nums"
                  >
                    {criterion.score} / 5
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {criterion.comment}
                </p>
              </li>
            ))}
          </ul>

          <div className="rounded-md bg-background/60 px-3 py-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("block.roleplay.nextTime")}
            </p>
            <p className="mt-1 text-sm">{report.suggestion}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              disabled={completed}
              onClick={() => {
                onComplete(block.id);
              }}
              variant={completed ? "secondary" : "default"}
            >
              {completed ? (
                <>
                  <Check aria-hidden="true" />
                  {t("block.roleplay.markedDone")}
                </>
              ) : (
                t("block.roleplay.markDone")
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
