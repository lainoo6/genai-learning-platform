import { cookies } from "next/headers";
import { cache } from "react";

import { DEFAULT_LOCALE, LOCALE_COOKIE, resolveLocale, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import {
  createTranslator,
  mergeMessages,
  type Messages,
  type Translator,
} from "@/i18n/translate";

/**
 * Request-scoped i18n for Server Components and Server Actions.
 *
 * `cookies()` is cached per request by React, so a page can call `getI18n()`
 * from every component without paying for the read more than once. Pages are
 * rendered inside the locale shell in the root layout, which is the Suspense
 * boundary Cache Components needs for this request-time access.
 */

export const getLocale = cache(async (): Promise<Locale> => {
  const store = await cookies();
  return resolveLocale(store.get(LOCALE_COOKIE)?.value);
});

export const getMessages = cache(async (): Promise<Messages> => {
  const locale = await getLocale();
  return mergeMessages(getDictionary(locale), getDictionary(DEFAULT_LOCALE));
});

export type ServerI18n = {
  locale: Locale;
  messages: Messages;
  t: Translator;
};

export const getI18n = cache(async (): Promise<ServerI18n> => {
  const [locale, messages] = await Promise.all([getLocale(), getMessages()]);

  return { locale, messages, t: createTranslator(messages) };
});
