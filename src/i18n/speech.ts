import { speechLang, type Locale } from "@/i18n/config";

/**
 * Voice selection for the slides narration.
 *
 * The interface language decides which voice is used: a Chinese UI reads with a
 * Chinese voice (Microsoft Huihui and friends are installed locally on
 * Windows), whichever language the deck itself is written in. When the chosen
 * language has no installed voice at all, the text's own script is used as a
 * last resort so the narration is not silent.
 */

/** Minimal shape of `SpeechSynthesisVoice`, so the helper stays unit-testable. */
export type VoiceLike = {
  name: string;
  lang: string;
  localService: boolean;
};

const CJK = /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/;

/** True when the text contains Chinese or Japanese characters. */
export function hasCjk(text: string): boolean {
  return CJK.test(text);
}

/** BCP-47 tag for the interface language, used by `SpeechSynthesisUtterance`. */
export function narrationLang(locale: Locale): string {
  return speechLang(locale);
}

/** Language matching the script of the slide, used only as a fallback. */
export function textLang(text: string): string {
  return hasCjk(text) ? "zh-CN" : "en-US";
}

/**
 * Best installed voice for a language tag.
 *
 * Offline voices are preferred over network ones: Chrome also lists remote
 * voices, and those stay silent when the synthesis service is unreachable.
 * Matching is done on the `en` / `zh` prefix so `zh-CN`, `zh-TW` and `zh-HK`
 * all qualify.
 */
export function pickVoice<T extends VoiceLike>(
  voices: readonly T[],
  lang: string,
): T | undefined {
  const prefix = lang.toLowerCase().split("-")[0] ?? lang.toLowerCase();
  const candidates = voices.filter((voice) =>
    voice.lang.toLowerCase().startsWith(prefix),
  );

  const exactLocal = candidates.find(
    (voice) =>
      voice.localService && voice.lang.toLowerCase() === lang.toLowerCase(),
  );
  if (exactLocal !== undefined) {
    return exactLocal;
  }

  const local = candidates.find((voice) => voice.localService);
  if (local !== undefined) {
    return local;
  }

  return candidates[0];
}
