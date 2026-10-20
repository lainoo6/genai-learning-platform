import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ save: vi.fn() }));
vi.mock("@/server/editor", () => ({ saveCourse: m.save }));
import { POST } from "./route";
const request = (origin = "http://localhost:3000") =>
  new Request("http://localhost:3000/api/teach/courses/c", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: '{"title":"Course"}',
  });
const context = { params: Promise.resolve({ id: "c" }) };
beforeEach(() => vi.resetAllMocks());
describe("course save HTTP transport", () => {
  it("returns saved course JSON after persistence completes", async () => {
    m.save.mockResolvedValue({
      ok: true,
      course: { id: "c", title: "Course" },
    });
    const response = await POST(request(), context);
    expect(await response.json()).toEqual({
      ok: true,
      course: { id: "c", title: "Course" },
    });
    expect(m.save).toHaveBeenCalledWith("c", { title: "Course" });
  });
  it("preserves validation or ownership rejection", async () => {
    m.save.mockResolvedValue({ ok: false, error: "Not the course owner" });
    const response = await POST(request(), context);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ ok: false });
  });
  it("rejects cross-origin saves before invoking persistence", async () => {
    expect((await POST(request("https://other.example"), context)).status).toBe(
      403,
    );
    expect(m.save).not.toHaveBeenCalled();
  });
});
