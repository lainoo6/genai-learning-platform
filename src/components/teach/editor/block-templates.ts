import type { Block, BlockType } from "@/lib/blocks/schema";

/**
 * Starting points for the block picker in the course editor (P5.1).
 *
 * Every template is schema-valid except for the content the author still has
 * to replace, which is what makes "Add block" feel instant: the block appears
 * in the lesson with a usable shape instead of an empty skeleton that fails
 * validation for fifteen different reasons.
 */

export type BlockTypeInfo = {
  type: BlockType;
  label: string;
  description: string;
};

export const BLOCK_TYPE_INFO = [
  {
    type: "reading",
    label: "Reading",
    description: "Markdown text with an optional illustration.",
  },
  {
    type: "quiz",
    label: "Quiz",
    description: "Single choice, multiple choice, true/false or short answer.",
  },
  {
    type: "flashcards",
    label: "Flashcards",
    description: "A deck of term-and-definition cards.",
  },
  {
    type: "slides",
    label: "Slides",
    description: "Pages with bullets and spoken narration.",
  },
  {
    type: "coding",
    label: "Coding",
    description: "A JavaScript exercise graded by assertions.",
  },
  {
    type: "game",
    label: "Game",
    description: "Order the steps, or match the pairs.",
  },
  {
    type: "simulation",
    label: "Simulation",
    description: "A branching scenario built from decisions.",
  },
  {
    type: "roleplay",
    label: "Role play",
    description: "A conversation with an AI persona, graded on a rubric.",
  },
  {
    type: "reflection",
    label: "Reflection",
    description: "A free-text note with a minimum length.",
  },
] as const satisfies readonly BlockTypeInfo[];

function newId(): string {
  return crypto.randomUUID();
}

/** A complete, schema-valid block of the requested type. */
export function createBlock(type: BlockType): Block {
  switch (type) {
    case "reading":
      return {
        id: newId(),
        type,
        title: "Reading",
        payload: {
          markdown: "## Overview\n\nWrite the lesson text here. Markdown is supported.",
        },
      };

    case "quiz":
      return {
        id: newId(),
        type,
        title: "Check your understanding",
        payload: {
          passScore: 0.7,
          questions: [
            {
              id: newId(),
              kind: "single",
              prompt: "What is the main idea of this lesson?",
              explanation: "Explain why the correct option is right.",
              options: ["First option", "Second option"],
              answer: [0],
            },
          ],
        },
      };

    case "flashcards":
      return {
        id: newId(),
        type,
        title: "Key terms",
        payload: {
          cards: [{ front: "Term", back: "Definition" }],
        },
      };

    case "slides":
      return {
        id: newId(),
        type,
        title: "Lesson slides",
        payload: {
          autoPlay: false,
          slides: [
            {
              title: "Slide title",
              bullets: ["First point"],
              narration: "Say this out loud when the slide opens.",
            },
          ],
        },
      };

    case "coding":
      return {
        id: newId(),
        type,
        title: "Practice",
        payload: {
          problem: "Write a function that returns the answer.",
          starter: "function solve() {\n  // Your code here\n}\n",
          tests: [{ name: "Returns the answer", expression: "solve() === 42" }],
          hints: ["Start by deciding what the function should return."],
        },
      };

    case "game":
      return {
        id: newId(),
        type,
        title: "Put the steps in order",
        payload: {
          variant: "sort",
          items: [
            { text: "First step", order: 0 },
            { text: "Second step", order: 1 },
          ],
        },
      };

    case "simulation":
      return {
        id: newId(),
        type,
        title: "Decision point",
        payload: {
          intro: "You are about to make a decision. Read the situation and choose.",
          start: "start",
          end: "end",
          nodes: {
            start: {
              text: "Describe the situation the learner is in.",
              options: [
                {
                  label: "Take the safe option",
                  next: "end",
                  feedback: "Explain what happens next.",
                  score: 1,
                },
              ],
            },
            end: {
              text: "Close the scenario with what the learner has learned.",
              options: [],
            },
          },
        },
      };

    case "roleplay":
      return {
        id: newId(),
        type,
        title: "Role play",
        payload: {
          scenario: "Describe the situation and who the learner is talking to.",
          persona: "You are a hiring manager interviewing a junior developer.",
          goal: "Ask three questions and explain your reasoning clearly.",
          rubric: ["Asks a clarifying question", "Gives a concrete example"],
        },
      };

    case "reflection":
      return {
        id: newId(),
        type,
        title: "Reflection",
        payload: {
          prompt: "What did you learn, and what is still unclear?",
          minWords: 40,
        },
      };
  }
}
