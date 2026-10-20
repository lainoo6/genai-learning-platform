import { afterEach, describe, expect, it, vi } from "vitest";
import { postJson } from "./post-json";
const options = {
  timeoutMs: 1000,
  timeoutMessage: "Timed out",
  failureMessage: "Invalid response",
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe("bounded JSON requests", () => {
  it("returns a JSON result without awaiting a Server Component stream", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        Response.json({ ok: true, report: { summary: "Done" } }),
      );
    vi.stubGlobal("fetch", fetcher);
    expect(
      await postJson("/api/code-review", { code: "x" }, options),
    ).toMatchObject({ ok: true });
    expect(fetcher.mock.calls[0][1]).toMatchObject({
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: '{"code":"x"}',
    });
  });
  it("surfaces a server failure instead of staying busy", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ error: "Not signed in" }, { status: 403 }),
        ),
    );
    await expect(postJson("/api/code-review", {}, options)).rejects.toThrow(
      "Not signed in",
    );
  });
  it("rejects HTML redirects or malformed JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response("<html>Sign in</html>", {
            headers: { "Content-Type": "text/html" },
          }),
        ),
    );
    await expect(postJson("/api/code-review", {}, options)).rejects.toThrow(
      "Invalid response",
    );
  });
  it("times out and aborts an indefinitely pending request", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(() => new Promise(() => {}));
    vi.stubGlobal("fetch", fetcher);
    const result = postJson("/api/code-review", {}, options);
    const rejected = expect(result).rejects.toThrow("Timed out");
    await vi.advanceTimersByTimeAsync(1000);
    await rejected;
    expect(
      (fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].signal
        ?.aborted,
    ).toBe(true);
  });
  it("bounds waiting for the body even if headers have already arrived", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue({
          ok: true,
          headers: new Headers({ "Content-Type": "application/json" }),
          json: () => new Promise(() => {}),
        }),
    );
    const result = postJson("/api/code-review", {}, options);
    const rejected = expect(result).rejects.toThrow("Timed out");
    await vi.advanceTimersByTimeAsync(1000);
    await rejected;
  });
});
