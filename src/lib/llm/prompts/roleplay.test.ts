import { describe, expect, it } from "vitest";

import type { RoleplayBlock } from "@/lib/blocks/schema";
import { MOCK_MARKER } from "@/lib/llm/mock";
import {
  mockRoleplayFeedback,
  mockRoleplayReply,
  roleplayFeedbackPrompt,
  roleplayFeedbackSchema,
  roleplaySystemPrompt,
  type RoleplayTurn,
} from "@/lib/llm/prompts/roleplay";

const block: RoleplayBlock = {
  id: "blk_roleplay",
  title: "Interview a stakeholder",
  type: "roleplay",
  payload: {
    scenario: "The product manager has ten minutes to talk about checkout.",
    persona: "Priya, a product manager who speaks in vague adjectives",
    goal: "Leave with one testable requirement.",
    rubric: [
      "Asked about the problem before proposing a feature",
      "Turned \"faster\" into something measurable",
      "Summarised the requirement back",
    ],
  },
};

const transcript: RoleplayTurn[] = [
  { role: "user", content: "What does a slow checkout cost you today?" },
  { role: "assistant", content: "Support gets about forty calls a week about it." },
  { role: "user", content: "So the goal is fewer calls, not a faster animation?" },
];

describe("roleplaySystemPrompt", () => {
  it("carries the character, scenario and goal", () => {
    const prompt = roleplaySystemPrompt(block);

    expect(prompt).toContain("Priya");
    expect(prompt).toContain("ten minutes");
    expect(prompt).toContain("one testable requirement");
    expect(prompt).toContain("80 words");
  });
});

describe("roleplayFeedbackPrompt", () => {
  it("lists every rubric line and the transcript", () => {
    const prompt = roleplayFeedbackPrompt(block, transcript);

    for (const criterion of block.payload.rubric) {
      expect(prompt).toContain(criterion);
    }
    expect(prompt).toContain("Learner: What does a slow checkout cost you today?");
    expect(prompt).toContain("Character: Support gets about forty calls a week");
  });
});

describe("mockRoleplayFeedback", () => {
  it("grades exactly the rubric it was given", () => {
    const parsed = roleplayFeedbackSchema.parse(
      mockRoleplayFeedback(roleplayFeedbackPrompt(block, transcript)),
    );

    expect(parsed.criteria.map((entry) => entry.criterion)).toEqual(
      block.payload.rubric,
    );
    for (const entry of parsed.criteria) {
      expect(entry.score).toBeGreaterThanOrEqual(1);
      expect(entry.score).toBeLessThanOrEqual(5);
      expect(entry.comment).toContain(MOCK_MARKER);
    }
    expect(parsed.suggestion).toContain(MOCK_MARKER);
  });
});

describe("mockRoleplayReply", () => {
  it("rotates through the canned lines and marks them", () => {
    const first = mockRoleplayReply(0);
    const second = mockRoleplayReply(1);

    expect(first).toContain(MOCK_MARKER);
    expect(second).toContain(MOCK_MARKER);
    expect(first).not.toBe(second);
    expect(mockRoleplayReply(8)).toBe(first);
  });
});
