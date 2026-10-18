import { z } from "zod";

import { blockSchema } from "@/lib/blocks/schema";
import { mockText } from "@/lib/llm/mock";
import type { Audience, AuthoringDifficulty } from "@/lib/llm/prompts/outline";

/**
 * Per-lesson generation for the instructor wizard (P4.6).
 *
 * Step 3 turns one outline lesson into a complete `Block[]` payload. The reply
 * is validated twice: `blockSchema` guarantees every payload is renderable, and
 * the refinements below enforce the editorial rules the outline promised (at
 * least one expository block, at least three distinct block types, unique ids).
 * A rejection is fed back to the model as a retry hint by `generateJson`.
 *
 * `mockLesson` reads its own prompt back — the field names below are the
 * contract between the two — so mock mode still writes a lesson about the
 * requested title.
 */

/** Block types that teach content rather than test or practise it. */
const EXPOSITORY_TYPES = ["reading", "slides"] as const;

/** Minimum number of distinct block types in a generated lesson. */
const MIN_DISTINCT_TYPES = 3;

/** One generated lesson: what it is called, how long it takes, what is in it. */
export const generatedLessonSchema = z
  .object({
    title: z.string().min(2).max(120),
    estimatedMinutes: z.number().int().min(3).max(45),
    blocks: z.array(blockSchema).min(3).max(6),
  })
  .superRefine((lesson, ctx) => {
    const ids = lesson.blocks.map((block) => block.id);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({
        code: "custom",
        message: "Block ids must be unique within a lesson.",
        path: ["blocks"],
      });
    }

    const types = new Set(lesson.blocks.map((block) => block.type));

    if (types.size < MIN_DISTINCT_TYPES) {
      ctx.addIssue({
        code: "custom",
        message: `Use at least ${MIN_DISTINCT_TYPES} different block types in a lesson.`,
        path: ["blocks"],
      });
    }

    if (!EXPOSITORY_TYPES.some((type) => types.has(type))) {
      ctx.addIssue({
        code: "custom",
        message: "Every lesson needs a reading or a slides block to teach the content.",
        path: ["blocks"],
      });
    }
  });

export type GeneratedLesson = z.infer<typeof generatedLessonSchema>;

/** Everything the lesson writer needs to know about the course and the lesson. */
export type LessonRequest = {
  courseTitle: string;
  courseDescription: string;
  topic: string;
  audience: Audience;
  difficulty: AuthoringDifficulty;
  notes: string;
  moduleTitle: string;
  lessonTitle: string;
  lessonSummary: string;
  suggestedBlocks: readonly string[];
  /** 1-based position of the lesson in the whole course. */
  lessonNumber: number;
  lessonCount: number;
};

/** Compact reference for every renderable block. One line each, wrapped by hand. */
const BLOCK_REFERENCE: readonly string[] = [
  'reading: {"id": string, "title": string, "type": "reading",',
  '          "payload": {"markdown": string}}',
  'slides:  {"id": string, "title": string, "type": "slides",',
  '          "payload": {"autoPlay": boolean, "slides": [{"title": string,',
  '                      "bullets": string[], "narration": string}]}}',
  'quiz:    {"id": string, "title": string, "type": "quiz",',
  '          "payload": {"passScore": 0.7, "questions": [{"id": string,',
  '                      "kind": "single", "prompt": string,',
  '                      "options": [string, string, string, string],',
  '                      "answer": [number], "explanation": string}]}}',
  'flashcards: {"id": string, "title": string, "type": "flashcards",',
  '             "payload": {"cards": [{"front": string, "back": string}]}}',
  'reflection: {"id": string, "title": string, "type": "reflection",',
  '             "payload": {"prompt": string, "minWords": number}}',
  'coding:  {"id": string, "title": string, "type": "coding",',
  '          "payload": {"problem": string, "starter": string,',
  '                      "tests": [{"name": string, "expression": string}],',
  '                      "hints": [string]}}',
  'game match: {"id": string, "title": string, "type": "game",',
  '             "payload": {"variant": "match",',
  '                         "pairs": [{"left": string, "right": string}]}}',
  'game sort:  {"id": string, "title": string, "type": "game",',
  '             "payload": {"variant": "sort",',
  '                         "items": [{"text": string, "order": number}]}}',
  'simulation: {"id": string, "title": string, "type": "simulation",',
  '             "payload": {"intro": string, "start": string, "end": string,',
  '                         "nodes": {"<node id>": {"text": string,',
  '                           "options": [{"label": string, "next": string,',
  '                           "feedback": string, "score": number}]}}}}',
  'roleplay: {"id": string, "title": string, "type": "roleplay",',
  '           "payload": {"scenario": string, "persona": string,',
  '                       "goal": string, "rubric": [string]}}',
];

