import { describe, expect, it } from "vitest";

import type { Block } from "@/lib/blocks/schema";
import {
  explainResultSchema,
  explainUserPrompt,
  mockExplain,
} from "@/lib/llm/prompts/explain";
import { MOCK_MARKER } from "@/lib/llm/mock";
import type { LearnerProfile } from "@/lib/profile";

const readingBlock: Block = {
  id: "b1",
  title: "What is a regression test",
  type: "reading",
  payload: { markdown: "A regression test re-runs earlier checks." },
};

const quizBlock: Block = {
  id: "b2",
  title: "Check yourself",
  type: "quiz",
  payload: {
    passScore: 0.5,
    questions: [
      {
        id: "q1",
        kind: "truefalse",
        prompt: "A regression test proves the code is bug free.",
        explanation: "It only re-checks what was checked before.",
        answer: [1],
      },
    ],
  },
};

function profile(background: LearnerProfile["background"]): LearnerProfile {
  return {
    background,
    backgroundNote: "",
    goals: [],
    goalNote: "",
    statement: "",
  };
}

function mockFor(learner: LearnerProfile, block: Block): string {
  const prompt = explainUserPrompt({
    profile: learner,
    courseTitle: "Software basics",
    lessonTitle: "Testing",
    block,
    wrongQuestions: [],
  });

  return explainResultSchema.parse(mockExplain(prompt)).markdown;
}

describe("mockExplain", () => {
  it("produces content that satisfies the result schema", () => {
    const prompt = explainUserPrompt({
      profile: profile("NON_CS"),
      courseTitle: "Software basics",
      lessonTitle: "Testing",
      block: readingBlock,
      wrongQuestions: [],
    });

    const parsed = explainResultSchema.parse(mockExplain(prompt));

    expect(parsed.title.length).toBeGreaterThan(0);
    expect(parsed.markdown).toContain(MOCK_MARKER);
  });

  it("writes a visibly different explanation per background", () => {
    const newcomer = mockFor(profile("NON_CS"), readingBlock);
    const student = mockFor(profile("CS_STUDENT"), readingBlock);

    expect(newcomer).not.toBe(student);
    expect(newcomer).toContain("recipe");
    expect(student).toContain("contract");
  });

  it("quotes the questions the learner got wrong", () => {
    const prompt = explainUserPrompt({
      profile: profile("CS_STUDENT"),
      courseTitle: "Software basics",
      lessonTitle: "Testing",
      block: quizBlock,
      wrongQuestions: quizBlock.payload.questions,
    });

    const parsed = explainResultSchema.parse(mockExplain(prompt));

    expect(parsed.markdown).toContain("proves the code is bug free");
  });
});
