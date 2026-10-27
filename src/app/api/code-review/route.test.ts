import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ review: vi.fn() }));
vi.mock("@/server/code-review", () => ({ requestCodeReview: m.review }));
import { POST } from "./route";
const request = (origin = "http://localhost:3000") =>
  new Request("http://localhost:3000/api/code-review", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: '{"code":"solve()"}',
  });
beforeEach(() => vi.resetAllMocks());
describe("code review HTTP transport", () => {
  it("finishes with a private JSON result", async () => {
    m.review.mockResolvedValue({
      ok: true,
      report: { summary: "Review complete" },
      mock: false,
    });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({
      ok: true,
      report: { summary: "Review complete" },
    });
  });
  it("does not invoke the service for cross-origin submissions", async () => {
    expect((await POST(request("https://other.example"))).status).toBe(403);
    expect(m.review).not.toHaveBeenCalled();
  });
  it("returns failure JSON if the service rejects", async () => {
    m.review.mockRejectedValue(new Error("private backend details"));
    const response = await POST(request());
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      ok: false,
      error: "Code review unavailable. Please retry.",
    });
  });
});
