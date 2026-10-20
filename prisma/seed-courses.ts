import { CourseSource, CourseStatus, Prisma, type PrismaClient } from "@prisma/client";

import { blockListSchema } from "../src/lib/blocks/schema";

/**
 * Seed content for "Software Engineering Fundamentals" (task P2.6).
 *
 * Every lesson payload is parsed with the real block schema before it is
 * written, so a typo on the seed side fails loudly at `npm run db:seed` instead
 * of showing up as an unrenderable lesson in the player.
 */

export const SEED_COURSE_SLUG = "software-engineering-fundamentals";

const COURSE = {
  slug: SEED_COURSE_SLUG,
  title: "Software Engineering Fundamentals",
  description:
    "Seven short lessons on how software actually gets built: what engineers do all day, "
    + "where ideas turn into requirements, how effort is estimated, and what a team "
    + "does inside a two-week sprint. Written for people who work near software, not in it.",
  topic: "Software Engineering",
  audience: "Non-CS beginners",
  difficulty: "beginner",
  coverEmoji: "🧱",
};

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

const MODULES: SeedModule[] = [
  {
    title: "Why Software Engineering",
    lessons: [
      {
        title: "What software engineers actually do",
        estimatedMinutes: 12,
        blocks: [
          {
            id: "blk_se_l1_reading",
            title: "A day in the life, minus the typing",
            type: "reading",
            payload: {
              markdown: [
                "# The job is mostly deciding",
                "",
                "Watch an engineer for a whole day and surprisingly little of it looks like "
                  + "writing new code. It looks like reading a function somebody else wrote in "
                  + "2019, asking a teammate what the ticket author meant by \"graceful "
                  + "handling\", reproducing a bug that hits one customer in nine thousand, and "
                  + "working out whether Thursday's fix can safely ship before Friday's release.",
                "",
                "The typing happens in short bursts in between. What makes it valuable is the "
                  + "deciding that came first.",
                "",
                "## Four things the week is actually made of",
                "",
                "1. **Understanding the problem.** Reproducing it, reading logs, asking the "
                  + "person who reported it rather than guessing what they meant.",
                "2. **Designing a change that fits.** Where does this belong? Does it belong "
                  + "in the payment service or in the checkout screen? A change that works but "
                  + "lands in the wrong place becomes next year's rewrite.",
                "3. **Proving nothing else broke.** Tests, a review from a second pair of "
                  + "eyes, a staging environment that mirrors production closely enough to "
                  + "trust.",
                "4. **Keeping it alive.** Dashboards, alerts, a support rota, and that quiet "
                  + "quarterly task of updating a library before it stops receiving security "
                  + "patches.",
                "",
                "## A concrete example: slow checkout",
                "",
                "An online bookstore asks an engineer to make checkout \"faster\". She opens "
                  + "the performance panel and finds the payment step takes 3.4 seconds to "
                  + "appear. Three quarters of that time is one third-party postcode lookup "
                  + "that runs before anything is drawn on screen.",
                "",
                "She does not rewrite checkout. She loads the page first and does the lookup "
                  + "while it is already visible. Same request, same customer satisfaction, "
                  + "roughly ninety minutes of work instead of three weeks.",
                "",
                "The clever part was not the typing. It was refusing to guess where the time "
                  + "was going.",
                "",
                "## Why this matters if you do not code",
                "",
                "Working next to engineers gets much easier once you stop asking \"how fast "
                  + "can you build this?\" and start asking \"what would we have to give up, "
                  + "and what might break?\". The first question only has one honest answer "
                  + "(\"it depends\"). The second one is the conversation worth having.",
                "",
                "> The most expensive sentence in software is \"that should be quick\". It is",
                "> usually said before anybody has looked.",
                "",
                "Next time you hear it, the useful reply is not \"no\". It is \"quick compared "
                  + "with what — and what are we leaving out?\"",
              ].join("\n"),
            },
          },
          {
            id: "blk_se_l1_quiz",
            title: "Check your understanding",
            type: "quiz",
            payload: {
              passScore: 0.7,
              questions: [
                {
                  id: "q_l1_what_first",
                  kind: "single",
                  prompt:
                    "A shop owner asks an engineer to make checkout faster. What does she usually do first?",
                  options: [
                    "Measure where the time is actually being spent",
                    "Rewrite the checkout page from scratch",
                    "Assign more developers to the checkout work",
                    "Upgrade every library the project depends on",
                  ],
                  answer: [0],
                  explanation:
                    "Measurement comes before code. In the example above the slow part was a "
                    + "single third-party lookup, which nobody could have guessed from reading "
                    + "the ticket.",
                },
                {
                  id: "q_l1_week",
                  kind: "multi",
                  prompt: "Which of these realistically belong to an engineer's week?",
                  options: [
                    "Reading code somebody else wrote",
                    "Reproducing a bug from a support email",
                    "Reviewing a teammate's change before it ships",
                    "Attending a three-hour coding marathon every morning",
                  ],
                  answer: [0, 1, 2],
                  explanation:
                    "Reading, reproducing and reviewing are daily work at most companies. "
                    + "Marathon coding sessions are a film trope — sustained, uninterrupted "
                    + "typing is rare and usually a sign nobody is reviewing anything.",
                },
                {
                  id: "q_l1_done",
                  kind: "truefalse",
                  prompt:
                    "Once software has been released, the engineering work is basically finished.",
                  answer: [1],
                  explanation:
                    "False. Operating software is where most of its lifetime cost sits: "
                    + "monitoring, incident response, dependency updates, and the requests that "
                    + "only appear once real people use it.",
                },
                {
                  id: "q_l1_check",
                  kind: "short",
                  prompt:
                    "Name one thing a team checks before letting a change reach real users.",
                  answer: "test, review, staging, monitor, monitoring, canary, rollback",
                  explanation:
                    "Tests, code review, a staging environment, gradual rollouts or a "
                    + "monitoring dashboard all count. The habit is what matters: something "
                    + "sits between a laptop and a customer.",
                },
              ],
            },
          },
        ],
      },
      {
        title: "The software lifecycle",
        estimatedMinutes: 12,
        blocks: [
          {
            id: "blk_se_l2_reading",
            title: "Software is never finished, only maintained",
            type: "reading",
            payload: {
              markdown: [
                "# Nothing stays still around your code",
                "",
                "Apple ships a new iOS in September and a shipping label layout quietly "
                  + "breaks. A payment provider moves its API deadline by three months. A "
                  + "partner university renames a department, and a form dropdown nobody has "
                  + "opened in a year suddenly looks wrong.",
                "",
                "None of those changes were your idea. All of them land on your software. "
                  + "That is why teams talk about a *lifecycle* rather than a project with a "
                  + "finish line.",
                "",
                "## Six places you will visit again and again",
                "",
                "1. **Discover** — What is the problem, whose problem is it, and how would we "
                  + "recognise that it got better?",
                "2. **Design** — What data exists, what the screens do, where the boundaries "
                  + "are, and which failure modes we accept.",
                "3. **Build and test** — Write it, and prove the parts around it still work.",
                "4. **Release** — Usually behind a switch, often to 5% of users first, always "
                  + "watching whether error rates move.",
                "5. **Operate** — Logs, alerts, somebody on call, dashboards that tell you "
                  + "something is wrong before a customer emails you.",
                "6. **Improve or retire** — Six months of usage data now tells you what people "
                  + "actually use, which is frequently not what the plan said.",
                "",
                "Teams loop through these rather than walking through them once. A support "
                  + "ticket is the beginning of a new Discover pass.",
                "",
                "## Example: adding \"Sign in with Google\"",
                "",
                "It reads like one line of work. In practice it touches: terms-of-service "
                  + "review (Discover), deciding what happens to accounts that already used "
                  + "the same email address (Design), redirect handling plus recovery codes "
                  + "(Build), rolling out to staff accounts first (Release), watching login "
                  + "success rates for a week (Operate), and eventually deleting the password "
                  + "reset emails nobody clicks any more (Improve).",
                "",
                "## Being wrong early is cheap",
                "",
                "A misunderstanding caught during Discover costs an edit in a document. The "
                  + "same misunderstanding caught during Operate means rollback plans, refunds, "
                  + "a support backlog and an apology email. Nothing about the final code "
                  + "differs much — only the invoice does.",
                "",
                "## What to take away",
                "",
                "If someone promises a piece of software will be \"done\", ask what happens in "
                  + "month seven. Lifecycles are not bureaucracy; they are a way of admitting "
                  + "that the world around the software will keep moving.",
              ].join("\n"),
            },
          },
          {
            id: "blk_se_l2_quiz",
            title: "Check your understanding",
            type: "quiz",
            payload: {
              passScore: 0.7,
              questions: [
                {
                  id: "q_l2_loop",
                  kind: "single",
                  prompt:
                    "How do teams usually move through the six lifecycle stages in real projects?",
                  options: [
                    "They loop back, often starting again from Discover after learning something",
                    "They pass through once, in fixed order, and then move to the next project",
                    "They skip straight from Discover to Release for anything small",
                    "They only visit Operate when something breaks in production",
                  ],
                  answer: [0],
                  explanation:
                    "A support ticket or a usage report usually kicks off another Discover "
                    + "round. Operate is continuous too — you watch dashboards before things "
                    + "break, not only after.",
                },
                {
                  id: "q_l2_late_cost",
                  kind: "multi",
                  prompt:
                    "What does it usually cost to find a requirements mistake after release?",
                  options: [
                    "Support tickets nobody had budgeted for",
                    "A rollback or hotfix under time pressure",
                    "A short edit to the original planning document",
                    "Trust, especially if money or personal data was involved",
                  ],
                  answer: [0, 1, 3],
                  explanation:
                    "The code fix itself is often tiny — that is the trap. The cost lands in "
                    + "support load, emergency work and credibility. Editing the planning "
                    + "document is what you pay if you catch it early instead.",
                },
                {
                  id: "q_l2_maintenance",
                  kind: "truefalse",
                  prompt:
                    "Most of the lifetime cost of a software system is spent after the first release.",
                  answer: [0],
                  explanation:
                    "True. Keeping something running — updates, incidents, new regulations, "
                    + "new devices — normally dwarfs the cost of writing version one.",
                },
                {
                  id: "q_l2_operate",
                  kind: "short",
                  prompt:
                    "Name one signal a team watches while software is running in production.",
                  answer:
                    "log, logs, dashboard, alert, error rate, latency, uptime, crash report",
                  explanation:
                    "Logs, dashboards, alerts, error rates and latency are all common answers. "
                    + "The point of Operating is noticing trouble before your users tell you.",
                },
              ],
            },
          },
        ],
      },
    ],
  },
  {
    title: "From idea to requirements",
    lessons: [
      {
        title: "Requirements and user stories",
        estimatedMinutes: 14,
        blocks: [
          {
            id: "blk_se_l3_reading",
            title: "Turning a wish into something testable",
            type: "reading",
            payload: {
              markdown: [
                "# \"Make it easier to find things\"",
                "",
                "That request is honest and completely unbuildable. Easier for whom? Compared "
                  + "with what? How would we know on Friday that it worked?",
                "",
                "A requirement is what survives that conversation. Good ones describe the "
                  + "outcome and leave the implementation to the people who will build it.",
                "",
                "## The user story shape",
                "",
                "Most teams write short stories instead of thick specifications:",
                "",
                "> As a **returning customer**, I want my last three orders to appear on the "
                  + "> home screen, so that I can re-order without searching.",
                "",
                "Three parts do very different work:",
                "",
                "- **As a…** names who benefits. It stops a story drifting into someone "
                  + "else's problem.",
                "- **I want…** states the capability, not the solution. \"Filter orders by "
                  + "date\" would be a solution, and it would skip the discussion about whether "
                  + "search would serve them better.",
                "- **So that…** gives the value, and it is the clause most worth fighting for. "
                  + "Once you know the value, a cheaper solution often appears.",
                "",
                "## Acceptance criteria: the deal you made",
                "",
                "Every story gets two to five testable lines. For the story above:",
                "",
                "- Signed-in customers see their three most recent orders on the home screen.",
                "- Each row shows date, total and one \"Order again\" button.",
                "- Customers with no orders see an empty state linking to the catalogue.",
                "- The home screen still loads in under two seconds on a three-year-old "
                  + "Android phone.",
                "",
                "Those four lines settle most arguments in advance, and the last one quietly "
                  + "adds a performance requirement that nobody had said out loud.",
                "",
                "## What that looked like in real life",
                "",
                "A university team was asked for \"a better timetable view\". They spent "
                  + "twenty minutes with two lecturers and discovered the real problem was not "
                  + "the layout: room changes happened the night before and nobody was told. "
                  + "The story became *\"As a lecturer, I want to see which of my classes have "
                  + "room changes tomorrow, so that I stop turning up at the wrong building.\"*",
                "",
                "The capability took two days instead of six weeks of redesign.",
                "",
                "## Warning signs",
                "",
                "- **Solutions disguised as requirements**: \"Add a download button\". Ask what "
                  + "the person needed the file for — often they wanted to email it, which is a "
                  + "different feature.",
                "- **No stakeholder named**: if nobody benefits, nobody can accept it.",
                "- **Nothing you could ever check**: \"intuitive\", \"modern\", \"seamless\" "
                  + "cannot be tested, so they cannot be finished.",
                "",
                "Write the criteria *with* the person who asked, not *for* them. The moment "
                  + "they rephrase a line in their own words, you find out whether you actually "
                  + "agreed on the same thing.",
              ].join("\n"),
            },
          },
          {
            id: "blk_se_l3_flashcards",
            title: "Requirements vocabulary",
            type: "flashcards",
            payload: {
              cards: [
                {
                  front: "Requirement",
                  back: "A statement of what the software must let someone do — never how to build it. \"Sort invoices by date\" is a requirement; \"use a date picker\" is a design choice.",
                },
                {
                  front: "User story",
                  back: "One capability written in one line: As a <who>, I want <what>, so that <value>. Short on purpose — it is a promise of a conversation, not the conversation itself.",
                },
                {
                  front: "Acceptance criteria",
                  back: "Two to five testable conditions that let everybody agree a story is finished. Good ones describe behaviour, so they double as test cases.",
                },
                {
                  front: "Functional vs non-functional requirement",
                  back: "Functional describes what the system does (export invoices as CSV). Non-functional describes how well it behaves (exports finish within ten seconds, files deleted after seven days).",
                },
                {
                  front: "Stakeholder",
                  back: "Anyone whose working week changes because the software changes — including support staff, who inherit every unclear requirement.",
                },
                {
                  front: "Constraint",
                  back: "A boundary nobody is negotiating here: a legal deadline, a payment provider we must integrate, a budget already spent. Constraints narrow design; they are not the same as requirements.",
                },
                {
                  front: "Scope",
                  back: "What this piece of work deliberately includes, and the line where it stops. Written down, it is the difference between \"done\" and \"endless\".",
                },
                {
                  front: "MVP (minimum viable product)",
                  back: "The smallest version you can put in front of a real user to learn something a meeting cannot tell you. Small is the point, not a compromise.",
                },
                {
                  front: "Edge case",
                  back: "Rare but real: the invoice with no billing address, the 1 a.m. holiday traffic spike, a name with forty characters. Cheap to design for, expensive to discover in production.",
                },
              ],
            },
          },
        ],
      },
      {
        title: "Estimation and trade-offs",
        estimatedMinutes: 14,
        blocks: [
          {
            id: "blk_se_l4_reading",
            title: "Why \"two weeks\" is not an estimate",
            type: "reading",
            payload: {
              markdown: [
                "# Estimates are forecasts, not promises",
                "",
                "Ask two engineers to estimate the same change and you will get two numbers. "
                  + "Ask them why and you will learn that one of them is including the data "
                  + "migration and the other is assuming somebody else does it. The estimates "
                  + "were never really about time — they were about hidden scope.",
                "",
                "That is the part worth fixing, and it is why modern teams argue about "
                  + "*relative size* instead of calendar dates.",
                "",
                "## Sizes instead of dates",
                "",
                "Most teams give each piece of work a relative number, usually called a "
                  + "story point. Pick one small, well-understood piece of work as a \"2\". "
                  + "Everything else is "
                  + "judged against it — a 5 is clearly bigger, an 8 is big enough that you "
                  + "would want to split it. Teams then learn that they finish about fourteen "
                  + "points per sprint, whatever those numbers secretly meant.",
                "",
                "This sounds evasive until you notice what it buys you: nobody has to pretend "
                  + "to know what an unfamiliar codebase will do on a bad week.",
                "",
                "## Give three numbers, not one",
                "",
                "For anything that genuinely matters, ask for best case, worst case, and most "
                  + "likely. \"Three days if the old API behaves, two weeks if we have to build "
                  + "the adapter ourselves, realistically six days\" is a useful sentence. "
                  + "\"Six days\" hides everything the listener needed.",
                "",
                "## The trades nobody can make for you",
                "",
                "| You can have | If you accept |",
                "| --- | --- |",
                "| Something this Friday | A narrower scope, and code you will rewrite later |",
                "| A clean design | Waiting while the team thinks, before writing anything |",
                "| Very high confidence | Tests, reviews and staged rollouts, i.e. calendar time |",
                "",
                "You rarely get fast, clean and highly certain together. Choosing which two "
                  + "you want is the actual decision — and it belongs to whoever owns the "
                  + "consequences, not solely to the engineers.",
                "",
                "\"It depends\" is only a useful answer when it is followed by which trade you "
                  + "are proposing.",
                "",
                "## Two habits that help immediately",
                "",
                "1. **Split anything that feels big.** Work you can finish in two days is work "
                  + "you can estimate honestly. Anything larger is a guess wearing a suit.",
                "2. **Write what you assumed.** \"Assumes the address API responds in under "
                  + "300 ms.\" When the assumption breaks, nobody has to argue about whose "
                  + "estimate was wrong.",
              ].join("\n"),
            },
          },
          {
            id: "blk_se_l4_quiz",
            title: "Check your understanding",
            type: "quiz",
            payload: {
              passScore: 0.7,
              questions: [
                {
                  id: "q_l4_relative",
                  kind: "single",
                  prompt: "Why do many teams estimate in relative sizes instead of exact days?",
                  options: [
                    "Because hidden unknowns are easier to admit as \"bigger than that one\"",
                    "Because they are not allowed to talk about calendars",
                    "Because managers prefer abstract numbers to real ones",
                    "Because the size of a task is fixed by company policy",
                  ],
                  answer: [0],
                  explanation:
                    "Comparing two pieces of work is surprisingly easy; predicting calendar "
                    + "time through an unfamiliar codebase is not. Relative sizing keeps the "
                    + "honest part and drops the false precision.",
                },
                {
                  id: "q_l4_tradeoffs",
                  kind: "multi",
                  prompt: "Which of these are genuine trade-offs rather than process problems?",
                  options: [
                    "Shipping something narrow this week instead of something broad next month",
                    "Skipping tests to hit a deadline, knowing defects will cost more later",
                    "Asking for a second opinion because everybody always asks",
                    "Choosing a third-party service to save build time, accepting their outages",
                  ],
                  answer: [0, 1, 3],
                  explanation:
                    "All three exchange one real cost for another. \"Everybody always asks\" is "
                    + "habit, not a trade-off — there is no alternative cost being weighed.",
                },
                {
                  id: "q_l4_big_task",
                  kind: "truefalse",
                  prompt:
                    "A task estimated at several weeks is reliable as long as the developer is experienced.",
                  answer: [1],
                  explanation:
                    "False. Large estimates hide unknowns regardless of skill — that is exactly "
                    + "why teams split work until it feels small enough to be honest about.",
                },
                {
                  id: "q_l4_assumption",
                  kind: "short",
                  prompt:
                    "What is it useful to record alongside an estimate besides the number itself?",
                  answer: "assumption, assumptions, risk, dependency, what we assumed",
                  explanation:
                    "Assumptions. \"Assumes the old API stays available\" turns a later "
                    + "argument into a documented condition that everybody signed up to.",
                },
              ],
            },
          },
        ],
      },
      {
        title: "Interview a stakeholder",
        estimatedMinutes: 12,
        blocks: [
          {
            id: "blk_se_l4b_roleplay",
            title: "The checkout that should be \"faster\"",
            type: "roleplay",
            payload: {
              scenario:
                "You are the business analyst on a small online bookstore. Priya, the "
                + "product manager, has ten minutes between meetings and wants the checkout "
                + "to \"feel faster\" before the next release. Nobody has measured anything "
                + "yet, and the support inbox has forty complaints that all say something "
                + "different.",
              persona:
                "Priya, a product manager who speaks in outcomes and vague adjectives, "
                + "dislikes being handed solutions before the problem is agreed, and answers "
                + "questions with stories about customers rather than numbers",
              goal:
                "Leave the meeting with one testable requirement, a way to measure success, "
                + "and a next step — without proposing a solution before you understand the "
                + "problem.",
              rubric: [
                "Opened by asking about the problem or the last time it happened, not by proposing a feature",
                "Asked who is affected and how often instead of accepting \"everyone\"",
                "Turned \"faster\" into something measurable — a number, an event, or a user-visible outcome",
                "Summarised the requirement back in their own words and got it confirmed",
                "Kept the meeting under control: one question at a time, and left with a next step",
              ],
            },
          },
        ],
      },
    ],
  },
  {
    title: "Working like a team",
    lessons: [
      {
        title: "Agile and sprints",
        estimatedMinutes: 12,
        blocks: [
          {
            id: "blk_se_l5_reading",
            title: "Agile is a feedback schedule",
            type: "reading",
            payload: {
              markdown: [
                "# Agile is not speed",
                "",
                "The word has been stretched until it means almost anything, so here is the "
                  + "narrow, useful version: **agile teams shorten the gap between deciding "
                  + "something and finding out whether it was a good decision.**",
                "",
                "Everything else — stand-ups, boards, story points — is scaffolding for that "
                  + "one habit.",
                "",
                "## What happens inside a two-week sprint",
                "",
                "- **Planning (60–90 min).** Pull work off the top of the backlog, make sure "
                  + "each story has acceptance criteria, and agree what \"finished\" means.",
                "- **Daily stand-up (10 min).** Not a status report to a manager: \"what I "
                  + "am moving today, what is blocking me\". Blocks are the whole point. If "
                  + "yours regularly runs half an hour, it has quietly turned into a status "
                  + "meeting with a different name.",
                "- **The days in between.** Stories move across the board; code review and testing "
                  + "happen during the sprint, never after it.",
                "- **Review (30 min).** Show what actually works to the people who asked for "
                  + "it. Half-finished demos are allowed; surprises at this stage are the "
                  + "cheapest surprises you will ever get.",
                "- **Retrospective (45 min).** What slowed us down, and one thing we will try "
                  + "differently next sprint.",
                "",
                "Notice that three of those five events exist purely to produce feedback "
                  + "early.",
                "",
                "## Two things that quietly ruin sprints",
                "",
                "**Changing the work mid-sprint.** If priorities genuinely changed, that is a "
                  + "conversation, and something else should come out. Adding work without "
                  + "removing work just means nothing gets finished, and \"almost done\" earns "
                  + "no feedback.",
                "",
                "**Skipping the retrospective.** A team that never inspects how it works will "
                  + "have the same argument next month. The retro is the only meeting whose "
                  + "customer is the team itself.",
                "",
                "## What agile cannot do for you",
                "",
                "It will not rescue unclear ownership, and it will not stop a stakeholder who "
                  + "only appears at the review. Those are organisational problems, and no "
                  + "ceremony fixes them. What agile does do is make those problems visible in "
                  + "fortnightly instalments instead of at the end of a nine-month project.",
              ].join("\n"),
            },
          },
          {
            id: "blk_se_l5_flashcards",
            title: "Sprint vocabulary",
            type: "flashcards",
            payload: {
              cards: [
                {
                  front: "Sprint",
                  back: "A fixed-length container for work, usually one or two weeks. Fixed is the key word: the deadline does not move, the amount of work does.",
                },
                {
                  front: "Backlog",
                  back: "Everything the team knows it might do, roughly prioritised and deliberately not all detailed. Only the top few items get stories and acceptance criteria.",
                },
                {
                  front: "Stand-up",
                  back: "Ten minutes, usually standing, answering \"what I am moving today, what is in my way\". Its purpose is exposing blockers, not reporting progress.",
                },
                {
                  front: "Sprint review",
                  back: "Showing working software to the people who asked for it. Honest half-finished work belongs here — feedback now is far cheaper than feedback in a month.",
                },
                {
                  front: "Retrospective",
                  back: "The team's own meeting: what slowed us down, what we change next sprint. The only ceremony whose customer is the team rather than the product.",
                },
                {
                  front: "Product owner",
                  back: "The person accountable for what gets built next and why. Needs the authority to say no, otherwise the backlog is just a wish list.",
                },
                {
                  front: "Facilitator (or Scrum Master)",
                  back: "Keeps the ceremonies honest and removes the blockers surfaced at stand-up. A coordinator of attention, not a project manager with a Gantt chart.",
                },
                {
                  front: "Definition of done",
                  back: "The checklist a story must pass before it counts: reviewed, tested, merged, deployed behind a flag. Without it, \"done\" means whatever people feel.",
                },
                {
                  front: "Velocity",
                  back: "How many points the team usually finishes per sprint. Useful for forecasting the next sprint, harmful when it becomes a target to be defended.",
                },
              ],
            },
          },
        ],
      },
      {
        title: "Wrap-up and self-check",
        estimatedMinutes: 10,
        blocks: [
          {
            id: "blk_se_l6_quiz",
            title: "Final check",
            type: "quiz",
            payload: {
              passScore: 0.7,
              questions: [
                {
                  id: "q_l6_scope",
                  kind: "single",
                  prompt:
                    "A stakeholder asks to add one more story halfway through a sprint that is "
                    + "already full. What fits the approach you just read about?",
                  options: [
                    "Discuss it and agree which existing story comes out",
                    "Accept it and let the team absorb the extra work",
                    "Extend the sprint by a few days",
                    "Skip the retrospective to free up time",
                  ],
                  answer: [0],
                  explanation:
                    "Adding without removing means nothing gets finished, and unfinished work "
                    + "produces no feedback. Extending the sprint breaks the rhythm the team "
                    + "is using to forecast.",
                },
                {
                  id: "q_l6_vague",
                  kind: "multi",
                  prompt:
                    "Which phrases signal that a requirement is not ready to build?",
                  options: [
                    "\"Make it intuitive\"",
                    "\"Fewer than three travellers can be added per booking\"",
                    "\"Modern and seamless\"",
                    "\"As it should obviously work\"",
                  ],
                  answer: [0, 2, 3],
                  explanation:
                    "Untestable words hide unfinished thinking. The travellers example is "
                    + "specific enough to write a test against, which is what makes it "
                    + "buildable.",
                },
                {
                  id: "q_l6_retro",
                  kind: "truefalse",
                  prompt:
                    "The sprint review is the meeting where the team talks about how they work together.",
                  answer: [1],
                  explanation:
                    "False — that is the retrospective. The review is about the product with "
                    + "stakeholders; the retro is about the process with the team.",
                },
                {
                  id: "q_l6_story",
                  kind: "single",
                  prompt:
                    "Which clause of a user story most often reveals a cheaper solution?",
                  options: [
                    "\"so that …\" (the value)",
                    "\"As a …\" (the role)",
                    "\"I want …\" (the capability)",
                    "The acceptance criteria",
                  ],
                  answer: [0],
                  explanation:
                    "Once the value is explicit, alternatives appear. In the timetable "
                    + "example the value was \"stop going to the wrong room\", which a "
                    + "redesign was not needed to deliver.",
                },
                {
                  id: "q_l6_estimate",
                  kind: "short",
                  prompt:
                    "What should a team do with a task that feels several weeks long?",
                  answer: "split, break down, break it down, split it, decompose",
                  explanation:
                    "Split it. Smaller pieces are estimated honestly; anything that large is "
                    + "really a collection of unknowns wearing a single label.",
                },
              ],
            },
          },
          {
            id: "blk_se_l6_reflection",
            title: "Take it back to your own work",
            type: "reflection",
            payload: {
              prompt:
                "Pick one piece of software you use every week at work or university. In your own words: what is one thing about it you would change, who exactly would benefit, and what evidence would convince you the change worked? Write at least 40 words — there is no single right answer.",
              minWords: 40,
            },
          },
        ],
      },
    ],
  },
];

/**
 * Creates the published seed course.
 *
 * Idempotent: an existing course with the same slug (including its modules,
 * lessons and any recorded progress) is deleted first, so re-running the seed
 * always leaves exactly one copy behind.
 */
export async function seedCourse(
  prisma: PrismaClient,
  createdById: string,
): Promise<{ courseId: string; lessonCount: number }> {
  const existing = await prisma.course.findUnique({
    where: { slug: COURSE.slug },
    select: { id: true },
  });

  if (existing !== null) {
    // Cascades to modules, lessons, enrollments and lesson progress.
    await prisma.course.delete({ where: { id: existing.id } });
  }

  const course = await prisma.course.create({
    data: {
      ...COURSE,
      source: CourseSource.SEED,
      status: CourseStatus.PUBLISHED,
      // Seeded content is the platform's staff pick by default.
      isCurated: true,
      createdById,
    },
  });

  let lessonCount = 0;

  for (const [moduleIndex, seedModule] of MODULES.entries()) {
    const courseModule = await prisma.module.create({
      data: {
        courseId: course.id,
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

  return { courseId: course.id, lessonCount };
}
