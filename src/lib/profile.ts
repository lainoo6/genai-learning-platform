import { z } from "zod";

import { prisma } from "@/lib/prisma";

/**
 * Learner profile captured by the onboarding questionnaire (P4.2).
 *
 * The answers are persisted on the two profile columns the data model already
 * has: `User.background` stores the background token (so recommendation rules
 * stay a plain comparison) and `User.goal` stores the remaining answers as a
 * JSON blob. `decodeProfile` is tolerant: unknown or missing data is treated as
 * "no profile yet" instead of throwing.
 */

const BACKGROUND_VALUES = ["NON_CS", "CS_STUDENT", "PRO_DEV", "OTHER"] as const;
const GOAL_VALUES = [
  "UNDERSTAND_SOFTWARE",
  "USE_AI_TOOLS",
  "PREPARE_INTERVIEWS",
  "OTHER",
] as const;

export type Background = (typeof BACKGROUND_VALUES)[number];
export type Goal = (typeof GOAL_VALUES)[number];

export const backgroundSchema = z.enum(BACKGROUND_VALUES);
export const goalSchema = z.enum(GOAL_VALUES);

export type BackgroundOption = {
  value: Background;
  label: string;
  hint: string;
};

export type GoalOption = {
  value: Goal;
  label: string;
};

/** Background answers shown on step 1 of the questionnaire. */
export const BACKGROUND_OPTIONS: ReadonlyArray<BackgroundOption> = [
  {
    value: "NON_CS",
    label: "New to computing",
    hint: "I have little or no programming experience.",
  },
  {
    value: "CS_STUDENT",
    label: "Computing student",
    hint: "I am studying computer science or a related subject.",
  },
  {
    value: "PRO_DEV",
    label: "Working developer",
    hint: "I already write software as part of my job.",
  },
  {
    value: "OTHER",
    label: "Something else",
    hint: "Add a line below so we can pitch things at the right level.",
  },
];

/** Learning goals offered on step 2 of the questionnaire. */
export const GOAL_OPTIONS: ReadonlyArray<GoalOption> = [
  { value: "UNDERSTAND_SOFTWARE", label: "Understand how software is built" },
  { value: "USE_AI_TOOLS", label: "Use AI coding tools" },
  { value: "PREPARE_INTERVIEWS", label: "Prepare for interviews" },
  { value: "OTHER", label: "Something else" },
];

export const BACKGROUND_LABELS: Record<Background, string> = {
  NON_CS: "New to computing",
  CS_STUDENT: "Computing student",
  PRO_DEV: "Working developer",
  OTHER: "Another background",
};

export const GOAL_LABELS: Record<Goal, string> = {
  UNDERSTAND_SOFTWARE: "Understand how software is built",
  USE_AI_TOOLS: "Use AI coding tools",
  PREPARE_INTERVIEWS: "Prepare for interviews",
  OTHER: "Reach a personal goal",
};

/** A complete learner profile. */
export const learnerProfileSchema = z.object({
  background: backgroundSchema,
  backgroundNote: z.string().trim().max(300).default(""),
  goals: z.array(goalSchema).default([]),
  goalNote: z.string().trim().max(300).default(""),
  statement: z.string().trim().max(500).default(""),
});

export type LearnerProfile = z.infer<typeof learnerProfileSchema>;

/**
 * Profile as submitted by the questionnaire: identical to the stored profile
 * except that at least one goal is required.
 */
export const onboardingSchema = learnerProfileSchema.extend({
  goals: z.array(goalSchema).min(1),
});

/** Answers kept in `User.goal`, JSON encoded. */
type StoredAnswers = {
  goals: Goal[];
  backgroundNote: string;
  goalNote: string;
  statement: string;
};

const storedAnswersSchema = z.object({
  goals: z.array(goalSchema).default([]),
  backgroundNote: z.string().default(""),
  goalNote: z.string().default(""),
  statement: z.string().default(""),
});

const EMPTY_ANSWERS: StoredAnswers = {
  goals: [],
  backgroundNote: "",
  goalNote: "",
  statement: "",
};

/** Splits a profile into the two `User` columns that hold it. */
export function encodeProfile(profile: LearnerProfile): {
  background: string;
  goal: string;
} {
  return {
    background: profile.background,
    goal: JSON.stringify({
      goals: profile.goals,
      backgroundNote: profile.backgroundNote,
      goalNote: profile.goalNote,
      statement: profile.statement,
    } satisfies StoredAnswers),
  };
}

function decodeStoredAnswers(goal: string | null): StoredAnswers {
  if (goal === null || goal.trim().length === 0) {
    return EMPTY_ANSWERS;
  }

  let value: unknown;
  try {
    value = JSON.parse(goal);
  } catch {
    // A hand-written goal from before the questionnaire: show nothing rather
    // than failing the page.
    return EMPTY_ANSWERS;
  }

  const parsed = storedAnswersSchema.safeParse(value);
  return parsed.success ? parsed.data : EMPTY_ANSWERS;
}

/**
 * Rebuilds a profile from the stored columns, or `null` when the learner has
 * not completed the questionnaire yet.
 */
export function decodeProfile(
  background: string | null,
  goal: string | null,
): LearnerProfile | null {
  const parsedBackground = backgroundSchema.safeParse(background);
  if (!parsedBackground.success) {
    return null;
  }

  return {
    background: parsedBackground.data,
    ...decodeStoredAnswers(goal),
  };
}

/** True once the learner has a background on file. */
export function hasProfile(background: string | null | undefined): boolean {
  return typeof background === "string" && background.trim().length > 0;
}

/** Reads the profile of a user. */
export async function loadLearnerProfile(
  userId: string,
): Promise<LearnerProfile | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { background: true, goal: true },
  });

  if (user === null) {
    return null;
  }

  return decodeProfile(user.background, user.goal);
}
