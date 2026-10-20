import { z } from "zod";
import type { Block } from "./schema";
import { gradeQuiz, type QuizResponses } from "./scoring";

/** Versioned hand-off contract for Member 4. All normalized scores are 0..1. */
export const activitySubmissionSchema = z.object({
  attemptId: z.string().uuid(),
  answer: z.record(z.string(), z.unknown()),
  feedback: z.record(z.string(), z.unknown()).default({}),
});
export type ActivitySubmission = {
  attemptId?: string;
  answer: Record<string, unknown>;
  feedback?: Record<string, unknown>;
};
export type ActivityGrade = {
  score: { raw: number; min: number; max: number; normalized: number } | null;
  completed: boolean;
  passed: boolean | null;
  verification: "server" | "client-tests" | "ai" | "mock" | "ungraded";
  feedback: Record<string, unknown>;
};
export function normalizedScore(raw: number, min: number, max: number) {
  return {
    raw,
    min,
    max,
    normalized:
      max === min ? 1 : Math.max(0, Math.min(1, (raw - min) / (max - min))),
  };
}
const responseSchema = z.record(
  z.string(),
  z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("choice"),
      choices: z.array(z.number().int().nonnegative()),
    }),
    z.object({ kind: z.literal("text"), text: z.string().max(10000) }),
  ]),
);

/** Regrades deterministic activities against the SAVED activity, never client scores. */
export function gradeActivity(
  block: Block,
  answer: Record<string, unknown>,
): ActivityGrade {
  const base: ActivityGrade = {
    score: null,
    completed: true,
    passed: null,
    verification: "ungraded",
    feedback: {},
  };
  switch (block.type) {
    case "quiz": {
      const responses = responseSchema.parse(answer.responses) as QuizResponses;
      const result = gradeQuiz(
        block.payload.questions,
        responses,
        block.payload.passScore,
      );
      return {
        ...base,
        score: normalizedScore(result.correct, 0, result.total),
        completed: result.passed,
        passed: result.passed,
        verification: "server",
        feedback: {
          ...result,
          wrongQuestionIds: block.payload.questions
            .filter((q) => !gradeQuiz([q], responses, 1).passed)
            .map((q) => q.id),
          explanations: block.payload.questions.map((q) => ({
            id: q.id,
            explanation: q.explanation,
          })),
        },
      };
    }
    case "coding": {
      const parsed = z
        .object({
          code: z.string().max(50000),
          results: z
            .array(
              z.object({
                name: z.string(),
                passed: z.boolean(),
                error: z.string().nullable(),
              }),
            )
            .max(200),
          failure: z.string().nullable().optional(),
        })
        .parse(answer);
      if (
        parsed.results.length > 0 &&
        (parsed.results.length !== block.payload.tests.length ||
          parsed.results.some((r, i) => r.name !== block.payload.tests[i].name))
      )
        throw new Error(
          "Test results no longer match this activity. Run tests again.",
        );
      const correct = parsed.results.filter((r) => r.passed).length;
      const passed = correct === block.payload.tests.length;
      return {
        ...base,
        score: normalizedScore(correct, 0, block.payload.tests.length),
        completed: passed && answer.finalize === true,
        passed,
        verification: "client-tests",
        feedback: { results: parsed.results, failure: parsed.failure ?? null },
      };
    }
    case "simulation": {
      const choices = z
        .array(
          z.object({
            nodeId: z.string(),
            optionIndex: z.number().int().nonnegative(),
          }),
        )
        .max(20)
        .parse(answer.choices);
      let current = block.payload.start;
      let raw = 0,
        min = 0,
        max = 0;
      const steps = choices.map((choice) => {
        if (current === block.payload.end || choice.nodeId !== current)
          throw new Error("Invalid simulation path.");
        const node = block.payload.nodes[current];
        const option = node?.options[choice.optionIndex];
        if (!option) throw new Error("Invalid simulation option.");
        raw += option.score;
        min += Math.min(...node.options.map((o) => o.score));
        max += Math.max(...node.options.map((o) => o.score));
        current = option.next;
        return {
          ...choice,
          label: option.label,
          feedback: option.feedback,
          score: option.score,
        };
      });
      const completed = current === block.payload.end;
      return {
        ...base,
        score: normalizedScore(raw, min, max),
        completed,
        passed: completed,
        verification: "server",
        feedback: {
          steps,
          outcome: completed ? "end" : "incomplete",
          scoring: "relative-to-visited-decisions",
        },
      };
    }
    case "game": {
      const p = block.payload;
      if (p.variant === "sort") {
        const order = z
          .array(z.number().int().nonnegative())
          .length(p.items.length)
          .parse(answer.order);
        if (
          new Set(order).size !== p.items.length ||
          order.some((i) => i >= p.items.length)
        )
          throw new Error("Invalid item order.");
        const expected = p.items
          .map((_, i) => i)
          .sort((a, b) => p.items[a].order - p.items[b].order);
        const correct = order.filter((id, i) => id === expected[i]).length;
        return {
          ...base,
          score: normalizedScore(correct, 0, order.length),
          passed: correct === order.length,
          completed: correct === order.length,
          verification: "server",
          feedback: { correct, total: order.length },
        };
      }
      const choices = z
        .array(
          z.object({
            left: z.number().int().nonnegative(),
            right: z.number().int().nonnegative(),
          }),
        )
        .min(1)
        .max(2000)
        .parse(answer.choices);
      if (
        choices.some(
          (c) => c.left >= p.pairs.length || c.right >= p.pairs.length,
        )
      )
        throw new Error("Invalid pair.");
      const matched = new Set(
        choices.filter((c) => c.left === c.right).map((c) => c.left),
      );
      return {
        ...base,
        score: normalizedScore(matched.size, 0, p.pairs.length),
        completed: matched.size === p.pairs.length,
        passed: matched.size === p.pairs.length,
        verification: "server",
        feedback: {
          correct: matched.size,
          total: p.pairs.length,
          attempts: choices.length,
        },
      };
    }
    case "reflection": {
      const text = z.string().max(50000).parse(answer.text);
      const cjk =
        text.match(/[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/g)?.length ?? 0;
      const rest = text
        .replace(/[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/g, " ")
        .trim();
      const words = cjk + (rest ? rest.split(/\s+/).length : 0);
      return {
        ...base,
        completed: words >= block.payload.minWords,
        feedback: { words, minWords: block.payload.minWords },
      };
    }
    case "roleplay":
      throw new Error("Use the server-generated roleplay report.");
    default:
      return base;
  }
}
