/**
 * Mock fallbacks for the LLM service layer (docs/plan/01 §6).
 *
 * Every `generateJson` call declares a usage key. In mock mode the provider
 * looks the handler up here instead of calling the model, so a demo run
 * without any API key still produces usable content. Handlers return plain
 * data — the provider validates it against the caller's Zod schema — and mark
 * their text with `[MOCK]` so a canned answer is never mistaken for a real one.
 */

/** Generation purposes used across the platform. */
export const LLM_USAGES = [
  "tutor",
  "explain-block",
  "roleplay-feedback",
  "code-review",
  "course-outline",
  "course-lesson",
  "learner-course",
  "repo-analysis",
] as const;

export type LlmUsage = (typeof LLM_USAGES)[number];

/** Marker prepended to every mock-generated text shown in the UI. */
export const MOCK_MARKER = "[MOCK]";

/** Marks a generated string as mock content. */
export function mockText(text: string): string {
  return `${MOCK_MARKER} ${text}`;
}

export type MockRequest = {
  usage: LlmUsage;
  prompt: string;
};

/**
 * A fallback implementation for one usage key. It receives the prompt so the
 * canned answer can echo whatever context the caller embedded, and returns
 * data shaped like the caller's schema.
 */
export type MockHandler = (request: MockRequest) => unknown;

const handlers = new Map<LlmUsage, MockHandler>();

/** Registers (or replaces) the fallback used for a usage key. */
export function registerMock(usage: LlmUsage, handler: MockHandler): void {
  handlers.set(usage, handler);
}

/** Returns the fallback for a usage key, or `null` when none is registered. */
export function mockHandlerFor(usage: LlmUsage): MockHandler | null {
  return handlers.get(usage) ?? null;
}
