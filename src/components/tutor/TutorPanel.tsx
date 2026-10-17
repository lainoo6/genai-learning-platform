"use client";

import { Loader2, SendHorizontal, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import type { TutorMessageView } from "@/lib/tutor";
import { cn } from "@/lib/utils";
import { trackTutorOpen } from "@/server/tutor";

/**
 * AI tutor drawer (P4.3).
 *
 * A floating button opens a drawer: a right-hand panel on desktop, a bottom
 * sheet on phones. Questions go to `/api/tutor`, which streams the answer back
 * as plain text; the reply is appended chunk by chunk so it reads as typing.
 *
 * History comes from the server as `initialMessages` (the last 20 messages of
 * this lesson's TutorSession), so a reload keeps the conversation.
 */

const SUGGESTIONS = [
  "Explain this simply",
  "Give me an example",
  "Quiz me on this",
] as const;

export type TutorPanelProps = {
  courseId: string;
  lessonId: string;
  lessonTitle: string;
  initialMessages: TutorMessageView[];
  /** True when the LLM layer is in mock mode, so the panel can say so. */
  mockMode: boolean;
};

export function TutorPanel({
  courseId,
  lessonId,
  lessonTitle,
  initialMessages,
  mockMode,
}: TutorPanelProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<TutorMessageView[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isTracking, startTracking] = useTransition();
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Keep the newest message in view while a reply streams in.
  useEffect(() => {
    const container = scrollRef.current;
    if (container !== null) {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages]);

  function openPanel(): void {
    setOpen(true);
    startTracking(async () => {
      await trackTutorOpen(courseId, lessonId);
    });
  }

  async function send(question: string): Promise<void> {
    const trimmed = question.trim();
    if (trimmed.length === 0 || isStreaming) {
      return;
    }

    setError(null);
    setDraft("");
    setIsStreaming(true);

    const userMessage: TutorMessageView = {
      id: `pending-user-${Date.now()}`,
      role: "user",
      content: trimmed,
    };
    const replyId = `pending-reply-${Date.now()}`;

    setMessages((previous) => [
      ...previous,
      userMessage,
      { id: replyId, role: "assistant", content: "" },
    ]);

    try {
      const response = await fetch("/api/tutor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lessonId, message: trimmed }),
      });

      if (!response.ok || response.body === null) {
        throw new Error(`The tutor is unavailable (${response.status}).`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      // Streams arrive as raw UTF-8 text deltas; `stream: true` keeps multi-byte
      // characters that are split across chunks intact.
      for (;;) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        const delta = decoder.decode(value, { stream: true });
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
        setMessages((previous) =>
          previous.map((message) =>
            message.id === replyId
              ? { ...message, content: message.content + tail }
              : message,
          ),
        );
      }
    } catch (cause: unknown) {
      setMessages((previous) =>
        previous.filter(
          (message) => message.id !== replyId || message.content.length > 0,
        ),
      );
      setError(
        cause instanceof Error
          ? cause.message
          : "The tutor could not answer. Try again in a moment.",
      );
    } finally {
      setIsStreaming(false);
    }
  }

  const canSend = draft.trim().length > 0 && !isStreaming;

  return (
    <>
      {open ? null : (
        <Button
          className="fixed bottom-5 right-5 z-40 shadow-lg"
          onClick={openPanel}
        >
          <Sparkles aria-hidden="true" />
          AI tutor
        </Button>
      )}

      {open ? (
        <aside
          aria-label="AI tutor"
          className="fixed inset-x-0 bottom-0 z-50 flex h-[80vh] flex-col border-t bg-background shadow-2xl sm:inset-y-0 sm:left-auto sm:right-0 sm:h-full sm:w-96 sm:border-l sm:border-t-0"
        >
          <header className="flex items-start gap-2 border-b px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-sm font-medium">
                <Sparkles aria-hidden="true" className="size-4" />
                AI tutor
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {lessonTitle}
              </p>
            </div>
            <Button
              aria-label="Close tutor"
              onClick={() => {
                setOpen(false);
              }}
              size="icon"
              variant="ghost"
            >
              <X aria-hidden="true" />
            </Button>
          </header>

          <div
            className="flex-1 space-y-3 overflow-y-auto px-4 py-4 text-sm"
            ref={scrollRef}
          >
            <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
              Ask about this lesson. I can see what you are working on
              {mockMode ? " (answers are running in mock mode)." : "."}
            </p>

            {messages.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No conversation yet — start with one of the questions below.
              </p>
            ) : null}

            {messages.map((message) => (
              <div
                className={cn(
                  "max-w-[85%] rounded-lg px-3 py-2",
                  message.role === "user"
                    ? "ml-auto bg-primary text-primary-foreground"
                    : "bg-muted",
                )}
                key={message.id}
              >
                {message.content.length === 0 ? (
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <Loader2
                      aria-hidden="true"
                      className="size-3.5 animate-spin"
                    />
                    Thinking…
                  </span>
                ) : (
                  <p className="whitespace-pre-wrap">{message.content}</p>
                )}
              </div>
            ))}

            {error === null ? null : (
              <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-700">
                {error}
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-2 border-t px-4 py-2">
            {SUGGESTIONS.map((suggestion) => (
              <Button
                disabled={isStreaming}
                key={suggestion}
                onClick={() => {
                  void send(suggestion);
                }}
                size="sm"
                variant="outline"
              >
                {suggestion}
              </Button>
            ))}
          </div>

          <form
            className="flex items-end gap-2 border-t px-4 py-3"
            onSubmit={(event) => {
              event.preventDefault();
              void send(draft);
            }}
          >
            <textarea
              aria-label="Ask the tutor"
              className="min-h-10 max-h-32 flex-1 resize-y rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring"
              disabled={isStreaming}
              onChange={(event) => {
                setDraft(event.target.value);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void send(draft);
                }
              }}
              placeholder="Ask about this lesson…"
              rows={2}
              value={draft}
            />
            <Button
              aria-label="Send message"
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

          {isTracking ? (
            <p className="px-4 pb-2 text-[11px] text-muted-foreground">
              Opening tutor…
            </p>
          ) : null}
        </aside>
      ) : null}
    </>
  );
}
