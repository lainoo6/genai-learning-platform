import { z } from "zod";

import { blockSchema } from "@/lib/blocks/schema";
import {
  CONTENT_LANGUAGE_LABEL,
  contentLanguageLine,
  readContentLanguage,
  type ContentLanguage,
} from "@/lib/llm/language";
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
  /** Language of the generated content; defaults to English. */
  language?: ContentLanguage;
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
  const language = request.language ?? "en";

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
    contentLanguageLine(language),
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
    `- Write every learner-visible string in ${CONTENT_LANGUAGE_LABEL[language]}, use no emoji, and do not wrap the reply in code fences.`,
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

  if (readContentLanguage(prompt) === "zh") {
    return mockChineseLesson({ title, summary, index, id });
  }

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

/**
 * Chinese demo lessons used when the interface language is Chinese.
 *
 * Same course as the English demo (three Git lessons), written from scratch
 * rather than translated line by line, so the prose reads naturally. A lesson
 * whose title was edited in step 2 falls back to a Chinese placeholder built
 * from its own title and summary.
 */
function mockChineseLesson(input: {
  title: string;
  summary: string;
  index: number;
  id: string;
}): GeneratedLesson {
  const { title, summary, index, id } = input;

  if (index === 1) {
    return mockChineseVersionControlLesson(id);
  }
  if (index === 2) {
    return mockChineseFirstCommitLesson(id);
  }
  if (index === 3) {
    return mockChineseBranchLesson(id);
  }

  return mockChinesePlaceholderLesson({ title, summary, id });
}

function mockChineseVersionControlLesson(indexId: string): GeneratedLesson {
  return {
    title: "为什么需要版本控制",
    estimatedMinutes: 9,
    blocks: [
      {
        id: `blk_${indexId}_reading`,
        title: "项目需要一份记忆",
        type: "reading",
        payload: {
          markdown: mockReading(
            [
              "# 一份比个人电脑还年轻的历史",
              "",
              "想象一个叫「结课报告」的文件夹，里面躺着 `报告.doc`、`报告-最终版.doc`、"
                + "`报告-最终版-v2.doc`，以及 `报告-最终版-v2-用这个.doc`。没有人确定哪一份是"
                + "最新的，没有人记得它们之间改了什么，唯一记得的人正在休假。",
              "",
              "这就是没有版本控制的项目的样子。问题不在文件本身，而在于缺失的历史。"
                + "Git 存在的意义，就是把这段历史记录下来，让团队不必再从文件名里做考古。",
              "",
              "## 一个仓库记录了什么",
              "",
              "Git 仓库就是一个普通文件夹，旁边多了一个隐藏的 `.git` 目录。这个目录保存每个"
                + "被跟踪文件的每一个版本、谁改的、什么时候改的，以及他写下的原因。工作文件仍然是"
                + "普通文件，历史就放在它们旁边。",
              "",
              "## 提交是一张快照，不是一份差异",
              "",
              "把提交想成给整个项目拍一张照片，再贴上一张标签，会容易得多。Git 存得很省空间"
                + "——没有变化的文件与上一张照片共用——但心智模型就是快照。正因如此，你才能"
                + "跳回任何一个提交，看到项目当时的样子。",
              "",
              "## 一个具体的例子",
              "",
              "你花了一个下午，把十二个文件里的一个函数改了名字。两周后出现了一个缺陷。"
                + "有历史记录时，你可以问「谁动过这个函数」，读到那次重命名的提交，从提交信息里"
                + "看到原因。没有历史记录时，你只能打开十二个文件去猜。",
              "",
              "## 为什么团队离不开它",
              "",
              "两个人同时改一个文件，不是存储问题，而是协作问题。Git 让每个人先在自己的副本上"
                + "工作，再把结果合并；它还会明确告诉你两处修改在哪里撞车，而不是悄悄保留最后"
                + "保存的那一份。下一课我们来做第一次提交。",
            ].join("\n"),
          ),
        },
      },
      {
        id: `blk_${indexId}_slides`,
        title: "每个仓库背后的四个想法",
        type: "slides",
        payload: {
          autoPlay: false,
          slides: [
            {
              title: "问题不在文件",
              bullets: ["版本藏在文件名里", "没人记得改了什么", "缺的是历史"],
              narration:
                "大多数团队其实都留着文件的每一个版本，麻烦在于版本藏在文件名里，每次改动背后的原因就丢了。版本控制把这份知识搬进一个全团队都能读懂的结构里。",
            },
            {
              title: "仓库负责保存历史",
              bullets: ["一个文件夹加一个隐藏的 .git 目录", "每个被跟踪的版本都被保存", "工作文件仍然是普通文件"],
              narration:
                "仓库就是项目文件夹旁边多了一个 .git 目录。工作文件仍然可以用任何编辑器打开，而历史、作者和提交信息都存在那个隐藏目录里，跟着文件夹一起走。",
            },
            {
              title: "提交是一张快照",
              bullets: ["给整个项目拍一张照片", "存得省，并与上一张共享", "带着信息与作者"],
              narration:
                "每次提交都记录下项目在某一刻的样子。Git 通过与上一个提交共享未变化的文件来省空间，但真正有用的心智模型是「可以回去的快照」。贴在上面的提交信息，是后来的人真正会读的部分。",
            },
            {
              title: "历史会回答问题",
              bullets: ["谁动过这个函数", "为什么改这里", "谁审阅过"],
              narration:
                "有了历史，调试的方式就变了。你不必在文件之间猜，而是直接问哪次提交动过这段代码，再读作者写下的原因。这正是接下来整门课要养成的习惯。",
            },
          ],
        },
      },
      {
        id: `blk_${indexId}_quiz`,
        title: "检查一下理解",
        type: "quiz",
        payload: {
          passScore: 0.7,
          questions: [
            {
              id: `q_${indexId}_1`,
              kind: "single",
              prompt: "把版本保存成一个个文件，最大的问题是什么？",
              options: [
                "历史以及每次改动的原因都丢了",
                "文件太占磁盘空间",
                "只有一个人能打开它们",
                "它们无法重命名",
              ],
              answer: [0],
              explanation:
                "副本留住了内容，却留不住理由，团队因此失去了「改了什么、为什么改」的记录。",
            },
            {
              id: `q_${indexId}_2`,
              kind: "single",
              prompt: "Git 仓库把历史保存在哪里？",
              options: [
                "项目里的隐藏 .git 目录",
                "Git 网站上的数据库",
                "每个文件的开头",
                "桌面上的另一个文件夹",
              ],
              answer: [0],
              explanation:
                ".git 目录就在工作文件旁边，保存着每一个被记录的版本。",
            },
            {
              id: `q_${indexId}_3`,
              kind: "single",
              prompt: "为什么说提交是一张快照？",
              options: [
                "它记录下整个项目在某一刻的状态",
                "它只保存发生变化的那几行",
                "它会删除上一个版本",
                "它把项目复制到服务器上",
              ],
              answer: [0],
              explanation:
                "「快照」这个模型解释了为什么你能回到任意一个提交，看到项目当时完整的样子。",
            },
          ],
        },
      },
    ],
  };
}

