import { describe, expect, it } from "vitest";

import {
  createTranslator,
  interpolate,
  mergeMessages,
  translateMessages,
  type Messages,
} from "@/i18n/translate";

const EN: Messages = {
  "enroll.button.submit": "Enroll and start",
  "courses.count": "{visible} of {total} courses",
  "courses.title": "Course catalog",
};

const ZH: Messages = {
  "enroll.button.submit": "报名并开始",
  "courses.count": "共 {total} 门课程，显示 {visible} 门",
};

describe("translateMessages", () => {
  it("returns the message for the active language", () => {
    expect(translateMessages(ZH, "enroll.button.submit")).toBe("报名并开始");
  });

  it("falls back to English when the key is missing from the active language", () => {
    const merged = mergeMessages(ZH, EN);

    expect(translateMessages(merged, "courses.title")).toBe("Course catalog");
  });

  it("treats a blank translation as missing and falls back", () => {
    const merged = mergeMessages({ "courses.title": "   " }, EN);

    expect(translateMessages(merged, "courses.title")).toBe("Course catalog");
  });

  it("prefers the active language over English", () => {
    const merged = mergeMessages(ZH, EN);

    expect(translateMessages(merged, "enroll.button.submit")).toBe("报名并开始");
  });

  it("returns the key itself when neither language defines it", () => {
    expect(translateMessages(mergeMessages(ZH, EN), "missing.key")).toBe(
      "missing.key",
    );
  });

  it("fills placeholders in either language", () => {
    const merged = mergeMessages(ZH, EN);

    expect(translateMessages(merged, "courses.count", { visible: 2, total: 7 }))
      .toBe("共 7 门课程，显示 2 门");
    expect(
      translateMessages(mergeMessages(EN, EN), "courses.count", {
        visible: 2,
        total: 7,
      }),
    ).toBe("2 of 7 courses");
  });
});

describe("interpolate", () => {
  it("leaves unknown placeholders untouched", () => {
    expect(interpolate("Hello {name}, {missing}", { name: "Ada" })).toBe(
      "Hello Ada, {missing}",
    );
  });

  it("returns the template unchanged when there are no values", () => {
    expect(interpolate("Plain text")).toBe("Plain text");
  });
});

describe("createTranslator", () => {
  it("binds the translator to one message set", () => {
    const t = createTranslator(EN);

    expect(t("enroll.button.submit")).toBe("Enroll and start");
    expect(t("missing.key")).toBe("missing.key");
  });
});