/**
 * Prompt for one lesson.
 *
 * The block reference is deliberately complete: the reply is parsed straight
 * into `generatedLessonSchema`, so a payload shape the model invents would cost
 * an attempt. `suggestedBlocks` is the outline's plan, not a hard constraint —
 * the writer may swap one activity for another that fits the material better,
 * as long as the editorial rules hold.
 */
export function lessonPrompt(request: LessonRequest): string {
  const notes =
    request.notes.trim().length === 0 ? "None." : request.notes.trim();

  return [
    "You write one lesson of an interactive mini-course as structured JSON.",
    "The lesson must be usable exactly as written: no placeholders, no",
    "\"see the textbook\", no missing answers.",
    "",
    `Course: ${request.courseTitle}`,
    `Course description: ${request.courseDescription}`,
    `Topic: ${request.topic}`,
    `Audience: ${request.audience}`,
    `Difficulty: ${request.difficulty}`,
    `Module: ${request.moduleTitle}`,
    `Lesson number: ${request.lessonNumber} of ${request.lessonCount}`,
    `Lesson title: ${request.lessonTitle}`,
    `Lesson summary: ${request.lessonSummary}`,
    `Suggested blocks: ${request.suggestedBlocks.join(", ")}`,
    "Author's notes:",
    notes,
    "",
    "Rules:",
    "- Reply with one lesson only, matching the lesson title and summary above.",
    "- Three to six blocks, ordered as the learner experiences them. Start with",
    "  a reading or slides block; finish with a quiz or reflection when the",
    "  suggested blocks allow it.",
    "- Use at least three different block types. Only use block types that",
    "  appear in Suggested blocks, unless one of them cannot carry the content.",
    "- Block ids look like \"blk_l2_reading\" and \"blk_l2_quiz\"; question ids",
    "  look like \"q_l2_1\". Every id is unique within the lesson.",
    "- Reading: 250 to 400 words of markdown, one \"# \" heading, short",
    "  paragraphs, one concrete example, no images, no code fences.",
    "- Quiz: passScore 0.7 and three single-choice questions, each with four",
    "  options, `answer` as an array holding one zero-based index, and a",
    "  one-sentence explanation.",
    "- Flashcards: six to eight cards. Game: five pairs (match) or five items",
    "  with distinct orders 1-5 (sort). Slides: four to six pages, each with a",
    "  plain-text narration of 40 to 80 words.",
    "- Coding: `starter` is runnable JavaScript that declares the function the",
    "  learner must fix; every test `expression` is a boolean expression",
    "  evaluated after the code runs, for example reverse(\"abc\") === \"cba\".",
    "- Simulation: `start` and `end` must be keys of `nodes`; every node except",
    "  `end` needs at least one option; `score` is a whole number and may be",
    "  negative.",
    "- Roleplay: a scenario, the persona the AI plays, the learner's goal and a",
    "  rubric of three or four criteria.",
    "- Write in English, use no emoji, and do not wrap the reply in code fences.",
    "",
    "Reply with one JSON object of this exact shape:",
    '{"title": string, "estimatedMinutes": number, "blocks": Block[]}',
    "",
    "Block shapes:",
    ...BLOCK_REFERENCE,
  ].join("\n");
}

/** Reads a `Name: value` line back out of a generated prompt. */
function readField(prompt: string, name: string): string | null {
  const match = new RegExp(`^${name}: (.*)$`, "m").exec(prompt);
  return match?.[1]?.trim() ?? null;
}

