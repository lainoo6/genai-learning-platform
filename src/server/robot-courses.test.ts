import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ auth: vi.fn(), find: vi.fn(), create: vi.fn(), update: vi.fn(), lessonUpdate: vi.fn(), lessonCreate: vi.fn(), eligible: vi.fn(), overrides: vi.fn(), lessonDelete: vi.fn(), stamp: vi.fn(), transaction: vi.fn(), enrolled: vi.fn(), progress: vi.fn(), generate: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: m.auth }));
vi.mock("@/lib/prisma", () => ({ prisma: { course: { findUnique: m.find }, enrollment: { findUnique: m.enrolled }, lessonProgress: { findMany: m.progress }, $transaction: m.transaction } }));
vi.mock("@/lib/llm/provider", () => ({ generateJson: m.generate, isMockMode: () => true }));
import { saveRobotCourse, loadRobotCourseDraft } from "./robot-courses";
import { generateProgrammingHints } from "./programming-hints";
import { loadRobotGame } from "@/lib/programming-game/robot-course-access";
import { createDeliveryPayload } from "@/lib/programming-game/delivery-level";
import { createRobotCourseDraft } from "@/lib/programming-game/robot-course";
let i = 0; const id = () => `00000000-0000-4000-8000-${String(++i).padStart(12, "0")}`;
function fixture() {
  const p = createRobotCourseDraft("en", id); p.updatedAt = "2026-11-02T00:00:00.000Z";
  const row = { id: p.draftId, slug: "robot-game-example", topic: "Robot programming", title: p.title, description: p.description, language: p.language, status: "PUBLISHED", createdById: "teacher", updatedAt: new Date(p.updatedAt), modules: [{ id: "module", lessons: p.levels.map((l, order) => ({ id: l.lessonId, title: l.title, order, blocks: [{ id: l.blockId, type: "game", title: l.title, payload: l.payload }] })) }] };
  return { p, row };
}
beforeEach(() => {
  vi.resetAllMocks(); m.auth.mockResolvedValue({ user: { id: "teacher", role: "INSTRUCTOR" } }); m.find.mockResolvedValue(null);
  m.create.mockImplementation(async ({ data }) => ({ id: data.id, updatedAt: new Date("2026-11-02T00:00:00.000Z") }));
  m.eligible.mockImplementation(async ({ where }) => where.id.in.length); m.overrides.mockResolvedValue(0); m.lessonDelete.mockImplementation(async ({ where }) => ({ count: where.id.in.length }));
  m.update.mockResolvedValue({ count: 1 }); m.stamp.mockResolvedValue({ updatedAt: new Date("2026-11-02T01:00:00.000Z") });
  m.transaction.mockImplementation((fn) => fn({ course: { findUnique: m.find, create: m.create, updateMany: m.update, findUniqueOrThrow: m.stamp }, lesson: { update: m.lessonUpdate, create: m.lessonCreate, count: m.eligible, deleteMany: m.lessonDelete }, userBlockOverride: { count: m.overrides } }));
  m.enrolled.mockResolvedValue({ id: "enrollment" }); m.progress.mockResolvedValue([]); m.generate.mockResolvedValue({ hints: ["[MOCK] Observe first"] });
});
describe("dedicated course persistence", () => {
  it("creates a separate teacher-owned draft with seven level lessons", async () => {
    const p = createRobotCourseDraft("en", id); const result = await saveRobotCourse(null, p);
    expect(result).toMatchObject({ ok: true, courseId: p.draftId });
    const data = m.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ createdById: "teacher", topic: "Robot programming", source: "INSTRUCTOR", status: "DRAFT" });
    expect(data.slug).toMatch(/^robot-game-/); expect(data.modules.create.lessons.create).toHaveLength(7);
  });
  it("reuses an existing creation identity after a network retry", async () => {
    const { p, row } = fixture(); m.find.mockResolvedValue(row);
    expect(await saveRobotCourse(null, p)).toMatchObject({ ok: true, courseId: row.id }); expect(m.create).not.toHaveBeenCalled();
  });
  it("updates only owned levels and preserves their lesson/block identities", async () => {
    const { p, row } = fixture(); m.find.mockResolvedValue(row); p.levels[0].title = "Updated level";
    expect(await saveRobotCourse(row.id, p)).toMatchObject({ ok: true });
    expect(m.lessonUpdate).toHaveBeenCalledTimes(1); expect(m.lessonUpdate.mock.calls[0][0]).toMatchObject({ where: { id: p.levels[0].lessonId }, data: { blocks: [{ id: p.levels[0].blockId }] } });
  });
  it("adds new levels without removing old history-bearing lessons", async () => {
    const { p, row } = fixture(); m.find.mockResolvedValue(row); p.levels.push({ ...p.levels[0], lessonId: id(), blockId: id() });
    expect(await saveRobotCourse(row.id, p)).toMatchObject({ ok: true }); expect(m.lessonCreate).toHaveBeenCalledOnce();
  });
  it.each(["owner", "stamp", "deleted", "identity"])("rejects unsafe update %s before writing any lessons", async (kind) => {
    const { p, row } = fixture();
    if (kind === "owner") row.createdById = "someone-else";
    if (kind === "stamp") p.updatedAt = "2020-01-01T00:00:00.000Z";
    if (kind === "deleted") p.levels.pop();
    if (kind === "identity") p.levels[0].blockId = id();
    m.find.mockResolvedValue(row); expect(await saveRobotCourse(row.id, p)).toMatchObject({ ok: false }); expect(m.lessonUpdate).not.toHaveBeenCalled();
  });
  it("rejects invalid map/reference or learner access before a transaction", async () => {
    const p = createRobotCourseDraft("en", id); p.levels[0].payload.allowed = [];
    expect(await saveRobotCourse(null, p)).toMatchObject({ ok: false }); expect(m.transaction).not.toHaveBeenCalled();
    m.auth.mockResolvedValue({ user: { id: "student", role: "LEARNER" } });
    expect(await saveRobotCourse(null, createRobotCourseDraft("en", id))).toMatchObject({ ok: false }); expect(m.transaction).not.toHaveBeenCalled();
  });
  it("rejects an optimistic update that loses the atomic course stamp check", async () => {
    const { p, row } = fixture(); m.find.mockResolvedValue(row); m.update.mockResolvedValue({ count: 0 });
    expect(await saveRobotCourse(row.id, p)).toMatchObject({ ok: false }); expect(m.lessonUpdate).not.toHaveBeenCalled();
  });
  it("loads the saved game course as the same editable draft", async () => {
    const { p, row } = fixture(); m.find.mockResolvedValue(row);
    expect(await loadRobotCourseDraft(row.id)).toMatchObject({ courseId: row.id, draft: { draftId: p.draftId, levels: p.levels } });
  });
});
describe("dedicated player access", () => {
  it("preview reads no enrollments or student progress", async () => {
    const { row } = fixture(); m.find.mockResolvedValue(row);
    expect(await loadRobotGame(row.id, true)).toMatchObject({ title: row.title }); expect(m.enrolled).not.toHaveBeenCalled(); expect(m.progress).not.toHaveBeenCalled();
  });
  it("requires enrollment and a published course for learners", async () => {
    const { row } = fixture(); m.find.mockResolvedValue(row); m.auth.mockResolvedValue({ user: { id: "student", role: "LEARNER" } });
    expect(await loadRobotGame(row.id, false)).not.toBeNull();
    m.enrolled.mockResolvedValue(null); expect(await loadRobotGame(row.id, false)).toBeNull();
    m.enrolled.mockResolvedValue({ id: "enrolled" }); row.status = "DRAFT"; expect(await loadRobotGame(row.id, false)).toBeNull();
  });
  it("does not let a student claim preview access or expose someone else's draft", async () => {
    const { row } = fixture(); row.status = "DRAFT"; m.find.mockResolvedValue(row);
    m.auth.mockResolvedValue({ user: { id: "student", role: "LEARNER" } }); expect(await loadRobotGame(row.id, true)).toBeNull();
    m.auth.mockResolvedValue({ user: { id: "other-teacher", role: "INSTRUCTOR" } }); expect(await loadRobotGame(row.id, true)).toBeNull();
  });
  it("returns only this learner's saved level completions", async () => {
    const { p, row } = fixture(); m.find.mockResolvedValue(row); m.auth.mockResolvedValue({ user: { id: "student", role: "LEARNER" } });
    m.progress.mockResolvedValue([{ lessonId: p.levels[0].lessonId, completedBlocks: [p.levels[0].blockId] }]);
    const result = await loadRobotGame(row.id, false); expect(result?.levels[0].completed).toBe(true); expect(result?.levels[1].completed).toBe(false);
    expect(m.progress.mock.calls[0][0].where.userId).toBe("student");
  });
});
describe("teacher AI hint access", () => {
  it("uses the shared audited provider and clearly labels mock mode", async () => {
    const { p } = fixture(); const result = await generateProgrammingHints({ locale: "zh", payload: p.levels[0].payload });
    expect(result).toMatchObject({ ok: true, mock: true }); expect(m.generate.mock.calls[0][2]).toMatchObject({ usage: "programming-hints", userId: "teacher" });
  });
  it("rejects another teacher's course or learner calls before generation", async () => {
    const { p, row } = fixture(); row.createdById = "other"; m.find.mockResolvedValue(row);
    expect(await generateProgrammingHints({ courseId: row.id, locale: "en", payload: p.levels[0].payload })).toMatchObject({ ok: false });
    m.auth.mockResolvedValue({ user: { id: "student", role: "LEARNER" } });
    expect(await generateProgrammingHints({ locale: "en", payload: p.levels[0].payload })).toMatchObject({ ok: false }); expect(m.generate).not.toHaveBeenCalled();
  });
  it("does not send an invalid reference to the model", async () => {
    const { p } = fixture(); p.levels[0].payload.allowed = [];
    expect(await generateProgrammingHints({ locale: "en", payload: p.levels[0].payload })).toMatchObject({ ok: false }); expect(m.generate).not.toHaveBeenCalled();
  });
});

