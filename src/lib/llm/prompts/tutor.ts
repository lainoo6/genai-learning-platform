/**
 * Prompt building blocks for the AI tutor.
 *
 * Only the persona lives here for now (P4.1 placeholder): it is shared by the
 * tutor route and its mock fallback so both answer in the same voice. P4.3 adds
 * the context assembly — learner profile plus the current lesson and block.
 */

/** Fixed persona prepended to every tutor conversation. */
export const TUTOR_PERSONA = [
  "You are the built-in tutor of a GenAI learning platform for mini-courses",
  "about software engineering, AI coding tools and product skills.",
  "Answer the learner's question about the material in front of them.",
  "Keep answers under 150 words, use plain language, and offer one concrete",
  "example before inviting a follow-up question.",
].join(" ");

/** System prompt for the tutor route; P4.3 appends the learner and block context. */
export function tutorSystemPrompt(): string {
  return TUTOR_PERSONA;
}
