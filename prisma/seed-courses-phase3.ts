import { CourseSource, CourseStatus, Prisma, type PrismaClient } from "@prisma/client";

import { blockListSchema } from "../src/lib/blocks/schema";

/**
 * Seed content for tasks P3.5: two more published mini-courses.
 *
 * - "Using AI Coding Agents Effectively" (CS students) — reading, quiz, slides,
 *   coding and a match game, plus a simulation about delegation.
 * - "Soft and Product Skills for Developers" (all audiences) — reading, quiz,
 *   flashcards, slides, a sort game, a role-play mock interview about feedback.
 *
 * Between them the two courses exercise every block type implemented so far.
 * Every lesson payload is parsed with the real block schema before it is
 * written, so a typo fails loudly at `npm run db:seed` instead of showing up as
 * an unrenderable lesson in the player.
 */

export const AI_AGENTS_COURSE_SLUG = "using-ai-coding-agents-effectively";
export const SOFT_SKILLS_COURSE_SLUG = "soft-and-product-skills-for-developers";

type SeedLesson = {
  title: string;
  estimatedMinutes: number;
  /** Validated against `blockListSchema` before it touches the database. */
  blocks: unknown[];
};

type SeedModule = {
  title: string;
  lessons: SeedLesson[];
};

type SeedCourse = {
  slug: string;
  title: string;
  description: string;
  topic: string;
  audience: string;
  difficulty: string;
  coverEmoji: string;
  modules: SeedModule[];
};

