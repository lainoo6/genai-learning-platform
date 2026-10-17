import { z } from "zod";

import { blockDigest } from "@/lib/blocks/digest";
import type { Block, QuizQuestion } from "@/lib/blocks/schema";
import { mockText } from "@/lib/llm/mock";
import {
  BACKGROUND_LABELS,
  GOAL_LABELS,
  type Background,
  type LearnerProfile,
} from "@/lib/profile";

/**
 * Prompts for "Explain for me" (P4.4).
 *
 * The rewrite is driven by the learner's background, so a newcomer and a
 * computing student asking about the same block get visibly different text.
 * The prompt also carries the questions the learner got wrong, which is what
 * lets a quiz explanation quote their actual mistakes.
 *
 * `mockExplain` reads the same prompt back (the field names below are the
 * contract between the two) so the canned reply is still about the block the
 * learner clicked — including the wrong questions.
 */

export const explainResultSchema = z.object({
  title: z.string().min(1).max(140),
  markdown: z.string().min(1).max(12000),
});

export type ExplainResultData = z.infer<typeof explainResultSchema>;

/** Everything the rewrite needs to know. */
export type ExplainContext = {
  profile: LearnerProfile | null;
  courseTitle: string;
  lessonTitle: string;
  block: Block;
  /** Questions answered incorrectly on the learner's last attempt (quiz only). */
  wrongQuestions: QuizQuestion[];
};

const PERSONA = [
  "You are a tutoring assistant on a mini-course platform.",
  "You rewrite one block of course material for one specific learner.",
].join(" ");

/** How the rewrite should sound for each background. */
const STYLE_RULES: Record<Background, string> = {
  NON_CS:
    "The learner is new to computing. Avoid jargon, define every term you keep, and lean on everyday analogies (a kitchen, a post office, a filing cabinet). Short sentences, no acronyms without expansion.",
  CS_STUDENT:
    "The learner studies computing. Keep the depth: name the underlying concepts, compare the idea with things they already know (data structures, version control, testing, APIs), and point out the trade-offs and failure modes.",
  PRO_DEV:
    "The learner already writes software for a living. Be concise and practical, tie the idea to a real workflow or code review, and skip beginner analogies entirely.",
  OTHER:
    "The learner's background is unknown. Use plain language, define terms the first time they appear, and stay concrete.",
};

export function explainSystemPrompt(profile: LearnerProfile | null): string {
  return [
    PERSONA,
    "",
    `Style for this learner: ${profile === null ? STYLE_RULES.OTHER : STYLE_RULES[profile.background]}`,
    "",
    "Output rules:",
    '- Reply with a single JSON object: { "title": string, "markdown": string }.',
    "- `title`: at most 8 words, naming what the explanation covers.",
    "- `markdown`: the explanation itself — short paragraphs and bullet lists, no HTML, no code fences.",
    "- Keep every fact that appears in the material. Never reveal a quiz answer key as a bare answer; explain the reasoning instead.",
  ].join("\n");
}

/** The instruction that differs per block type. */
function taskFor(context: ExplainContext): string {
  switch (context.block.type) {
    case "reading":
      return [
        "Task: rewrite this reading block for this learner.",
        "Keep every fact and roughly the same length; change the voice, the examples and the depth.",
      ].join(" ");
    case "quiz":
      return context.wrongQuestions.length > 0
        ? [
            "Task: explain the questions this learner got wrong, one by one.",
            "For each: quote the question, say why the correct answer is correct, and say what makes the tempting alternative wrong.",
          ].join(" ")
        : [
            "Task: the learner has not submitted this quiz yet.",
            "Walk through every question: what it is really asking and how to reason towards the answer, without just giving the answers away.",
          ].join(" ");
    default:
      return [
        `Task: explain this ${context.block.type} block in plain language for this learner.`,
        "Say what the activity asks for, why it is worth doing, and what to take away from it.",
      ].join(" ");
  }
}

