import { describe, expect, it } from "vitest";

import { getAudienceRule } from "@/lib/llm/prompts/audience";

describe("getAudienceRule", () => {
  it("treats a missing profile as the unknown background", () => {
    expect(getAudienceRule(null)).toContain("background is unknown");
  });

  it("gives every background a distinct, non-empty rule", () => {
    const rules = [
      getAudienceRule("NON_CS"),
      getAudienceRule("CS_STUDENT"),
      getAudienceRule("PRO_DEV"),
      getAudienceRule("OTHER"),
    ];

    expect(new Set(rules).size).toBe(rules.length);
    for (const rule of rules) {
      expect(rule.length).toBeGreaterThan(0);
    }
  });

  it("does not explain beginner ideas to a working developer", () => {
    expect(getAudienceRule("NON_CS")).toContain("Avoid jargon");
    expect(getAudienceRule("PRO_DEV")).toContain("skip beginner analogies");
  });
});