/** The 1-based lesson number embedded in the prompt, or 1 when unreadable. */
function readLessonNumber(prompt: string): number {
  const raw = readField(prompt, "Lesson number");
  const match = raw === null ? null : /^(\d+)\b/.exec(raw);
  const parsed = match === null ? Number.NaN : Number.parseInt(match[1], 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

/**
 * Splits a lesson title into the slug used for block ids.
 * `"Your first commit"` → `"your-first-commit"`.
 */
function idSlug(title: string): string {
  const slug = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 24);

  return slug.length > 0 ? slug : "lesson";
}

/**
 * Canned lesson used when no API key is configured.
 *
 * The three titles below match `mockCourseOutline`, so the default wizard run
 * produces a complete, genuinely readable course. A lesson whose title was
 * edited in step 2 falls back to a short placeholder built from its own title
 * and summary — still valid content, still marked `[MOCK]`.
 */
export function mockLesson(prompt: string): unknown {
  const title = readField(prompt, "Lesson title") ?? "Untitled lesson";
  const summary = readField(prompt, "Lesson summary") ?? "";
  const index = readLessonNumber(prompt);
  const id = `l${index}`;

  if (title === "Why version control exists" && index === 1) {
    return mockVersionControlLesson(index);
  }
  if (title === "Your first commit" && index === 2) {
    return mockFirstCommitLesson(index);
  }
  if (title === "Branches without fear" && index === 3) {
    return mockBranchLesson(index);
  }

  return mockPlaceholderLesson({ title, summary, id });
}

/** `[MOCK]` prefix for the prose blocks of the fixed demo lessons. */
function mockReading(markdown: string): string {
  return mockText(markdown);
}

function mockVersionControlLesson(index: number): GeneratedLesson {
  const id = `l${index}`;

  return {
    title: "Why version control exists",
    estimatedMinutes: 9,
    blocks: [
      {
        id: `blk_${id}_reading`,
        title: "A project needs a memory",
        type: "reading",
        payload: {
          markdown: mockReading(
            [
              "# A project needs a memory",
              "",
              "Picture a folder called `report`. Inside it: `report.doc`, "
                + "`report-final.doc`, `report-final-v2.doc` and "
                + "`report-final-v2-USE-THIS.doc`. Nobody knows which one is "
                + "current, nobody remembers what changed between them, and the "
                + "only person who does is on holiday.",
              "",
              "That folder is what a project looks like without version "
                + "control. The files are not the problem — the missing history "
                + "is. Git exists to record that history so a team never has to "
                + "reconstruct it from filenames.",
              "",
              "## What a repository records",
              "",
              "A Git repository is a folder plus a hidden `.git` directory. That "
                + "directory stores every version of every tracked file, who "
                + "changed it, when, and the message they wrote about why. The "
                + "working files stay ordinary files; the history lives beside "
                + "them.",
              "",
              "## A commit is a snapshot, not a diff",
              "",
                "It helps to think of a commit as a photograph of the whole "
                + "project at one moment, with a label attached. Git stores it "
                + "efficiently — unchanged files are shared with the previous "
                + "photo — but the mental model is a snapshot. That is why you "
                + "can jump back to any commit and see the project exactly as it "
                + "was.",
              "",
              "## A concrete example",
              "",
              "You rename a function across twelve files. Two weeks later a bug "
                + "appears. With a history you can ask \"what touched this "
                + "function?\", read the commit that renamed it, and see the "
                + "reason in its message. Without one you read twelve files and "
                + "guess.",
              "",
              "## Why teams need this",
              "",
              "Two people editing one file is not a storage problem, it is a "
                + "coordination problem. Git lets each person work on their own "
                + "copy and then merge the results, and it tells you precisely "
                + "where two edits collided instead of silently keeping the last "
                + "save. The next lesson builds your first commit.",
            ].join("\n"),
          ),
        },
      },
      {
        id: `blk_${id}_slides`,
        title: "Four ideas behind every repository",
        type: "slides",
        payload: {
          autoPlay: false,
          slides: [
            {
              title: "Files are not the problem",
              bullets: [
                "Versions hide in filenames",
                "Nobody remembers what changed",
                "The history is what is missing",
              ],
              narration:
                "Most teams already keep every version of a document. The trouble is that the versions live in file names, so the reason behind each change is lost. Version control moves that knowledge into a structure the whole team can read.",
            },
            {
              title: "The repository holds the history",
              bullets: [
                "A folder plus a hidden .git directory",
                "Every tracked version is stored",
                "Working files stay ordinary files",
              ],
              narration:
                "A repository is simply a project folder with a .git directory beside it. The working files remain files you can open in any editor; the history, the authors and the commit messages live in the hidden directory and travel with the folder.",
            },
            {
              title: "A commit is a snapshot",
              bullets: [
                "A photograph of the whole project",
                "Stored efficiently, shared with its parent",
                "Carries a message and an author",
              ],
              narration:
                "Each commit captures the project at one moment. Git stores it cheaply by sharing unchanged files with the previous commit, but the useful mental model is a snapshot you can return to. The message attached to it is the part humans read later.",
            },
            {
              title: "History answers questions",
              bullets: [
                "What touched this function?",
                "Why was this changed?",
                "Who reviewed it?",
              ],
              narration:
                "Once history exists, debugging changes shape. Instead of guessing across files, you ask which commit touched the code and read the reason its author wrote. That is the habit the rest of the course builds on.",
            },
          ],
        },
      },
      {
        id: `blk_${id}_quiz`,
        title: "Check your understanding",
        type: "quiz",
        payload: {
          passScore: 0.7,
          questions: [
            {
              id: `q_${id}_1`,
              kind: "single",
              prompt: "What is the main problem with keeping versions as files?",
              options: [
                "The history and the reason for each change are lost",
                "Files take too much disk space",
                "Only one person can open them",
                "They cannot be renamed",
              ],
              answer: [0],
              explanation:
                "Copies preserve content but not the reasoning, so the team loses the record of what changed and why.",
            },
            {
              id: `q_${id}_2`,
              kind: "single",
              prompt: "Where does a Git repository keep its history?",
              options: [
                "In a hidden .git directory inside the project",
                "In a database on the Git website",
                "In each file's header",
                "In a separate folder on the desktop",
              ],
              answer: [0],
              explanation:
                "The .git directory sits beside the working files and holds every recorded version.",
            },
            {
              id: `q_${id}_3`,
              kind: "single",
              prompt: "Why is a commit described as a snapshot?",
              options: [
                "It captures the state of the whole project at one moment",
                "It stores only the lines that changed",
                "It deletes the previous version",
                "It copies the project to a server",
              ],
              answer: [0],
              explanation:
                "The snapshot model explains why you can return to any commit and see the project exactly as it was.",
            },
          ],
        },
      },
    ],
  };
}

function mockFirstCommitLesson(index: number): GeneratedLesson {
  const id = `l${index}`;

  return {
    title: "Your first commit",
    estimatedMinutes: 10,
    blocks: [
      {
        id: `blk_${id}_reading`,
        title: "Three places a change can live",
        type: "reading",
        payload: {
          markdown: mockReading(
            [
              "# Three places a change can live",
              "",
              "Before you type a command, it helps to know where Git thinks your "
                + "work is. A change passes through three places, and each one "
                + "has a command that moves it along.",
              "",
              "## The working tree",
              "",
              "The working tree is the folder you edit. A file you have changed "
                + "is modified here and nowhere else — Git has noticed, but it has "
                + "not recorded anything yet. `git status` is the command that "
                + "tells you what is in this state.",
              "",
              "## The staging area",
              "",
              "The staging area is the list of changes that will go into the next "
                + "commit. `git add notes.md` moves a change into it. Staging "
                + "exists so that a messy afternoon of edits can be split into two "
                + "clear commits: one for the fix, one for the refactor.",
              "",
              "## The repository",
              "",
              "`git commit -m \"Add the first chapter\"` writes everything that is "
                + "staged into the repository as one new snapshot. Only staged "
                + "changes are included, which is why the same command can produce "
                + "very different results depending on what you added.",
              "",
              "## A concrete example",
              "",
              "You fix a typo in `intro.md` and start drafting `chapter-2.md`. Run "
                + "`git add intro.md`, commit with the message \"Fix typo in "
                + "intro\", then `git add chapter-2.md` and commit separately. Two "
                + "readable entries instead of one confusing one.",
              "",
              "## Reading the history back",
              "",
              "`git log --oneline` prints one line per commit: a short identifier, "
                + "the message, and nothing else. That list is the memory you built. "
                + "If a commit looks wrong, you can inspect it before deciding what "
                + "to do — but you never lose the previous state.",
            ].join("\n"),
          ),
        },
      },
      {
        id: `blk_${id}_cards`,
        title: "The vocabulary of a commit",
        type: "flashcards",
        payload: {
          cards: [
            {
              front: "Working tree",
              back: "The folder you edit. Changes here are noticed by Git but not yet recorded.",
            },
            {
              front: "Staging area",
              back: "The list of changes that will go into the next commit, filled by git add.",
            },
            {
              front: "Commit",
              back: "A recorded snapshot of the project, with an author, a time and a message.",
            },
            {
              front: "Commit message",
              back: "The line explaining why the change exists. Future readers rely on it more than on the code.",
            },
            {
              front: "git add",
              back: "Moves a change from the working tree into the staging area.",
            },
            {
              front: "git status",
              back: "Shows what is modified, what is staged and what Git is not tracking.",
            },
          ],
        },
      },
      {
        id: `blk_${id}_quiz`,
        title: "Check your understanding",
        type: "quiz",
        payload: {
          passScore: 0.7,
          questions: [
            {
              id: `q_${id}_1`,
              kind: "single",
              prompt: "What does `git add` actually do?",
              options: [
                "Stages a change for the next commit",
                "Saves a commit immediately",
                "Uploads the file to a server",
                "Deletes untracked files",
              ],
              answer: [0],
              explanation:
                "Adding fills the staging area; nothing is recorded until you commit.",
            },
            {
              id: `q_${id}_2`,
              kind: "single",
              prompt: "Which changes does a commit include?",
              options: [
                "Only the changes that were staged",
                "Every change in the folder",
                "Only new files",
                "Only deleted files",
              ],
              answer: [0],
              explanation:
                "The staging area is exactly the set of changes the commit will contain.",
            },
            {
              id: `q_${id}_3`,
              kind: "single",
              prompt: "Why split a messy afternoon into two commits?",
              options: [
                "Each commit then has one clear reason",
                "It makes the repository smaller",
                "Git refuses commits above a size limit",
                "It removes the need for messages",
              ],
              answer: [0],
              explanation:
                "Small commits with one reason are easier to review, revert and understand later.",
            },
          ],
        },
      },
    ],
  };
}

function mockBranchLesson(index: number): GeneratedLesson {
  const id = `l${index}`;

  return {
    title: "Branches without fear",
    estimatedMinutes: 9,
    blocks: [
      {
        id: `blk_${id}_reading`,
        title: "A branch is just a pointer",
        type: "reading",
        payload: {
          markdown: mockReading(
            [
              "# A branch is just a pointer",
              "",
              "Branches sound like a copy of the project. They are much smaller "
                + "than that: a branch is a movable pointer to a commit. Creating "
                + "one costs almost nothing, which is why Git expects you to make "
                + "them freely.",
              "",
              "## Creating and switching",
              "",
              "`git switch -c feature/login` creates the branch and moves you onto "
                + "it in one step. New commits advance the branch pointer; the "
                + "branch you came from keeps pointing at the commit where you left "
                + "it. Nothing was copied and nothing was lost.",
              "",
              "## Merging back",
              "",
              "When the work is ready, switch to `main` and run `git merge "
                + "feature/login`. If `main` has not moved since you branched, Git "
                + "simply slides the pointer forward — a fast-forward. If both "
                + "branches gained commits, Git builds a merge commit with two "
                + "parents.",
              "",
              "## What a conflict really is",
              "",
              "A conflict is not a mistake. It means two commits changed the same "
                + "lines of the same file, and Git will not guess which version you "
                + "meant. It marks the region in the file and waits. You keep the "
                + "text you want, delete the markers, stage the file and finish the "
                + "merge.",
              "",
              "## A concrete example",
              "",
              "Two people rename the same heading in `intro.md`. Whoever merges "
                + "second sees a conflict in that one heading, decides which wording "
                + "survives, and commits the resolution. The rest of both branches "
                + "merges automatically.",
              "",
              "## The habit to build",
              "",
              "Branch for anything that takes more than a few minutes: a fix, an "
                + "experiment, a feature. `main` stays working, and abandoning an "
                + "experiment costs one command instead of an afternoon of undo.",
            ].join("\n"),
          ),
        },
      },
      {
        id: `blk_${id}_match`,
        title: "Match each term to its meaning",
        type: "game",
        payload: {
          variant: "match",
          pairs: [
            { left: "Branch", right: "A movable pointer to a commit" },
            { left: "main", right: "The branch that stays deployable" },
            { left: "Merge", right: "Joining another branch's commits into yours" },
            { left: "Fast-forward", right: "Moving a pointer with no merge commit" },
            { left: "Conflict", right: "Two commits changed the same lines" },
          ],
        },
      },
      {
        id: `blk_${id}_quiz`,
        title: "Check your understanding",
        type: "quiz",
        payload: {
          passScore: 0.7,
          questions: [
            {
              id: `q_${id}_1`,
              kind: "single",
              prompt: "What is a branch, technically?",
              options: [
                "A pointer to a commit",
                "A full copy of the project folder",
                "A backup on a remote server",
                "A tag that never moves",
              ],
              answer: [0],
              explanation:
                "Branches are cheap because they are references, not copies of the files.",
            },
            {
              id: `q_${id}_2`,
              kind: "single",
              prompt: "When does a merge produce a conflict?",
              options: [
                "When both branches changed the same lines",
                "Whenever two branches are merged",
                "Only when a file was deleted",
                "When the branch names differ",
              ],
              answer: [0],
              explanation:
                "Git merges non-overlapping work automatically and asks a human only where the edits overlap.",
            },
            {
              id: `q_${id}_3`,
              kind: "single",
              prompt: "What happens during a fast-forward merge?",
              options: [
                "The branch pointer moves forward with no merge commit",
                "Git creates an empty commit",
                "The feature branch is deleted automatically",
                "All conflicts are resolved automatically",
              ],
              answer: [0],
              explanation:
                "If the target has not moved, the pointer can simply advance to the new commit.",
            },
          ],
        },
      },
    ],
  };
}

/**
 * Lesson used when the outline was edited in step 2.
 *
 * The fixed demo lessons no longer match the title, so this builds a short
 * placeholder from the lesson's own title and summary. It is honest about being
 * canned and still exercises every block component in the preview.
 */
function mockPlaceholderLesson(input: {
  title: string;
  summary: string;
  id: string;
}): GeneratedLesson {
  const { title, summary, id } = input;
  const slug = idSlug(title);
  const summaryLine =
    summary.length === 0
      ? "This lesson was added by hand, so it has no summary yet."
      : summary;

  return {
    title,
    estimatedMinutes: 8,
    blocks: [
      {
        id: `blk_${id}_${slug}_reading`,
        title: `About ${title}`,
        type: "reading",
        payload: {
          markdown: mockReading(
            [
              `# ${title}`,
              "",
              summaryLine,
              "",
              "## How to use this lesson",
              "",
              "Read the summary above and write down what you expect to be able "
                + "to do at the end. Then work through the cards and the "
                + "reflection: they are short on purpose, so you can finish in a "
                + "few minutes and notice what is still unclear.",
              "",
              "## A concrete example",
              "",
              `Take one small situation where ${title.toLowerCase()} matters, `
                + "describe what you would do first, and compare that with the "
                + "summary. Where the two disagree, that gap is what to ask the "
                + "tutor about.",
              "",
              "## What to remember",
              "",
              "- The goal of this lesson is the outcome named in the summary.",
              "- A worked example beats a definition when you revise.",
              "- If you cannot explain it in two sentences, re-read the cards.",
            ].join("\n"),
          ),
        },
      },
      {
        id: `blk_${id}_${slug}_cards`,
        title: "Lesson at a glance",
        type: "flashcards",
        payload: {
          cards: [
            { front: "Lesson focus", back: title },
            { front: "Why it matters", back: summaryLine },
            {
              front: "First step",
              back: "Write down what you already know about the focus, then check it against the summary.",
            },
            {
              front: "Revision trick",
              back: "Explain the focus out loud in two sentences, without looking at the notes.",
            },
            {
              front: "When you are done",
              back: "Finish the reflection so the next lesson can build on it.",
            },
          ],
        },
      },
      {
        id: `blk_${id}_${slug}_reflection`,
        title: "Put it in your own words",
        type: "reflection",
        payload: {
          prompt: `In two or three sentences, explain ${title} to somebody who has never studied it.`,
          minWords: 25,
        },
      },
    ],
  };
}
