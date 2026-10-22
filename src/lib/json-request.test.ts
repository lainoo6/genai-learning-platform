import { afterEach, describe, expect, it, vi } from "vitest";
import { readJsonPost } from "./json-request";
function request(
  origin: string,
  body = '{"answer":1}',
  type = "application/json",
) {
  return new Request("http://localhost:3000/api/code-review", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": type },
    body,
  });
}
afterEach(() => vi.unstubAllEnvs());
describe("JSON endpoint origin and payload guards", () => {
  it("accepts same-origin JSON", async () =>
    expect(await readJsonPost(request("http://localhost:3000"), 100)).toEqual({
      answer: 1,
    }));
  it("rejects an unrelated origin", async () =>
    await expect(
      readJsonPost(request("https://attacker.example"), 100),
    ).rejects.toMatchObject({ status: 403 }));
  it("does not trust an arbitrary x-forwarded-host header", async () => {
    const req = request("https://attacker.example");
    req.headers.set("x-forwarded-host", "attacker.example");
    await expect(readJsonPost(req, 100)).rejects.toMatchObject({ status: 403 });
  });
  it("accepts only the current Codespace forwarding domain", async () => {
    vi.stubEnv("CODESPACE_NAME", "my-space");
    vi.stubEnv("GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN", "app.github.dev");
    expect(
      await readJsonPost(request("https://my-space-3000.app.github.dev"), 100),
    ).toEqual({ answer: 1 });
    await expect(
      readJsonPost(request("https://other-space-3000.app.github.dev"), 100),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("rejects non-JSON, invalid JSON and oversized bodies", async () => {
    await expect(
      readJsonPost(request("http://localhost:3000", "x", "text/plain"), 100),
    ).rejects.toMatchObject({ status: 415 });
    await expect(
      readJsonPost(request("http://localhost:3000", "{x"), 100),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      readJsonPost(request("http://localhost:3000"), 3),
    ).rejects.toMatchObject({ status: 413 });
  });
});
