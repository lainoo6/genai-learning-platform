"use client";

import {
  Check,
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  VolumeX,
} from "lucide-react";
import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/client";
import { narrationLang, pickVoice, textLang } from "@/i18n/speech";
import type {
  BlockRenderProps,
  SlidesBlock as SlidesBlockData,
} from "@/lib/blocks/schema";
import { cn } from "@/lib/utils";

/**
 * Slides block with optional browser narration.
 *
 * One page is shown at a time; its bullets fade in one after another. Every
 * page carries a plain-text script read out by `speechSynthesis`, which the
 * learner can start, pause and resume at will.
 *
 * Completion needs every page to have been shown, plus the last page's
 * narration to have finished — unless the browser has no speech synthesis at
 * all, in which case simply paging through the deck is enough.
 *
 * Keyboard: the deck is a single tab stop; ← / → change page, Enter toggles the
 * narration, and the page dots are ordinary buttons.
 */

/** Delay between two consecutive bullets fading in, in milliseconds. */
const BULLET_STAGGER_MS = 120;

/** Grace period before auto-play starts, so a pending `cancel()` can settle. */
const AUTO_PLAY_DELAY_MS = 150;

/**
 * How long to wait for `onstart` before concluding the browser is not going to
 * read anything aloud. Some browsers accept `speak()` and then never produce a
 * sound — notably when the matching voice is a network voice and the synthesis
 * service is unreachable.
 */
const NARRATION_WATCHDOG_MS = 1500;