function mockChineseFirstCommitLesson(indexId: string): GeneratedLesson {
  return {
    title: "完成你的第一次提交",
    estimatedMinutes: 10,
    blocks: [
      {
        id: `blk_${indexId}_reading`,
        title: "一次改动可能待着的三个地方",
        type: "reading",
        payload: {
          markdown: mockReading(
            [
              "# 一次改动可能待着的三个地方",
              "",
              "在敲命令之前，先弄清楚 Git 认为你的工作在哪里，会省下很多困惑。一次改动会"
                + "经过三个地方，每一步都有一个命令把它往前推。",
              "",
              "## 工作区",
              "",
              "工作区就是你正在编辑的文件夹。被修改的文件首先出现在这里，暂时还没有别的地方。"
                + "`git status` 用来看有哪些文件处于这个状态。",
              "",
              "## 暂存区",
              "",
              "暂存区是「下一次提交要包含哪些改动」的清单。`git add 笔记.md` 把一处改动放进去。"
                + "它存在的意义是：一个下午的零散修改，可以被拆成两次清楚的提交——一次修问题，"
                + "一次做重构。",
              "",
              "## 仓库",
              "",
              "`git commit -m \"加上第一章\"` 会把暂存区里的内容写成一张新的快照。只有被暂存的"
                + "改动才会进入这次提交，所以同一条命令，加上不同的 `git add`，结果会完全不同。",
              "",
              "## 一个具体的例子",
              "",
              "你修好了 `引言.md` 里的一个错别字，又开始起草 `第二章.md`。先 `git add 引言.md`，"
                + "提交信息写「修正引言错别字」；然后再 `git add 第二章.md`，单独提交一次。两条"
                + "读得懂的记录，而不是一条含混的记录。",
              "",
              "## 把历史读回来",
              "",
              "`git log --oneline` 每个提交打印一行：一个短标识、一句信息，仅此而已。那份列表"
                + "就是你攒下来的记忆。如果某个提交看着不对，你可以先去查看它，再决定怎么办——"
                + "但之前的状态永远不会丢。",
            ].join("\n"),
          ),
        },
      },
      {
        id: `blk_${indexId}_cards`,
        title: "一次提交的词汇表",
        type: "flashcards",
        payload: {
          cards: [
            { front: "工作区", back: "你正在编辑的文件夹。这里的改动能被 Git 看到，但还没有被记录。" },
            { front: "暂存区", back: "下一次提交要包含的改动清单，用 git add 填充。" },
            { front: "提交", back: "项目在某一刻被记录下来的快照，带着作者、时间和一条信息。" },
            { front: "提交信息", back: "解释这次改动为什么存在的那句话。后来的读者更依赖它，而不是代码本身。" },
            { front: "git add", back: "把改动从工作区放进暂存区。" },
            { front: "git status", back: "显示哪些文件被修改、哪些已暂存、哪些还没有被跟踪。" },
          ],
        },
      },
      {
        id: `blk_${indexId}_quiz`,
        title: "检查一下理解",
        type: "quiz",
        payload: {
          passScore: 0.7,
          questions: [
            {
              id: `q_${indexId}_1`,
              kind: "single",
              prompt: "`git add` 到底做了什么？",
              options: [
                "把一处改动放进暂存区，等待下一次提交",
                "立刻生成一条提交",
                "把文件上传到服务器",
                "删除未被跟踪的文件",
              ],
              answer: [0],
              explanation: "add 只是填充暂存区；在提交之前，什么都不会被记录。",
            },
            {
              id: `q_${indexId}_2`,
              kind: "single",
              prompt: "一次提交会包含哪些改动？",
              options: [
                "只有被暂存的那些改动",
                "文件夹里的每一个改动",
                "只有新增的文件",
                "只有被删除的文件",
              ],
              answer: [0],
              explanation: "暂存区恰好就是这次提交会包含的改动集合。",
            },
            {
              id: `q_${indexId}_3`,
              kind: "single",
              prompt: "为什么要把一个混乱的下午拆成两次提交？",
              options: [
                "这样每条提交都有清楚的理由",
                "这样仓库会变小",
                "Git 不允许过大的提交",
                "这样就不需要写提交信息了",
              ],
              answer: [0],
              explanation: "理由单一的小提交，更容易审阅、回退，也更容易被后来的人读懂。",
            },
          ],
        },
      },
    ],
  };
}

