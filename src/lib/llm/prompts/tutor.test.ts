import { describe, expect, it } from "vitest";

import { getAudienceRule } from "@/lib/llm/prompts/audience";
import {
  describeProfile,
  tutorSystemPrompt,
  type TutorContext,
} from "@/lib/llm/prompts/tutor";
import type { LearnerProfile } from "@/lib/profile";

function profile(overrides: Partial<LearnerProfile> = {}): LearnerProfile {
  return {
    background: "NON_CS",
    backgroundNote: "",
    goals: [],
    goalNote: "",
    statement: "",
    ...overrides,
  };
}

const context: Omit<TutorContext, "profile"> = {
  courseTitle: "Software basics",
  lessonTitle: "Testing",
  blockType: "reading",
  blockTitle: "What is a regression test",
  blockDigest: "A regression test re-runs earlier checks.",
};

describe("describeProfile", () => {
  it("includes the learner's own note about their background", () => {
    const text = describeProfile(
      profile({ backgroundNote: "I studied biology." }),
    );

    expect(text).toContain("Note on background: I studied biology.");
  });
});

describe("tutorSystemPrompt", () => {
  it("injects the audience rule for the learner's background", () => {
    const prompt = tutorSystemPrompt({
      ...context,
      profile: profile({ background: "PRO_DEV" }),
    });

    expect(prompt).toContain(
      `Style for this learner: ${getAudienceRule("PRO_DEV")}`,
    );
  });

  it("falls back to the unknown-background rule without a profile", () => {
    const prompt = tutorSystemPrompt({ ...context, profile: null });

    expect(prompt).toContain(`Style for this learner: ${getAudienceRule(null)}`);
  });
});
