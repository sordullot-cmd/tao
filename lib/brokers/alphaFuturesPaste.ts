/**
 * Alpha Futures — conversion d'un copier-coller en CSV.
 *
 * Le site n'offre aucun export : le relevé se sélectionne à la souris et arrive
 * dans le presse-papiers en colonnes séparées par des tabulations. Plutôt que
 * de demander un CSV qui n'existe pas, on convertit le collage et on le remet
 * à `parseCSV` sous la forme d'un fichier — le reste de l'import ignore alors
 * qu'aucun fichier n'a jamais été déposé.
 *
 * Une ligne collée porte douze champs, dans cet ordre :
 *   instrument · sens · quantité · id d'ordre · sens d'ouverture · sens de
 *   fermeture · prix d'entrée · prix de sortie · P&L brut · frais ·
 *   horodatage d'entrée · horodatage de sortie
 *
 * Les colonnes produites reprennent celles du format générique du site (`Date`,
 * `Symbol`, `Direction`, `Entry`, `Exit`, `PnL`) pour que la détection de
 * `parseCSV` tombe dessus sans indice de plateforme, suivies de tout ce que le
 * collage porte en plus — dont l'horodatage, que la page Trades attend pour
 * afficher heure, durée et session.
 *
 * ⚠️ La colonne `PnL` du CSV porte le BRUT, pas le net — contrairement au champ
 * `pnl` des `rows`, qui sert l'aperçu à l'écran et vaut le net. Ce n'est pas une
 * incohérence : le site attend partout un P&L brut en base et déduit les frais
 * lui-même (`applyNetPnl`, lib/tradeFees.ts). Y écrire un net déjà amputé
 * faisait déduire les frais DEUX fois — une fois les vrais du relevé, une fois
 * ceux du barème — et le P&L global du site tombait sous le vrai de plusieurs
 * dizaines de dollars. La colonne `Fees` accompagne donc le brut : elle porte
 * les frais RÉELS, qui priment sur le barème.
 */

/** Valeur $/point, alignée sur getContractMultiplier() de lib/csvParsers.ts. */
const POINT_VALUE: Record<string, number> = {
  MNQ: 2, MES: 5, MYM: 0.5, M2K: 0.2,
  NQ: 20, ES: 50, YM: 5, RTY: 50, NK: 0.2,
};

export interface AlphaPasteRow {
  date: string;
  symbol: string;
  direction: "Long" | "Short";
  entry: number;
  exit: number;
  /** Net = brut − frais. Sert l'aperçu de la page d'import ; le CSV, lui,
      exporte le brut (voir l'en-tête de fichier). */
  pnl: number;
  pnlGross: number;
  fees: number;
  entryTime: string;
  exitTime: string;
  quantity: number;
  volume: number;
  points: number;
  pointValue: number;
  contractType: string;
  duration: string;
  tradeId: string;
  contract: string;
  exchange: string;
  openSide: string;
  closeSide: string;
  entryTimestamp: string;
  exitTimestamp: string;
  session: string;
}

export interface AlphaPasteResult {
  rows: AlphaPasteRow[];
  /** Lignes non reconnues, rendues telles quelles pour être montrées. */
  skipped: string[];
  csv: string;
  /** Nom proposé au fichier virtuel, daté du premier trade. */
  fileName: string;
}

const money = (raw: string): number =>
  Number(String(raw).replace(/[^0-9.-]/g, "").replace(/(?!^)-/g, "")) || 0;

/** Même découpage que la colonne « Session » de TradesPage. */
const sessionOf = (hour: number): string =>
  hour < 8 ? "Asia" : hour < 13 ? "London" : hour < 22 ? "NY" : "Asia";

/**
 * `01/09/2026 12:03:43.25 AM` → date ISO + heure 24 h.
 *
 * `dayFirst` tranche l'ambiguïté JJ/MM contre MM/JJ, indécidable sur une ligne
 * seule : l'appelant la lève sur TOUT le collage (un premier nombre > 12
 * quelque part prouve le jour en tête) plutôt que ligne à ligne, sinon deux
 * trades du même relevé pourraient être datés selon deux conventions.
 */
const parseStamp = (raw: string, dayFirst: boolean) => {
  const m = String(raw).trim().match(
    /(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})(?:\.(\d+))?\s*([AaPp])?\.?[Mm]?/
  );
  if (!m) return null;
  const [, a, b, year, hh, mm, ss, frac, ampm] = m;
  const day = dayFirst ? a : b;
  const month = dayFirst ? b : a;
  let hour = Number(hh);
  // Horloge 12 h : minuit s'écrit 12:03 AM, qu'il faut ramener à 00:03.
  if (ampm) hour = (hour % 12) + (ampm.toLowerCase() === "p" ? 12 : 0);
  const pad = (n: number | string) => String(n).padStart(2, "0");
  return {
    date: `${year}-${pad(month)}-${pad(day)}`,
    time: `${pad(hour)}:${mm}:${ss}`,
    seconds: hour * 3600 + Number(mm) * 60 + Number(ss) + Number(`0.${frac || 0}`),
    hour,
  };
};

/** Découpe une ligne collée. Les tabulations d'abord ; à défaut, 2+ espaces. */
const splitCells = (line: string): string[] => {
  const cells = line.includes("\t") ? line.split("\t") : line.split(/ {2,}/);
  return cells.map((c) => c.trim()).filter((c) => c !== "");
};

