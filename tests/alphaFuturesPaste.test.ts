import { describe, it, expect } from "vitest";
import { parseAlphaFuturesPaste } from "@/lib/brokers/alphaFuturesPaste";
import { parseCSV } from "@/lib/csvParsers";
import { withNetPnl } from "@/lib/tradeFees";
import { splitNewTrades } from "@/lib/importDedupe";

/** Trois lignes réelles, telles que le site les met dans le presse-papiers. */
const PASTE = [
  "XCME_Eq MNQ (U26)\tSHORT\t1.00\t26090a742e03563a\tSELL\tBUY\t$29,503.00\t$29,508.00\t-$10.00\t$1.32\t01/09/2026 12:03:43.25 AM\t01/09/2026 12:04:07.99 AM",
  "XCME_Eq MNQ (U26)\tSHORT\t1.00\t88e40dde2e9a537e\tSELL\tBUY\t$29,508.00\t$29,507.50\t+$1.00\t$1.32\t01/09/2026 12:02:13.71 AM\t01/09/2026 12:02:55.67 AM",
  "XCME_Eq MNQ (U26)\tLONG\t1.00\tf8124dd918905c0b\tBUY\tSELL\t$29,523.25\t$29,508.00\t-$30.50\t$1.32\t01/09/2026 12:00:11.00 AM\t01/09/2026 12:01:01.66 AM",
].join("\n");

describe("parseAlphaFuturesPaste()", () => {
  it("lit les trois trades d'un collage tabulé", () => {
    const { rows, skipped } = parseAlphaFuturesPaste(PASTE);
    expect(rows).toHaveLength(3);
    expect(skipped).toEqual([]);
  });

  it("remet les trades dans l'ordre où ils ont été pris", () => {
    const { rows } = parseAlphaFuturesPaste(PASTE);
    expect(rows.map((r) => r.entryTime)).toEqual(["00:00:11", "00:02:13", "00:03:43"]);
    expect(rows[0].direction).toBe("Long");
  });

  it("ramène minuit passé sur 24 h plutôt que de le lire comme midi", () => {
    const { rows } = parseAlphaFuturesPaste(PASTE);
    expect(rows[0].entryTime).toBe("00:00:11");
    expect(rows[0].session).toBe("Asia");
  });

  it("déduit le net des frais et garde le brut à côté", () => {
    const { rows } = parseAlphaFuturesPaste(PASTE);
    expect(rows[0].pnlGross).toBe(-30.5);
    expect(rows[0].fees).toBe(1.32);
    expect(rows[0].pnl).toBe(-31.82);
  });

  it("sépare le symbole de son échéance et de sa place", () => {
    const { rows } = parseAlphaFuturesPaste(PASTE);
    expect(rows[0].symbol).toBe("MNQ");
    expect(rows[0].contract).toBe("MNQU26");
    expect(rows[0].exchange).toBe("XCME_Eq");
    expect(rows[0].pointValue).toBe(2);
  });

  it("calcule points, notionnel et durée", () => {
    const { rows } = parseAlphaFuturesPaste(PASTE);
    expect(rows[0].points).toBe(-15.25);      // long : 29508 − 29523.25
    expect(rows[2].points).toBe(-5);          // short : 29503 → 29508
    expect(rows[0].volume).toBe(59046.5);     // 1 × 29523.25 × 2
    expect(rows[0].duration).toBe("50.66s");
  });

  it("date au jour en tête sans preuve du contraire", () => {
    const { rows } = parseAlphaFuturesPaste(PASTE);
    expect(rows[0].date).toBe("2026-09-01");
  });

  it("bascule tout le collage sur le mois en tête dès qu'une ligne le prouve", () => {
    const mmdd = PASTE.replace(/01\/09\/2026/g, "09/25/2026");
    const { rows } = parseAlphaFuturesPaste(mmdd);
    expect(rows[0].date).toBe("2026-09-25");
  });

  it("écarte les lignes illisibles sans perdre les autres", () => {
    const { rows, skipped } = parseAlphaFuturesPaste(`Instrument\tSide\tQty\n${PASTE}\n\t\t`);
    expect(rows).toHaveLength(3);
    expect(skipped).toHaveLength(1);
  });

  it("rend un CSV que parseCSV relit sans indice de plateforme", () => {
    const { csv } = parseAlphaFuturesPaste(PASTE);
    const trades = parseCSV(csv, null);
    expect(trades).toHaveLength(3);
    expect(trades[0].entryTime).toBe("00:00:11");
    expect(trades[0].exitTime).toBe("00:01:01");
    expect(trades[0].entry).toBe(29523.25);
    expect(trades[0].quantity).toBe(1);
    expect(trades[0].volume).toBe(59046.5);
  });

  it("confie au site un P&L brut et les frais réels, jamais un net déjà amputé", () => {
    // Le net écrit dans la colonne PnL se faisait re-déduire des frais par
    // applyNetPnl() : deux ponctions pour un seul aller-retour.
    const { csv } = parseAlphaFuturesPaste(PASTE);
    const trades = parseCSV(csv, null);
    expect(trades[0].pnl).toBe(-30.5);
    expect(trades[0].fees).toBe(1.32);
  });

  it("rend au net du site le net du relevé, au cent près", () => {
    const { rows, csv } = parseAlphaFuturesPaste(PASTE);
    const net = withNetPnl(parseCSV(csv, null)).reduce((s, t) => s + (Number(t.pnl) || 0), 0);
    const attendu = rows.reduce((s, r) => s + r.pnl, 0);
    expect(Math.round(net * 100) / 100).toBe(Math.round(attendu * 100) / 100);
  });

  it("ne rend aucun CSV quand rien n'est reconnu", () => {
    const { rows, csv } = parseAlphaFuturesPaste("n'importe quoi");
    expect(rows).toEqual([]);
    expect(csv).toBe("");
  });
});

