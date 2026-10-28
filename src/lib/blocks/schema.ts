import { z } from "zod";

/**
 * Single source of truth for lesson blocks (docs/plan/01 §3).
 *
 * Blocks live in `Lesson.blocks` as plain JSON, so every read path must run the
 * payload through these schemas before rendering. New block type = add a schema
 * here + a component + a registry entry.
 */

/** Common fields shared by every block. */
export const blockBaseSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
});

/** `reading` — markdown plus an optional illustration shown above the text. */
export const readingBlockSchema = blockBaseSchema.extend({
  type: z.literal("reading"),
  payload: z.object({
    markdown: z.string().min(1),
    /** Absolute URL or a path under `/public`; empty strings are rejected. */
    imageUrl: z.string().min(1).optional(),
  }),
});

/** Answer formats supported by a quiz question. */
export const questionKindSchema = z.enum([
  "single",
  "multi",
  "truefalse",
  "short",
]);

const questionBaseSchema = z.object({
  id: z.string().min(1),
  prompt: z.string().min(1),
  explanation: z.string().min(1),
});

/**
 * Choice answer: indices into `options`. Validated against the option count so
 * a malformed payload can never point outside the list.
 */
function choicesWithinOptions(answer: number[], options: string[]): boolean {
  return answer.every((index) => index >= 0 && index < options.length);
}

export const singleQuestionSchema = questionBaseSchema
  .extend({
    kind: z.literal("single"),
    options: z.array(z.string().min(1)).min(2),
    answer: z.array(z.number().int().min(0)).min(1).max(1),
  })
  .refine(
    (question) => choicesWithinOptions(question.answer, question.options),
    { message: "Single-choice answer must point at an existing option." },
  );

export const multiQuestionSchema = questionBaseSchema
  .extend({
    kind: z.literal("multi"),
    options: z.array(z.string().min(1)).min(2),
    answer: z.array(z.number().int().min(0)).min(1),
  })
  .refine(
    (question) => choicesWithinOptions(question.answer, question.options),
    { message: "Multi-choice answers must point at existing options." },
  );

export const trueFalseQuestionSchema = questionBaseSchema
  .extend({
    kind: z.literal("truefalse"),
    /** Defaults to True / False when the author leaves it out. */
    options: z.array(z.string().min(1)).length(2).optional(),
    answer: z.array(z.number().int().min(0).max(1)).min(1).max(1),
  })
  .refine(
    (question) =>
      choicesWithinOptions(
        question.answer,
        question.options ?? ["True", "False"],
      ),
    { message: "True/false answer must be 0 or 1." },
  );

/**
 * `short` — free text. `answer` holds comma-separated keywords; the learner is
 * correct when the response contains any of them (see lib/blocks/scoring.ts).
 */
export const shortQuestionSchema = questionBaseSchema.extend({
  kind: z.literal("short"),
  answer: z.string().min(1),
});

export const questionSchema = z.discriminatedUnion("kind", [
  singleQuestionSchema,
  multiQuestionSchema,
  trueFalseQuestionSchema,
  shortQuestionSchema,
]);

/** `quiz` — `passScore` is a ratio in [0, 1], matching the stored lesson score. */
export const quizBlockSchema = blockBaseSchema.extend({
  type: z.literal("quiz"),
  payload: z.object({
    passScore: z.number().min(0).max(1),
    questions: z.array(questionSchema).min(1),
  }),
});

/** One card in a flashcards deck. Both sides are short strings, not markdown. */
export const flashcardSchema = z.object({
  front: z.string().min(1),
  back: z.string().min(1),
});

/** `flashcards` — a deck browsed one card at a time and flipped to self-check. */
export const flashcardsBlockSchema = blockBaseSchema.extend({
  type: z.literal("flashcards"),
  payload: z.object({
    cards: z.array(flashcardSchema).min(1),
  }),
});

/** `reflection` — a free-text note. `minWords` gates the completion button. */
export const reflectionBlockSchema = blockBaseSchema.extend({
  type: z.literal("reflection"),
  payload: z.object({
    prompt: z.string().min(1),
    minWords: z.number().int().min(1),
  }),
});

/** One page of a slides deck: a heading, its bullets and the spoken script. */
export const slideSchema = z.object({
  title: z.string().min(1),
  bullets: z.array(z.string().min(1)).min(1),
  /** Read out loud by `speechSynthesis`; plain text, no markdown. */
  narration: z.string().min(1),
});

