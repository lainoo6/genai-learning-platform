import { createOpenAI, type OpenAIChatLanguageModelOptions } from "@ai-sdk/openai";
import { generateText } from "ai";
import type { Prisma } from "@prisma/client";
import type { ZodError, ZodType } from "zod";

import { mockHandlerFor, type LlmUsage } from "@/lib/llm/mock";
import { prisma } from "@/lib/prisma";

/**
 * Single entry point for every LLM call on the platform (docs/plan/01 §6).
 *
 * `generateJson` owns three responsibilities so no caller has to repeat them:
 * mock degradation (no key / `LLM_MOCK=true`), Zod validation with one retry,
 * and the GenerationJob audit trail.
 */

const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";
const DEFAULT_TEMPERATURE = 0.4;
const DEFAULT_MAX_ATTEMPTS = 2;

const JSON_ONLY_SYSTEM_PROMPT =
  "You are a precise teaching assistant. Reply with a single JSON value only — no prose, no code fences.";

export type LlmCompleteRequest = {
  system: string;
  prompt: string;
  temperature: number;
};

/**
 * The raw model call. Exposed as an option so tests can exercise the retry and
 * validation logic without touching the network.
 */
export type LlmComplete = (request: LlmCompleteRequest) => Promise<string>;

export type GenerateJsonOptions = {
  /** Usage key: picks the mock fallback and tags the GenerationJob. */
  usage: LlmUsage;
  system?: string;
  temperature?: number;
  /** Total attempts, default 2 (first try + one validation retry). */
  maxAttempts?: number;
  /** Author of the generation; stored on the GenerationJob. */
  userId?: string;
  courseId?: string;
  /** Extra context stored on the GenerationJob `input` for auditing. */
  input?: unknown;
  /** Test seam: replaces the real model call. */
  complete?: LlmComplete;
};

/** Base class for every error raised by the LLM service layer. */
export class LlmError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LlmError";
  }
}

/** Raised when the model output never satisfies the caller's schema. */
export class LlmValidationError extends LlmError {
  readonly issues: readonly string[];

  constructor(message: string, issues: readonly string[]) {
    super(message);
    this.name = "LlmValidationError";
    this.issues = issues;
  }
}

function readEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  return value === undefined || value.length === 0 ? null : value;
}

function isFlagEnabled(value: string | null): boolean {
  return value !== null && ["true", "1", "yes"].includes(value.toLowerCase());
}

export function llmApiKey(): string | null {
  return readEnv("LLM_API_KEY");
}

/**
 * Optional OpenAI-compatible gateway (e.g. OpenRouter). When unset the client
 * talks to api.openai.com directly.
 */
export function llmBaseUrl(): string | null {
  return readEnv("LLM_BASE_URL");
}

/**
 * True when no LLM key is configured or `LLM_MOCK` is switched on. Read at
 * call time (not at import time) so tests and runtime config changes apply.
 */
export function isMockMode(): boolean {
  return isFlagEnabled(readEnv("LLM_MOCK")) || llmApiKey() === null;
}

/** Model actually used: `LLM_MODEL` when set, otherwise the default. */
export function llmModel(): string {
  return readEnv("LLM_MODEL") ?? DEFAULT_OPENAI_MODEL;
}

/**
 * Client shared by every LLM call. `LLM_BASE_URL` redirects it to any
 * OpenAI-compatible gateway, so call sites never build their own client.
 */
export function llmClient() {
  const apiKey = llmApiKey();
  if (apiKey === null) {
    throw new LlmError(
      "LLM_API_KEY is not configured. Set it or enable LLM_MOCK=true.",
    );
  }

  const baseURL = llmBaseUrl();
  return createOpenAI(baseURL === null ? { apiKey } : { apiKey, baseURL });
}

/**
 * Keeps reasoning short so the first token arrives sooner. OpenRouter maps
 * `reasoningEffort` onto its own effort setting; plain OpenAI rejects the field
 * for non-reasoning models, so it is only sent to the OpenRouter gateway.
 */
export function llmProviderOptions():
  | { openai: OpenAIChatLanguageModelOptions }
  | undefined {
  const baseURL = llmBaseUrl();
  if (baseURL === null || !baseURL.includes("openrouter.ai")) {
    return undefined;
  }

  return { openai: { reasoningEffort: "minimal" } };
}

async function defaultComplete(request: LlmCompleteRequest): Promise<string> {
  const openai = llmClient();
  const { text } = await generateText({
    model: openai.chat(llmModel()),
    system: request.system,
    prompt: request.prompt,
    temperature: request.temperature,
    providerOptions: llmProviderOptions(),
  });

  return text;
}