function mockChineseBranchLesson(indexId: string): GeneratedLesson {
  return {
    title: "不再害怕分支",
    estimatedMinutes: 9,
    blocks: [
      {
        id: `blk_${indexId}_reading`,
        title: "分支只是一个指针",
        type: "reading",
        payload: {
          markdown: mockReading(
            [
              "# 分支只是一个指针",
              "",
              "「分支」听起来像是把项目复制了一份，其实它小得多：分支就是一个可以移动的、"
                + "指向某个提交的指针。创建一个分支几乎不花代价，所以 Git 期待你随手就建。",
              "",
              "## 创建与切换",
              "",
              "`git switch -c feature/login` 一步就创建分支并切过去。新的提交会让这个分支的"
                + "指针向前走；你原来的分支仍然指在你离开时的那个提交上。没有复制，也没有丢失。",
              "",
              "## 合并回来",
              "",
              "工作完成后，切回 `main` 并运行 `git merge feature/login`。如果 `main` 在你"
                + "分支出去之后没有动过，Git 只是把指针往前滑一格——这叫快进。如果两边都有"
                + "新提交，Git 会生成一个有两个父提交的合并提交。",
              "",
              "## 冲突到底是什么",
              "",
              "冲突不是错误。它意味着两次提交改了同一个文件的同一批行，Git 不愿意替你猜"
                + "你想要哪一个版本。它会在文件里标出这一段，然后停下来等你。你留下想要的"
                + "文字，删掉标记，把文件暂存，再结束这次合并。",
              "",
              "## 一个具体的例子",
              "",
              "两个人改了 `引言.md` 里同一个标题。后合并的那个人会在这一个标题上看到冲突，"
                + "决定保留哪种说法，然后提交这次解决结果。两个分支的其余部分都会自动合并。",
              "",
              "## 值得养成的习惯",
              "",
              "只要一件事需要超过几分钟，就为它开一个分支：修问题、做实验、加功能。`main` "
                + "始终保持可用，而放弃一个实验的代价只有一条命令，而不是一个下午的撤销。",
            ].join("\n"),
          ),
        },
      },
      {
        id: `blk_${indexId}_match`,
        title: "把术语和它的含义配对",
        type: "game",
        payload: {
          variant: "match",
          pairs: [
            { left: "分支", right: "指向某个提交、可以移动的指针" },
            { left: "main", right: "始终保持可发布的那个分支" },
            { left: "合并", right: "把另一个分支的提交接进你的分支" },
            { left: "快进", right: "不生成合并提交、只移动指针" },
            { left: "冲突", right: "两次提交改了同一批行" },
          ],
        },
      },
      {
        id: `blk_${indexId}_quiz`,
        title: "检查一下理解",
        type: "quiz",
        payload: {
          passScore: 0.7,
          questions: [
            {
              id: `q_${indexId}_1`,
              kind: "single",
              prompt: "从技术上说，分支是什么？",
              options: [
                "一个指向提交的指针",
                "项目文件夹的完整副本",
                "远程服务器上的备份",
                "一个永远不会移动的标签",
              ],
              answer: [0],
              explanation: "分支之所以廉价，是因为它只是引用，不是文件的副本。",
            },
            {
              id: `q_${indexId}_2`,
              kind: "single",
              prompt: "什么时候合并会产生冲突？",
              options: [
                "两个分支改了同一批行的时候",
                "只要合并两个分支就会",
                "只在文件被删除时",
                "分支名字不一样的时候",
              ],
              answer: [0],
              explanation: "互不重叠的改动 Git 会自动合并，只在改动重叠的地方才请人来决定。",
            },
            {
              id: `q_${indexId}_3`,
              kind: "single",
              prompt: "快进合并发生了什么？",
              options: [
                "分支指针向前移动，不生成合并提交",
                "Git 创建了一条空提交",
                "功能分支被自动删除",
                "所有冲突被自动解决",
              ],
              answer: [0],
              explanation: "如果目标分支没有动过，指针直接前进到新的提交就可以了。",
            },
          ],
        },
      },
    ],
  };
}

