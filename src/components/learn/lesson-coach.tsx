"use client";

import { Lightbulb } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";

/**
 * A learner who stalls rarely opens the tutor drawer on their own, so the
 * nudge has to come from the page. Dwell time on an unfinished block is the
 * only signal we need: it requires no changes to the block components.
 */
const STALL_MS = 90_000;
const TICK_MS = 1_000;

type StalledBlock = {
  id: string;
  type: string;
  hint: string | null;
};

export type LessonCoachProps = {
  nextLesson?: { title: string; href: string };
  /** The server already knows whether every activity in this lesson is done. */
  completed: boolean;
};

function dismissalKey(lessonId: string, blockId: string): string {
  return `coach:dismissed:${lessonId}:${blockId}`;
}

function isDismissed(lessonId: string, blockId: string): boolean {
  try {
    return (
      window.sessionStorage.getItem(dismissalKey(lessonId, blockId)) === "1"
    );
  } catch {
    // Storage can be blocked; the in-memory dismissal still covers this page view.
    return false;
  }
}

export function LessonCoach({ nextLesson, completed }: LessonCoachProps) {
  const t = useT();
  const pathname = usePathname();
  // Keep the props contract small: the lesson id is already in the URL.
  const lessonId = pathname.split("/").filter(Boolean).at(-1) ?? "lesson";

  const [prompt, setPrompt] = useState<StalledBlock | null>(null);
  const [advice, setAdvice] = useState<string | null>(null);
  const active = useRef<StalledBlock | null>(null);
  const prompted = useRef<Set<string>>(new Set());
  const dismissed = useRef<Set<string>>(new Set());

  // Literal keys only, so dictionaries.test.ts verifies every one of them.
  function guideFor(type: string): string {
    switch (type) {
      case "reading":
        return t("coach.guide.reading");
      case "quiz":
        return t("coach.guide.quiz");
      case "flashcards":
        return t("coach.guide.flashcards");
      case "reflection":
        return t("coach.guide.reflection");
      case "slides":
        return t("coach.guide.slides");
      case "coding":
        return t("coach.guide.coding");
      case "game":
        return t("coach.guide.game");
      case "simulation":
        return t("coach.guide.simulation");
      case "roleplay":
        return t("coach.guide.roleplay");
      default:
        return t("coach.guide.generic");
    }
  }

  useEffect(() => {
    if (completed) {
      active.current = null;
      return;
    }
    if (typeof IntersectionObserver === "undefined") {
      return;
    }

    const wrappers = Array.from(
      document.querySelectorAll<HTMLElement>("[data-block-id]"),
    );
    const visible = new Set<HTMLElement>();
    const elapsed = new Map<string, number>();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const element = entry.target as HTMLElement;
          if (entry.isIntersecting) {
            visible.add(element);
          } else {
            visible.delete(element);
            // Scrolling away restarts the clock; scrolling back is a fresh read.
            elapsed.delete(element.dataset.blockId ?? "");
          }
        }
      },
      { threshold: 0 },
    );
    for (const wrapper of wrappers) {
      observer.observe(wrapper);
    }

    const timer = window.setInterval(() => {
      if (document.hidden || active.current !== null) {
        return;
      }
      for (const element of visible) {
        const id = element.dataset.blockId ?? "";
        if (id.length === 0 || element.dataset.blockCompleted === "true") {
          continue;
        }
        if (prompted.current.has(id) || dismissed.current.has(id)) {
          continue;
        }
        if (isDismissed(lessonId, id)) {
          dismissed.current.add(id);
          continue;
        }
        const total = (elapsed.get(id) ?? 0) + TICK_MS;
        elapsed.set(id, total);
        if (total < STALL_MS) {
          continue;
        }
        prompted.current.add(id);
        const next: StalledBlock = {
          id,
          type: element.dataset.blockType ?? "",
          hint: element.dataset.blockHint ?? null,
        };
        active.current = next;
        setAdvice(null);
        setPrompt(next);
        break;
      }
    }, TICK_MS);

    return () => {
      observer.disconnect();
      window.clearInterval(timer);
    };
  }, [completed, lessonId]);

  // The floating bar would sit on top of the bottom navigation on a phone;
  // extra scroll room exists only while the bar is actually shown.
  useEffect(() => {
    if (completed || prompt === null) {
      return;
    }
    const main = document.querySelector<HTMLElement>("main");
    if (main === null) {
      return;
    }
    const previous = main.style.paddingBottom;
    main.style.paddingBottom = "6rem";
    return () => {
      main.style.paddingBottom = previous;
    };
  }, [completed, prompt]);

  function close(): void {
    if (prompt !== null) {
      dismissed.current.add(prompt.id);
      try {
        window.sessionStorage.setItem(dismissalKey(lessonId, prompt.id), "1");
      } catch {
        // Storage can be blocked; the in-memory dismissal still applies.
      }
    }
    active.current = null;
    setAdvice(null);
    setPrompt(null);
  }

  function showHint(): void {
    if (prompt === null) {
      return;
    }
    const wrapper = Array.from(
      document.querySelectorAll<HTMLElement>("[data-block-id]"),
    ).find((element) => element.dataset.blockId === prompt.id);
    wrapper?.scrollIntoView({ behavior: "smooth", block: "center" });
    // Some blocks keep their hints in a collapsed panel; open the first one so
    // the learner lands on readable text instead of a closed summary.
    const panel = wrapper?.querySelector("details");
    if (panel !== null && panel !== undefined) {
      panel.open = true;
    }
    setAdvice(prompt.hint ?? guideFor(prompt.type));
  }

  const shownPrompt = completed ? null : prompt;

  return (
    <>
      {completed ? (
        <section
          aria-label={t("coach.next.aria")}
          className="rounded-xl border border-primary/30 bg-background px-4 py-4"
        >
          <p className="text-sm font-medium">{t("coach.next.title")}</p>
          {nextLesson === undefined ? (
            <>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("coach.next.last")}
              </p>
              <Link
                className={cn(
                  buttonVariants({ size: "sm", variant: "secondary" }),
                  "mt-3",
                )}
                href="/dashboard"
              >
                {t("coach.next.dashboard")}
              </Link>
            </>
          ) : (
            <>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("coach.next.body", { title: nextLesson.title })}
              </p>
              <Link
                className={cn(buttonVariants({ size: "sm" }), "mt-3")}
                href={nextLesson.href}
              >
                {t("coach.next.continue")}
              </Link>
            </>
          )}
        </section>
      ) : null}

      {shownPrompt === null ? null : (
        <div
          aria-label={t("coach.stall.aria")}
          className="fixed bottom-4 left-4 right-32 z-30 rounded-xl border border-border bg-background p-3 text-sm shadow-lg sm:left-1/2 sm:right-auto sm:w-[26rem] sm:-translate-x-1/2"
          role="status"
        >
          <div className="flex items-start gap-2">
            <Lightbulb
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0 text-amber-500"
            />
            <div className="min-w-0 flex-1">
              <p className="font-medium">{t("coach.stall.title")}</p>
              {advice === null ? null : (
                <p className="mt-1 text-muted-foreground">{advice}</p>
              )}
              <div className="mt-2 flex flex-wrap gap-2">
                {advice === null ? (
                  <Button onClick={showHint} size="sm" type="button">
                    {t("coach.stall.show")}
                  </Button>
                ) : null}
                <Button
                  onClick={close}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  {advice === null
                    ? t("coach.stall.dismiss")
                    : t("coach.stall.close")}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
