import { z } from "zod";

import type { RoleplayBlock } from "@/lib/blocks/schema";
import { mockText } from "@/lib/llm/mock";

/**
 * Prompts for the roleplay block (P4.5).
 *
 * Two separate model conversations share this file:
 * - the in-character chat streamed by `/api/roleplay`, where the model plays
 *   `persona` and must not coach or grade;
 * - the end-of-activity feedback report, where the model steps out of character
 *   and scores the learner against the block's rubric.
 *
 * `mockRoleplayFeedback` reads the rubric back out of the generated prompt (the
 * `Rubric (…)` heading is the contract between the two), so the canned report
 * still grades the criteria the author wrote.
 */

/** One turn of the conversation, as sent by the browser. */
export const roleplayTurnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(4000),
});

export type RoleplayTurn = z.infer<typeof roleplayTurnSchema>;

/** Upper bound on a transcript, enforced by the route and the feedback action. */
export const ROLEPLAY_MAX_TRANSCRIPT = 40;

/** In-character system prompt: persona + room + what the learner is after. */
export function roleplaySystemPrompt(block: RoleplayBlock): string {
  const { persona, scenario, goal } = block.payload;

  return [
    "You are playing a character in a training conversation on a mini-course platform.",
    "Stay in character for the whole conversation and never mention that you are an AI.",
    `Character: ${persona}`,
    `Scenario: ${scenario}`,
    `The learner is trying to: ${goal}`,
    "",
    "Rules:",
    "- Reply in 80 words or fewer.",
    "- Speak as the character would speak: your own concerns, your own vocabulary.",
    "- Do not coach, grade or explain the exercise while it is running.",
    "- Push the conversation forward with a question or a realistic objection.",
    "- If the learner asks something outside the scenario, answer briefly in character.",
  ].join("\n");
}

/** Shape of the report shown after "End & get feedback". */
export const roleplayFeedbackSchema = z.object({
  criteria: z
    .array(
      z.object({
        criterion: z.string().min(1).max(300),
        score: z.number().int().min(1).max(5),
        comment: z.string().min(1).max(600),
      }),
    )
    .min(1),
  suggestion: z.string().min(1).max(1200),
});

export type RoleplayFeedback = z.infer<typeof roleplayFeedbackSchema>;

/** Turns the transcript into `Learner:` / `Character:` lines. */
function transcriptLines(transcript: RoleplayTurn[]): string[] {
  return transcript.map(
    (turn) => `${turn.role === "user" ? "Learner" : "Character"}: ${turn.content}`,
  );
}

/**
 * Prompt for the report: scenario, goal, rubric and the conversation, with the
 * rubric repeated as the grading instruction so the model scores every line.
 */
export function roleplayFeedbackPrompt(
  block: RoleplayBlock,
  transcript: RoleplayTurn[],
): string {
  const { scenario, persona, goal, rubric } = block.payload;

  return [
    "A learner has just finished a role-play exercise. Grade their performance.",
    "",
    `Scenario: ${scenario}`,
    `Character the model played: ${persona}`,
    `The learner's goal: ${goal}`,
    "",
    "Rubric (score each criterion from 1 to 5):",
    ...rubric.map((criterion) => `- ${criterion}`),
    "",
    "Transcript:",
    ...transcriptLines(transcript),
    "",
    "Task: return one entry per rubric criterion, in the rubric's order, quoting the",
    "criterion as `criterion`. Give a 1-5 integer score and a comment that names",
    "something the learner actually said (or failed to say). Then write one overall",
    "suggestion they could act on in the next attempt.",
    "",
    'Reply with a single JSON object: { "criteria": [{ "criterion": string, "score": number, "comment": string }], "suggestion": string }.',
  ].join("\n");
}

/**
 * Eight fixed lines used when no API key is configured.
 *
 * They are deliberately generic enough to fit an interview or a stakeholder
 * conversation: each one probes for evidence, so the mock still behaves like a
 * partner in a conversation rather than a wall of text.
 */
const MOCK_LINES: readonly string[] = [
  "Thanks for starting. Give me the short version of what you would do first.",
  "That is one angle. What makes you confident about it?",
  "Tell me about a time you actually did that — what happened?",
  "What would you do differently if the other person disagreed with you?",
  "I am not convinced yet. What evidence would change my mind?",
  "If you had to cut half of that, which half would you keep?",
  "How would you know afterwards whether it worked?",
  "Fair enough. Is there anything you want to ask me before we wrap up?",
];

/** Canned in-character reply, rotating through `MOCK_LINES`. */
export function mockRoleplayReply(assistantTurns: number): string {
  const index = Math.abs(assistantTurns) % MOCK_LINES.length;
  return mockText(MOCK_LINES[index] ?? MOCK_LINES[0]);
}

/** Reads the `- ...` bullets that follow a section heading. */
function readBullets(prompt: string, heading: string): string[] {
  const lines = prompt.split("\n");
  const start = lines.findIndex((line) => line.startsWith(heading));
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
 * Canned report used when no API key is configured.
 *
 * One criterion per rubric line, deterministic mid-range scores, and a comment
 * built from the criterion itself so the report visibly grades the author's
 * rubric rather than a generic checklist.
 */
export function mockRoleplayFeedback(prompt: string): unknown {
  const rubric = readBullets(prompt, "Rubric");
  const criteria = (rubric.length > 0 ? rubric : ["Contributed to the conversation"]).map(
    (criterion, index) => ({
      criterion,
      score: index % 2 === 0 ? 4 : 3,
      comment: mockText(
        `You addressed "${criterion}" in the conversation, but the answer could rest on one concrete moment instead of a general description.`,
      ),
    }),
  );

  return {
    criteria,
    suggestion: mockText(
      "Pick the two rubric lines you scored lowest on and rehearse one sentence for each: the situation, what you actually said, and what changed afterwards. That is what a real conversation rewards.",
    ),
  };
}