/** Strips markdown fences and any prose wrapped around the JSON value. */
export function extractJsonPayload(raw: string): string {
  const trimmed = raw.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  const body = (fenced?.[1] ?? trimmed).trim();

  const objectStart = body.indexOf("{");
  const arrayStart = body.indexOf("[");
  const candidates = [objectStart, arrayStart].filter((index) => index >= 0);

  if (candidates.length === 0) {
    return body;
  }

  const start = Math.min(...candidates);
  const end = Math.max(body.lastIndexOf("}"), body.lastIndexOf("]"));

  return end > start ? body.slice(start, end + 1) : body.slice(start);
}

function describeIssues(error: ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.map((segment) => String(segment)).join(".");
    return path.length > 0 ? `${path}: ${issue.message}` : issue.message;
  });
}

type ParseResult<T> = { ok: true; data: T } | { ok: false; issues: string[] };

function parseModelOutput<T>(
  schema: ZodType<T>,
  raw: string,
): ParseResult<T> {
  let value: unknown;
  try {
    value = JSON.parse(extractJsonPayload(raw));
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : "unknown parse error";
    return { ok: false, issues: [`The reply is not valid JSON (${detail}).`] };
  }

  const parsed = schema.safeParse(value);
  if (parsed.success) {
    return { ok: true, data: parsed.data };
  }

  return { ok: false, issues: describeIssues(parsed.error) };
}

/** Appends the previous validation failures to the original prompt. */
function retryPrompt(prompt: string, issues: readonly string[]): string {
  return [
    prompt,
    "",
    "Your previous reply was rejected:",
    ...issues.map((issue) => `- ${issue}`),
    "",
    "Reply again with a single JSON value only (no prose, no code fences) that fixes every issue above.",
  ].join("\n");
}

type JobEntry = {
  usage: LlmUsage;
  status: "SUCCESS" | "FAILED";
  prompt: string;
  input: unknown;
  output: unknown;
  userId: string | undefined;
  courseId: string | undefined;
};

/**
 * Audit trail for a generation (docs/plan/01 §6). The audit must never break
 * the caller, so write failures are logged and swallowed.
 */
async function recordGenerationJob(entry: JobEntry): Promise<void> {
  try {
    await prisma.generationJob.create({
      data: {
        type: entry.usage.toUpperCase(),
        input: {
          prompt: entry.prompt,
          request: entry.input ?? null,
        } as Prisma.InputJsonValue,
        output: entry.output as Prisma.InputJsonValue,
        status: entry.status,
        createdById: entry.userId ?? "system",
        courseId: entry.courseId ?? null,
      },
    });
  } catch (error: unknown) {
    console.error("[llm] failed to record GenerationJob", error);
  }
}

function generateMockJson<T>(
  schema: ZodType<T>,
  prompt: string,
  usage: LlmUsage,
): T {
  const handler = mockHandlerFor(usage);
  if (handler === null) {
    throw new LlmError(
      `No mock fallback is registered for usage "${usage}". Register one with registerMock("${usage}", ...).`,
    );
  }

  const parsed = schema.safeParse(handler({ usage, prompt }));
  if (!parsed.success) {
    throw new LlmValidationError(
      `The mock fallback for "${usage}" does not match the expected schema.`,
      describeIssues(parsed.error),
    );
  }

  return parsed.data;
}

/**
 * Generates data matching `schema`.
 *
 * Mock mode returns the registered fallback for `options.usage`. Otherwise the
 * model is asked for JSON, the reply is validated, and a single retry with the
 * validation errors appended is made before giving up.
 *
 * @throws LlmValidationError when the output never matches `schema`.
 */
export async function generateJson<T>(
  schema: ZodType<T>,
  prompt: string,
  options: GenerateJsonOptions,
): Promise<T> {
  if (isMockMode()) {
    return generateMockJson(schema, prompt, options.usage);
  }

  const complete = options.complete ?? defaultComplete;
  const maxAttempts = Math.max(1, options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);
  const system = options.system ?? JSON_ONLY_SYSTEM_PROMPT;
  const temperature = options.temperature ?? DEFAULT_TEMPERATURE;

  let issues: readonly string[] = [];
  let lastOutput = "";

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const attemptPrompt = attempt === 1 ? prompt : retryPrompt(prompt, issues);
    lastOutput = await complete({ system, prompt: attemptPrompt, temperature });

    const parsed = parseModelOutput(schema, lastOutput);
    if (parsed.ok) {
      await recordGenerationJob({
        usage: options.usage,
        status: "SUCCESS",
        prompt,
        input: options.input,
        output: parsed.data,
        userId: options.userId,
        courseId: options.courseId,
      });
      return parsed.data;
    }

    issues = parsed.issues;
  }

  await recordGenerationJob({
    usage: options.usage,
    status: "FAILED",
    prompt,
    input: options.input,
    output: { output: lastOutput, issues: [...issues] },
    userId: options.userId,
    courseId: options.courseId,
  });

  throw new LlmValidationError(
    `The model did not return data matching the schema after ${maxAttempts} attempt(s).`,
    issues,
  );
}