/* Relevé complet d'une journée, dix lignes : trois paires partagent
   instrument, sens, prix ET centième de seconde d'entrée — c'est Alpha qui
   découpe un ordre de 5 contrats en 4 + 1. C'est le relevé sur lequel le site
   annonçait 167 $ là où Alpha en comptait 270. */
const JOURNEE = [
  "XCME_Eq NQ (U26)\tLONG\t1.00\tbda8dd55c8665f50\tBUY\tSELL\t$29,230.50\t$29,231.25\t+$15.00\t$4.78\t01/09/2026 05:00:12.94 PM\t01/09/2026 05:01:15.32 PM",
  "XCME_Eq NQ (U26)\tSHORT\t1.00\t4c884c79f4f2593f\tSELL\tBUY\t$29,215.75\t$29,211.75\t+$80.00\t$4.78\t01/09/2026 04:56:20.99 PM\t01/09/2026 04:57:43.32 PM",
  "XCME_Eq NQ (U26)\tSHORT\t4.00\td79f3be23fb750bf\tSELL\tBUY\t$29,215.75\t$29,211.75\t+$320.00\t$19.12\t01/09/2026 04:56:20.99 PM\t01/09/2026 04:57:43.32 PM",
  "XCME_Eq NQ (U26)\tSHORT\t4.00\t2fa749508f905884\tSELL\tBUY\t$29,208.50\t$29,209.00\t-$40.00\t$19.12\t01/09/2026 01:48:39.80 PM\t01/09/2026 01:49:38.19 PM",
  "XCME_Eq NQ (U26)\tSHORT\t1.00\t16124c5db3da5c9b\tSELL\tBUY\t$29,208.50\t$29,209.00\t-$10.00\t$4.78\t01/09/2026 01:48:39.80 PM\t01/09/2026 01:49:38.19 PM",
  "XCME_Eq NQ (U26)\tSHORT\t4.00\t1a0d5945739555fc\tSELL\tBUY\t$29,213.25\t$29,213.00\t+$20.00\t$19.12\t01/09/2026 12:55:48.30 PM\t01/09/2026 12:56:11.11 PM",
  "XCME_Eq NQ (U26)\tSHORT\t1.00\t609dc34f4bcc58c6\tSELL\tBUY\t$29,213.25\t$29,213.00\t+$5.00\t$4.78\t01/09/2026 12:55:48.30 PM\t01/09/2026 12:56:11.11 PM",
  "XCME_Eq MNQ (U26)\tSHORT\t1.00\t26090a742e03563a\tSELL\tBUY\t$29,503.00\t$29,508.00\t-$10.00\t$1.32\t01/09/2026 12:03:43.25 AM\t01/09/2026 12:04:07.99 AM",
  "XCME_Eq MNQ (U26)\tSHORT\t1.00\t88e40dde2e9a537e\tSELL\tBUY\t$29,508.00\t$29,507.50\t+$1.00\t$1.32\t01/09/2026 12:02:13.71 AM\t01/09/2026 12:02:55.67 AM",
  "XCME_Eq MNQ (U26)\tLONG\t1.00\tf8124dd918905c0b\tBUY\tSELL\t$29,523.25\t$29,508.00\t-$30.50\t$1.32\t01/09/2026 12:00:11.00 AM\t01/09/2026 12:01:01.66 AM",
].join("\n");