const CSV_COLUMNS: Array<[string, (r: AlphaPasteRow) => string | number]> = [
  ["Date", (r) => r.date],
  ["Symbol", (r) => r.symbol],
  ["Direction", (r) => r.direction],
  ["Entry", (r) => r.entry.toFixed(2)],
  ["Exit", (r) => r.exit.toFixed(2)],
  /* Le brut, et les frais réels juste après : c'est le site qui fait la
     soustraction, une seule fois. */
  ["PnL", (r) => r.pnlGross.toFixed(2)],
  ["Entry Time", (r) => r.entryTime],
  ["Exit Time", (r) => r.exitTime],
  ["Quantity", (r) => r.quantity],
  ["Volume", (r) => r.volume.toFixed(2)],
  ["PnL Gross", (r) => r.pnlGross.toFixed(2)],
  ["Fees", (r) => r.fees.toFixed(2)],
  ["Points", (r) => r.points.toFixed(2)],
  ["Point Value", (r) => r.pointValue],
  ["Contract Type", (r) => r.contractType],
  ["Duration", (r) => r.duration],
  ["Trade ID", (r) => r.tradeId],
  ["Contract", (r) => r.contract],
  ["Exchange", (r) => r.exchange],
  ["Open Side", (r) => r.openSide],
  ["Close Side", (r) => r.closeSide],
  ["Entry Timestamp", (r) => r.entryTimestamp],
  ["Exit Timestamp", (r) => r.exitTimestamp],
  ["Session", (r) => r.session],
  ["Broker", () => "Alpha Futures"],
];

export const parseAlphaFuturesPaste = (text: string): AlphaPasteResult => {
  const lines = String(text || "").split(/\r?\n/).filter((l) => l.trim() !== "");

  /* Convention de date levée sur l'ensemble : dès qu'un premier nombre dépasse
     12, il ne peut être qu'un jour. Sans preuve, on garde le jour en tête —
     c'est le format qu'affiche Alpha, et le mois en tête daterait un relevé de
     septembre au 9 janvier sans que rien ne le signale. */
  const dayFirst = !lines.some((l) => {
    const d = l.match(/(\d{1,2})\/(\d{1,2})\/\d{4}/);
    return d != null && Number(d[1]) <= 12 && Number(d[2]) > 12;
  });

  const rows: AlphaPasteRow[] = [];
  const skipped: string[] = [];

  for (const line of lines) {
    const cells = splitCells(line);
    if (cells.length < 12) { skipped.push(line); continue; }

    const [instrument, dirRaw, qtyRaw, tradeId, openSide, closeSide,
           entryRaw, exitRaw, pnlRaw, feesRaw, inRaw, outRaw] = cells;

    const dir = dirRaw.toUpperCase();
    if (dir !== "LONG" && dir !== "SHORT") { skipped.push(line); continue; }

    const start = parseStamp(inRaw, dayFirst);
    const end = parseStamp(outRaw, dayFirst);
    if (!start || !end) { skipped.push(line); continue; }

    const entry = money(entryRaw);
    const exit = money(exitRaw);
    if (!entry || !exit) { skipped.push(line); continue; }

    /* « XCME_Eq MNQ (U26) » : le symbole seul nourrit la page (c'est lui que
       detectContractType sait lire), le mois d'échéance et la place restent à
       part pour ne pas fragmenter les statistiques d'un même instrument. */
    const m = instrument.match(/([A-Z0-9]+)\s*\(([A-Z]\d+)\)/i);
    const symbol = (m ? m[1] : instrument.split(/\s+/).pop() || instrument).toUpperCase();
    const contract = m ? `${symbol}${m[2].toUpperCase()}` : symbol;
    const words = instrument.trim().split(/\s+/);
    const exchange = words.length > 1 && words[0].toUpperCase() !== symbol ? words[0] : "";

    const quantity = Math.abs(money(qtyRaw)) || 1;
    const pointValue = POINT_VALUE[symbol] ?? 1;
    const gross = money(pnlRaw);
    const fees = Math.abs(money(feesRaw));
    const sign = dir === "LONG" ? 1 : -1;
    let seconds = end.seconds - start.seconds;
    if (seconds < 0) seconds += 24 * 3600; // trade à cheval sur minuit

    rows.push({
      date: start.date,
      symbol,
      direction: dir === "LONG" ? "Long" : "Short",
      entry,
      exit,
      pnl: Math.round((gross - fees) * 100) / 100,
      pnlGross: gross,
      fees,
      entryTime: start.time,
      exitTime: end.time,
      quantity,
      volume: quantity * entry * pointValue,
      points: Math.round(sign * (exit - entry) * 100) / 100,
      pointValue,
      contractType: symbol.startsWith("M") ? "micro" : "mini",
      duration: `${seconds.toFixed(2)}s`,
      tradeId,
      contract,
      exchange,
      openSide: openSide.toUpperCase(),
      closeSide: closeSide.toUpperCase(),
      entryTimestamp: `${start.date} ${start.time}`,
      exitTimestamp: `${end.date} ${end.time}`,
      session: sessionOf(start.hour),
    });
  }

  // Chronologique : le collage arrive du plus récent au plus ancien, alors
  // qu'un journal se lit dans l'ordre où les trades ont été pris.
  rows.sort((a, b) => a.entryTimestamp.localeCompare(b.entryTimestamp));

  const header = CSV_COLUMNS.map(([name]) => name).join(",");
  const body = rows.map((r) => CSV_COLUMNS.map(([, get]) => get(r)).join(","));
  const csv = rows.length ? `${header}\n${body.join("\n")}\n` : "";

  return {
    rows,
    skipped,
    csv,
    fileName: `alpha-futures-${rows[0]?.date || "collage"}.csv`,
  };
};
