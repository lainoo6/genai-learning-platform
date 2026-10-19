import type { Locale } from "@/i18n/config";

/**
 * Language of the *content* an LLM call produces.
 *
 * This is independent from the stored course language: a course keeps the
 * language it was generated in, while the interface can be switched at any
 * time. Every prompt carries a `Content language:` line, which is also the
 * contract the mock fallbacks read to pick their canned translation.
 */

export type ContentLanguage = "en" | "zh";

/** Name used inside prompts and shown in logs. */
export const CONTENT_LANGUAGE_LABEL: Record<ContentLanguage, string> = {
  en: "English",
  zh: "Chinese (Simplified)",
};

/** The interface language decides the language of newly generated content. */
export function contentLanguageFromLocale(locale: Locale): ContentLanguage {
  return locale === "zh" ? "zh" : "en";
}

/** The marker line every prompt carries. */
export function contentLanguageLine(language: ContentLanguage): string {
  return `Content language: ${CONTENT_LANGUAGE_LABEL[language]}`;
}

/** Reads the marker back out of a generated prompt; defaults to English. */
export function readContentLanguage(prompt: string | null | undefined): ContentLanguage {
  const match = /^Content language: (.+)$/m.exec(prompt ?? "");
  const value = match?.[1]?.trim().toLowerCase() ?? "";

  return value.startsWith("chinese") ? "zh" : "en";
}
