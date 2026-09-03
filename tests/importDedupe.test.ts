import { describe, it, expect } from "vitest";
import { splitNewTrades, tradeSignature } from "@/lib/importDedupe";
import { parseAlphaFuturesPaste } from "@/lib/brokers/alphaFuturesPaste";
import { parseCSV } from "@/lib/csvParsers";
import { calculateFees } from "@/lib/tradeFees";

/** Un trade tel que la page le construit avant insertion. */
const tr = (over: Record<string, unknown> = {}) => ({
  date: "2026-09-01",
  symbol: "MNQ",
  direction: "Long",
  entry: 23500,
  exit: 23510,
  entry_time: "10:00:00",
  exit_time: "10:05:00",
  ...over,
});

describe("anti-doublons de l'import", () => {
  it("garde les sorties partielles que seule l'heure de sortie sépare", () => {
    const batch = [
      tr({ exit_time: "10:05:00" }),
      tr({ exit_time: "10:06:00" }),
      tr({ exit_time: "10:07:00" }),
    ];
    const { toInsert, duplicates } = splitNewTrades(batch, []);
    expect(toInsert).toHaveLength(3);
    expect(duplicates).toBe(0);
  });

  it("garde deux lignes rigoureusement identiques du même relevé", () => {
    // Deux exécutions dans la même seconde : le relevé en porte deux, la base
    // doit en recevoir deux.
    const { toInsert } = splitNewTrades([tr(), tr()], []);
    expect(toInsert).toHaveLength(2);
  });

  it("n'insère rien quand le relevé est réimporté à l'identique", () => {
    const batch = [tr({ exit_time: "10:05:00" }), tr({ exit_time: "10:06:00" })];
    const { toInsert, duplicates } = splitNewTrades(batch, batch);
    expect(toInsert).toHaveLength(0);
    expect(duplicates).toBe(2);
  });

  it("n'insère que le surplus quand la base en a déjà une partie", () => {
    const batch = [tr(), tr(), tr()];
    const { toInsert, duplicates } = splitNewTrades(batch, [tr()]);
    expect(toInsert).toHaveLength(2);
    expect(duplicates).toBe(1);
  });

  it("tient la comparaison entre un numeric de la base et le texte d'un CSV", () => {
    const enBase = { ...tr(), entry: 23500.004, exit: "23510.00" };
    expect(tradeSignature(enBase)).toBe(tradeSignature(tr()));
  });

  it("sépare deux sens opposés aux mêmes prix", () => {
    const { toInsert } = splitNewTrades([tr({ direction: "Short" })], [tr()]);
    expect(toInsert).toHaveLength(1);
  });

  it("importe en entier un collage Alpha dont trois lignes sortent au même prix", () => {
    const line = (id: string, out: string) =>
      `XCME_Eq MNQ (U26)\tLONG\t1\t${id}\tBUY\tSELL\t23500.00\t23510.00\t20.00\t0.74\t01/09/2026 10:00:00.00 AM\t01/09/2026 ${out}.00 AM`;
    const paste = parseAlphaFuturesPaste([
      line("9001", "10:05:00"),
      line("9002", "10:06:00"),
      line("9003", "10:07:00"),
    ].join("\n"));
    expect(paste.rows).toHaveLength(3);

    const parsed = parseCSV(paste.csv, "tradovate");
    const batch = parsed.map((t: Record<string, unknown>) => ({
      date: t.date, symbol: t.symbol, direction: t.direction,
      entry: t.entry, exit: t.exit,
      entry_time: t.entryTime, exit_time: t.exitTime,
    }));
    expect(splitNewTrades(batch, []).toInsert).toHaveLength(3);
  });
});

describe("frais réels rapportés par un réimport", () => {
  it("corrige un trade que la base a gardé sans frais", () => {
    // Le cas qui fausse le P&L : trade entré avant la migration 035, donc sans
    // frais, donc facturé au barème moyen du site.
    const existing = [tr({ id: "u1", fees: null })];
    const { toInsert, duplicates, toRefresh } = splitNewTrades([tr({ fees: 1.04 })], existing);
    expect(toInsert).toHaveLength(0);
    expect(duplicates).toBe(1);
    expect(toRefresh).toEqual([{ id: "u1", fees: 1.04 }]);
  });

  it("n'écrit rien quand la base porte déjà les mêmes frais", () => {
    const existing = [tr({ id: "u1", fees: 1.04 })];
    expect(splitNewTrades([tr({ fees: 1.04 })], existing).toRefresh).toEqual([]);
  });

  it("n'efface pas des frais connus avec un relevé qui n'en dit rien", () => {
    const existing = [tr({ id: "u1", fees: 1.04 })];
    expect(splitNewTrades([tr()], existing).toRefresh).toEqual([]);
  });

  it("laisse le lot rectifier un montant différent", () => {
    const existing = [tr({ id: "u1", fees: 1.82 })]; // le barème, écrit par erreur
    expect(splitNewTrades([tr({ fees: 1.04 })], existing).toRefresh).toEqual([
      { id: "u1", fees: 1.04 },
    ]);
  });

  it("ne corrige que les doublons, jamais un trade neuf", () => {
    const { toInsert, toRefresh } = splitNewTrades([tr({ fees: 1.04, exit_time: "11:00:00" })], [
      tr({ id: "u1", fees: null }),
    ]);
    expect(toInsert).toHaveLength(1);
    expect(toRefresh).toEqual([]);
  });

  it("apparie chaque ligne d'un scale-out au bon trade en base", () => {
    const existing = [
      tr({ id: "u1", fees: null, exit_time: "10:05:00" }),
      tr({ id: "u2", fees: null, exit_time: "10:06:00" }),
    ];
    const batch = [
      tr({ fees: 1.04, exit_time: "10:06:00" }),
      tr({ fees: 2.08, exit_time: "10:05:00" }),
    ];
    expect(splitNewTrades(batch, existing).toRefresh).toEqual([
      { id: "u2", fees: 1.04 },
      { id: "u1", fees: 2.08 },
    ]);
  });
});

describe("barème moyen contre frais du relevé", () => {
  it("respecte un relevé qui chiffre les frais à zéro", () => {
    // Le barème ne doit pas réinventer 1,82 $ là où le broker n'a rien pris.
    expect(calculateFees({ symbol: "MNQ", quantity: 1, fees: 0 })).toBe(0);
  });

  it("garde le barème quand les frais sont ABSENTS, pas nuls", () => {
    expect(calculateFees({ symbol: "MNQ", quantity: 1, fees: null })).toBe(1.82);
    expect(calculateFees({ symbol: "MNQ", quantity: 2 })).toBe(3.64);
  });
});
