import { describe, expect, it } from "vitest";

import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
  htmlLang,
  isLocale,
  resolveLocale,
  speechLangPrefix,
} from "@/i18n/config";
import { readLocaleCookie, serializeLocaleCookie } from "@/i18n/cookie";

describe("locale cookie", () => {
  it("serialises the choice so it survives a browser restart", () => {
    const cookie = serializeLocaleCookie("zh");

    expect(cookie).toContain(`${LOCALE_COOKIE}=zh`);
    expect(cookie).toContain("path=/");
    expect(cookie).toContain(`max-age=${LOCALE_COOKIE_MAX_AGE}`);
    expect(cookie).toContain("SameSite=Lax");
  });

  it("reads the locale back out of a cookie header", () => {
    expect(readLocaleCookie("session=abc; locale=zh; theme=dark")).toBe("zh");
    expect(readLocaleCookie("locale=en")).toBe("en");
  });

  it("returns null when the cookie is absent or empty", () => {
    expect(readLocaleCookie("session=abc")).toBeNull();
    expect(readLocaleCookie("")).toBeNull();
    expect(readLocaleCookie(undefined)).toBeNull();
  });
});

describe("resolveLocale", () => {
  it("accepts the supported locales", () => {
    expect(resolveLocale("zh")).toBe("zh");
    expect(resolveLocale("en")).toBe("en");
    expect(isLocale("zh")).toBe(true);
  });

  it("falls back to English for missing or unsupported values", () => {
    expect(resolveLocale(undefined)).toBe(DEFAULT_LOCALE);
    expect(resolveLocale(null)).toBe(DEFAULT_LOCALE);
    expect(resolveLocale("fr")).toBe("en");
    expect(resolveLocale("")).toBe("en");
  });
});

describe("language tags", () => {
  it("uses a full tag for the document and the voice filter", () => {
    expect(htmlLang("zh")).toBe("zh-CN");
    expect(htmlLang("en")).toBe("en");
    expect(speechLangPrefix("zh")).toBe("zh");
    expect(speechLangPrefix("en")).toBe("en");
  });
});