export function SlidesBlock({
  block,
  completed,
  onComplete,
}: BlockRenderProps<SlidesBlockData>) {
  const { locale } = useI18n();
  const t = useI18n().t;
  const { slides, autoPlay } = block.payload;

  const [index, setIndex] = useState(0);
  /** Page indices that have been shown at least once. */
  const [viewed, setViewed] = useState<number[]>(() =>
    slides.length > 0 ? [0] : [],
  );
  /** Page indices whose narration ran to the end (cancelled ones do not count). */
  const [narrated, setNarrated] = useState<number[]>([]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  /**
   * Non-null once the browser has refused to actually speak: either the
   * utterance reported an error, or nothing started within the watchdog window.
   * Narration then stops being a requirement to finish the block.
   */
  const [narrationIssue, setNarrationIssue] = useState<string | null>(null);

  /**
   * Whether the browser can read the slides out loud.
   *
   * Checked through `useSyncExternalStore` rather than an effect: the prerender
   * pass has no `window`, so the server snapshot is `false` and React swaps in
   * the real value right after hydration.
   */
  const supportsSpeech = useSyncExternalStore(
    () => () => {},
    () =>
      typeof window !== "undefined"
      && "speechSynthesis" in window
      && typeof window.SpeechSynthesisUtterance === "function",
    () => false,
  );

  /** The utterance allowed to report its own end; anything else was cancelled. */
  const activeUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  /** Timer that decides whether `speak()` ever produced a sound. */
  const watchdogRef = useRef<number | null>(null);

  // Leaving the block (lesson navigation, refresh) must not leave a voice
  // reading a page that is no longer on screen.
  useEffect(
    () => () => {
      if (watchdogRef.current !== null) {
        window.clearTimeout(watchdogRef.current);
      }
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    },
    [],
  );

  const stopNarration = useCallback(() => {
    activeUtteranceRef.current = null;
    if (watchdogRef.current !== null) {
      window.clearTimeout(watchdogRef.current);
      watchdogRef.current = null;
    }
    if (supportsSpeech !== true) {
      return;
    }
    window.speechSynthesis.cancel();
  }, [supportsSpeech]);

  const narrate = useCallback(
    (slideIndex: number) => {
      if (supportsSpeech !== true) {
        return;
      }

      const slide = slides[slideIndex];
      if (slide === undefined) {
        return;
      }

      const synthesis = window.speechSynthesis;
      synthesis.cancel();

      // The interface language picks the voice: a Chinese UI reads with an
      // installed zh-* voice such as Microsoft Huihui. Only when that language
      // has no voice at all does the script of the slide decide.
      const lang = narrationLang(locale);
      const utterance = new SpeechSynthesisUtterance(slide.narration);
      utterance.lang = lang;
      utterance.rate = 1;

      // Prefer a voice installed on this machine. Chrome also offers network
      // voices, which need a round trip to a synthesis service and stay silent
      // when it cannot be reached.
      const voices = synthesis.getVoices();
      const voice =
        pickVoice(voices, lang) ?? pickVoice(voices, textLang(slide.narration));
      if (voice !== undefined) {
        utterance.voice = voice;
        utterance.lang = voice.lang;
      }

      let started = false;

      const clearWatchdog = (): void => {
        if (watchdogRef.current !== null) {
          window.clearTimeout(watchdogRef.current);
          watchdogRef.current = null;
        }
      };

      const forget = (): void => {
        clearWatchdog();
        if (activeUtteranceRef.current !== utterance) {
          return;
        }
        activeUtteranceRef.current = null;
        setIsSpeaking(false);
        setIsPaused(false);
      };

      utterance.onstart = () => {
        started = true;
        clearWatchdog();
        setNarrationIssue(null);
      };

      utterance.onend = () => {
        forget();
        setNarrated((previous) =>
          previous.includes(slideIndex) ? previous : [...previous, slideIndex],
        );
      };

      utterance.onerror = (event: SpeechSynthesisErrorEvent) => {
        forget();
        setNarrationIssue(event.error || "the request was refused");
      };

      activeUtteranceRef.current = utterance;
      setIsSpeaking(true);
      setIsPaused(false);
      synthesis.speak(utterance);

      watchdogRef.current = window.setTimeout(() => {
        watchdogRef.current = null;
        if (started || activeUtteranceRef.current !== utterance) {
          return;
        }
        activeUtteranceRef.current = null;
        setIsSpeaking(false);
        setNarrationIssue("nothing started speaking");
      }, NARRATION_WATCHDOG_MS);
    },
    [locale, slides, supportsSpeech],
  );

  // Changing page always silences the previous one; `autoPlay` then starts the
  // new page's narration on its own.
  useEffect(() => {
    if (supportsSpeech !== true) {
      return undefined;
    }

    stopNarration();

    if (!autoPlay) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      narrate(index);
    }, AUTO_PLAY_DELAY_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [autoPlay, index, narrate, stopNarration, supportsSpeech]);

  const goTo = useCallback(
    (target: number) => {
      if (target < 0 || target >= slides.length) {
        return;
      }
      setIndex(target);
      setViewed((previous) =>
        previous.includes(target) ? previous : [...previous, target],
      );
    },
    [slides.length],
  );

  function toggleNarration(): void {
    if (supportsSpeech !== true) {
      return;
    }

    const synthesis = window.speechSynthesis;

    if (synthesis.paused) {
      synthesis.resume();
      setIsPaused(false);
      setIsSpeaking(true);
      return;
    }

    if (synthesis.speaking) {
      synthesis.pause();
      setIsPaused(true);
      setIsSpeaking(false);
      return;
    }

    narrate(index);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    // Keys pressed on the buttons inside the deck bubble up here; only handle
    // the ones aimed at the deck itself.
    if (event.target !== event.currentTarget) {
      return;
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      goTo(index + 1);
      return;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      goTo(index - 1);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      toggleNarration();
    }
  }

  const slide = slides[index];
  if (slide === undefined) {
    return null;
  }

  const allViewed = viewed.length === slides.length;
  const lastNarrated = narrated.includes(slides.length - 1);

  /**
   * Narration only gates completion while it actually works. A browser that
   * cannot speak — or one that accepts the request and then stays silent —
   * falls back to the same rule as the reading blocks: seeing every slide is
   * enough.
   */
  const narrationRequired = supportsSpeech === true && narrationIssue === null;
  const canComplete = allViewed && (!narrationRequired || lastNarrated);

  const hint = !allViewed
    ? t("block.slides.hint.open", { total: slides.length })
    : narrationRequired && !lastNarrated
      ? t("block.slides.hint.narrate")
      : t("block.slides.hint.done");

  return (
    <div
      aria-roledescription="slideshow"
      className="space-y-4 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      onKeyDown={handleKeyDown}
      role="group"
      tabIndex={0}
    >
      <div className="rounded-xl bg-muted/50 px-5 py-6 ring-1 ring-foreground/10">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t("block.slides.position", {
            current: index + 1,
            total: slides.length,
          })}
        </p>

        {/* Keyed by page so the fade-in replays on every page change. */}
        <div className="mt-2" key={index}>
          <h3 className="animate-in fade-in-0 slide-in-from-bottom-1 text-lg font-semibold duration-500">
            {slide.title}
          </h3>
          <ul className="mt-3 space-y-2">
            {slide.bullets.map((bullet, bulletIndex) => (
              <li
                className="animate-in fade-in-0 slide-in-from-bottom-1 flex gap-2 text-sm leading-relaxed duration-500"
                key={bulletIndex}
                style={{ animationDelay: `${bulletIndex * BULLET_STAGGER_MS}ms` }}
              >
                <span
                  aria-hidden="true"
                  className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary/60"
                />
                <span>{bullet}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          aria-label={t("block.slides.previous")}
          disabled={index === 0}
          onClick={() => {
            goTo(index - 1);
          }}
          size="icon"
          variant="outline"
        >
          <ChevronLeft aria-hidden="true" />
        </Button>
        <Button
          aria-label={t("block.slides.next")}
          disabled={index === slides.length - 1}
          onClick={() => {
            goTo(index + 1);
          }}
          size="icon"
          variant="outline"
        >
          <ChevronRight aria-hidden="true" />
        </Button>

        {supportsSpeech === true ? (
          <Button onClick={toggleNarration} variant="outline">
            {isSpeaking ? (
              <>
                <Pause aria-hidden="true" />
                {t("block.slides.pause")}
              </>
            ) : (
              <>
                <Play aria-hidden="true" />
                {isPaused
                  ? t("block.slides.resume")
                  : t("block.slides.play")}
              </>
            )}
          </Button>
        ) : null}

        <div className="ml-auto flex items-center gap-0.5">
          {slides.map((_, dotIndex) => (
            <button
              aria-current={dotIndex === index}
              aria-label={t("block.slides.goto", { index: dotIndex + 1 })}
              className="flex size-7 items-center justify-center rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              key={dotIndex}
              onClick={() => {
                goTo(dotIndex);
              }}
              type="button"
            >
              <span
                className={cn(
                  "size-2.5 rounded-full transition-colors",
                  dotIndex === index
                    ? "bg-primary"
                    : "bg-foreground/20 hover:bg-foreground/40",
                )}
              />
            </button>
          ))}
        </div>
      </div>

      {supportsSpeech === false ? (
        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <VolumeX aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
          {t("block.slides.unsupported")}
        </p>
      ) : null}

      {narrationIssue === null ? null : (
        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <VolumeX aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
          {t("block.slides.issue", {
            issue: narrationIssue,
            language: locale === "zh" ? "中文" : "英文",
          })}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t pt-4">
        <Button
          disabled={!canComplete || completed}
          onClick={() => {
            onComplete(block.id);
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
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
    </div>
  );
}