describe("delivery course persistence and hint boundaries", () => {
  it("persists a teacher delivery map and its executable reference answer", async () => {
    const p = createRobotCourseDraft("en", id); p.levels[0].payload = createDeliveryPayload("en", 4);
    expect(await saveRobotCourse(null, p)).toMatchObject({ ok: true });
    const block = m.create.mock.calls[0][0].data.modules.create.lessons.create[0].blocks[0];
    expect(block.payload.customLevel.delivery.items).toHaveLength(4); expect(block.payload.referenceProgram[0].op).toBe("pickup");
  });
  it("rejects a carried-but-not-delivered reference before opening a transaction or generating hints", async () => {
    const p = createRobotCourseDraft("en", id); const payload = createDeliveryPayload("en"); payload.referenceProgram = payload.referenceProgram!.slice(0, 2); p.levels[0].payload = payload;
    expect(await saveRobotCourse(null, p)).toMatchObject({ ok: false }); expect(m.transaction).not.toHaveBeenCalled();
    expect(await generateProgrammingHints({ locale: "en", payload })).toMatchObject({ ok: false }); expect(m.generate).not.toHaveBeenCalled();
  });
  it("loads saved parcel starts, destinations and reference without losing fields", async () => {
    const { p, row } = fixture(); const payload = createDeliveryPayload("zh"); p.levels[0].payload = payload; row.modules[0].lessons[0].blocks[0].payload = payload; m.find.mockResolvedValue(row);
    expect((await loadRobotCourseDraft(row.id))?.draft.levels[0].payload).toEqual(payload);
  });
});