const AI_AGENTS_COURSE: SeedCourse = {
  slug: AI_AGENTS_COURSE_SLUG,
  title: "Using AI Coding Agents Effectively",
  description:
    "Six lessons on getting real work out of an AI coding agent without handing it "
    + "the judgement calls: what the tools are actually good at, how to write a brief "
    + "they can act on, how to review a diff you did not write, and when the honest "
    + "answer is to do it yourself. Written for students who already code.",
  topic: "AI Coding Assistants",
  audience: "CS students",
  difficulty: "intermediate",
  coverEmoji: "🤖",
  modules: [
    {
      title: "The AI coding landscape",
      lessons: [
        {
          title: "What agents can and cannot do",
          estimatedMinutes: 14,
          blocks: [
            {
              id: "blk_ai_l1_reading",
              title: "A loop with tools attached",
              type: "reading",
              payload: {
                markdown: [
                  "# What an agent actually is",
                  "",
                  "Autocomplete finishes your sentence. An agent finishes your task — or "
                    + "tries to.",
                  "",
                  "The difference is a loop. An autocomplete model sees the file you are "
                    + "typing in and predicts the next few tokens. A coding agent sees the "
                    + "same thing and then *acts*: it reads a file, runs a command, watches "
                    + "the output, edits something, runs the tests again, and repeats until "
                    + "it decides it is done. It has tools — a shell, a file editor, a search "
                    + "index — and it chooses when to use them.",
                  "",
                  "That loop is the whole product. It is also where every failure mode lives.",
                  "",
                  "## What they are genuinely good at",
                  "",
                  "- **Mechanical sweeps.** Rename a symbol across two hundred files, "
                    + "migrate two hundred call sites to a new signature, convert a folder "
                    + "from one test framework to another. Wide, boring, and verifiable by "
                    + "the compiler.",
                  "- **Explaining unfamiliar code.** Point it at a function you have never "
                    + "seen and ask what it does. This is probably the most valuable item on "
                    + "the list, and the one people under-use.",
                  "- **First drafts of known patterns.** A pagination helper, a CSV parser, "
                    + "a form with validation. The pattern exists in the training data; you "
                    + "are paying for typing speed, not judgement.",
                  "- **Writing tests from a description.** \"Cover the case where a user has "
                    + "two expired subscriptions\" is the kind of instruction it handles "
                    + "well — provided you then read the test.",
                  "",
                  "## What they are genuinely bad at",
                  "",
                  "- **Anything that is not in the repository.** Why the checkout service "
                    + "retries three times. Which customer complained the loudest. The fact "
                    + "that the odd number in the config is a workaround for a vendor bug "
                    + "from 2023. An agent cannot know what nobody wrote down, and it will "
                    + "not stop to ask — it will guess.",
                  "- **Deciding what matters.** Asked to add pagination to an orders "
                    + "endpoint, it will write pagination. It will not notice that the "
                    + "nightly finance job reads the same endpoint and expects every row.",
                  "- **Security-sensitive code.** Authorisation and input validation are "
                    + "exactly the places where \"looks reasonable\" is not good enough, and "
                    + "exactly the places where a plausible pattern scraped from the internet "
                    + "is most likely wrong.",
                  "- **Holding a long plan together.** Over a long task the plan drifts. The "
                    + "third requirement you gave quietly disappears, and the summary the "
                    + "agent writes at the end still sounds confident.",
                  "",
                  "## The mental model that survives contact with reality",
                  "",
                  "> A fast, tireless junior engineer who has read the entire internet and "
                    + "> has never once worked at your company.",
                  "",
                  "Fast and tireless: it will do the sweep in ninety seconds. Never worked "
                    + "here: it does not know your constraints, your users, or what you "
                    + "promised anybody.",
                  "",
                  "So the useful question is never \"can the agent do this?\" — it can "
                    + "attempt almost anything. The useful question is **\"can I check the "
                    + "answer cheaply?\"** If yes, delegate freely. If no, you are not "
                    + "delegating work, you are delegating risk.",
                  "",
                  "## A concrete example",
                  "",
                  "\"Add pagination to the orders API.\" The agent produces something that "
                    + "compiles and paginates. What it cannot see:",
                  "",
                  "- the nightly finance job that reads every order and would silently start "
                    + "receiving twenty rows;",
                  "- the mobile client that parses `data.orders` and would break on an "
                    + "envelope that now also carries `nextCursor`;",
                  "- a thirty-second timeout on a query whose cost profile changes once "
                    + "`LIMIT` and `OFFSET` enter it.",
                  "",
                  "None of those exist as text in the repository. All of them live in the "
                    + "head of somebody who has worked on this system for a year. That gap — "
                    + "not typing speed — is what the rest of this course is about.",
                ].join("\n"),
              },
            },
            {
              id: "blk_ai_l1_quiz",
              title: "Check your understanding",
              type: "quiz",
              payload: {
                passScore: 0.7,
                questions: [
                  {
                    id: "q_ai_l1_loop",
                    kind: "single",
                    prompt:
                      "What is the main difference between autocomplete and a coding agent?",
                    options: [
                      "An agent runs a loop: it reads, runs commands and acts on the result",
                      "Autocomplete is always faster than an agent",
                      "An agent can only write longer files",
                      "Autocomplete cannot see the file you are editing",
                    ],
                    answer: [0],
                    explanation:
                      "Both see your code. Only the agent acts on it — running tests, "
                        + "reading other files, editing — and only the agent decides for "
                        + "itself when to stop.",
                  },
                  {
                    id: "q_ai_l1_good_at",
                    kind: "multi",
                    prompt:
                      "Which of these are things coding agents are genuinely good at today?",
                    options: [
                      "Mechanical sweeps, such as renaming a symbol across many files",
                      "Explaining a function you have never seen before",
                      "Knowing why a retry count was set to three last year",
                      "Producing a first draft of a well-known pattern",
                    ],
                    answer: [0, 1, 3],
                    explanation:
                      "Sweeps, explanations and first drafts of known patterns all play to "
                        + "what the model has seen. Unwritten history is the one thing it "
                        + "cannot reach — it will guess instead.",
                  },
                  {
                    id: "q_ai_l1_unwritten",
                    kind: "truefalse",
                    prompt:
                      "An agent cannot know a constraint that nobody wrote down anywhere.",
                    answer: [0],
                    explanation:
                      "True. It has no access to conversations, incidents or the reason "
                        + "behind a strange constant — and it will invent a plausible one "
                        + "rather than tell you it does not know.",
                  },
                  {
                    id: "q_ai_l1_question",
                    kind: "short",
                    prompt:
                      "In one phrase: what is the question to ask before delegating a task "
                        + "to an agent?",
                    answer: "verify, check, test it, review, how will i know",
                    explanation:
                      "\"Can I verify the answer cheaply?\" If you can, delegate. If you "
                        + "cannot, the task still needs a human who owns the consequence.",
                  },
                ],
              },
            },
          ],
        },
        {
          title: "Delegation patterns",
          estimatedMinutes: 12,
          blocks: [
            {
              id: "blk_ai_l2_slides",
              title: "Four ways to hand work over",
              type: "slides",
              payload: {
                autoPlay: false,
                slides: [
                  {
                    title: "The pattern matters more than the prompt",
                    bullets: [
                      "Most disappointment comes from picking the wrong pattern, not from "
                        + "poor wording",
                      "Each pattern differs in how much you review and how much you trust",
                      "Start at the top of this list and only go deeper when it pays",
                    ],
                    narration:
                      "Most disappointment with coding agents comes from picking the wrong "
                        + "pattern, not from poor wording. Here are four, from the least to "
                        + "the most trust.",
                  },
                  {
                    title: "Pattern one — ask for a draft, keep the decision",
                    bullets: [
                      "You ask for an approach, you choose between the options",
                      "Good when you do not yet know what the code should look like",
                      "The output is a conversation starter, never a patch",
                    ],
                    narration:
                      "Pattern one: ask for a draft and keep the decision. You want "
                        + "options, not a patch. Use it when you do not yet know what the "
                        + "code should look like.",
                  },
                  {
                    title: "Pattern two — give it a test to satisfy",
                    bullets: [
                      "Write the failing test yourself, then let the agent make it pass",
                      "The test is the specification, so there is nothing to argue about",
                      "This is the pattern with the best ratio of speed to trust",
                    ],
                    narration:
                      "Pattern two: you write the failing test, the agent makes it pass. "
                        + "Because the test is the specification, there is nothing left to "
                        + "argue about — and you can check the result in seconds.",
                  },
                  {
                    title: "Pattern three — the mechanical sweep",
                    bullets: [
                      "Renames, migrations, formatting, build config",
                      "Wide and boring, and the compiler catches the mistakes",
                      "Still search for the string afterwards: compilers miss text",
                    ],
                    narration:
                      "Pattern three: the mechanical sweep. Renames, migrations, "
                        + "formatting. It is wide and boring, and the compiler catches the "
                        + "mistakes. Just remember to search for the plain text afterwards.",
                  },
                  {
                    title: "Pattern four — the full handoff",
                    bullets: [
                      "You write a brief: goal, constraints, acceptance criteria, out of "
                        + "scope",
                      "The agent plans, implements and reports back",
                      "Only worth it when the acceptance criteria are checkable",
                      "Without a brief, this pattern is how 900-line diffs happen",
                    ],
                    narration:
                      "Pattern four: the full handoff. You write a brief with a goal, "
                        + "constraints, acceptance criteria and an out-of-scope list. Only "
                        + "use it when those criteria are genuinely checkable — otherwise "
                        + "this is how nine-hundred-line diffs happen.",
                  },
                ],
              },
            },
            {
              id: "blk_ai_l2_quiz",
              title: "Check your understanding",
              type: "quiz",
              payload: {
                passScore: 0.7,
                questions: [
                  {
                    id: "q_ai_l2_tdd",
                    kind: "single",
                    prompt:
                      "Why does writing the failing test yourself work so well with an agent?",
                    options: [
                      "The test becomes the specification, so the result is cheap to check",
                      "Agents are unable to write tests at all",
                      "It makes the agent run faster",
                      "It removes the need to read the code it produces",
                    ],
                    answer: [0],
                    explanation:
                      "A test you wrote is a specification nobody can talk their way "
                        + "around. You still read the diff, but you now have a cheap, "
                        + "objective check.",
                  },
                  {
                    id: "q_ai_l2_handoff",
                    kind: "multi",
                    prompt: "What belongs in a brief for a full handoff?",
                    options: [
                      "The goal, in one or two sentences",
                      "Acceptance criteria you could actually check",
                      "An out-of-scope list naming what not to touch",
                      "Your personal opinion of the existing code style",
                    ],
                    answer: [0, 1, 2],
                    explanation:
                      "Goal, criteria and boundaries are what stop a small request from "
                        + "becoming a rewrite. Taste complaints belong in code review, not "
                        + "in a brief.",
                  },
                  {
                    id: "q_ai_l2_sweep",
                    kind: "truefalse",
                    prompt:
                      "A green test suite proves that a rename touched every occurrence of "
                        + "the old name.",
                    answer: [1],
                    explanation:
                      "False. Compilers and tests follow identifiers, not text. Occurrences "
                        + "built by string concatenation — raw SQL, analytics events, email "
                        + "templates — are missed silently.",
                  },
                ],
              },
            },
          ],
        },
      ],
    },
    {
      title: "Working with agents",
      lessons: [
        {
          title: "Writing good specs",
          estimatedMinutes: 16,
          blocks: [
            {
              id: "blk_ai_l3_reading",
              title: "The brief is the unit of delegation",
              type: "reading",
              payload: {
                markdown: [
                  "# Five lines that replace an hour of arguing",
                  "",
                  "Tell an agent \"make the URL handling more robust\" and you will get a "
                    + "confident rewrite of a module you did not want touched. Tell it what "
                    + "the five lines below say and you will get a patch you can read in two "
                    + "minutes. The difference is not the model. It is the brief.",
                  "",
                  "## The shape of a brief",
                  "",
                  "| Part | What it answers |",
                  "| --- | --- |",
                  "| **Goal** | What is true when this is done? One or two sentences. |",
                  "| **Context** | Where this lives, and what the agent cannot see. |",
                  "| **Constraints** | What must stay true: no new dependencies, no "
                    + "behaviour change, must run offline. |",
                  "| **Acceptance criteria** | Two to five things you could actually check. |",
                  "| **Out of scope** | What must not change, named explicitly. |",
                  "",
                  "Two of those five are easy to skip, and they are the two that cause the "
                    + "damage. **Out of scope** is the only line that stops a small request "
                    + "from becoming a refactor. **Acceptance criteria** are the only line "
                    + "that lets you check the answer without reading every file.",
                  "",
                  "## A real brief",
                  "",
                  "> **Goal.** Add a `slug` to every blog post so URLs read "
                    + "`/posts/hello-world` instead of `/posts/42`.",
                  "> **Context.** Posts live in `src/content/posts/*.md` and are loaded by "
                    + "`loadPosts()` in `src/lib/posts.ts`. Existing posts have no slug field.",
                  "> **Constraints.** No new npm dependencies. Existing `/posts/:id` URLs "
                    + "must keep working. Node 18.",
                  "> **Acceptance criteria.** (1) `slugify(\"Hello, World!\")` returns "
                    + "`\"hello-world\"`. (2) Two posts with the same title get different "
                    + "slugs. (3) Every existing post resolves under both the old numeric "
                    + "URL and its new slug. (4) `npm test` passes.",
                  "> **Out of scope.** Do not touch the tag pages, the RSS feed, or the "
                    + "markdown renderer.",
                  "",
                  "Four acceptance criteria, and each one is a test somebody could write. "
                    + "That is the test of a good criterion: if you cannot tell whether it "
                    + "passed, it is not a criterion, it is a wish.",
                  "",
                  "## Why criteria beat instructions",
                  "",
                  "Instructions tell the agent *how*, which removes the one thing it is "
                    + "good at. Criteria tell it *what has to be true*, which lets it use the "
                    + "pattern it knows. Write criteria, and let the implementation go.",
                  "",
                  "There is a second benefit: criteria are reusable. The same four lines "
                    + "work as a brief for an agent, as the definition of done for a "
                    + "teammate, and as the test file you check in. One artefact, three jobs.",
                  "",
                  "## The exercise below",
                  "",
                  "The next block gives you the acceptance criteria for a function and asks "
                    + "you to implement it. Read the criteria first and make a prediction "
                    + "about the tricky line before you type — the point is to feel what a "
                    + "criterion is worth when it is written well, and how much is left "
                    + "unspecified when it is not.",
                ].join("\n"),
              },
            },
            {
              id: "blk_ai_l3_coding",
              title: "Implement a spec you did not write",
              type: "coding",
              payload: {
                problem:
                  "Here is the brief for a small function: \"slugify(title) turns a blog "
                    + "post title into a URL fragment. Lower-case letters and digits only; "
                    + "everything else collapses into a single hyphen; no hyphen at either "
                    + "end.\" That is four acceptance criteria wearing a sentence. Implement "
                    + "the function so every test below passes — the tests are the "
                    + "criteria, written out.",
                starter: "function slugify(title) {\n  // your code here\n}",
                tests: [
                  {
                    name: "lowercases the title",
                    expression: "slugify(\"Hello World\") === \"hello-world\"",
                  },
                  {
                    name: "collapses runs of separators into one hyphen",
                    expression: "slugify(\"a   b\") === \"a-b\"",
                  },
                  {
                    name: "drops punctuation",
                    expression: "slugify(\"Ship it! (now)\") === \"ship-it-now\"",
                  },
                  {
                    name: "leaves no hyphen at either end",
                    expression: "slugify(\"  --Hi--  \") === \"hi\"",
                  },
                  {
                    name: "keeps digits",
                    expression: "slugify(\"Top 10 tips\") === \"top-10-tips\"",
                  },
                ],
                hints: [
                  "Lower-case first, then replace — order matters for the result.",
                  "One regular expression can replace every run of characters that is not "
                    + "a letter or a digit with a single hyphen: /[^a-z0-9]+/g",
                  "Trim the hyphens off both ends last, not first.",
                ],
              },
            },
          ],
        },
        {
          title: "Reviewing AI output",
          estimatedMinutes: 15,
          blocks: [
            {
              id: "blk_ai_l4_reading",
              title: "How to read a diff you did not write",
              type: "reading",
              payload: {
                markdown: [
                  "# Reviewing is the job now",
                  "",
                  "When writing code was slow, reviewing was the cheap part. An agent inverts "
                    + "that: a plausible six-hundred-line diff arrives in ninety seconds and "
                    + "reading it properly takes longer than writing it would have. Reviewing "
                    + "is now the bottleneck, and it is the skill nobody teaches.",
                  "",
                  "## Read in this order",
                  "",
                  "1. **The tests, first.** They tell you what the author believed the task "
                    + "was. If the tests are wrong, the implementation is irrelevant.",
                  "2. **The smallest file.** It usually contains the actual change; "
                    + "everything else is plumbing around it.",
                  "3. **The deletion.** What disappeared is easier to miss than what "
                    + "appeared, and more often where the damage is.",
                  "4. **Everything else**, last, and faster.",
                  "",
                  "## Four questions to ask",
                  "",
                  "- **Does it do what the brief asked — and nothing else?** Scope creep "
                    + "is the default failure mode, because tidying up feels productive.",
                  "- **Did it touch a file it had no reason to touch?** Config, CI, "
                    + "migrations and lockfiles deserve a question each time.",
                  "- **Would this test fail if the logic were wrong?** A test that only "
                    + "asserts a function was called proves nothing about behaviour.",
                  "- **What behaviour changed that nobody asked about?** Defaults, error "
                    + "handling, rounding and ordering are where silent changes hide.",
                  "",
                  "## Red flags worth a second look",
                  "",
                  "- A 400-line diff for a one-line bug: the fix and a refactor got mixed "
                    + "together. Ask for them separately.",
                  "- A test deleted or weakened in the same commit as the fix. That is the "
                    + "fix failing a case, usually.",
                  "- A new dependency for something that used to be three lines of code.",
                  "- `catch (e) {}` — an error swallowed is a bug moved somewhere else.",
                  "- \"Refactor\" in the description of a bug fix.",
                  "",
                  "## The uncomfortable part",
                  "",
                  "None of this is specific to AI. Every item on the list applies to a diff "
                    + "from a teammate, and always has. What changed is the *volume*: agents "
                    + "make it possible to produce more code than a team can thoughtfully "
                    + "review, and the pressure to approve rather than read is now constant.",
                  "",
                  "A review you did not really do is worse than no review, because it "
                    + "produces the record of a check without the check. If you are too busy "
                    + "to read it, say so out loud — a small honest diff beats a large "
                    + "unreviewed one.",
                ].join("\n"),
              },
            },
            {
              id: "blk_ai_l4_game",
              title: "Match the signal to what it means",
              type: "game",
              payload: {
                variant: "match",
                pairs: [
                  {
                    left: "A test was deleted in the same commit as the fix",
                    right: "Stop: the fix probably made that case fail",
                  },
                  {
                    left: "The diff adds a dependency nobody on the team knows",
                    right: "Check the licence, the last release date and the maintainers",
                  },
                  {
                    left: "The new test only asserts that a function was called",
                    right: "Tautology: it would pass even if the logic were wrong",
                  },
                  {
                    left: "A 400-line diff for a one-line bug",
                    right: "Ask for the fix on its own and keep the refactor separate",
                  },
                  {
                    left: "The error path now returns null instead of throwing",
                    right: "A silent behaviour change the callers were not told about",
                  },
                  {
                    left: "Every test passes and the naming reads beautifully",
                    right: "Still read it: good style and correctness are different things",
                  },
                ],
              },
            },
            {
              id: "blk_ai_l4_quiz",
              title: "Check your understanding",
              type: "quiz",
              payload: {
                passScore: 0.7,
                questions: [
                  {
                    id: "q_ai_l4_order",
                    kind: "single",
                    prompt: "What is the most useful thing to read first in an unfamiliar diff?",
                    options: [
                      "The tests, because they show what the author thought the task was",
                      "The largest file, to get it out of the way",
                      "The commit message",
                      "The formatting and naming",
                    ],
                    answer: [0],
                    explanation:
                      "The tests reveal the author's understanding of the task. If that "
                        + "understanding is wrong, the implementation cannot be right.",
                  },
                  {
                    id: "q_ai_l4_flags",
                    kind: "multi",
                    prompt: "Which of these deserve a question during a review?",
                    options: [
                      "A lockfile change for a three-line utility",
                      "A catch block that swallows the error",
                      "A test renamed for clarity",
                      "A bug fix bundled with a refactor",
                    ],
                    answer: [0, 1, 3],
                    explanation:
                      "New dependencies, swallowed errors and mixed concerns all change "
                        + "risk without changing behaviour visibly. Renaming a test for "
                        + "clarity is just tidying.",
                  },
                  {
                    id: "q_ai_l4_busy",
                    kind: "truefalse",
                    prompt:
                      "Approving a change you did not have time to read is better than "
                        + "delaying it.",
                    answer: [1],
                    explanation:
                      "False. An unread approval creates the record of a check without the "
                        + "check, which is worse than an honest \"I have not reviewed this "
                        + "yet\".",
                  },
                ],
              },
            },
          ],
        },
      ],
    },
    {
      title: "Responsible use",
      lessons: [
        {
          title: "When not to trust AI",
          estimatedMinutes: 15,
          blocks: [
            {
              id: "blk_ai_l5_simulation",
              title: "Friday, 16:40 — what do you hand over?",
              type: "simulation",
              payload: {
                intro:
                  "Four things land on your desk at once, the office is emptying, and you "
                    + "have an agent and twenty minutes. Delegation is a judgement call about "
                    + "consequences — walk it and see where your instincts take you.",
                start: "inbox",
                end: "debrief",
                nodes: {
                  inbox: {
                    text:
                      "Your four tasks: (1) a CSS alignment bug on the pricing page, "
                        + "(2) a change to how subscription refunds are rounded, (3) a rename "
                        + "of `userId` to `accountId` across two hundred files, (4) the draft "
                        + "incident write-up for Tuesday's outage. What do you hand to the "
                        + "agent first?",
                    options: [
                      {
                        label: "The rename across two hundred files",
                        next: "rename",
                        feedback:
                          "Good instinct: mechanical, wide, and the compiler checks it for "
                            + "you. This is the pattern agents are best at.",
                        score: 2,
                      },
                      {
                        label: "The CSS alignment bug",
                        next: "css",
                        feedback:
                          "Safe enough — small blast radius, easy to eyeball. It is just "
                            + "not the best use of twenty minutes of machine time.",
                        score: 1,
                      },
                      {
                        label: "The refund rounding change",
                        next: "refunds",
                        feedback:
                          "Money, policy and edge cases. The rounding rule lives in a "
                            + "finance document the agent has never seen.",
                        score: 0,
                      },
                      {
                        label: "The incident write-up",
                        next: "incident",
                        feedback:
                          "The write-up needs the timeline you lived through. The agent has "
                            + "a tone for this kind of document, and it will use it.",
                        score: -1,
                      },
                    ],
                  },
                  rename: {
                    text:
                      "The agent renames everything in ninety seconds and the suite is "
                        + "green. Then you remember that three SQL strings and one analytics "
                        + "event are built by concatenating text — and the compiler does not "
                        + "follow text.",
                    options: [
                      {
                        label: "Search the whole repo for the literal text \"userId\"",
                        next: "sweep",
                        feedback:
                          "Exactly right. Compilers follow identifiers; greps follow text. "
                            + "That gap is where renames leak.",
                        score: 2,
                      },
                      {
                        label: "Merge it — the suite is green",
                        next: "leak",
                        feedback:
                          "Green tests tell you the renamed paths work. They say nothing "
                            + "about the paths that were never renamed.",
                        score: -1,
                      },
                    ],
                  },
                  sweep: {
                    text:
                      "You find four more occurrences: two in raw SQL, one in a marketing "
                        + "email template, one in a dashboard query. The agent can fix those "
                        + "too.",
                    options: [
                      {
                        label: "Fix the four by hand — it will take two minutes",
                        next: "refunds",
                        feedback:
                          "Reasonable. Four known sites, two minutes, and the diff stays "
                            + "exactly as large as it needs to be.",
                        score: 2,
                      },
                      {
                        label: "Ask the agent to fix them, then re-run the search",
                        next: "refunds",
                        feedback:
                          "Also fine — the important part is that you re-ran the search "
                            + "instead of trusting the claim that it was done.",
                        score: 2,
                      },
                    ],
                  },
                  leak: {
                    text:
                      "You merge it. On Monday the analytics dashboard is empty, a nightly "
                        + "job fails on a column that no longer resolves, and the fix takes "
                        + "the whole morning.",
                    options: [
                      {
                        label: "Fix it and move on to the next task",
                        next: "debrief",
                        feedback:
                          "A ninety-second rename cost a morning. Verification is the whole "
                            + "difference between delegating work and delegating risk.",
                        score: -1,
                      },
                    ],
                  },
                  css: {
                    text:
                      "The agent fixes the alignment in two minutes. The fix works by adding "
                        + "`!important` to three rules rather than finding out why they were "
                        + "being overridden.",
                    options: [
                      {
                        label: "Ask why the rule was being overridden in the first place",
                        next: "refunds",
                        feedback:
                          "The right question. A specificity conflict usually means two "
                            + "stylesheets disagree about who owns that element.",
                        score: 2,
                      },
                      {
                        label: "Accept it — the alignment is fixed and the demo is tomorrow",
                        next: "refunds",
                        feedback:
                          "It works, and you have bought a debt you will pay with interest "
                            + "the next time somebody touches that page.",
                        score: 1,
                      },
                    ],
                  },
                  refunds: {
                    text:
                      "Now the refund rounding change. The agent proposes rounding to two "
                        + "decimals at the point of display — and cheerfully offers to "
                        + "rewrite the refund service while it is in there.",
                    options: [
                      {
                        label: "Take the display fix, refuse the rewrite, ask finance to "
                          + "confirm the rule",
                        next: "debrief",
                        feedback:
                          "You kept the change small, left the policy with the people who "
                            + "own it, and shipped something you could actually read.",
                        score: 2,
                      },
                      {
                        label: "Let it rewrite the refund service",
                        next: "rewrite",
                        feedback:
                          "A rounding question has just become an unreviewable "
                            + "nine-hundred-line diff, on a Friday, about money.",
                        score: -1,
                      },
                      {
                        label: "Round the amount stored in the database instead of the "
                          + "display",
                        next: "rewrite",
                        feedback:
                          "Stored rounding rewrites history: last January's refunds would "
                            + "no longer match the finance report.",
                        score: -2,
                      },
                    ],
                  },
                  rewrite: {
                    text:
                      "The rewrite touches six services. Nobody reviews it properly before "
                        + "Monday, and the refund totals for January no longer match the "
                        + "numbers finance already reported.",
                    options: [
                      {
                        label: "Roll it back and write the small change yourself",
                        next: "debrief",
                        feedback:
                          "Rolling back cost an hour of pride. Shipping it would have cost "
                            + "a week of reconciliation and a difficult conversation.",
                        score: 0,
                      },
                    ],
                  },
                  incident: {
                    text:
                      "The agent produces a clean, confident eight-hundred-word write-up. It "
                        + "is also wrong about the order of two events and invents a "
                        + "mitigation that nobody performed.",
                    options: [
                      {
                        label: "Rewrite it from your own notes",
                        next: "debrief",
                        feedback:
                          "The one asset you had that the agent did not: you were there. "
                            + "Expect a confident tone to hide invented detail — the two are "
                            + "not correlated.",
                        score: 0,
                      },
                    ],
                  },
                  debrief: {
                    text:
                      "The pattern across every branch: delegate the work you can verify "
                        + "mechanically, and keep the decisions whose consequences you would "
                        + "have to explain to another human being.",
                    options: [],
                  },
                },
              },
            },
          ],
        },
        {
          title: "Reflection",
          estimatedMinutes: 10,
          blocks: [
            {
              id: "blk_ai_l6_reflection",
              title: "Your own line",
              type: "reflection",
              payload: {
                prompt:
                  "Think about a task you worked on this month. Would you hand it to an "
                    + "agent tomorrow? Say what it was, whether you could check the answer "
                    + "cheaply, and where you would personally draw the line between "
                    + "delegating the work and delegating the judgement. Write at least 50 "
                    + "words — there is no single right answer, and the line is different "
                    + "for everyone.",
                minWords: 50,
              },
            },
          ],
        },
      ],
    },
  ],
};

