import { DEFAULT_LOCALE, type Locale } from "@/i18n/config";
import en from "@/i18n/en.json";
import zh from "@/i18n/zh.json";
import type { Messages } from "@/i18n/translate";

/**
 * Dictionary loading. `en` is the fallback for every other language, so a key
 * that has not been translated yet still renders English instead of a raw key.
 */

const DICTIONARIES: Record<Locale, Messages> = {
  en: en as Messages,
  zh: zh as Messages,
};

export function getDictionary(locale: Locale): Messages {
  return DICTIONARIES[locale] ?? DICTIONARIES[DEFAULT_LOCALE];
}
