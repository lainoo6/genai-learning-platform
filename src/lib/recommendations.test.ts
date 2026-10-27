import { describe, expect, it } from "vitest";

import type { LearnerProfile } from "@/lib/profile";
import { recommendCourse, type CourseSummary } from "@/lib/recommendations";

const SOFTWARE = "software-engineering-fundamentals";
const AI_AGENTS = "using-ai-coding-agents-effectively";
const SOFT_SKILLS = "soft-and-product-skills-for-developers";

function course(slug: string, title: string): CourseSummary {
  return {
    id: slug,
    slug,
    title,
    description: "",
    topic: "",
    audience: "",
    difficulty: "beginner",
    coverEmoji: "📘",
  };
}

const catalog: CourseSummary[] = [
  course(SOFTWARE, "Software Engineering Fundamentals"),
  course(AI_AGENTS, "Using AI Coding Agents Effectively"),
  course(SOFT_SKILLS, "Soft and Product Skills for Developers"),
];

function profile(overrides: Partial<LearnerProfile>): LearnerProfile {
  return {
    background: "NON_CS",
    backgroundNote: "",
    goals: ["UNDERSTAND_SOFTWARE"],
    goalNote: "",
    statement: "",
    ...overrides,
  };
}

describe("recommendCourse", () => {
  it("sends newcomers to the software fundamentals course", () => {
    const result = recommendCourse(catalog, profile({ background: "NON_CS" }));

    expect(result?.course.slug).toBe(SOFTWARE);
    expect(result?.reason).toContain("Software Engineering Fundamentals");
  });

  it("sends computing students to the AI coding agents course", () => {
    const result = recommendCourse(catalog, profile({ background: "CS_STUDENT" }));

    expect(result?.course.slug).toBe(AI_AGENTS);
  });

  it("matches other backgrounds on their selected goal", () => {
    const result = recommendCourse(
      catalog,
      profile({
        background: "PRO_DEV",
        goals: ["PREPARE_INTERVIEWS"],
      }),
    );

    expect(result?.course.slug).toBe(SOFT_SKILLS);
    expect(result?.reason).toContain("interviews");
  });

  it("falls back to free-text keywords when no goal is picked", () => {
    const result = recommendCourse(
      catalog,
      profile({
        background: "OTHER",
        goals: ["OTHER"],
        goalNote: "I want to use Copilot at work",
      }),
    );

    expect(result?.course.slug).toBe(AI_AGENTS);
  });

  it("falls back to the goal pick when the background course is missing", () => {
    const withoutFundamentals = catalog.filter(
      (entry) => entry.slug !== SOFTWARE,
    );
    const result = recommendCourse(
      withoutFundamentals,
      profile({ background: "NON_CS", goals: ["USE_AI_TOOLS"] }),
    );

    expect(result?.course.slug).toBe(AI_AGENTS);
  });

  it("returns a generic pick when the learner has no profile", () => {
    const result = recommendCourse(catalog, null);

    expect(result?.course.slug).toBe(SOFTWARE);
    expect(result?.reason).toContain("questionnaire");
  });

  it("returns null for an empty catalog", () => {
    expect(recommendCourse([], profile({}))).toBeNull();
  });
});