describe("robot level deletion and ordering", () => {
  it("persists a new order while preserving all lesson and block identities", async () => {
    const { p, row } = fixture(); m.find.mockResolvedValue(row);
    p.levels.reverse(); expect(await saveRobotCourse(row.id, p)).toMatchObject({ ok: true });
    const changed = p.levels.filter((level, order) => row.modules[0].lessons.find(old => old.id === level.lessonId)?.order !== order);
    expect(m.lessonUpdate).toHaveBeenCalledTimes(changed.length);
    for (const level of changed) expect(m.lessonUpdate).toHaveBeenCalledWith(expect.objectContaining({ where: { id: level.lessonId }, data: expect.objectContaining({ order: p.levels.indexOf(level) }) }));
    expect(m.lessonDelete).not.toHaveBeenCalled(); expect(m.eligible).not.toHaveBeenCalled();
  });
  it("deletes only explicitly acknowledged history-free levels and reindexes the remainder", async () => {
    const { p, row } = fixture(); m.find.mockResolvedValue(row); const removed = p.levels.splice(2, 1)[0];
    expect(await saveRobotCourse(row.id, p, [removed.lessonId])).toMatchObject({ ok: true });
    expect(m.eligible.mock.calls[0][0].where).toMatchObject({ id: { in: [removed.lessonId] }, moduleId: "module", progress: { none: {} }, activityAttempts: { none: {} }, playthroughs: { none: {} }, gameActivityVersions: { none: {} }, feedback: { none: {} } });
    expect(m.overrides).toHaveBeenCalledWith({ where: { lessonId: { in: [removed.lessonId] } } });
    expect(m.lessonDelete.mock.calls[0][0].where).toEqual(m.eligible.mock.calls[0][0].where);
    expect(m.lessonUpdate).toHaveBeenCalledTimes(4); expect(m.lessonUpdate.mock.calls[0][0].data.order).toBe(2);
    expect(m.transaction.mock.calls[0][1]).toMatchObject({ isolationLevel: "Serializable" });
  });
  it.each(["records", "overrides"])("protects lessons with %s before writing course or lessons", async (kind) => {
    const { p, row } = fixture(); m.find.mockResolvedValue(row); const removed = p.levels.pop()!;
    if (kind === "records") m.eligible.mockResolvedValue(0); else m.overrides.mockResolvedValue(1);
    expect(await saveRobotCourse(row.id, p, [removed.lessonId])).toMatchObject({ ok: false, error: expect.stringContaining("learning records") });
    expect(m.update).not.toHaveBeenCalled(); expect(m.lessonDelete).not.toHaveBeenCalled(); expect(m.lessonUpdate).not.toHaveBeenCalled();
  });
  it.each(["wrong", "extra", "duplicate"])("rejects mismatched deletion acknowledgement: %s", async (kind) => {
    const { p, row } = fixture(); m.find.mockResolvedValue(row); const removed = p.levels.pop()!;
    const ids = kind === "wrong" ? [id()] : kind === "extra" ? [removed.lessonId, id()] : [removed.lessonId, removed.lessonId];
    expect(await saveRobotCourse(row.id, p, ids)).toMatchObject({ ok: false }); expect(m.update).not.toHaveBeenCalled(); expect(m.lessonDelete).not.toHaveBeenCalled();
  });
  it("rejects removing every level before entering the transaction", async () => {
    const { p, row } = fixture(); const ids = p.levels.map((l) => l.lessonId); p.levels = [];
    expect(await saveRobotCourse(row.id, p, ids)).toMatchObject({ ok: false }); expect(m.transaction).not.toHaveBeenCalled();
  });
  it.each(["owner", "stale"])("rejects %s deletions without inspecting or mutating lessons", async (kind) => {
    const { p, row } = fixture(); m.find.mockResolvedValue(row); const removed = p.levels.pop()!;
    if (kind === "owner") row.createdById = "other"; else p.updatedAt = "2020-01-01T00:00:00.000Z";
    expect(await saveRobotCourse(row.id, p, [removed.lessonId])).toMatchObject({ ok: false }); expect(m.eligible).not.toHaveBeenCalled(); expect(m.lessonDelete).not.toHaveBeenCalled();
  });
  it("stops when the final guarded deletion finds a newly protected lesson", async () => {
    const { p, row } = fixture(); m.find.mockResolvedValue(row); const removed = p.levels.pop()!; m.lessonDelete.mockResolvedValue({ count: 0 });
    expect(await saveRobotCourse(row.id, p, [removed.lessonId])).toMatchObject({ ok: false }); expect(m.lessonUpdate).not.toHaveBeenCalled();
  });
});

