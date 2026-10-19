import { describe, expect, it } from "vitest";
import { readAllPages } from "../../supabase/functions/_shared/pagedRows";

describe("4blue historical import pagination", () => {
  it("reads historical 2026 sales beyond the first 1000 snapshot rows", async () => {
    const snapshots = Array.from({ length: 2617 }, (_, id) => ({ id, mrr: 65, plan: "PROFIT" }));
    const ranges: number[][] = [];
    const rows = await readAllPages(async (from, to) => {
      ranges.push([from, to]);
      return { data: snapshots.slice(from, to + 1), error: null };
    });
    expect(rows).toHaveLength(2617);
    expect(rows[2616]).toEqual({ id: 2616, mrr: 65, plan: "PROFIT" });
    expect(ranges).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
    expect(new Set(rows.map(row => row.id)).size).toBe(2617);
  });

  it("fails rather than importing a partial dataset when a later page fails", async () => {
    await expect(readAllPages(async (from) => from === 0
      ? { data: Array.from({ length: 1000 }, (_, id) => ({ id })), error: null }
      : { data: null, error: { message: "source unavailable" } },
    )).rejects.toThrow("source unavailable");
  });
});