/** `slides` — one page at a time, optionally narrated by the browser. */
export const slidesBlockSchema = blockBaseSchema.extend({
  type: z.literal("slides"),
  payload: z.object({
    slides: z.array(slideSchema).min(1),
    /** When true, opening a page starts its narration automatically. */
    autoPlay: z.boolean(),
  }),
});

/**
 * One assertion of a coding exercise: `expression` is evaluated inside the
 * sandbox after the learner's code has run, and must be `true` to pass.
 */
export const codingTestSchema = z.object({
  name: z.string().min(1),
  expression: z.string().min(1),
});

/** `coding` — a JavaScript exercise graded by assertions in a Web Worker. */
export const codingBlockSchema = blockBaseSchema.extend({
  type: z.literal("coding"),
  payload: z.object({
    problem: z.string().min(1),
    /** Shown in the editor on the first visit; may be an empty string. */
    starter: z.string(),
    tests: z.array(codingTestSchema).min(1),
    hints: z.array(z.string().min(1)),
  }),
});

/** One row of a `sort` game: what it says and where it belongs. */
export const sortItemSchema = z.object({
  text: z.string().min(1),
  /** Target position. Only the relative order matters, not the actual numbers. */
  order: z.number().int(),
});

/** One pair of a `match` game. */
export const matchPairSchema = z.object({
  left: z.string().min(1),
  right: z.string().min(1),
});

/** One option in a `choose` game. Exactly one option must be correct. */
export const chooseOptionSchema = z.object({
  text: z.string().min(1),
  correct: z.boolean(),
});

const sortGamePayloadSchema = z.object({
  variant: z.literal("sort"),
  items: z.array(sortItemSchema).min(2),
});

const matchGamePayloadSchema = z.object({
  variant: z.literal("match"),
  pairs: z.array(matchPairSchema).min(2),
});

const chooseGamePayloadSchema = z
  .object({
    variant: z.literal("choose"),
    prompt: z.string().min(1),
    options: z.array(chooseOptionSchema).min(2),
  })
  .refine((payload) => payload.options.filter((option) => option.correct).length === 1, {
    message: "Choose games must have exactly one correct option.",
    path: ["options"],
  });

/** `game` — an ordering, matching, or single-correct choice puzzle. */
export const gameBlockSchema = blockBaseSchema
  .extend({
    type: z.literal("game"),
    payload: z.discriminatedUnion("variant", [
      sortGamePayloadSchema,
      matchGamePayloadSchema,
      chooseGamePayloadSchema,
    ]),
  })
  .refine(
    (block) =>
      block.payload.variant !== "sort" ||
      new Set(block.payload.items.map((item) => item.order)).size ===
        block.payload.items.length,
    { message: "Sort items must all carry a distinct order value." },
  );

/** One choice offered by a simulation node. */
export const simulationOptionSchema = z.object({
  label: z.string().min(1),
  /** Node this choice leads to. Must name an existing node. */
  next: z.string().min(1),
  feedback: z.string().min(1),
  /** Points added to the run total; may be negative. */
  score: z.number(),
});

/**
 * One step of a simulation: what happens next, and the ways out of it.
 *
 * `options` is only required on nodes the learner has to leave: the `end` node
 * is a closing statement with nothing left to choose.
 */
export const simulationNodeSchema = z.object({
  text: z.string().min(1),
  options: z.array(simulationOptionSchema),
});

/** `simulation` — a branching scenario walked one decision at a time. */
export const simulationBlockSchema = blockBaseSchema
  .extend({
    type: z.literal("simulation"),
    payload: z.object({
      intro: z.string().min(1),
      start: z.string().min(1),
      end: z.string().min(1),
      nodes: z.record(z.string(), simulationNodeSchema),
    }),
  })
  .refine((block) => Object.hasOwn(block.payload.nodes, block.payload.start), {
    message: "The simulation must start on a node that exists.",
  })
  .refine((block) => Object.hasOwn(block.payload.nodes, block.payload.end), {
    message: "The simulation must end on a node that exists.",
  })
  .refine(
    (block) =>
      Object.entries(block.payload.nodes).every(
        ([id, node]) => id === block.payload.end || node.options.length > 0,
      ),
    {
      message:
        "Every simulation node except the end node needs at least one option.",
    },
  )
  .superRefine((block, ctx) => {
    const { nodes, end, start } = block.payload;
    for (const [id, node] of Object.entries(nodes)) {
      node.options.forEach((option, index) => {
        if (!Object.hasOwn(nodes, option.next))
          ctx.addIssue({
            code: "custom",
            path: ["payload", "nodes", id, "options", index, "next"],
            message: `Unknown target: ${option.next}`,
          });
      });
    }
    if (nodes[end]?.options.length)
      ctx.addIssue({
        code: "custom",
        path: ["payload", "end"],
        message: "The end node cannot have outgoing options.",
      });
    // Every reachable node must have a route to the end, even when loops exist.
    const reachable = new Set<string>();
    const visit = (id: string) => {
      if (reachable.has(id) || !Object.hasOwn(nodes, id)) return;
      reachable.add(id);
      if (id !== end) nodes[id].options.forEach((o) => visit(o.next));
    };
    visit(start);
    const canEnd = new Set([end]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const [id, node] of Object.entries(nodes))
        if (!canEnd.has(id) && node.options.some((o) => canEnd.has(o.next))) {
          canEnd.add(id);
          changed = true;
        }
    }
    for (const id of reachable)
      if (!canEnd.has(id))
        ctx.addIssue({
          code: "custom",
          path: ["payload", "nodes", id],
          message: "This node has no path to the end.",
        });
  });

