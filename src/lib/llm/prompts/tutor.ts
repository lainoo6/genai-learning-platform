import { z } from "zod";

import { mockText } from "@/lib/llm/mock";
import { BACKGROUND_LABELS, GOAL_LABELS, type LearnerProfile } from "@/lib/profile";

/**
 * Prompt building blocks for the AI tutor (P4.3).
 *
 * The persona, the context assembly and the mock answer live together so the
 * canned reply and the real reply are written in the same voice.
 */

/** Fixed persona prepended to every tutor conversation. */
export const TUTOR_PERSONA = [
  "You are the built-in tutor of a GenAI learning platform for mini-courses",
  "about software engineering, AI coding tools and product skills.",
  "Answer the learner's question about the material in front of them.",
  "Keep answers under 150 words, use plain language, and offer one concrete",
  "example before inviting a follow-up question.",
].join(" ");

/** Everything the tutor knows about the learner and the current lesson. */
export type TutorContext = {
  profile: LearnerProfile | null;
  courseTitle: string;
  lessonTitle: string;
  /** Type of the block the learner is on, or null when the lesson has none. */
  blockType: string | null;
  blockTitle: string | null;
  blockDigest: string | null;
};

/** Reply shape shared by the streaming route and the mock fallback. */
export const tutorReplySchema = z.object({
  reply: z.string().min(1),
});

export type TutorReply = z.infer<typeof tutorReplySchema>;

/** One-paragraph description of the learner used inside the system prompt. */
export function describeProfile(profile: LearnerProfile | null): string {
  if (profile === null) {
    return "The learner has not filled in the onboarding questionnaire yet, so avoid assumptions about their level.";
  }

  const goals = profile.goals
    .map((goal) => GOAL_LABELS[goal])
    .join(", ");

  return [
    `Background: ${BACKGROUND_LABELS[profile.background]}.`,
    `Goals: ${goals.length > 0 ? goals : "not stated"}.`,
    profile.statement.length > 0
      ? `In their own words: "${profile.statement}".`
      : "",
    profile.goalNote.length > 0 ? `Note on goals: ${profile.goalNote}` : "",
  ]
    .filter((part) => part.length > 0)
    .join(" ");
}

/** System prompt: persona + learner profile + the material in front of them. */
export function tutorSystemPrompt(context: TutorContext): string {
  const material = [
    `Course: ${context.courseTitle}`,
    `Lesson: ${context.lessonTitle}`,
    context.blockType === null
      ? null
      : `Current block (${context.blockType}): ${context.blockTitle ?? ""}`,
    context.blockDigest === null ? null : `Block content: ${context.blockDigest}`,
  ].filter((line): line is string => line !== null);

  return [
    TUTOR_PERSONA,
    "",
    "Learner profile:",
    describeProfile(context.profile),
    "",
    "Material in front of the learner:",
    ...material,
    "",
    "Ground every answer in that material. If the question is unrelated, answer",
    "briefly and steer the learner back to the lesson.",
  ].join("\n");
}

/** Wraps a learner question so the model keeps answering about the material. */
export function tutorQuestionPrompt(question: string): string {
  return `Learner question: ${question}`;
}

/**
 * Canned teaching answer used when no API key is configured.
 *
 * It is built from the block title / type / lesson title so the reply still
 * reads as if it is about the page the learner is on, and every mock answer
 * carries the `[MOCK]` marker.
 */
export function mockTutorReply(context: TutorContext, question: string): string {
  const subject = context.blockTitle ?? context.lessonTitle;
  const activity = context.blockType === null ? "lesson" : `${context.blockType} activity`;

  return mockText(
    [
      `Here is how I would approach "${subject}" — the ${activity} you have open in ${context.courseTitle}.`,
      `The one idea to take away is that it is a step in building software: something is described, then checked, then improved.`,
      `A concrete example: imagine you are explaining "${subject}" to a teammate in two sentences — the first says what it is, the second says why it matters for the result.`,
      `You asked: "${question}". I am running in mock mode, so this is a prepared answer rather than a generated one — switch off LLM_MOCK and add an API key for real answers.`,
      `Tell me which part feels unclear and we will take it one step at a time.`,
    ].join(" "),
  );
}