const SOFT_SKILLS_COURSE: SeedCourse = {
  slug: SOFT_SKILLS_COURSE_SLUG,
  title: "Soft and Product Skills for Developers",
  description:
    "The other half of the job: asking a question that gets an answer, finding out "
    + "what users actually need, deciding what is worth building next, and giving a "
    + "teammate feedback they can act on. Short, practical, and deliberately free of "
    + "jargon. No prior experience needed.",
  topic: "Soft and Product Skills",
  audience: "All backgrounds",
  difficulty: "beginner",
  coverEmoji: "🧭",
  modules: [
    {
      title: "Communication",
      lessons: [
        {
          title: "Asking good questions",
          estimatedMinutes: 12,
          blocks: [
            {
              id: "blk_soft_l1_reading",
              title: "The question behind the question",
              type: "reading",
              payload: {
                markdown: [
                  "# \"How do I make the button blue?\"",
                  "",
                  "Somebody asks how to change a button's colour. Twenty minutes later it "
                    + "turns out they wanted the button to look disabled while a form is "
                    + "submitting — and the right answer is not a colour at all, it is a "
                    + "disabled state plus a spinner.",
                  "",
                  "This has a name: the **XY problem**. You are trying to do X, you decide Y "
                    + "will get you there, and then you ask how to do Y. The person helping "
                    + "you can only answer the question you asked.",
                  "",
                  "The cure is one extra sentence: *\"I'm trying to X.\"* It costs four "
                    + "words and it regularly saves twenty minutes.",
                  "",
                  "## What a good technical question contains",
                  "",
                  "1. **What you are trying to achieve**, in one sentence.",
                  "2. **What you tried**, specifically — not \"everything\".",
                  "3. **What you expected** to happen.",
                  "4. **What actually happened**, including the exact error text.",
                  "5. **The smallest version that still breaks.**",
                  "",
                  "That last one does most of the work. Shrinking a bug from \"the app is "
                    + "slow\" to \"this one query takes four seconds when the table has more "
                    + "than ten thousand rows\" often solves it before you finish typing. "
                    + "Making a minimal reproduction is not a chore you do for the person "
                    + "helping you — it is the debugging.",
                  "",
                  "## Where to ask",
                  "",
                  "- **A teammate who has context on your code** beats a search engine for "
                    + "anything specific to your project.",
                  "- **Search and documentation** beat a person for anything general — and "
                    + "they are available at 3 a.m.",
                  "- **A public forum** is right for general problems, and has the side "
                    + "benefit that the next person with your problem finds the answer.",
                  "",
                  "The mistake is using these in the wrong order: asking a person something "
                    + "a search would answer in ten seconds, or searching for an hour for "
                    + "something only your team knows.",
                  "",
                  "## Answering well",
                  "",
                  "- **Ask one clarifying question before solving.** \"Is this happening in "
                    + "production or only locally?\" is cheap and often changes the answer.",
                  "- **Explain, do not just fix.** Pasting a working snippet teaches "
                    + "nothing; one sentence about why it works teaches the pattern.",
                  "- **Say what you do not know.** \"I think this is a caching issue, but "
                    + "I have not checked\" is far more useful than a confident guess.",
                  "",
                  "## The uncomfortable bit",
                  "",
                  "Asking feels expensive because it exposes what you do not know. In "
                    + "practice, the opposite is true: the person who asks on day one ships "
                    + "on day two, and the person who stays quiet for a week explains on "
                    + "Friday why nothing works yet. Nobody is keeping score of your "
                    + "questions. They are only noticing the work.",
                ].join("\n"),
              },
            },
            {
              id: "blk_soft_l1_quiz",
              title: "Check your understanding",
              type: "quiz",
              payload: {
                passScore: 0.7,
                questions: [
                  {
                    id: "q_soft_l1_xy",
                    kind: "single",
                    prompt:
                      "Somebody asks how to change a button's colour when they really want "
                        + "it to look inactive during submission. What is this called?",
                    options: [
                      "The XY problem: asking about your attempted solution instead of your "
                        + "goal",
                      "Scope creep",
                      "A race condition",
                      "Rubber-duck debugging",
                    ],
                    answer: [0],
                    explanation:
                      "The XY problem. Adding one sentence — \"I'm trying to stop people "
                        + "double-submitting\" — changes the answer from a colour to a "
                        + "disabled state.",
                  },
                  {
                    id: "q_soft_l1_question",
                    kind: "multi",
                    prompt: "What belongs in a well-formed technical question?",
                    options: [
                      "What you expected to happen",
                      "The exact error text",
                      "The smallest version that still breaks",
                      "A list of every forum you have already searched",
                    ],
                    answer: [0, 1, 2],
                    explanation:
                      "Expectation, actual behaviour and a minimal reproduction are the "
                        + "three that change the answer. Long lists of places you looked "
                        + "rarely help.",
                  },
                  {
                    id: "q_soft_l1_repro",
                    kind: "truefalse",
                    prompt:
                      "Building a minimal reproduction is something you do mainly to save "
                        + "the helper's time.",
                    answer: [1],
                    explanation:
                      "False — it is usually the debugging itself. Shrinking the problem is "
                        + "very often the moment you find the cause.",
                  },
                ],
              },
            },
          ],
        },
        {
          title: "Understanding users",
          estimatedMinutes: 12,
          blocks: [
            {
              id: "blk_soft_l2_reading",
              title: "People describe solutions, not needs",
              type: "reading",
              payload: {
                markdown: [
                  "# \"I need a dropdown here\"",
                  "",
                  "Nobody has ever needed a dropdown. They needed to choose one option from "
                    + "a list of forty without scrolling, and a dropdown was the first "
                    + "solution they could picture. Build the dropdown and you have solved "
                    + "the sentence, not the problem — a searchable field might have been "
                    + "better, or a sensible default with an \"other\" option.",
                  "",
                  "This is the single most useful habit in this course: **when someone "
                    + "describes a feature, ask what they were doing when they needed it.**",
                  "",
                  "## Stated versus revealed",
                  "",
                  "What people say they do and what they actually do differ, and neither is "
                    + "a lie. People genuinely believe they check their dashboard every "
                    + "morning; the logs show they check it when something has already gone "
                    + "wrong. Both facts are useful — the first tells you what they value, "
                    + "the second tells you when they need you.",
                  "",
                  "## Three questions that work",
                  "",
                  "1. **\"Walk me through the last time this happened.\"** Specific memories "
                    + "beat general opinions, and they surface the parts people forgot to "
                    + "mention.",
                  "2. **\"What do you do instead, right now?\"** If the answer is a "
                    + "spreadsheet, a sticky note or a colleague's memory, you have found "
                    + "the real competition — and a very motivated user.",
                  "3. **\"What happens if this never gets built?\"** A shrug is information. "
                    + "It means the item is not urgent, however loudly it was requested.",
                  "",
                  "Ask \"why\" a second and third time, gently. The first answer is a "
                    + "feature request; the third answer is usually a need, and needs have "
                    + "more than one possible solution.",
                  "",
                  "## Personas, and their limits",
                  "",
                  "A short description of a typical user (\"Priya, a lab technician who "
                    + "uses this on a shared tablet between experiments\") is a genuinely "
                    + "useful shortcut: it stops twenty people imagining twenty different "
                    + "users. The danger is treating it as research. A persona you invented "
                    + "in a meeting is a hypothesis, and hypotheses need checking.",
                  "",
                  "## Where to find users without a research budget",
                  "",
                  "- **Support tickets** are the cheapest qualitative data you will ever "
                    + "get, and they are already written down.",
                  "- **The search box** on your own product tells you what people expected "
                    + "to find and could not.",
                  "- **Watching one person use it** — five minutes, no commentary, no "
                    + "helping — will teach you more than a survey of two hundred.",
                ].join("\n"),
              },
            },
            {
              id: "blk_soft_l2_flashcards",
              title: "User research vocabulary",
              type: "flashcards",
              payload: {
                cards: [
                  {
                    front: "Stated preference",
                    back: "What people say they want, in an interview or a survey. Useful for values, unreliable for behaviour.",
                  },
                  {
                    front: "Revealed preference",
                    back: "What people actually do, measured in logs or observed directly. Less flattering and more accurate.",
                  },
                  {
                    front: "Persona",
                    back: "A short, concrete description of one typical user. A shared hypothesis — not a substitute for talking to people.",
                  },
                  {
                    front: "Job to be done",
                    back: "The progress someone is trying to make, phrased without your product in it: \"get to the lab before the samples thaw\".",
                  },
                  {
                    front: "Edge case user",
                    back: "The person your happy path forgets: the shared tablet, the screen reader, the intermittent connection. Designing for them usually improves everything.",
                  },
                  {
                    front: "Usability test",
                    back: "Watching one real person attempt a real task, without helping. Five participants find most of the problems; five hundred rarely find more.",
                  },
                  {
                    front: "Feature request versus need",
                    back: "\"I need a dropdown\" is a request. \"I need to pick one of forty options quickly\" is the need. Always ask which one you were just given.",
                  },
                  {
                    front: "Workaround as evidence",
                    back: "The spreadsheet, the sticky note or the manual export someone built to cope. Strongest signal available that a need is real and unmet.",
                  },
                ],
              },
            },
          ],
        },
      ],
    },
    {
      title: "Product thinking",
      lessons: [
        {
          title: "Users and value",
          estimatedMinutes: 12,
          blocks: [
            {
              id: "blk_soft_l3_slides",
              title: "What \"value\" means when you are the one building it",
              type: "slides",
              payload: {
                autoPlay: false,
                slides: [
                  {
                    title: "Features are what you build. Value is what changes.",
                    bullets: [
                      "A feature ships when the code is deployed",
                      "Value only exists when somebody's day gets easier",
                      "The gap between the two is where most wasted work lives",
                    ],
                    narration:
                      "A feature ships when the code is deployed. Value only exists when "
                        + "somebody's day gets easier. The gap between those two is where "
                        + "most wasted work lives.",
                  },
                  {
                    title: "Name the change you are trying to make",
                    bullets: [
                      "Faster, cheaper, safer, less boring — pick one",
                      "If you cannot finish the sentence \"so that …\", the goal is unclear",
                      "\"Modernise the stack\" is not a change anyone can feel",
                    ],
                    narration:
                      "Slide two: name the change. Faster, cheaper, safer, less boring — "
                        + "pick one. If you cannot finish the sentence that starts with "
                        + "\"so that\", the goal is not clear yet.",
                  },
                  {
                    title: "Engineers optimise what they can measure",
                    bullets: [
                      "Bundle size is measurable; trust is not — so bundle size gets "
                        + "attention",
                      "Ask which number you are improving, and whether it moves anything "
                        + "anyone feels",
                      "A metric nobody outside the team understands will eventually be "
                        + "gamed",
                    ],
                    narration:
                      "Slide three: we optimise what we can measure. Bundle size is "
                        + "measurable and trust is not, so bundle size gets the attention. "
                        + "Always ask which number you are improving, and whether it moves "
                        + "anything a user can feel.",
                  },
                  {
                    title: "The cheapest experiment wins",
                    bullets: [
                      "Before building: can a fake version answer the question?",
                      "A landing page, a spreadsheet, or a button that says \"coming soon\"",
                      "Building the real thing is the most expensive way to test an idea",
                    ],
                    narration:
                      "Slide four: the cheapest experiment wins. Before you build, ask "
                        + "whether a fake version would answer the question. A landing page "
                        + "or a spreadsheet costs an afternoon; the real feature costs a "
                        + "month.",
                  },
                ],
              },
            },
            {
              id: "blk_soft_l3_quiz",
              title: "Check your understanding",
              type: "quiz",
              payload: {
                passScore: 0.7,
                questions: [
                  {
                    id: "q_soft_l3_value",
                    kind: "single",
                    prompt: "When does a feature create value?",
                    options: [
                      "When somebody's day genuinely gets easier because of it",
                      "When it is deployed to production",
                      "When it is written down in the roadmap",
                      "When the team finishes the acceptance criteria",
                    ],
                    answer: [0],
                    explanation:
                      "Deployment is a milestone for the team, not an outcome for a user. "
                        + "Value is the change somebody else experiences.",
                  },
                  {
                    id: "q_soft_l3_experiment",
                    kind: "multi",
                    prompt: "Which of these are cheap ways to test an idea before building it?",
                    options: [
                      "A landing page describing the feature, measuring sign-ups",
                      "Running the process manually by hand for two weeks",
                      "A button that explains the feature is not ready yet",
                      "Building the full version behind a feature flag",
                    ],
                    answer: [0, 1, 2],
                    explanation:
                      "All three answer the question \"does anybody want this?\" for the "
                        + "price of an afternoon. Building the full version is the "
                        + "expensive way to find out.",
                  },
                  {
                    id: "q_soft_l3_metric",
                    kind: "truefalse",
                    prompt:
                      "If a metric improves, the product is necessarily better for users.",
                    answer: [1],
                    explanation:
                      "False. It depends on whether the metric is connected to anything "
                        + "anybody feels. Teams reliably improve whatever number they watch, "
                        + "whether or not it matters.",
                  },
                ],
              },
            },
          ],
        },
        {
          title: "Prioritizing a backlog",
          estimatedMinutes: 10,
          blocks: [
            {
              id: "blk_soft_l4_game",
              title: "Put this backlog in order",
              type: "game",
              payload: {
                variant: "sort",
                items: [
                  {
                    text: "Search takes six seconds on the catalogue page",
                    order: 3,
                  },
                  {
                    text: "Rename \"Projects\" to \"Spaces\" in the top menu",
                    order: 5,
                  },
                  {
                    text: "Checkout fails on Safari — nobody can complete a payment",
                    order: 1,
                  },
                  {
                    text: "Regular users keep asking for a dark theme",
                    order: 4,
                  },
                  {
                    text: "Password reset emails are landing in spam",
                    order: 2,
                  },
                ],
              },
            },
          ],
        },
      ],
    },
    {
      title: "Working together",
      lessons: [
        {
          title: "Mock interview: give and receive feedback",
          estimatedMinutes: 14,
          blocks: [
            {
              id: "blk_soft_l5_roleplay",
              title: "Tell me about a time you gave hard feedback",
              type: "roleplay",
              payload: {
                scenario:
                  "A twenty-minute mock interview for a junior developer role. Morgan has "
                    + "just asked: \"Tell me about a time you gave a teammate feedback they "
                    + "did not want to hear.\" The interview continues from your answer, and "
                    + "you can ask for feedback on how you did before it ends.",
                persona:
                  "Morgan, a hiring manager who is friendly but keeps pressing for specifics, "
                    + "notices when an answer stays abstract, and never fills a silence for you",
                goal:
                  "Answer with one concrete situation — what you actually said and what "
                    + "changed — then ask for feedback on your answer and respond to it "
                    + "without getting defensive.",
                rubric: [
                  "Told one specific story (when, where, who) instead of a general philosophy",
                  "Quoted what they actually said, in words, rather than \"I gave feedback\"",
                  "Described the outcome, including how the teammate reacted",
                  "Asked for feedback on the answer and listened without justifying",
                  "Kept the answer to roughly two minutes and left room for a follow-up question",
                ],
              },
            },
          ],
        },
        {
          title: "Self-check",
          estimatedMinutes: 10,
          blocks: [
            {
              id: "blk_soft_l6_quiz",
              title: "Final check",
              type: "quiz",
              payload: {
                passScore: 0.7,
                questions: [
                  {
                    id: "q_soft_l6_feedback",
                    kind: "single",
                    prompt:
                      "What is the single most useful change to a code review that has "
                        + "eleven comments?",
                    options: [
                      "Rank them and lead with the one that must change before merging",
                      "Delete nine of them so the author is not overwhelmed",
                      "Move them all into a follow-up ticket",
                      "Add a summary comment explaining that they are all important",
                    ],
                    answer: [0],
                    explanation:
                      "Ranking turns a wall into a plan. Deleting them loses information; "
                        + "deferring all of them means none of them happen.",
                  },
                  {
                    id: "q_soft_l6_need",
                    kind: "multi",
                    prompt:
                      "Which of these help you find out what a user actually needs rather "
                        + "than what they asked for?",
                    options: [
                      "\"Walk me through the last time this happened\"",
                      "\"What do you do instead, right now?\"",
                      "\"What colour should the button be?\"",
                      "\"What happens if this never gets built?\"",
                    ],
                    answer: [0, 1, 3],
                    explanation:
                      "All three turn a feature request into a need. The colour question "
                        + "accepts the request exactly as framed.",
                  },
                  {
                    id: "q_soft_l6_ask",
                    kind: "truefalse",
                    prompt:
                      "Asking a teammate a question early is a sign that you are not ready "
                        + "for the work.",
                    answer: [1],
                    explanation:
                      "False. Asking early is the cheapest way to avoid a week of "
                        + "confidently wrong work, and nobody is keeping score.",
                  },
                  {
                    id: "q_soft_l6_priority",
                    kind: "short",
                    prompt:
                      "In one or two words: what should decide the order of a backlog?",
                    answer: "value, impact, risk, users, consequence, urgency",
                    explanation:
                      "Value and consequence — what changes, for whom, and what it costs "
                        + "to wait. Volume of requests is not a priority signal.",
                  },
                ],
              },
            },
            {
              id: "blk_soft_l6_reflection",
              title: "One thing to change next week",
              type: "reflection",
              payload: {
                prompt:
                  "Pick one habit from this course — asking the question behind the "
                    + "question, watching one real user, testing an idea cheaply, or "
                    + "ranking your review comments. Describe a specific situation in the "
                    + "coming week where you will use it, and what you expect to happen "
                    + "differently. Write at least 50 words.",
                minWords: 50,
              },
            },
          ],
        },
      ],
    },
  ],
};

