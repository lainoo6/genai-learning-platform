import { z } from "zod";

import { blockListSchema } from "@/lib/blocks/schema";
import {
  CONTENT_LANGUAGE_LABEL,
  contentLanguageLine,
  type ContentLanguage,
} from "@/lib/llm/language";

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
export function learnerCoursePrompt(
  topic: string,
  goal: string,
  language: ContentLanguage = "en",
): string {
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
    contentLanguageLine(language),
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
    `- Write every string in ${CONTENT_LANGUAGE_LABEL[language]}.`,
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
export function mockLearnerCourse(language: ContentLanguage = "en"): unknown {
  if (language === "zh") {
    return mockChineseLearnerCourse();
  }

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

/**
 * Chinese demo course used when the interface language is Chinese.
 *
 * Same shape as the English demo (three lessons: reading, one interactive
 * block, quiz) and the same subject, so switching the language shows the same
 * course written naturally in Chinese rather than a machine translation.
 */
function mockChineseLearnerCourse(): unknown {
  return {
    title: "珍珠奶茶的历史",
    description:
      "一杯有嚼劲的饮料，如何从台湾的茶摊走向四大洲的商场：两段互相竞争的起源故事、"
      + "珍珠背后的供应链，以及「每一杯都能定制」这门生意。",
    difficulty: "beginner",
    lessons: [
      {
        title: "茶摊上发明的一杯饮料",
        estimatedMinutes: 8,
        blocks: [
          {
            id: "blk_l1_reading",
            title: "两家茶店，一个嚼劲十足的点子",
            type: "reading",
            payload: {
              markdown: [
                "# 一杯比个人电脑还年轻的饮料",
                "",
                "很多人以为珍珠奶茶是古老的中国传统，其实不是。它出现在 1980 年代中期的台湾，"
                  + "至今仍有两家茶店在争谁先发明了它。",
                "",
                "台中的春水堂说，创始人在 1980 年代就开始试验冷茶；流传的版本是，1988 年的一次"
                  + "员工会议上，产品经理林秀慧把粉圆丢进了自己的茶杯。台南的翰林茶馆讲了一个"
                  + "相似的故事，只是时间和人物都不同。两个版本在一件重要的事上是一致的：有人把"
                  + "有嚼劲的木薯珍珠放进了甜茶里，口感从此彻底改变了这杯饮料。",
                "",
                "## 杯子里到底有什么",
                "",
                "珍珠——也就是 boba——由木薯淀粉制成，煮软后泡在糖浆里保持弹性。下面的茶通常是"
                  + "轻发酵的乌龙或红茶，加糖、加冰后摇匀。粗吸管不是装饰：它是把杯底的一颗珍珠"
                  + "送到嘴边的唯一办法。",
                "",
                "## 一个具体的例子",
                "",
                "走进台北的任何一家店，说一句「珍珠奶茶，半糖，少冰」。一句话里做了三个决定："
                  + "基底的饮料、甜度、冰量，而价格不变。这种「可以配置而不只是点单」的体验，"
                  + "正是它传播出去的部分。",
                "",
                "## 为什么扩散得这么快",
                "",
                "原料便宜，设备只是一台摇杯机和一台封口机，而这杯饮料在任何人拥有智能手机之前"
                  + "就已经很上镜。一个摊位一分钟就能出一杯，天然适合夜市：人流大、地方小、不用"
                  + "餐具。下一课，我们跟着它从夜市走进四大洲的商场。",
              ].join("\n"),
            },
          },
          {
            id: "blk_l1_cards",
            title: "一杯饮料的词汇表",
            type: "flashcards",
            payload: {
              cards: [
                {
                  front: "Boba（珍珠）",
                  back: "指的是木薯珍珠本身，也常用来指这杯饮料。深色、有嚼劲，由木薯淀粉制成。",
                },
                {
                  front: "木薯珍珠",
                  back: "木薯淀粉搓成的小球，煮熟后泡在糖浆里。它本身几乎没有味道，提供的是口感。",
                },
                {
                  front: "木薯",
                  back: "珍珠的原料，一种富含淀粉的块根作物，热带地区广泛种植，也是木薯粉的来源。",
                },
                {
                  front: "摇杯机",
                  back: "把茶、糖浆和冰块混合的设备。摇动既降温，也让饮料充气。",
                },
                {
                  front: "封口机",
                  back: "把塑料膜热封在杯口上的机器。这样饮料不加盖也能摇，带走也不会洒。",
                },
                {
                  front: "乌龙茶",
                  back: "台湾与中国南方部分发酵的茶，常被用作珍珠奶茶的茶底。",
                },
                {
                  front: "夜市",
                  back: "傍晚开始的街头小吃市场。珍珠奶茶最早的大众观众，就是在这些摊位前形成的。",
                },
              ],
            },
          },
          {
            id: "blk_l1_quiz",
            title: "检查一下理解",
            type: "quiz",
            payload: {
              passScore: 0.7,
              questions: [
                {
                  id: "q_l1_1",
                  kind: "single",
                  prompt: "珍珠奶茶最早出现在哪里？",
                  options: ["台湾", "香港", "新加坡", "日本"],
                  answer: [0],
                  explanation: "这杯饮料 1980 年代中期出现在台湾，其他地方是后来才接受的。",
                },
                {
                  id: "q_l1_2",
                  kind: "single",
                  prompt: "珍珠是用什么做的？",
                  options: ["木薯淀粉", "米粉", "小麦面筋", "明胶"],
                  answer: [0],
                  explanation: "木薯珍珠就是木薯淀粉，所以它是有嚼劲的，而不是松散易碎的。",
                },
                {
                  id: "q_l1_3",
                  kind: "single",
                  prompt: "为什么珍珠奶茶需要粗吸管？",
                  options: [
                    "这样珍珠才能被吸上来",
                    "为了让饮料保持冰凉",
                    "为了方便搅拌",
                    "为了方便封口",
                  ],
                  answer: [0],
                  explanation: "普通吸管会把珍珠挡住，粗吸管的口径正是为它准备的。",
                },
              ],
            },
          },
        ],
      },
      {
        title: "从夜市走向全球品牌",
        estimatedMinutes: 9,
        blocks: [
          {
            id: "blk_l2_reading",
            title: "一杯本地饮料如何走出去",
            type: "reading",
            payload: {
              markdown: [
                "# 从台中到购物中心",
                "",
                "1990 年代，珍珠奶茶从台湾扩散到香港、中国大陆和东南亚。靠的不是广告，而是"
                  + "加盟：一家把糖浆配方调好的店，可以把配方、杯子和封口机一起卖给另一个城市"
                  + "的经营者。",
                "",
                "到了 2010 年代，它经由在亚洲求学、想念这口味的学生传到了欧洲和北美。日出茶太、"
                  + "CoCo 等连锁开出上百家门店；一些专门店则靠单一产品排起长队——黑糖珍珠奶茶，"
                  + "牛奶里一道焦糖色的渐变，天生适合被拍下来。",
                "",
                "## 两个互相竞争的起源故事",
                "",
                "台湾的两种说法值得知道，因为它们展示了食物史通常是怎么形成的。春水堂指向台中"
                  + "与 1980 年代末；翰林茶馆指向台南，时间稍早。两边都没有专利，依据主要是当事"
                  + "家族的回忆。更诚实的版本是：这杯饮料差不多同时在好几家茶店里出现。",
                "",
                "## 跨过一条边界之后会变什么",
                "",
                "配方不会原封不动地旅行。北美的店往往把默认甜度调低，因为当地口味期待更少的糖；"
                  + "有些市场在茶加奶的基底上加了奶盖或鲜果。但珍珠相当稳定——它是顾客闭着眼睛也"
                  + "认得出来的那一部分。",
                "",
                "## 值得记住的例子",
                "",
                "温哥华卖的一杯和高雄卖的一杯，可能共享同一个名字、同一根吸管和同一台封口机，"
                  + "喝起来却像两种产品。这不是「不正宗」，而是成功的餐饮连锁本来就会做的事，"
                  + "也是这杯饮料能走完全程的原因。",
              ].join("\n"),
            },
          },
          {
            id: "blk_l2_match",
            title: "把每一项和它的作用配对",
            type: "game",
            payload: {
              variant: "match",
              pairs: [
                { left: "春水堂", right: "提出起源说法之一的台中茶店" },
                { left: "翰林茶馆", right: "提出竞争性起源说法的台南茶店" },
                { left: "木薯淀粉", right: "珍珠的原料" },
                { left: "封口机", right: "把膜封在杯口，方便摇匀" },
                { left: "加盟", right: "这杯饮料快速进入其他国家的方式" },
              ],
            },
          },
          {
            id: "blk_l2_quiz",
            title: "检查一下理解",
            type: "quiz",
            payload: {
              passScore: 0.7,
              questions: [
                {
                  id: "q_l2_1",
                  kind: "single",
                  prompt: "发明故事与哪两座城市有关？",
                  options: [
                    "台中与台南",
                    "台北与高雄",
                    "香港与澳门",
                    "上海与厦门",
                  ],
                  answer: [0],
                  explanation: "两种互相竞争的说法，分别来自台中与台南的茶店。",
                },
                {
                  id: "q_l2_2",
                  kind: "single",
                  prompt: "1990 年代把这杯饮料带到其他国家的机制是什么？",
                  options: ["加盟", "政府出口计划", "电视广告", "航空配餐合同"],
                  answer: [0],
                  explanation: "加盟让一家已经跑通的店，把配方和设备卖给海外的经营者。",
                },
                {
                  id: "q_l2_3",
                  kind: "single",
                  prompt: "在不同市场之间，哪一部分变化最小？",
                  options: ["木薯珍珠", "甜度", "配料", "茶底"],
                  answer: [0],
                  explanation: "甜度、配料和茶底都会被调整，只有珍珠保持着一望即知的相同。",
                },
              ],
            },
          },
        ],
      },
      {
        title: "五美元一杯的生意经",
        estimatedMinutes: 8,
        blocks: [
          {
            id: "blk_l3_reading",
            title: "为什么「可定制」就是产品本身",
            type: "reading",
            payload: {
              markdown: [
                "# 五美元一杯的生意经",
                "",
                "珍珠奶茶的原料——茶、水、奶粉、糖和淀粉——每杯成本很低。价格来自别的地方："
                  + "这家店卖的其实是一个「负担得起的小决定」。",
                "",
                "## 不增加成本的定制",
                "",
                "甜度、冰量、配料、加不加奶。每个选择都显得私人，而店家提供它们几乎不花钱。"
                  + "餐厅没法让你决定汤要多咸而不多请一位厨师；奶茶店却能在队伍继续前进的同时，"
                  + "让你做六个选择。",
                "",
                "这和咖啡连锁在牛奶与糖浆上发现的窍门是同一条：产品不是那杯液体，而是「这杯是"
                  + "为你做的」这种感觉，而且价格低到明天还可以再来一次。",
                "",
                "## 队伍在卖什么",
                "",
                "看得见的队伍干两件事。它告诉路人这家店值得排，也生产出一张照片：柜台上的一排"
                  + "杯子、塑料杯里的渐变色、一只手把它举到街景前。这杯饮料在被喝掉之前就已经被"
                  + "设计成适合拍照——封口保住了它的样子，珍珠是一层一层的，而不是化开。",
                "",
                "## 钱到底花在哪里",
                "",
                "租金、人力和冷藏占掉了大部分毛利，而不是茶叶。这就是为什么这门生意要靠高人流"
                  + "地段的小店面扩张，也是为什么一份糟糕的租约会关掉一个本来赚钱的品牌。珍珠很"
                  + "便宜，那个街角不便宜。",
                "",
                "## 带走的结论",
                "",
                "珍珠奶茶是个好案例，因为它小到可以完整看清：便宜的原料、可配置的产品、上镜的"
                  + "外形，以及一门依赖位置的生意。几乎每一个消费趋势，都在用不同的口味重复这个"
                  + "组合。",
              ].join("\n"),
            },
          },
          {
            id: "blk_l3_sort",
            title: "把做一杯的步骤排好序",
            type: "game",
            payload: {
              variant: "sort",
              items: [
                { text: "泡好茶并放凉", order: 1 },
                { text: "把糖浆和冰块放进摇杯", order: 2 },
                { text: "摇到冰凉均匀", order: 3 },
                { text: "倒进已经放好珍珠的杯子", order: 4 },
                { text: "封口并递给顾客", order: 5 },
              ],
            },
          },
          {
            id: "blk_l3_quiz",
            title: "检查一下理解",
            type: "quiz",
            payload: {
              passScore: 0.7,
              questions: [
                {
                  id: "q_l3_1",
                  kind: "single",
                  prompt: "为什么奶茶店能提供这么多定制选项？",
                  options: [
                    "提供这些选项几乎不增加成本",
                    "每一单都需要一位训练有素的厨师",
                    "它们会显著提高原料成本",
                    "食品安全法要求如此",
                  ],
                  answer: [0],
                  explanation: "糖、冰和配料都是便宜的变量，真正值钱的是那份「为你而定」的感觉。",
                },
                {
                  id: "q_l3_2",
                  kind: "single",
                  prompt: "一家店的毛利主要被什么占掉？",
                  options: [
                    "租金、人力和冷藏",
                    "茶叶",
                    "木薯珍珠",
                    "塑料杯",
                  ],
                  answer: [0],
                  explanation: "每杯的原料都很便宜，贵的是那个位置和那些人。",
                },
                {
                  id: "q_l3_3",
                  kind: "single",
                  prompt: "看得见的队伍对一家店有什么用？",
                  options: [
                    "传递人气，并制造一个拍照的时刻",
                    "降低原料成本",
                    "让饮料更冰",
                    "缩短员工培训时间",
                  ],
                  answer: [0],
                  explanation: "队伍是社交证明，也是这杯饮料形象的一部分。",
                },
              ],
            },
          },
        ],
      },
    ],
  };
}
