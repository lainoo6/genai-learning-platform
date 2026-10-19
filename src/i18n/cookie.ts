import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, type Locale } from "@/i18n/config";

/**
 * Cookie helpers for the locale, kept free of `next/headers` so both the
 * browser switcher and the unit tests can use them.
 */

/** `document.cookie` assignment string for the chosen locale. */
export function serializeLocaleCookie(locale: Locale): string {
  return `${LOCALE_COOKIE}=${locale}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; SameSite=Lax`;
}

/** Reads the locale out of a raw `Cookie` header (or `document.cookie`). */
export function readLocaleCookie(cookieHeader: string | null | undefined): string | null {
  if (cookieHeader === null || cookieHeader === undefined || cookieHeader.length === 0) {
    return null;
  }

  for (const part of cookieHeader.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === LOCALE_COOKIE) {
      return decodeURIComponent(rest.join("="));
    }
  }

  return null;
}

/**
 * Writes the chosen locale to `document.cookie`.
 *
 * Kept out of the component so the React Compiler lint rule does not treat the
 * assignment as a render-phase mutation of an outer value.
 */
export function writeLocaleCookie(locale: Locale): void {
  if (typeof document === "undefined") {
    return;
  }

  document.cookie = serializeLocaleCookie(locale);
}
