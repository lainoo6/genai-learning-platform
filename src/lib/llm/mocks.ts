import { readContentLanguage } from "@/lib/llm/language";
import { registerMock } from "@/lib/llm/mock";
import { mockLearnerCourse } from "@/lib/llm/prompts/course";
import { mockExplain } from "@/lib/llm/prompts/explain";
import { mockLesson } from "@/lib/llm/prompts/lesson";
import { mockCourseOutline } from "@/lib/llm/prompts/outline";
import { mockRoleplayFeedback } from "@/lib/llm/prompts/roleplay";

/**
 * Registration point for the canned LLM fallbacks (P4.4, P4.5, P4.6, P4.7).
 *
 * `generateJson` looks its fallback up by usage key, so a caller has to make
 * sure its handler is registered before asking. Re-registering simply replaces
 * the handler, which makes this safe to call on every request.
 */
export function registerLlmMocks(): void {
  registerMock("explain-block", ({ prompt }) => mockExplain(prompt));
  registerMock("roleplay-feedback", ({ prompt }) => mockRoleplayFeedback(prompt));
  registerMock("course-outline", ({ prompt }) => mockCourseOutline(prompt));
  registerMock("course-lesson", ({ prompt }) => mockLesson(prompt));
  registerMock("learner-course", ({ prompt }) =>
    mockLearnerCourse(readContentLanguage(prompt)),
  );
}