describe("robot course save transaction budget", () => {
  it("uses a bounded transaction budget below the client request timeout", async () => {
    const {p,row}=fixture();m.find.mockResolvedValue(row);
    expect(await saveRobotCourse(row.id,p)).toMatchObject({ok:true});
    expect(m.transaction.mock.calls[0][1]).toEqual({isolationLevel:"Serializable",maxWait:5000,timeout:20000});
    expect(m.lessonUpdate).not.toHaveBeenCalled();
  });
  it("does not rewrite unchanged JSONB when object key order differs", async () => {
    const {p,row}=fixture();
    // Rebuild the full JSON value with keys reordered recursively, as JSONB can do.
    function reorder(value: unknown): unknown {return Array.isArray(value)?value.map(reorder):value&&typeof value==="object"?Object.fromEntries(Object.entries(value).reverse().map(([k,v])=>[k,reorder(v)])):value;}
    row.modules[0].lessons=row.modules[0].lessons.map(l=>({...l,blocks:reorder(l.blocks) as typeof l.blocks}));
    m.find.mockResolvedValue(row);expect(await saveRobotCourse(row.id,p)).toMatchObject({ok:true});expect(m.lessonUpdate).not.toHaveBeenCalled();
  });
  it("writes changed reference content even when the lesson title and order are unchanged", async () => {
    const {p,row}=fixture();row.modules[0].lessons=structuredClone(row.modules[0].lessons);p.levels[0].payload.hints=["A new hint"];
    m.find.mockResolvedValue(row);expect(await saveRobotCourse(row.id,p)).toMatchObject({ok:true});expect(m.lessonUpdate).toHaveBeenCalledOnce();
  });
  it("reports expired transactions as a failed save without an automatic replay", async () => {
    const p=createRobotCourseDraft("zh",id);m.transaction.mockRejectedValue(Object.assign(new Error("Transaction not found"),{code:"P2028"}));
    expect(await saveRobotCourse(null,p)).toMatchObject({ok:false,error:expect.stringContaining("本次保存未确认成功")});expect(m.transaction).toHaveBeenCalledOnce();
  });
});
