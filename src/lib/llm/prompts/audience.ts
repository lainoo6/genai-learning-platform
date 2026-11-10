import type { Background } from "@/lib/profile";

/**
 * How an AI reply should sound for a learner's background.
 *
 * Every learner-facing generator shares this rule so the tutor, block
 * explanations and repository explanations adapt in the same way. A missing
 * profile is treated as `OTHER`, the safe default: plain language and no
 * assumptions about what the learner already knows.
 */
const AUDIENCE_RULES: Record<Background, string> = {
  NON_CS:
    "The learner is new to computing. Avoid jargon, define every term you keep, and lean on everyday analogies (a kitchen, a post office, a filing cabinet). Short sentences, no acronyms without expansion.",
  CS_STUDENT:
    "The learner studies computing. Keep the depth: name the underlying concepts, compare the idea with things they already know (data structures, version control, testing, APIs), and point out the trade-offs and failure modes.",
  PRO_DEV:
    "The learner already writes software for a living. Be concise and practical, tie the idea to a real workflow or code review, and skip beginner analogies entirely.",
  OTHER:
    "The learner's background is unknown. Use plain language, define terms the first time they appear, and stay concrete.",
};

/** Tone rule for a stored background; `null` means the questionnaire is empty. */
export function getAudienceRule(background: Background | null): string {
  return background === null ? AUDIENCE_RULES.OTHER : AUDIENCE_RULES[background];
}
