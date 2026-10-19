/**
 * Pure translation helpers.
 *
 * Nothing in this module imports a dictionary: the server renders with the
 * messages it loaded for the request, and the browser receives the merged
 * messages as props. That keeps both dictionaries out of the client bundle.
 */

export type Messages = Record<string, string>;

export type TranslateValues = Record<string, string | number>;

/** A translator bound to one set of messages. */
export type Translator = (key: string, values?: TranslateValues) => string;

const PLACEHOLDER = /\{(\w+)\}/g;

/** Replaces `{name}` placeholders; unknown placeholders are left untouched. */
export function interpolate(template: string, values?: TranslateValues): string {
  if (values === undefined || values === null) {
    return template;
  }

  return template.replace(PLACEHOLDER, (match, name: string) => {
    const value = values[name];
    return value === undefined ? match : String(value);
  });
}

/**
 * Overlays `primary` on `fallback`.
 *
 * A missing or blank key in the active language therefore falls back to the
 * English string instead of showing a raw key to the learner.
 */
export function mergeMessages(primary: Messages, fallback: Messages): Messages {
  const merged: Messages = { ...fallback };

  for (const [key, value] of Object.entries(primary)) {
    if (value.trim().length > 0) {
      merged[key] = value;
    }
  }

  return merged;
}

/**
 * Looks a key up in the merged messages.
 *
 * Returns the key itself when neither language defines it, which makes a
 * forgotten key obvious during development while never crashing a page.
 */
export function translateMessages(
  messages: Messages,
  key: string,
  values?: TranslateValues,
): string {
  const template = messages[key];

  if (template === undefined || template.trim().length === 0) {
    return key;
  }

  return interpolate(template, values);
}

/** Binds `translateMessages` to one message set. */
export function createTranslator(messages: Messages): Translator {
  return (key, values) => translateMessages(messages, key, values);
}