describe("une journée entière d'Alpha Futures", () => {
  it("recolle en un seul trade les morceaux ouverts au même instant", () => {
    const { rows, skipped } = parseAlphaFuturesPaste(JOURNEE);
    expect(rows).toHaveLength(7);
    expect(skipped).toEqual([]);
    const fusion = rows.find((r) => r.entryTime === "16:56:20")!;
    expect(fusion.quantity).toBe(5);
    expect(fusion.pnlGross).toBe(400);
    expect(fusion.fees).toBe(23.9);
    expect(fusion.pnl).toBe(376.1);
    expect(fusion.points).toBe(4);
    expect(fusion.tradeId).toBe("4c884c79f4f2593f+d79f3be23fb750bf");
  });

  it("pondère les prix et garde la dernière sortie quand les morceaux divergent", () => {
    const paste = [
      "XCME_Eq NQ (U26)\tLONG\t1.00\ta\tBUY\tSELL\t$100.00\t$110.00\t+$200.00\t$4.78\t01/09/2026 03:00:00.50 PM\t01/09/2026 03:01:00.00 PM",
      "XCME_Eq NQ (U26)\tLONG\t3.00\tb\tBUY\tSELL\t$104.00\t$106.00\t+$120.00\t$14.34\t01/09/2026 03:00:00.50 PM\t01/09/2026 03:02:00.00 PM",
    ].join("\n");
    const [r] = parseAlphaFuturesPaste(paste).rows;
    expect(r.quantity).toBe(4);
    expect(r.entry).toBe(103);
    expect(r.exit).toBe(107);
    expect(r.pnlGross).toBe(320);
    expect(r.exitTime).toBe("15:02:00");
    expect(r.duration).toBe("119.50s");
  });

  it("ne fusionne pas deux entrées de la même seconde à des centièmes différents", () => {
    const paste = [
      "XCME_Eq NQ (U26)\tLONG\t1.00\ta\tBUY\tSELL\t$100.00\t$110.00\t+$200.00\t$4.78\t01/09/2026 03:00:00.50 PM\t01/09/2026 03:01:00.00 PM",
      "XCME_Eq NQ (U26)\tLONG\t1.00\tb\tBUY\tSELL\t$100.00\t$110.00\t+$200.00\t$4.78\t01/09/2026 03:00:00.90 PM\t01/09/2026 03:01:00.00 PM",
    ].join("\n");
    expect(parseAlphaFuturesPaste(paste).rows).toHaveLength(2);
  });

  it("retombe au dollar près sur le net du relevé", () => {
    const { csv } = parseAlphaFuturesPaste(JOURNEE);
    const net = withNetPnl(parseCSV(csv, null)).reduce((s, t) => s + (Number(t.pnl) || 0), 0);
    // 350,50 $ de brut − 80,44 $ de frais réels.
    expect(Math.round(net * 100) / 100).toBe(270.06);
  });

  it("n'insère aucun trade deux fois, et n'en perd aucun", () => {
    const { csv } = parseAlphaFuturesPaste(JOURNEE);
    const batch = parseCSV(csv, null).map((t) => ({
      date: t.date, symbol: t.symbol, direction: t.direction,
      entry: t.entry, exit: t.exit,
      entry_time: t.entryTime, exit_time: t.exitTime,
    }));
    expect(splitNewTrades(batch, []).toInsert).toHaveLength(7);
    // Le même relevé recollé ne rentre pas une seconde fois.
    expect(splitNewTrades(batch, batch).toInsert).toHaveLength(0);
  });
});
