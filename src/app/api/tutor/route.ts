import { createOpenAI } from "@ai-sdk/openai";
import { type ModelMessage, streamText } from "ai";
import { z } from "zod";

import { getI18n } from "@/i18n/server";
import { trackEvent } from "@/lib/analytics";
import { auth } from "@/lib/auth";
import { contentLanguageFromLocale } from "@/lib/llm/language";
import { isMockMode, llmModel, openaiApiKey } from "@/lib/llm/provider";
import {
  mockTutorReply,
  tutorQuestionPrompt,
  tutorSystemPrompt,
} from "@/lib/llm/prompts/tutor";
import {
  appendTutorMessage,
  loadTutorLessonContext,
  loadTutorMessages,
  resolveTutorSession,
  TUTOR_HISTORY_LIMIT,
} from "@/lib/tutor";

/**
 * Streaming tutor endpoint (P4.3).
 *
 * The client only sends the lesson id and the question: everything the model
 * needs — learner profile, course, lesson and the block the learner is on — is
 * assembled server side so it cannot be spoofed. Both turns are persisted on
 * `TutorMessage`, so reopening the panel replays the conversation.
 *
 * Without an API key (or with `LLM_MOCK=true`) the canned reply is streamed in
 * small chunks instead, which keeps the typing effect and the demo intact.
 */

const requestSchema = z.object({
  lessonId: z.string().min(1),
  message: z.string().trim().min(1).max(2000),
});

const TEMPERATURE = 0.5;
const MOCK_CHUNK_SIZE = 12;
const MOCK_CHUNK_DELAY_MS = 18;
const NO_STORE = { "Cache-Control": "no-store" } as const;

/** Splits a canned reply into chunks so the panel still "types" it out. */
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
      { error: t("server.tutor.invalidRequest") },
      { status: 400, headers: NO_STORE },
    );
  }

  const session = await auth();
  const userId = session?.user?.id;
  if (userId === undefined) {
    return Response.json(
      { error: t("server.tutor.signIn") },
      { status: 401, headers: NO_STORE },
    );
  }

  const loaded = await loadTutorLessonContext(userId, parsed.data.lessonId);
  if (loaded === null) {
    return Response.json(
      { error: t("server.tutor.lessonNotFound") },
      { status: 404, headers: NO_STORE },
    );
  }

  const context = { ...loaded, language };

  const sessionId = await resolveTutorSession(
    userId,
    context.courseId,
    context.lessonId,
    context.lessonTitle,
  );
  const history = await loadTutorMessages(sessionId, TUTOR_HISTORY_LIMIT);

  await appendTutorMessage(sessionId, "user", parsed.data.message);
  await trackEvent("TUTOR_MESSAGE", {
    userId,
    courseId: context.courseId,
    payload: {
      lessonId: context.lessonId,
      blockType: context.blockType,
      characters: parsed.data.message.length,
    },
  });

  const messages: ModelMessage[] = [
    ...history.map(
      (message): ModelMessage => ({
        role: message.role,
        content: message.content,
      }),
    ),
    { role: "user", content: tutorQuestionPrompt(parsed.data.message) },
  ];

  const apiKey = openaiApiKey();
  if (isMockMode() || apiKey === null) {
    const reply = mockTutorReply(context, parsed.data.message);
    await appendTutorMessage(sessionId, "assistant", reply);
    return chunkedTextResponse(reply);
  }

  const openai = createOpenAI({ apiKey });

  const result = streamText({
    model: openai.chat(llmModel()),
    system: tutorSystemPrompt(context),
    messages,
    temperature: TEMPERATURE,
    onFinish: async ({ text }) => {
      await appendTutorMessage(sessionId, "assistant", text);
    },
  });

  return result.toTextStreamResponse({ headers: NO_STORE });
}
