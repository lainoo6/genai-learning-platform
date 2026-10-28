import { describe, expect, it } from "vitest";
import { gradeActivity, normalizedScore } from "./activity-result";
import { blockSchema, type Block, type SimulationBlock } from "./schema";
import { isShortAnswerCorrect } from "./scoring";
const sim: SimulationBlock = {
  id: "sim",
  title: "Simulation",
  type: "simulation",
  payload: {
    intro: "Choose",
    start: "start",
    end: "end",
    nodes: {
      start: {
        text: "Choose",
        options: [
          { label: "Good", next: "end", score: 3, feedback: "Good" },
          { label: "Bad", next: "loop", score: -1, feedback: "Try again" },
        ],
      },
      loop: {
        text: "Again",
        options: [
          { label: "End", next: "end", score: 1, feedback: "Done" },
          { label: "Loop", next: "loop", score: -1, feedback: "Again" },
        ],
      },
      end: { text: "Done", options: [] },
    },
  },
};
const game: Block = {
  id: "g",
  title: "Sort",
  type: "game",
  payload: {
    variant: "sort",
    items: [
      { text: "B", order: 20 },
      { text: "A", order: 10 },
    ],
  },
};
describe("activity grades", () => {
  it("normalizes negative raw scores and clamps ratios", () => {
    expect(normalizedScore(-1, -1, 3).normalized).toBe(0);
    expect(normalizedScore(1, -1, 3).normalized).toBe(0.5);
    expect(normalizedScore(1, 1, 1).normalized).toBe(1);
  });
  it("reconstructs simulation scores from node + option, ignoring claimed score", () => {
    const grade = gradeActivity(sim, {
      choices: [{ nodeId: "start", optionIndex: 0 }],
      score: 999,
    });
    expect(grade.score?.normalized).toBe(1);
    expect(grade.completed).toBe(true);
    expect(grade.feedback.steps).toEqual([
      {
        nodeId: "start",
        optionIndex: 0,
        label: "Good",
        score: 3,
        feedback: "Good",
      },
    ]);
  });
  it("rejects skipped nodes and choices after the end", () => {
    expect(() =>
      gradeActivity(sim, { choices: [{ nodeId: "loop", optionIndex: 0 }] }),
    ).toThrow();
    expect(() =>
      gradeActivity(sim, {
        choices: [
          { nodeId: "start", optionIndex: 0 },
          { nodeId: "end", optionIndex: 0 },
        ],
      }),
    ).toThrow();
  });
  it("does not complete a truncated or looping simulation", () => {
    expect(
      gradeActivity(sim, { choices: [{ nodeId: "start", optionIndex: 1 }] })
        .completed,
    ).toBe(false);
  });
  it("grades non-contiguous sort orders and rejects duplicate ids", () => {
    expect(gradeActivity(game, { order: [1, 0] }).score?.normalized).toBe(1);
    expect(gradeActivity(game, { order: [0, 1] }).completed).toBe(false);
    expect(() => gradeActivity(game, { order: [0, 0] })).toThrow();
  });
  it("does not count repeated matching pairs as distinct answers", () => {
    const block: Block = {
      id: "m",
      title: "Match",
      type: "game",
      payload: {
        variant: "match",
        pairs: [
          { left: "A", right: "a" },
          { left: "B", right: "b" },
        ],
      },
    };
    expect(
      gradeActivity(block, {
        choices: [
          { left: 0, right: 0 },
          { left: 0, right: 0 },
        ],
      }).completed,
    ).toBe(false);
  });
  it("grades a choose challenge from the saved correct option", () => {
    const block: Block = {
      id: "c",
      title: "Choose",
      type: "game",
      payload: {
        variant: "choose",
        prompt: "Which is safest?",
        options: [
          { text: "Distractor", correct: false },
          { text: "Correct", correct: true },
        ],
      },
    };
    expect(gradeActivity(block, { option: 0 }).completed).toBe(false);
    expect(gradeActivity(block, { option: 1 })).toMatchObject({
      completed: true,
      passed: true,
      score: null,
      verification: "server",
    });
    expect(() => gradeActivity(block, { option: 3 })).toThrow();
  });
  it("labels browser coding tests as unverified and rejects stale test sets", () => {
    const block: Block = {
      id: "c",
      title: "Code",
      type: "coding",
      payload: {
        problem: "Sum",
        starter: "",
        hints: [],
        tests: [{ name: "sum", expression: "sum(1,2)===3" }],
      },
    };
    expect(
      gradeActivity(block, {
        code: "function sum(a,b){return a+b}",
        results: [{ name: "sum", passed: true, error: null }],
      }).verification,
    ).toBe("client-tests");
    const evidence = {
      code: "sum",
      results: [{ name: "sum", passed: true, error: null }],
    };
    expect(gradeActivity(block, evidence).completed).toBe(false);
    expect(
      gradeActivity(block, { ...evidence, finalize: true }).completed,
    ).toBe(true);
    expect(() =>
      gradeActivity(block, {
        code: "x",
        results: [{ name: "old", passed: true, error: null }],
      }),
    ).toThrow();
  });
  it("keeps ungraded activities without inventing a score", () => {
    expect(
      gradeActivity(
        {
          id: "r",
          title: "Read",
          type: "reading",
          payload: { markdown: "Hello" },
        },
        {},
      ).score,
    ).toBeNull();
  });
});
describe("regressions", () => {
  it("rejects unknown simulation targets and trapped cycles at authoring time", () => {
    const invalid = structuredClone(sim);
    invalid.payload.nodes.start.options[0].next = "missing";
    expect(blockSchema.safeParse(invalid).success).toBe(false);
    invalid.payload.nodes.start.options[0].next = "start";
    invalid.payload.nodes.loop.options[0].next = "start";
    expect(blockSchema.safeParse(invalid).success).toBe(false);
  });
  it("accepts a loop with an escape route", () =>
    expect(blockSchema.safeParse(sim).success).toBe(true));
  it("matches Latin keywords at word boundaries and handles regex punctuation", () => {
    expect(isShortAnswerCorrect("email", "AI")).toBe(false);
    expect(isShortAnswerCorrect("use AI, safely", "AI")).toBe(true);
    expect(isShortAnswerCorrect("Use C++.", "C++")).toBe(true);
    expect(isShortAnswerCorrect("机器学习模型", "机器学习")).toBe(true);
  });
});
