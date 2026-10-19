"use client";

import { useTransition } from "react";

import { LOCALES, LOCALE_LABELS } from "@/i18n/config";
import { useI18n } from "@/i18n/client";
import { writeLocaleCookie } from "@/i18n/cookie";
import { cn } from "@/lib/utils";

/**
 * EN / 中文 switcher.
 *
 * The choice lives in a cookie rather than in the URL, so switching language
 * keeps the current page. A full reload is used instead of a client-side
 * navigation: the locale is resolved on the server, and every cached segment
 * has to be rendered again in the new language.
 */
export function LocaleSwitcher() {
  const { locale, t } = useI18n();
  const [isPending, startTransition] = useTransition();

  function choose(next: (typeof LOCALES)[number]): void {
    if (next === locale) {
      return;
    }

    writeLocaleCookie(next);
    startTransition(() => {
      window.location.reload();
    });
  }

  return (
    <div
      aria-label={t("locale.switcher")}
      className="flex items-center rounded-full p-0.5 ring-1 ring-foreground/15"
      role="group"
    >
      {LOCALES.map((option) => (
        <button
          aria-pressed={option === locale}
          className={cn(
            "rounded-full px-2 py-1 text-xs font-medium transition-colors",
            option === locale
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
          disabled={isPending}
          key={option}
          onClick={() => {
            choose(option);
          }}
          type="button"
        >
          {LOCALE_LABELS[option]}
        </button>
      ))}
    </div>
  );
}
