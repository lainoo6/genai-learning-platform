import {
  BACKGROUND_LABELS,
  GOAL_LABELS,
  type Goal,
  type LearnerProfile,
} from "@/lib/profile";

/**
 * Rule-based course recommendation (P4.2).
 *
 * Pure so it can be unit tested without a database: it only needs the catalog
 * fields that describe a course, which `CourseWithLessons` also satisfies.
 */

export type CourseSummary = {
  id: string;
  slug: string;
  title: string;
  description: string;
  topic: string;
  audience: string;
  difficulty: string;
  coverEmoji: string;
};

export type Recommendation = {
  course: CourseSummary;
  reason: string;
};

/** Slugs of the three seeded courses the rules point at. */
const SEED_SLUGS = {
  software: "software-engineering-fundamentals",
  aiAgents: "using-ai-coding-agents-effectively",
  softSkills: "soft-and-product-skills-for-developers",
} as const;

/** Goal priority used when the background alone does not decide. */
const GOAL_PRIORITY: ReadonlyArray<{ goal: Goal; slug: string }> = [
  { goal: "USE_AI_TOOLS", slug: SEED_SLUGS.aiAgents },
  { goal: "PREPARE_INTERVIEWS", slug: SEED_SLUGS.softSkills },
  { goal: "UNDERSTAND_SOFTWARE", slug: SEED_SLUGS.software },
];

/** Free-text keywords, checked when no goal checkbox decides the pick. */
const TEXT_KEYWORDS: ReadonlyArray<{ pattern: RegExp; slug: string }> = [
  { pattern: /\b(ai|llm|copilot|agent|prompt)\b/, slug: SEED_SLUGS.aiAgents },
  {
    pattern: /\b(interview|feedback|communicat\w*|team|stakeholder|product)\b/,
    slug: SEED_SLUGS.softSkills,
  },
  {
    pattern: /\b(code|coding|software|program\w*|app|web)\b/,
    slug: SEED_SLUGS.software,
  },
];

function profileText(profile: LearnerProfile): string {
  return `${profile.statement} ${profile.goalNote}`.toLowerCase();
}

/** Preferred starting course: by background first, then by goal. */
function preferredSlug(profile: LearnerProfile): string {
  switch (profile.background) {
    case "NON_CS":
      return SEED_SLUGS.software;
    case "CS_STUDENT":
      return SEED_SLUGS.aiAgents;
    default:
      return slugForGoals(profile);
  }
}

function slugForGoals(profile: LearnerProfile): string {
  const selected = new Set(profile.goals);
  const byGoal = GOAL_PRIORITY.find((entry) => selected.has(entry.goal));
  if (byGoal !== undefined) {
    return byGoal.slug;
  }

  const text = profileText(profile);
  const byText = TEXT_KEYWORDS.find((entry) => entry.pattern.test(text));
  return byText?.slug ?? SEED_SLUGS.software;
}

/** One sentence explaining why a course was picked. */
function reasonFor(course: CourseSummary, profile: LearnerProfile | null): string {
  if (profile === null) {
    return `Answer the short profile questionnaire and this pick becomes yours. Until then, “${course.title}” is the safest place to start.`;
  }

  switch (profile.background) {
    case "NON_CS":
      return `You are ${BACKGROUND_LABELS.NON_CS.toLowerCase()}, so start with “${course.title}”: it explains how software gets built without assuming any code.`;
    case "CS_STUDENT":
      return `You are a ${BACKGROUND_LABELS.CS_STUDENT.toLowerCase()}, so “${course.title}” turns what you already know into AI-assisted practice.`;
    default: {
      const goalLabel = primaryGoalLabel(profile);
      return `You want to ${goalLabel.toLowerCase()}, so “${course.title}” is the closest match in the catalog.`;
    }
  }
}

/** The goal to quote in the reason: first checkbox, else free text, else a default. */
function primaryGoalLabel(profile: LearnerProfile): string {
  const firstGoal = profile.goals[0];
  if (firstGoal !== undefined) {
    return GOAL_LABELS[firstGoal];
  }

  const statement = profile.statement.trim();
  if (statement.length > 0) {
    return statement.length > 60 ? `${statement.slice(0, 60)}…` : statement;
  }

  return "Learn something new";
}

/**
 * Picks the course a learner should start with, or `null` when the catalog is
 * empty. A missing preferred course (not published yet) falls back to the
 * goal-based pick and then to the first course in reading order.
 */
export function recommendCourse(
  courses: ReadonlyArray<CourseSummary>,
  profile: LearnerProfile | null,
): Recommendation | null {
  const [firstCourse] = courses;
  if (firstCourse === undefined) {
    return null;
  }

  const preferred = profile === null ? null : preferredSlug(profile);
  const bySlug =
    preferred === null
      ? undefined
      : courses.find((course) => course.slug === preferred);
  const byGoals =
    profile === null
      ? undefined
      : courses.find((course) => course.slug === slugForGoals(profile));
  const course = bySlug ?? byGoals ?? firstCourse;

  return { course, reason: reasonFor(course, profile) };
}
