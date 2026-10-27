import en from "@/i18n/en.json";
import { createTranslator, type Messages, type Translator } from "@/i18n/translate";

/**
 * The English dictionary as a translator.
 *
 * Server actions and pure helpers that run outside a request (unit tests, CSV
 * parsing) use this default and let the caller pass a request-bound translator
 * instead.
 */
export const ENGLISH_MESSAGES: Messages = en as Messages;

export const englishT: Translator = createTranslator(ENGLISH_MESSAGES);
