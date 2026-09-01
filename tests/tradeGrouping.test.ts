import { describe, it, expect } from "vitest";
import { groupExecutions } from "@/lib/tradeGrouping";

/** Un trade de la page : même forme que ce que Supabase rend. */
const tr = (over: Record<string, unknown> = {}) => ({
  id: Math.random().toString(36).slice(2),
  date: "2026-09-01",
  symbol: "MNQ",
  direction: "Long",
  entry: 23500,
  entry_time: "10:00:00",
  account_id: "compte-A",
  pnl: 20,
  ...over,
});

describe("regroupement des exécutions", () => {
  it("laisse une ligne par exécution sur un même compte", () => {
    // Scale-in : trois entrées au même prix en moins d'une minute. Trois
    // trades, trois lignes — c'est le cas qui en cachait trois sur neuf.
    const groups = groupExecutions([
      tr({ entry_time: "10:00:00" }),
      tr({ entry_time: "10:00:12" }),
      tr({ entry_time: "10:00:30" }),
    ]);
    expect(groups).toHaveLength(3);
    expect(groups.every(g => g.length === 1)).toBe(true);
  });

  it("réunit le même ordre parti sur plusieurs comptes", () => {
    const groups = groupExecutions([
      tr({ account_id: "compte-A" }),
      tr({ account_id: "compte-B", entry_time: "10:00:03" }),
      tr({ account_id: "compte-C", entry_time: "10:00:05" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toHaveLength(3);
  });

  it("ouvre un groupe dès que le compte revient", () => {
    // A, B, puis A de nouveau : deux ordres copiés, pas un seul de trois.
    const groups = groupExecutions([
      tr({ account_id: "compte-A", entry_time: "10:00:00" }),
      tr({ account_id: "compte-B", entry_time: "10:00:02" }),
      tr({ account_id: "compte-A", entry_time: "10:00:04" }),
    ]);
    expect(groups.map(g => g.length).sort()).toEqual([1, 2]);
  });

  it("sépare deux ordres du même compte espacés de plus d'une minute", () => {
    const groups = groupExecutions([
      tr({ account_id: "compte-A", entry_time: "10:00:00" }),
      tr({ account_id: "compte-B", entry_time: "10:00:02" }),
      tr({ account_id: "compte-A", entry_time: "11:30:00" }),
      tr({ account_id: "compte-B", entry_time: "11:30:02" }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups.every(g => g.length === 2)).toBe(true);
  });

  it("ne mélange ni les sens, ni les instruments, ni les prix", () => {
    const groups = groupExecutions([
      tr({ account_id: "compte-A" }),
      tr({ account_id: "compte-B", direction: "Short" }),
      tr({ account_id: "compte-C", symbol: "ES" }),
      tr({ account_id: "compte-D", entry: 23501 }),
    ]);
    expect(groups).toHaveLength(4);
  });

  it("garde une ligne chacun aux trades sans compte rattaché", () => {
    // Imports d'avant le rattachement : sans cette règle ils s'empilaient tous
    // sur une seule ligne.
    const groups = groupExecutions([
      tr({ account_id: null, entry_time: "10:00:00" }),
      tr({ account_id: null, entry_time: "10:00:05" }),
    ]);
    expect(groups).toHaveLength(2);
  });

  it("n'égare aucun trade, quel que soit le découpage", () => {
    const list = [
      tr({ account_id: "A", entry_time: "10:00:00" }),
      tr({ account_id: "B", entry_time: "10:00:01" }),
      tr({ account_id: "A", entry_time: "10:00:02" }),
      tr({ account_id: "A", symbol: "ES", entry: 5800 }),
      tr({ account_id: null }),
      tr({ direction: "Short", account_id: "B" }),
    ];
    const groups = groupExecutions(list);
    expect(groups.flat()).toHaveLength(list.length);
    expect(new Set(groups.flat().map(t => t.id)).size).toBe(list.length);
  });

  it("rend une liste vide sans rien inventer", () => {
    expect(groupExecutions([])).toEqual([]);
  });
});
