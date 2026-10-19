import { type ModelMessage, streamText } from "ai";
import { z } from "zod";

import { getI18n } from "@/i18n/server";
import { auth } from "@/lib/auth";
import { blockListSchema } from "@/lib/blocks/schema";
import { contentLanguageFromLocale } from "@/lib/llm/language";
import { isMockMode, llmApiKey, llmClient, llmModel, llmProviderOptions } from "@/lib/llm/provider";
import {
  mockRoleplayReply,
  roleplaySystemPrompt,
  roleplayTurnSchema,
  ROLEPLAY_MAX_TRANSCRIPT,
} from "@/lib/llm/prompts/roleplay";
import { prisma } from "@/lib/prisma";

/**
 * In-character streaming endpoint for the roleplay block (P4.5).
 *
 * The browser sends the lesson and block ids plus the conversation so far; the
 * persona, scenario and goal are read from the stored block server side, so a
 * client cannot invent a character or talk the model out of the scenario.
 *
 * Without an API key (or with `LLM_MOCK=true`) one of eight canned lines is
 * streamed back instead, which keeps the typing effect and the demo intact.
 */

const requestSchema = z.object({
  lessonId: z.string().min(1),
  blockId: z.string().min(1),
  message: z.string().trim().min(1).max(2000),
  history: z.array(roleplayTurnSchema).max(ROLEPLAY_MAX_TRANSCRIPT).default([]),
});

const TEMPERATURE = 0.6;
const MOCK_CHUNK_SIZE = 10;
const MOCK_CHUNK_DELAY_MS = 16;
const NO_STORE = { "Cache-Control": "no-store" } as const;

/** Splits a canned reply into chunks so the chat still "types" it out. */
function chunkedTextResponse(text: string): Response {
  const encoder = new TextEncoder();
  const chunks =
    text.match(new RegExp(`[\\s\\S]{1,${MOCK_CHUNK_SIZE}}`, "gu")) ?? [];

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
        await new Promise((resolve) => {
          setTimeout(resolve, MOCK_CHUNK_DELAY_MS);
        });
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { ...NO_STORE, "Content-Type": "text/plain; charset=utf-8" },
  });
}

export async function POST(request: Request): Promise<Response> {
  const { locale, t } = await getI18n();
  const language = contentLanguageFromLocale(locale);
  const body: unknown = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json(
      { error: t("server.roleplay.invalidRequest") },
      { status: 400, headers: NO_STORE },
    );
  }

  const session = await auth();
  if (session?.user?.id === undefined) {
    return Response.json(
      { error: t("server.roleplay.signInChat") },
      { status: 401, headers: NO_STORE },
    );
  }

  const lesson = await prisma.lesson.findUnique({
    where: { id: parsed.data.lessonId },
    select: { blocks: true },
  });

  if (lesson === null) {
    return Response.json(
      { error: t("server.roleplay.lessonNotFound") },
      { status: 404, headers: NO_STORE },
    );
  }

  const parsedBlocks = blockListSchema.safeParse(lesson.blocks);
  const block = parsedBlocks.success
    ? parsedBlocks.data.find(
        (candidate) =>
          candidate.id === parsed.data.blockId && candidate.type === "roleplay",
      )
    : undefined;

  if (block === undefined || block.type !== "roleplay") {
    return Response.json(
      { error: t("server.roleplay.blockNotFound") },
      { status: 404, headers: NO_STORE },
    );
  }

  const { history, message } = parsed.data;

  if (isMockMode()) {
    const assistantTurns = history.filter(
      (turn) => turn.role === "assistant",
    ).length;
    return chunkedTextResponse(mockRoleplayReply(assistantTurns, language));
  }

  const apiKey = llmApiKey();
  if (apiKey === null) {
    return Response.json(
      { error: t("server.roleplay.unavailable") },
      { status: 503, headers: NO_STORE },
    );
  }

  const messages: ModelMessage[] = [
    ...history.map(
      (turn): ModelMessage => ({ role: turn.role, content: turn.content }),
    ),
    { role: "user", content: message },
  ];

  const openai = llmClient();
  const result = streamText({
    model: openai.chat(llmModel()),
    system: roleplaySystemPrompt(block, language),
    messages,
    temperature: TEMPERATURE,
    providerOptions: llmProviderOptions(),
  });

  return result.toTextStreamResponse({ headers: NO_STORE });
}
