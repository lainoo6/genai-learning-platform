import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { MOCK_MARKER, mockText, registerMock } from "@/lib/llm/mock";
import type { LlmCompleteRequest } from "@/lib/llm/provider";
import {
  generateJson,
  isMockMode,
  LlmValidationError,
  openaiApiKey,
} from "@/lib/llm/provider";

const answerSchema = z.object({
  title: z.string(),
  body: z.string(),
});

const ENV_KEYS = ["OPENAI_API_KEY", "LLM_MOCK", "LLM_MODEL"] as const;
const savedEnv = new Map<string, string | undefined>();

const { createJob, createdJobs } = vi.hoisted(() => {
  const jobs: Record<string, unknown>[] = [];
  const create = vi.fn(async (args: { data: Record<string, unknown> }) => {
    jobs.push(args.data);
    return { id: "job_1" };
  });

  return { createJob: create, createdJobs: jobs };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    generationJob: {
      create: (args: { data: Record<string, unknown> }) => createJob(args),
    },
  },
}));

/** Switches the service layer to real mode without a network call. */
function useRealMode(): void {
  process.env.OPENAI_API_KEY = "test-key";
  delete process.env.LLM_MOCK;
}

function useMockMode(): void {
  delete process.env.OPENAI_API_KEY;
  delete process.env.LLM_MOCK;
}

/** Model stub that records every prompt it was given. */
function stubModel(replies: string[]) {
  const prompts: string[] = [];
  const complete = vi.fn(async (request: LlmCompleteRequest) => {
    prompts.push(request.prompt);
    return replies[Math.min(prompts.length - 1, replies.length - 1)] ?? "";
  });

  return { complete, prompts };
}

beforeEach(() => {
  createdJobs.length = 0;
  createJob.mockClear();
  for (const key of ENV_KEYS) {
    savedEnv.set(key, process.env[key]);
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = savedEnv.get(key);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

describe("isMockMode", () => {
  it("is on when no key is configured", () => {
    useMockMode();

    expect(openaiApiKey()).toBeNull();
    expect(isMockMode()).toBe(true);
  });

  it("is forced on by LLM_MOCK even with a key present", () => {
    process.env.OPENAI_API_KEY = "test-key";
    process.env.LLM_MOCK = "true";

    expect(isMockMode()).toBe(true);
  });

  it("is off when a key is present and mock is not forced", () => {
    useRealMode();

    expect(isMockMode()).toBe(false);
  });
});

describe("generateJson in mock mode", () => {
  it("returns the registered fallback, validated and [MOCK] marked", async () => {
    useMockMode();
    const { complete } = stubModel(['{"title":"real","body":"real"}']);
    registerMock("tutor", () => ({
      title: "How software is built",
      body: mockText("Start with the reading block, then try the quiz."),
    }));

    const result = await generateJson(answerSchema, "Explain this block", {
      usage: "tutor",
      complete,
    });

    expect(result.title).toBe("How software is built");
    expect(result.body.startsWith(MOCK_MARKER)).toBe(true);
    expect(complete).not.toHaveBeenCalled();
    expect(createJob).not.toHaveBeenCalled();
  });

  it("rejects a fallback that does not match the schema", async () => {
    useMockMode();
    registerMock("tutor", () => ({ title: "missing body" }));

    await expect(
      generateJson(answerSchema, "Explain this block", { usage: "tutor" }),
    ).rejects.toBeInstanceOf(LlmValidationError);
  });
});

describe("generateJson in real mode", () => {
  it("parses a fenced JSON reply and records a successful job", async () => {
    useRealMode();
    const { complete } = stubModel(['```json\n{"title":"T","body":"B"}\n```']);

    const result = await generateJson(answerSchema, "Summarise this lesson", {
      usage: "tutor",
      complete,
      userId: "user_1",
    });

    expect(result).toEqual({ title: "T", body: "B" });
    expect(complete).toHaveBeenCalledTimes(1);
    expect(createdJobs).toHaveLength(1);
    expect(createdJobs[0]?.status).toBe("SUCCESS");
    expect(createdJobs[0]?.createdById).toBe("user_1");
  });

  it("retries once on broken JSON and then throws LlmValidationError", async () => {
    useRealMode();
    const { complete, prompts } = stubModel(["Sorry, no JSON this time."]);

    await expect(
      generateJson(answerSchema, "Summarise this lesson", {
        usage: "tutor",
        complete,
      }),
    ).rejects.toBeInstanceOf(LlmValidationError);

    expect(complete).toHaveBeenCalledTimes(2);
    expect(prompts[1]).toContain("Your previous reply was rejected");
    expect(createdJobs).toHaveLength(1);
    expect(createdJobs[0]?.status).toBe("FAILED");
  });

  it("returns data when the retried reply satisfies the schema", async () => {
    useRealMode();
    const { complete, prompts } = stubModel([
      '{"title":"Only a title"}',
      '{"title":"T","body":"B"}',
    ]);

    const result = await generateJson(answerSchema, "Summarise this lesson", {
      usage: "tutor",
      complete,
    });

    expect(result).toEqual({ title: "T", body: "B" });
    expect(complete).toHaveBeenCalledTimes(2);
    expect(prompts[1]).toContain("Your previous reply was rejected");
    expect(createdJobs[0]?.status).toBe("SUCCESS");
  });
});