export function explainUserPrompt(context: ExplainContext): string {
  const { profile } = context;
  const goals = profile === null
    ? "unknown"
    : profile.goals.map((goal) => GOAL_LABELS[goal]).join(", ") || "not stated";

  const lines = [
    `Learner background: ${profile?.background ?? "UNKNOWN"}`,
    `Learner background label: ${profile === null ? "unknown" : BACKGROUND_LABELS[profile.background]}`,
    `Learner goals: ${goals}`,
    `Course: ${context.courseTitle}`,
    `Lesson: ${context.lessonTitle}`,
    `Block type: ${context.block.type}`,
    `Block title: ${context.block.title}`,
    `Block digest: ${blockDigest(context.block)}`,
  ];

  if (context.wrongQuestions.length > 0) {
    lines.push("Wrong questions (answered incorrectly on the last attempt):");
    for (const question of context.wrongQuestions) {
      lines.push(`- ${question.prompt}`);
    }
  }

  lines.push(taskFor(context));

  return lines.join("\n");
}

/** Reads a `Name: value` line back out of a generated prompt. */
function readField(prompt: string, name: string): string | null {
  const match = new RegExp(`^${name}: (.*)$`, "m").exec(prompt);
  return match?.[1]?.trim() ?? null;
}

/** Reads the `- ...` bullets that follow a section heading. */
function readBullets(prompt: string, heading: string): string[] {
  const lines = prompt.split("\n");
  const start = lines.findIndex((line) => line.startsWith(`${heading}`));
  if (start < 0) {
    return [];
  }

  const bullets: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (!line.startsWith("- ")) {
      break;
    }
    bullets.push(line.slice(2).trim());
  }

  return bullets;
}

/**
 * Canned rewrite used when no API key is configured.
 *
 * Built from the block title / type and the learner's background, so even in
 * mock mode a newcomer and a computing student get noticeably different text.
 */
export function mockExplain(prompt: string): unknown {
  const background = readField(prompt, "Learner background");
  const blockType = readField(prompt, "Block type") ?? "block";
  const blockTitle = readField(prompt, "Block title") ?? "this block";
  const wrongQuestions = readBullets(prompt, "Wrong questions");

  const forNewcomer = background !== "CS_STUDENT" && background !== "PRO_DEV";

  const body = forNewcomer
    ? [
        mockText(`Here is "${blockTitle}" in plain language.`),
        "",
        "Think of it like writing a recipe before you cook: you write down what should happen, in order, so anyone can follow it later and get the same result.",
        "",
        `- The idea: **${blockTitle}** is one small step of that recipe.`,
        "- Why it matters: without the step, the next person has to guess, and guesses turn into bugs.",
        "- What to remember: describe the outcome first, then check that what you built matches it.",
        "",
        "_Mock explanation: add an API key (or clear LLM_MOCK) for a rewrite generated for you._",
      ].join("\n")
    : [
        mockText(`Here is "${blockTitle}" with the technical detail kept in.`),
        "",
        "At the mechanical level this is a contract between two parts of a system: one side states what must hold, the other side is expected to satisfy it before anything else runs.",
        "",
        `- **Structure**: the ${blockType} block pins down inputs, expected state, and the observable outcome — the same shape as a type signature plus an invariant.`,
        "- **Trade-off**: being explicit costs time up front and buys you cheap failures instead of expensive ones.",
        "- **Failure mode**: the interesting bugs are not wrong outputs but unverified assumptions — always ask which assumption this step is checking.",
        "",
        "_Mock explanation: add an API key (or clear LLM_MOCK) for a rewrite generated for you._",
      ].join("\n");

  const quizSection = wrongQuestions.length === 0
    ? ""
    : [
        "",
        "### Questions you got wrong",
        ...wrongQuestions.map(
          (question, index) =>
            `${index + 1}. **${question}** — read what the question is really asking before you look at the options; the distractor is usually the answer that sounds plausible but skips one step of the reasoning.`,
        ),
      ].join("\n");

  return {
    title: `Explained: ${blockTitle}`,
    markdown: `${body}${quizSection}`,
  };
}
