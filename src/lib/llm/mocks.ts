import { readContentLanguage } from "@/lib/llm/language";
import { registerMock } from "@/lib/llm/mock";
import { mockLearnerCourse } from "@/lib/llm/prompts/course";
import { mockExplain } from "@/lib/llm/prompts/explain";
import { mockLesson } from "@/lib/llm/prompts/lesson";
import { mockCourseOutline } from "@/lib/llm/prompts/outline";
import { mockRoleplayFeedback } from "@/lib/llm/prompts/roleplay";
import { mockGameActivity } from "@/lib/llm/prompts/game-activity";

/**
 * Registration point for the canned LLM fallbacks (P4.4, P4.5, P4.6, P4.7).
 *
 * `generateJson` looks its fallback up by usage key, so a caller has to make
 * sure its handler is registered before asking. Re-registering simply replaces
 * the handler, which makes this safe to call on every request.
 */
export function registerLlmMocks(): void {
  registerMock("code-review", () => ({
    summary: "[MOCK] Demo feedback only; no AI analysis of your code has run.",
    errors: [], improvements: ["[MOCK] Use clear variable names and small functions."],
    edgeCases: ["[MOCK] Check empty inputs, boundary values and unexpected types."],
  }));
  registerMock("explain-block", ({ prompt }) => mockExplain(prompt));
  registerMock("roleplay-feedback", ({ prompt }) => mockRoleplayFeedback(prompt));
  registerMock("course-outline", ({ prompt }) => mockCourseOutline(prompt));
  registerMock("course-lesson", ({ prompt }) => mockLesson(prompt));
  registerMock("course-game-activity", ({ prompt }) =>
    mockGameActivity(readContentLanguage(prompt)),
  );
  registerMock("learner-course", ({ prompt }) =>
    mockLearnerCourse(readContentLanguage(prompt)),
  );
}
