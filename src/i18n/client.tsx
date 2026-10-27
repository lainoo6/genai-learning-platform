"use client";

import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";

import { htmlLang, type Locale } from "@/i18n/config";
import { createTranslator, type Messages, type Translator } from "@/i18n/translate";

/**
 * Client-side i18n.
 *
 * The server resolves the locale from the cookie and passes the merged
 * messages down, so a client component never has to fetch a dictionary and the
 * first paint already uses the right language.
 */

type I18nValue = {
  locale: Locale;
  messages: Messages;
  t: Translator;
};

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({
  locale,
  messages,
  children,
}: {
  locale: Locale;
  messages: Messages;
  children: ReactNode;
}) {
  const value = useMemo<I18nValue>(
    () => ({ locale, messages, t: createTranslator(messages) }),
    [locale, messages],
  );

  // The document is rendered once and cached; keep its declared language in
  // sync with the chosen one for screen readers and spell checkers.
  useEffect(() => {
    document.documentElement.lang = htmlLang(locale);
  }, [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** Current locale plus its translator. */
export function useI18n(): I18nValue {
  const value = useContext(I18nContext);

  if (value === null) {
    throw new Error("useI18n must be used inside <I18nProvider>.");
  }

  return value;
}

/** Shorthand for the common case: only the translator is needed. */
export function useT(): Translator {
  return useI18n().t;
}
