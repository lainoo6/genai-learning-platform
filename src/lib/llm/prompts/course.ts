import { z } from "zod";

import { blockListSchema } from "@/lib/blocks/schema";

/**
 * Course generation for the learner-facing /generate page (P4.7).
 *
 * The shape is deliberately narrower than the block engine: one module, three
 * lessons, and exactly three blocks per lesson (reading → one interactive
 * block → quiz). Restricting the interactive block to flashcards or a game
 * keeps the generated payload reliable enough to pass `blockListSchema` on the
 * first or second attempt, which matters because a failed generation costs the
 * learner the whole course.
 */

/** Interactive blocks a generated lesson may use between the reading and quiz. */
export const GENERATED_INTERACTIVE_TYPES = ["flashcards", "game"] as const;

/** One generated lesson: reading + one interactive block + quiz, in order. */
export const generatedLessonSchema = z
  .object({
    title: z.string().min(2).max(120),
    estimatedMinutes: z.number().int().min(3).max(20),
    blocks: blockListSchema,
  })
  .superRefine((lesson, ctx) => {
    const { blocks } = lesson;
    const types = blocks.map((block) => block.type);

    if (blocks.length !== 3) {
      ctx.addIssue({
        code: "custom",
        message:
          "Each lesson needs exactly three blocks: reading, one interactive block, quiz.",
        path: ["blocks"],
      });
      return;
    }

    if (types[0] !== "reading" || types[2] !== "quiz") {
      ctx.addIssue({
        code: "custom",
        message: "Blocks must be ordered reading, interactive, quiz.",
        path: ["blocks"],
      });
    }

    const interactive = types[1];
    if (
      interactive === undefined
      || !GENERATED_INTERACTIVE_TYPES.includes(
        interactive as (typeof GENERATED_INTERACTIVE_TYPES)[number],
      )
    ) {
      ctx.addIssue({
        code: "custom",
        message: "The middle block must be a flashcards or game block.",
        path: ["blocks", 1],
      });
    }
  });

/** The whole mini-course the model has to return. */
export const learnerCourseSchema = z.object({
  title: z.string().min(3).max(90),
  description: z.string().min(20).max(500),
  difficulty: z.enum(["beginner", "intermediate", "advanced"]),
  lessons: z.array(generatedLessonSchema).length(3),
});

export type LearnerCourse = z.infer<typeof learnerCourseSchema>;

/**
 * Prompt for the whole course. The JSON skeleton and the per-block shapes are
 * spelled out because the reply is parsed directly by `learnerCourseSchema`.
 */
export function learnerCoursePrompt(topic: string, goal: string): string {
  const goalLine =
    goal.trim().length === 0
      ? "No specific goal was given, so assume curiosity."
      : `The learner's goal: ${goal.trim()}`;

  return [
    "Write one very short mini-course for a learner who typed a topic into a",
    "\"generate a course\" box. The course must be factually careful, specific to",
    "the topic, and readable in under half an hour.",
    "",
    `Topic: ${topic}`,
    goalLine,
    "",
    "Structure: exactly one module of three lessons. Each lesson has exactly three",
    "blocks, in this order:",
    "1. reading — 250 to 400 words of markdown. Start with a single # heading, use",
    "   short paragraphs, include one concrete example, and do not use images.",
    "2. interactive — either flashcards (6 to 8 cards) or game (variant \"match\"",
    "   with 5 pairs, or variant \"sort\" with 5 items carrying distinct order",
    "   numbers). Choose whichever fits the lesson.",
    "3. quiz — passScore 0.7 and exactly 3 single-choice questions, each with 4",
    "   options, answer as an array containing one index, and a one-sentence",
    "   explanation.",
    "",
    "Rules:",
    "- Block ids look like \"blk_l1_reading\", \"blk_l1_cards\", \"blk_l1_quiz\".",
    "- Question ids look like \"q_l1_1\".",
    "- Every lesson title is concrete (\"Tea arrives in Taiwan\"), never \"Lesson 1\".",
    "- Factual claims must be things a careful encyclopedia would agree with; hedge",
    "  disputed origin stories instead of picking a winner.",
    "- Do not use emoji. Do not wrap the reply in code fences.",
    "",
    "Reply with one JSON object of this exact shape:",
    '{"title": string, "description": string,',
    ' "difficulty": "beginner" | "intermediate" | "advanced",',
    ' "lessons": [{"title": string, "estimatedMinutes": number, "blocks": Block[]}]}',
    "",
    "Block shapes:",
    'reading: {"id": string, "title": string, "type": "reading",',
    '          "payload": {"markdown": string}}',
    'flashcards: {"id": string, "title": string, "type": "flashcards",',
    '             "payload": {"cards": [{"front": string, "back": string}]}}',
    'game match: {"id": string, "title": string, "type": "game",',
    '             "payload": {"variant": "match",',
    '                         "pairs": [{"left": string, "right": string}]}}',
    'game sort:  {"id": string, "title": string, "type": "game",',
    '             "payload": {"variant": "sort",',
    '                         "items": [{"text": string, "order": number}]}}',
    'quiz: {"id": string, "title": string, "type": "quiz",',
    '       "payload": {"passScore": 0.7, "questions": [{"id": string,',
    '                    "kind": "single", "prompt": string,',
    '                    "options": [string, string, string, string],',
    '                    "answer": [number], "explanation": string}]}}',
  ].join("\n");
}

