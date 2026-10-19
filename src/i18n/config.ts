/**
 * Locale configuration shared by the server and the client.
 *
 * The platform keeps the locale in a cookie instead of a `[locale]` route
 * segment: every page already has a stable URL, and switching language must not
 * invalidate links that learners or instructors have bookmarked.
 */

export const LOCALES = ["en", "zh"] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

/** Name of the cookie holding the learner's UI language. */
export const LOCALE_COOKIE = "locale";

/** One year: the choice survives across sessions. */
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** Label shown in the header switcher. */
export const LOCALE_LABELS: Record<Locale, string> = {
  en: "EN",
  zh: "中文",
};

/** `lang` attribute for the document and for speech synthesis. */
export function htmlLang(locale: Locale): string {
  return locale === "zh" ? "zh-CN" : "en";
}

/** BCP-47 tag used when filtering speech-synthesis voices. */
export function speechLang(locale: Locale): string {
  return locale === "zh" ? "zh-CN" : "en-US";
}

/** Two-letter prefix used to match installed voices (`en`, `zh`). */
export function speechLangPrefix(locale: Locale): string {
  return locale === "zh" ? "zh" : "en";
}

/** True when `value` is one of the supported locales. */
export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/** Cookie value (or anything else) to a supported locale, defaulting to English. */
export function resolveLocale(value: unknown): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

/** Language name shown on a course card for content written in that language. */
export const CONTENT_LANGUAGES: Record<string, string> = {
  en: "English",
  zh: "中文",
};