export type SeededCourse = {
  slug: string;
  courseId: string;
  lessonCount: number;
};

/**
 * Creates one published course.
 *
 * Idempotent: an existing course with the same slug (including its modules,
 * lessons and any recorded progress) is deleted first, so re-running the seed
 * always leaves exactly one copy behind.
 */
async function seedOneCourse(
  prisma: PrismaClient,
  createdById: string,
  course: SeedCourse,
): Promise<SeededCourse> {
  const existing = await prisma.course.findUnique({
    where: { slug: course.slug },
    select: { id: true },
  });

  if (existing !== null) {
    // Cascades to modules, lessons, enrollments and lesson progress.
    await prisma.course.delete({ where: { id: existing.id } });
  }

  const row = await prisma.course.create({
    data: {
      slug: course.slug,
      title: course.title,
      description: course.description,
      topic: course.topic,
      audience: course.audience,
      difficulty: course.difficulty,
      coverEmoji: course.coverEmoji,
      source: CourseSource.SEED,
      status: CourseStatus.PUBLISHED,
      createdById,
    },
  });

  let lessonCount = 0;

  for (const [moduleIndex, seedModule] of course.modules.entries()) {
    const courseModule = await prisma.module.create({
      data: {
        courseId: row.id,
        title: seedModule.title,
        order: moduleIndex,
      },
    });

    for (const [lessonIndex, lesson] of seedModule.lessons.entries()) {
      const blocks = blockListSchema.parse(lesson.blocks) as unknown as
        Prisma.InputJsonValue;

      await prisma.lesson.create({
        data: {
          moduleId: courseModule.id,
          title: lesson.title,
          order: lessonIndex,
          estimatedMinutes: lesson.estimatedMinutes,
          blocks,
        },
      });

      lessonCount += 1;
    }
  }

  return { slug: course.slug, courseId: row.id, lessonCount };
}

/** Seeds both P3 courses and returns what it created. */
export async function seedPhase3Courses(
  prisma: PrismaClient,
  createdById: string,
): Promise<SeededCourse[]> {
  return [
    await seedOneCourse(prisma, createdById, AI_AGENTS_COURSE),
    await seedOneCourse(prisma, createdById, SOFT_SKILLS_COURSE),
  ];
}