/**
 * Fixed demo course used when no API key is configured.
 *
 * It is complete enough to learn from, not a stub: three lessons, real prose,
 * and every block required by `learnerCourseSchema`.
 */
export function mockLearnerCourse(): unknown {
  return {
    title: "History of Bubble Tea",
    description:
      "How a chewy drink from Taiwanese tea stalls became a global habit: the two "
      + "rival origin stories, the supply chain behind the pearls, and the economics "
      + "of customising every cup.",
    difficulty: "beginner",
    lessons: [
      {
        title: "A drink invented at a tea stall",
        estimatedMinutes: 8,
        blocks: [
          {
            id: "blk_l1_reading",
            title: "Two tea houses, one chewy idea",
            type: "reading",
            payload: {
              markdown: [
                "# A drink younger than the personal computer",
                "",
                "Bubble tea is often treated as an ancient Chinese tradition. It is not. "
                  + "The drink appeared in Taiwan in the mid-1980s, and two tea houses still "
                  + "argue about which one invented it.",
                "",
                "Chun Shui Tang, a tea house in Taichung, says its founder experimented with "
                  + "serving cold tea in the 1980s; the story goes that a product manager, Lin "
                  + "Hsiu-hui, dropped tapioca balls into a cup during a staff meeting in 1988. "
                  + "Hanlin Tea Room in Tainan tells a similar story with a different date and "
                  + "a different person. Both versions agree on the important part: somebody "
                  + "put chewy cassava pearls into sweetened tea and the texture changed the "
                  + "drink completely.",
                "",
                "## What is actually in the cup",
                "",
                "The pearls — boba — are made from cassava starch, boiled until soft, then "
                  + "kept in syrup so they stay chewy. The tea underneath is usually a light "
                  + "oolong or black tea, sweetened with syrup and shaken with ice. A wide "
                  + "straw is not decoration: it is the only way to get a pearl from the "
                  + "bottom of the cup to your mouth.",
                "",
                "## A concrete example",
                "",
                "Walk into a Taipei shop and order \"bubble milk tea, half sugar, less ice\". "
                  + "Three decisions happen in one sentence: the base drink, how sweet it is, "
                  + "and how cold. None of them changes the price. That combination — a drink "
                  + "you configure rather than simply order — is the part that travelled.",
                "",
                "## Why it spread so quickly",
                "",
                "The ingredients were cheap, the equipment was a shaker and a sealing machine, "
                  + "and the drink photographed well before anybody owned a smartphone. A "
                  + "single stall could make a cup in under a minute, which made it a natural "
                  + "fit for night markets: high volume, small space, no cutlery.",
                "",
                "The next lesson follows the drink out of the night market and into shopping "
                  + "centres on four continents.",
              ].join("\n"),
            },
          },
          {
            id: "blk_l1_cards",
            title: "The vocabulary of a cup",
            type: "flashcards",
            payload: {
              cards: [
                {
                  front: "Boba",
                  back: "The tapioca pearls themselves — and, by extension, the drink. Chewy, dark, and made from cassava starch.",
                },
                {
                  front: "Tapioca pearl",
                  back: "A ball of cassava starch, boiled and stored in syrup. It has almost no flavour of its own; its job is texture.",
                },
                {
                  front: "Cassava",
                  back: "The starchy root the pearls come from. Cheap, grown in tropical regions, and also the source of tapioca flour.",
                },
                {
                  front: "Shaker",
                  back: "The machine or hand shaker that mixes tea, syrup and ice. Shaking chills the drink and aerates it.",
                },
                {
                  front: "Sealing machine",
                  back: "The device that welds a plastic film over the cup. It lets the drink be shaken without a lid and carried without spilling.",
                },
                {
                  front: "Oolong",
                  back: "A partly fermented tea from Taiwan and southern China. Common as the base of a bubble tea.",
                },
                {
                  front: "Night market",
                  back: "An evening street-food market. Bubble tea reached its first mass audience through these stalls.",
                },
              ],
            },
          },
          {
            id: "blk_l1_quiz",
            title: "Check your understanding",
            type: "quiz",
            payload: {
              passScore: 0.7,
              questions: [
                {
                  id: "q_l1_1",
                  kind: "single",
                  prompt: "Where did bubble tea first appear?",
                  options: ["Taiwan", "Hong Kong", "Singapore", "Japan"],
                  answer: [0],
                  explanation:
                    "The drink emerged in Taiwan in the mid-1980s; the other places adopted it later.",
                },
                {
                  id: "q_l1_2",
                  kind: "single",
                  prompt: "What are the pearls made from?",
                  options: [
                    "Cassava starch",
                    "Rice flour",
                    "Wheat gluten",
                    "Gelatin",
                  ],
                  answer: [0],
                  explanation:
                    "Tapioca pearls are cassava starch, which is why they are chewy rather than crumbly.",
                },
                {
                  id: "q_l1_3",
                  kind: "single",
                  prompt: "Why does a bubble tea cup need a wide straw?",
                  options: [
                    "So the pearls can be sucked up",
                    "So the drink stays cold",
                    "So the tea can be stirred",
                    "So the cup can be sealed",
                  ],
                  answer: [0],
                  explanation:
                    "A normal straw blocks the pearls; the wide one is sized for them.",
                },
              ],
            },
          },
        ],
      },
      {
        title: "From night market to global brand",
        estimatedMinutes: 9,
        blocks: [
          {
            id: "blk_l2_reading",
            title: "How a local drink travels",
            type: "reading",
            payload: {
              markdown: [
                "# From Taichung to the shopping mall",
                "",
                "In the 1990s bubble tea spread across Taiwan and into Hong Kong, mainland "
                  + "China and Southeast Asia. The mechanism was not advertising. It was "
                  + "franchising: a shop that had perfected its syrup could sell the recipe, "
                  + "the cups and the sealing machine to somebody in another city.",
                "",
                "By the 2010s the drink had reached Europe and North America, often through "
                  + "students who had studied in Asia and missed it. Chains such as Chatime "
                  + "and CoCo opened hundreds of outlets; specialist brands built queues "
                  + "around a single product, brown sugar bubble tea, that photographs as a "
                  + "gradient of caramel against milk.",
                "",
                "## Two rival origin stories",
                "",
                "Taiwan's two claims are worth knowing because they show how food history "
                  + "usually works. Chun Shui Tang points to Taichung and the late 1980s. "
                  + "Hanlin Tea Room points to Tainan and a slightly earlier date. Neither "
                  + "claim has a patent, and both are supported mainly by the memories of the "
                  + "families involved. The honest version is that the drink emerged in "
                  + "several tea shops around the same time.",
                "",
                "## What changes when a drink crosses a border",
                "",
                "Recipes do not travel unchanged. Shops in North America often reduce the "
                  + "default sugar level, because local palates expect less sweetness. Some "
                  + "markets add cheese foam or fresh fruit to a base that started as tea "
                  + "and milk. The pearls, however, stay remarkably consistent — they are "
                  + "the one part customers can recognise with their eyes closed.",
                "",
                "## The example to remember",
                "",
                "A cup sold in Vancouver and a cup sold in Kaohsiung may share a name, a "
                  + "straw and a sealing machine, and still taste like two different products. "
                  + "That is not a failure of authenticity; it is what successful food "
                  + "franchises do, and it is why the drink survived the trip.",
              ].join("\n"),
            },
          },
          {
            id: "blk_l2_match",
            title: "Match each piece to its role",
            type: "game",
            payload: {
              variant: "match",
              pairs: [
                {
                  left: "Chun Shui Tang",
                  right: "Taichung tea house with one of the origin claims",
                },
                {
                  left: "Hanlin Tea Room",
                  right: "Tainan tea house with the rival origin claim",
                },
                {
                  left: "Cassava starch",
                  right: "What the pearls are made from",
                },
                {
                  left: "Sealing machine",
                  right: "Welds film over the cup so it can be shaken",
                },
                {
                  left: "Franchising",
                  right: "How the drink reached other countries quickly",
                },
              ],
            },
          },
          {
            id: "blk_l2_quiz",
            title: "Check your understanding",
            type: "quiz",
            payload: {
              passScore: 0.7,
              questions: [
                {
                  id: "q_l2_1",
                  kind: "single",
                  prompt: "Which two cities are associated with the invention story?",
                  options: [
                    "Taichung and Tainan",
                    "Taipei and Kaohsiung",
                    "Hong Kong and Macau",
                    "Shanghai and Xiamen",
                  ],
                  answer: [0],
                  explanation:
                    "The rival claims come from tea houses in Taichung and Tainan.",
                },
                {
                  id: "q_l2_2",
                  kind: "single",
                  prompt: "What carried the drink to other countries in the 1990s?",
                  options: [
                    "Franchising",
                    "Government export programmes",
                    "Television advertising",
                    "Airline catering contracts",
                  ],
                  answer: [0],
                  explanation:
                    "Franchising let a proven shop sell its recipe and equipment to operators abroad.",
                },
                {
                  id: "q_l2_3",
                  kind: "single",
                  prompt: "Which part of the drink changes least across markets?",
                  options: [
                    "The tapioca pearls",
                    "The sugar level",
                    "The toppings",
                    "The tea base",
                  ],
                  answer: [0],
                  explanation:
                    "Sugar, toppings and tea bases are adapted; the pearls stay recognisably the same.",
                },
              ],
            },
          },
        ],
      },
      {
        title: "The economics of a five-dollar cup",
        estimatedMinutes: 8,
        blocks: [
          {
            id: "blk_l3_reading",
            title: "Why customisation is the product",
            type: "reading",
            payload: {
              markdown: [
                "# The economics of a five-dollar cup",
                "",
                "A bubble tea shop sells a drink whose ingredients — tea, water, milk powder, "
                  + "sugar and starch — cost very little per cup. The price comes from "
                  + "something else: the shop is selling a small, affordable decision.",
                "",
                "## Customisation without cost",
                "",
                "Sugar level, ice level, topping, milk or no milk. Each choice feels personal "
                  + "and costs the shop almost nothing to offer. A restaurant cannot let you "
                  + "choose how salty the soup is without hiring another cook; a bubble tea "
                  + "shop can let you choose six things while the queue keeps moving.",
                "",
                "This is the same trick coffee chains discovered with milk and syrup. The "
                  + "product is not the liquid. It is the feeling that the cup was made for "
                  + "you, at a price low enough to repeat tomorrow.",
                "",
                "## What the queue sells",
                "",
                "A visible queue does two jobs. It tells passers-by that the shop is worth "
                  + "joining, and it produces a photograph: a row of cups on a counter, a "
                  + "colour gradient in a plastic cup, a hand holding it against a street. "
                  + "The drink is designed to be photographed before it is drunk — the sealed "
                  + "top keeps it intact, and the pearls sit in layers rather than dissolving.",
                "",
                "## Where the money actually goes",
                "",
                "Rent, staff and refrigeration take most of the margin, not the tea. That is "
                  + "why the business scales through small outlets in high-footfall locations "
                  + "and why a single bad lease can close a profitable brand. The pearls are "
                  + "cheap; the corner is not.",
                "",
                "## The takeaway",
                "",
                "Bubble tea is a useful case study because it is small enough to see whole: "
                  + "a cheap ingredient, a configurable product, a photogenic object and a "
                  + "location-based business. Almost every consumer trend repeats that "
                  + "combination with a different flavour.",
              ].join("\n"),
            },
          },
          {
            id: "blk_l3_sort",
            title: "Put the steps of a cup in order",
            type: "game",
            payload: {
              variant: "sort",
              items: [
                { text: "Brew the tea and let it cool", order: 1 },
                { text: "Add syrup and ice to the shaker", order: 2 },
                { text: "Shake until chilled and mixed", order: 3 },
                { text: "Pour over pearls already waiting in the cup", order: 4 },
                { text: "Seal the cup and hand it over", order: 5 },
              ],
            },
          },
          {
            id: "blk_l3_quiz",
            title: "Check your understanding",
            type: "quiz",
            payload: {
              passScore: 0.7,
              questions: [
                {
                  id: "q_l3_1",
                  kind: "single",
                  prompt: "Why can a bubble tea shop offer so many customisations?",
                  options: [
                    "They cost the shop almost nothing to provide",
                    "They require a trained chef for each order",
                    "They increase the ingredient cost sharply",
                    "They are required by food safety law",
                  ],
                  answer: [0],
                  explanation:
                    "Sugar, ice and toppings are cheap variables; the personalisation is the value.",
                },
                {
                  id: "q_l3_2",
                  kind: "single",
                  prompt: "What takes most of a shop's margin?",
                  options: [
                    "Rent, staff and refrigeration",
                    "The tea leaves",
                    "The tapioca pearls",
                    "The plastic cups",
                  ],
                  answer: [0],
                  explanation:
                    "The ingredients are cheap per cup; the location and the labour are not.",
                },
                {
                  id: "q_l3_3",
                  kind: "single",
                  prompt: "What does a visible queue do for a shop?",
                  options: [
                    "Signals popularity and creates a photo moment",
                    "Reduces the cost of ingredients",
                    "Makes the drink colder",
                    "Shortens the training for staff",
                  ],
                  answer: [0],
                  explanation:
                    "The queue is social proof and part of the product's image.",
                },
              ],
            },
          },
        ],
      },
    ],
  };
}
