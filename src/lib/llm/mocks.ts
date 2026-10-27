import { readContentLanguage } from "@/lib/llm/language";
import { registerMock } from "@/lib/llm/mock";
import { mockLearnerCourse } from "@/lib/llm/prompts/course";
import { mockExplain } from "@/lib/llm/prompts/explain";
import { mockLesson } from "@/lib/llm/prompts/lesson";
import { mockCourseOutline } from "@/lib/llm/prompts/outline";
import { mockRepoAnalysis } from "@/lib/llm/prompts/repo";
import { mockRoleplayFeedback } from "@/lib/llm/prompts/roleplay";

/** Reads the repository label back out of a repo-analysis prompt. */
function repoLabelFromPrompt(prompt: string): string {
  const match = /^Repository:\s*(.+)$/mu.exec(prompt);
  return match?.[1]?.trim() ?? "demo/repo";
}

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
  registerMock("learner-course", ({ prompt }) =>
    mockLearnerCourse(readContentLanguage(prompt)),
  );
  registerMock("repo-analysis", ({ prompt }) =>
    mockRepoAnalysis(repoLabelFromPrompt(prompt)),
  );
}