function mockChinesePlaceholderLesson(input: {
  title: string;
  summary: string;
  id: string;
}): GeneratedLesson {
  const { title, summary, id } = input;
  const slug = idSlug(title);
  const summaryLine =
    summary.length === 0 ? "这节课是手动添加的，还没有写摘要。" : summary;

  return {
    title,
    estimatedMinutes: 8,
    blocks: [
      {
        id: `blk_${id}_${slug}_reading`,
        title: `关于「${title}」`,
        type: "reading",
        payload: {
          markdown: mockReading(
            [
              `# ${title}`,
              "",
              summaryLine,
              "",
              "## 怎么用这一课",
              "",
              "先读上面的摘要，写下你期待学完之后能做什么。然后过一遍卡片和反思：它们刻意"
                + "做得很短，几分钟就能完成，也更容易看出哪里还没想清楚。",
              "",
              "## 一个具体的例子",
              "",
              `找一个「${title}」真正起作用的小场景，描述你第一步会做什么，再和摘要对照。`
                + "两者不一致的地方，就是值得去问导师的问题。",
              "",
              "## 需要记住的",
              "",
              "- 这一课的目标，就是摘要里写的那个结果。",
              "- 复习时，一个具体的例子比一条定义更有用。",
              "- 如果你没法用两句话讲清楚，就回去再看一遍卡片。",
            ].join("\n"),
          ),
        },
      },
      {
        id: `blk_${id}_${slug}_cards`,
        title: "本课速览",
        type: "flashcards",
        payload: {
          cards: [
            { front: "本课重点", back: title },
            { front: "为什么重要", back: summaryLine },
            { front: "第一步", back: "先写下你已经知道的，再和摘要对照。" },
            { front: "复习技巧", back: "不看笔记，用两句话把这个重点讲出来。" },
            { front: "完成之后", back: "把反思写完，下一课才能接着往上搭。" },
          ],
        },
      },
      {
        id: `blk_${id}_${slug}_reflection`,
        title: "用你自己的话说一遍",
        type: "reflection",
        payload: {
          prompt: `用两三句话，把「${title}」讲给一个从没学过它的人听。`,
          minWords: 25,
        },
      },
    ],
  };
}