/**
 * `roleplay` — a conversation with an AI character, graded afterwards against
 * the rubric. The learner is the one being trained; `persona` is the character
 * the model plays, `scenario` sets the room, and `goal` says what the learner
 * should achieve. `rubric` is the criteria the feedback report scores.
 */
export const roleplayBlockSchema = blockBaseSchema.extend({
  type: z.literal("roleplay"),
  payload: z.object({
    scenario: z.string().min(1),
    persona: z.string().min(1),
    goal: z.string().min(1),
    rubric: z.array(z.string().min(1)).min(1),
  }),
});

/** Discriminated union of every implemented block. */
export const blockSchema = z.discriminatedUnion("type", [
  readingBlockSchema,
  quizBlockSchema,
  flashcardsBlockSchema,
  reflectionBlockSchema,
  slidesBlockSchema,
  codingBlockSchema,
  gameBlockSchema,
  simulationBlockSchema,
  roleplayBlockSchema,
]);

/** `Lesson.blocks` is stored as a JSON array of blocks. */
export const blockListSchema = z
  .array(blockSchema)
  .refine((blocks) => new Set(blocks.map((b) => b.id)).size === blocks.length, {
    message: "Activity ids must be unique within a lesson.",
  });

export type BlockType = z.infer<typeof blockSchema>["type"];
export type Block = z.infer<typeof blockSchema>;
export type ReadingBlock = z.infer<typeof readingBlockSchema>;
export type QuizBlock = z.infer<typeof quizBlockSchema>;
export type FlashcardsBlock = z.infer<typeof flashcardsBlockSchema>;
export type Flashcard = z.infer<typeof flashcardSchema>;
export type ReflectionBlock = z.infer<typeof reflectionBlockSchema>;
export type Slide = z.infer<typeof slideSchema>;
export type SlidesBlock = z.infer<typeof slidesBlockSchema>;
export type CodingTest = z.infer<typeof codingTestSchema>;
export type CodingBlock = z.infer<typeof codingBlockSchema>;
export type SortItem = z.infer<typeof sortItemSchema>;
export type MatchPair = z.infer<typeof matchPairSchema>;
export type ChooseOption = z.infer<typeof chooseOptionSchema>;
export type GameBlock = z.infer<typeof gameBlockSchema>;
export type SimulationOption = z.infer<typeof simulationOptionSchema>;
export type SimulationNode = z.infer<typeof simulationNodeSchema>;
export type SimulationBlock = z.infer<typeof simulationBlockSchema>;
export type RoleplayBlock = z.infer<typeof roleplayBlockSchema>;
export type QuizQuestion = z.infer<typeof questionSchema>;
export type QuestionKind = z.infer<typeof questionKindSchema>;

export type BlockOfType<T extends BlockType> = Extract<Block, { type: T }>;

/** Where a block is being rendered, handed to every block by the renderer. */
export type BlockContext = {
  courseId: string;
  lessonId: string;
  preview?: boolean;
};

/**
 * Props every block component receives through the registry.
 *
 * `onComplete(blockId, score)` — `score` is a 0..1 ratio and is only supplied by
 * scored blocks (quiz). Blocks that cannot be failed omit it.
 *
 * `context` identifies the lesson the block belongs to: the coding block keys
 * its saved drafts by it, and game / simulation use it for their analytics.
 */
export type BlockRenderProps<T extends Block = Block> = {
  block: T;
  completed: boolean;
  onComplete: (blockId: string, score?: number) => void;
  context: BlockContext;
  onAttempt?: (result: import("./activity-result").ActivitySubmission) => void;
};
