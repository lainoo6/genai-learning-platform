import { describe, expect, it } from "vitest";

import {
  narrationLang,
  pickVoice,
  textLang,
  type VoiceLike,
} from "@/i18n/speech";

const VOICES: VoiceLike[] = [
  { name: "Google US English", lang: "en-US", localService: false },
  { name: "Microsoft David", lang: "en-US", localService: true },
  { name: "Microsoft Huihui", lang: "zh-CN", localService: true },
  { name: "Google 普通话", lang: "zh-CN", localService: false },
  { name: "Microsoft Tracy", lang: "zh-HK", localService: true },
  { name: "Microsoft Ichiro", lang: "ja-JP", localService: true },
];

describe("narrationLang", () => {
  it("follows the interface language", () => {
    expect(narrationLang("zh")).toBe("zh-CN");
    expect(narrationLang("en")).toBe("en-US");
  });
});

describe("textLang", () => {
  it("detects the script of a slide", () => {
    expect(textLang("这是中文旁白。")).toBe("zh-CN");
    expect(textLang("This is an English narration.")).toBe("en-US");
  });
});

describe("pickVoice", () => {
  it("prefers a local voice with the exact tag", () => {
    expect(pickVoice(VOICES, "zh-CN")?.name).toBe("Microsoft Huihui");
    expect(pickVoice(VOICES, "en-US")?.name).toBe("Microsoft David");
  });

  it("accepts any voice whose language shares the prefix", () => {
    expect(pickVoice(VOICES, "zh-TW")?.name).toBe("Microsoft Huihui");
  });

  it("falls back to a network voice when nothing is installed", () => {
    const networkOnly = VOICES.filter((voice) => !voice.localService);

    expect(pickVoice(networkOnly, "en-US")?.name).toBe("Google US English");
  });

  it("returns undefined when the language is not installed", () => {
    expect(pickVoice(VOICES, "de-DE")).toBeUndefined();
  });
});
