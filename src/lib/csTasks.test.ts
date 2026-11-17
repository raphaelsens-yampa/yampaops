import { describe, it, expect } from "vitest";
import { taskBucket, taskCounters, filterTasks, type CsTask } from "./csTasks";
const now = new Date("2026-11-17T12:00:00Z"); // 09:00 SP
const t = (p: Partial<CsTask>): CsTask => ({ id: Math.random().toString(), client_email: "a@x.com", client_name: null, portfolio_id: null, title: "T", description: null, task_type: "outro", priority: "media", status: "pendente", due_at: now.toISOString(), completed_at: null, assigned_to: "u1", created_by: "u1", created_at: "", ...p });
describe("csTasks", () => {
  it("open task past due is overdue", () => expect(taskBucket(t({ due_at: "2026-11-17T11:00:00Z" }), now)).toBe("atrasada"));
  it("later today (SP) is today", () => expect(taskBucket(t({ due_at: "2026-11-18T02:00:00Z" }), now)).toBe("hoje"));
  it("within 7 days is week", () => expect(taskBucket(t({ due_at: "2026-11-24T12:00:00Z" }), now)).toBe("semana"));
  it("completed task is never overdue", () => expect(taskBucket(t({ status: "concluida", due_at: "2026-11-01T00:00:00Z" }), now)).toBe("fechada"));
  it("counts completed this month", () => expect(taskCounters([t({ status: "concluida", completed_at: "2026-11-05T12:00:00Z" }), t({ status: "concluida", completed_at: "2026-10-05T12:00:00Z" })], now).concluidasMes).toBe(1));
  it("mine filter keeps only assigned tasks", () => expect(filterTasks([t({}), t({ assigned_to: "u2" })], { mine: true, status: "todas", period: "todas", priority: "todas", search: "" }, "u1", now)).toHaveLength(1));
});
