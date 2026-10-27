import type { Locale } from "@/i18n/config";
import type { Block, BlockType } from "@/lib/blocks/schema";

/**
 * Starting points for the block picker in the course editor (P5.1).
 *
 * Every template is schema-valid except for the content the author still has
 * to replace, which is what makes "Add block" feel instant: the block appears
 * in the lesson with a usable shape instead of an empty skeleton that fails
 * validation for fifteen different reasons.
 *
 * The starter prose follows the interface language, so an instructor working in
 * Chinese gets Chinese placeholders to overwrite rather than English ones.
 */

export type BlockTypeInfo = {
  type: BlockType;
  /** Dictionary keys, so the picker follows the interface language. */
  labelKey: string;
  descriptionKey: string;
};

export const BLOCK_TYPE_INFO = [
  {
    type: "reading",
    labelKey: "block.reading",
    descriptionKey: "editor.template.reading.description",
  },
  {
    type: "quiz",
    labelKey: "block.quiz",
    descriptionKey: "editor.template.quiz.description",
  },
  {
    type: "flashcards",
    labelKey: "block.flashcards",
    descriptionKey: "editor.template.flashcards.description",
  },
  {
    type: "slides",
    labelKey: "block.slides",
    descriptionKey: "editor.template.slides.description",
  },
  {
    type: "coding",
    labelKey: "block.coding",
    descriptionKey: "editor.template.coding.description",
  },
  {
    type: "game",
    labelKey: "block.game",
    descriptionKey: "editor.template.game.description",
  },
  {
    type: "simulation",
    labelKey: "block.simulation",
    descriptionKey: "editor.template.simulation.description",
  },
  {
    type: "roleplay",
    labelKey: "block.roleplay",
    descriptionKey: "editor.template.roleplay.description",
  },
  {
    type: "reflection",
    labelKey: "block.reflection",
    descriptionKey: "editor.template.reflection.description",
  },
] as const satisfies readonly BlockTypeInfo[];

function newId(): string {
  return crypto.randomUUID();
}

type Template = () => Block;

const ENGLISH: Record<BlockType, Template> = {
  reading: () => ({
    id: newId(),
    type: "reading",
    title: "Reading",
    payload: {
      markdown: "## Overview\n\nWrite the lesson text here. Markdown is supported.",
    },
  }),
  quiz: () => ({
    id: newId(),
    type: "quiz",
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
  }),
  flashcards: () => ({
    id: newId(),
    type: "flashcards",
    title: "Key terms",
    payload: {
      cards: [{ front: "Term", back: "Definition" }],
    },
  }),
  slides: () => ({
    id: newId(),
    type: "slides",
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
  }),
  coding: () => ({
    id: newId(),
    type: "coding",
    title: "Practice",
    payload: {
      problem: "Write a function that returns the answer.",
      starter: "function solve() {\n  // Your code here\n}\n",
      tests: [{ name: "Returns the answer", expression: "solve() === 42" }],
      hints: ["Start by deciding what the function should return."],
    },
  }),
  game: () => ({
    id: newId(),
    type: "game",
    title: "Put the steps in order",
    payload: {
      variant: "sort",
      items: [
        { text: "First step", order: 0 },
        { text: "Second step", order: 1 },
      ],
    },
  }),
  simulation: () => ({
    id: newId(),
    type: "simulation",
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
  }),
  roleplay: () => ({
    id: newId(),
    type: "roleplay",
    title: "Role play",
    payload: {
      scenario: "Describe the situation and who the learner is talking to.",
      persona: "You are a hiring manager interviewing a junior developer.",
      goal: "Ask three questions and explain your reasoning clearly.",
      rubric: ["Asks a clarifying question", "Gives a concrete example"],
    },
  }),
  reflection: () => ({
    id: newId(),
    type: "reflection",
    title: "Reflection",
    payload: {
      prompt: "What did you learn, and what is still unclear?",
      minWords: 40,
    },
  }),
};

const CHINESE: Record<BlockType, Template> = {
  reading: () => ({
    id: newId(),
    type: "reading",
    title: "阅读",
    payload: {
      markdown: "## 概览\n\n在这里写课程正文，支持 Markdown。",
    },
  }),
  quiz: () => ({
    id: newId(),
    type: "quiz",
    title: "检查一下理解",
    payload: {
      passScore: 0.7,
      questions: [
        {
          id: newId(),
          kind: "single",
          prompt: "这节课的主要观点是什么？",
          explanation: "解释为什么正确选项是对的。",
          options: ["选项一", "选项二"],
          answer: [0],
        },
      ],
    },
  }),
  flashcards: () => ({
    id: newId(),
    type: "flashcards",
    title: "关键术语",
    payload: {
      cards: [{ front: "术语", back: "解释" }],
    },
  }),
  slides: () => ({
    id: newId(),
    type: "slides",
    title: "课堂幻灯片",
    payload: {
      autoPlay: false,
      slides: [
        {
          title: "幻灯片标题",
          bullets: ["第一个要点"],
          narration: "这一页打开时，把这句话读出来。",
        },
      ],
    },
  }),
  coding: () => ({
    id: newId(),
    type: "coding",
    title: "动手练习",
    payload: {
      problem: "写一个返回结果的函数。",
      starter: "function solve() {\n  // 在这里写代码\n}\n",
      tests: [{ name: "返回正确结果", expression: "solve() === 42" }],
      hints: ["先想清楚这个函数应该返回什么。"],
    },
  }),
  game: () => ({
    id: newId(),
    type: "game",
    title: "把步骤排好序",
    payload: {
      variant: "sort",
      items: [
        { text: "第一步", order: 0 },
        { text: "第二步", order: 1 },
      ],
    },
  }),
  simulation: () => ({
    id: newId(),
    type: "simulation",
    title: "决策点",
    payload: {
      intro: "你即将做出一个决定。读完情境后做出选择。",
      start: "start",
      end: "end",
      nodes: {
        start: {
          text: "描述学习者所处的情境。",
          options: [
            {
              label: "选择稳妥的做法",
              next: "end",
              feedback: "解释接下来会发生什么。",
              score: 1,
            },
          ],
        },
        end: {
          text: "用学习者学到的东西收尾。",
          options: [],
        },
      },
    },
  }),
  roleplay: () => ({
    id: newId(),
    type: "roleplay",
    title: "角色扮演",
    payload: {
      scenario: "描述情境，以及学习者正在和谁对话。",
      persona: "你是一位正在面试初级开发者的招聘经理。",
      goal: "提出三个问题，并清楚说明你的理由。",
      rubric: ["提出澄清性的问题", "给出一个具体的例子"],
    },
  }),
  reflection: () => ({
    id: newId(),
    type: "reflection",
    title: "反思",
    payload: {
      prompt: "你学到了什么？还有什么不清楚？",
      minWords: 40,
    },
  }),
};

/** A complete, schema-valid block of the requested type. */
export function createBlock(type: BlockType, locale: Locale = "en"): Block {
  const templates = locale === "zh" ? CHINESE : ENGLISH;
  return templates[type]();
}
