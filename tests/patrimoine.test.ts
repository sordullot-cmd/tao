import { describe, it, expect } from "vitest";
import {
  assetGain,
  assetValue,
  classOfType,
  classBySlug,
  historyChange,
  holdingGain,
  holdingGainPct,
  holdingValue,
  netWorth,
  sectionsByClass,
  shareOf,
  toChartPoints,
  withTodayPoint,
  dayKey,
  type Asset,
  type Holding,
} from "@/lib/patrimoine";

const asset = (over: Partial<Asset> = {}): Asset => ({
  id: "a1",
  name: "PEA",
  type: "pea",
  balance: 10_000,
  institution: null,
  updatedAt: null,
  ...over,
});

const holding = (over: Partial<Holding> = {}): Holding => ({
  id: "h1",
  name: "MSCI World",
  isin: "LU1681043599",
  quantity: 10,
  avgPrice: 100,
  price: 120,
  ...over,
});

describe("valorisation d'une ligne", () => {
  it("valorise au dernier cours connu", () => {
    expect(holdingValue(holding())).toBe(1200);
  });

  it("retombe sur le PRU quand aucun cours n'est saisi", () => {
    expect(holdingValue(holding({ price: null }))).toBe(1000);
  });

  it("vaut zéro sans cours ni PRU plutôt que NaN", () => {
    expect(holdingValue(holding({ price: null, avgPrice: null }))).toBe(0);
  });

  it("ne calcule pas de plus-value tant que les deux prix ne sont pas connus", () => {
    expect(holdingGain(holding())).toBe(200);
    expect(holdingGain(holding({ price: null }))).toBeNull();
    expect(holdingGain(holding({ avgPrice: null }))).toBeNull();
  });

  it("exprime la plus-value en pourcentage du prix de revient", () => {
    expect(holdingGainPct(holding())).toBeCloseTo(20);
    // Prix de revient nul : le pourcentage n'a pas de sens, pas d'infini.
    expect(holdingGainPct(holding({ avgPrice: 0 }))).toBeNull();
  });
});

describe("valorisation d'un actif", () => {
  it("prend le solde saisi quand l'actif ne porte pas de lignes", () => {
    expect(assetValue(asset())).toBe(10_000);
    expect(assetValue(asset({ holdings: [] }))).toBe(10_000);
  });

  it("prend la somme des lignes dès qu'il en porte, et ignore le solde", () => {
    const a = asset({ balance: 999, holdings: [holding(), holding({ id: "h2", quantity: 5 })] });
    expect(assetValue(a)).toBe(1200 + 600);
  });

  it("ne renvoie une plus-value que si au moins une ligne est chiffrée", () => {
    expect(assetGain(asset())).toBeNull();
    expect(assetGain(asset({ holdings: [holding({ price: null })] }))).toBeNull();
    expect(assetGain(asset({ holdings: [holding(), holding({ id: "h2", price: null })] }))).toBe(200);
  });
});

describe("patrimoine net", () => {
  it("sépare actifs et passifs, et retranche les seconds", () => {
    const nw = netWorth([
      asset({ id: "a1", balance: 10_000 }),
      asset({ id: "a2", type: "savings", balance: 5_000 }),
      asset({ id: "a3", type: "loan", balance: -150_000 }),
    ]);
    expect(nw.gross).toBe(15_000);
    expect(nw.liabilities).toBe(-150_000);
    expect(nw.total).toBe(-135_000);
  });

  it("vaut zéro sur un patrimoine vide", () => {
    expect(netWorth([])).toEqual({ gross: 0, liabilities: 0, total: 0 });
  });
});

describe("répartition", () => {
  it("ne donne pas de part à un passif — un tiret, pas « 0 % »", () => {
    expect(shareOf(-1000, 10_000)).toBeNull();
    expect(shareOf(2_500, 10_000)).toBe(25);
  });

  it("ne divise pas par zéro quand rien n'est possédé", () => {
    expect(shareOf(1000, 0)).toBeNull();
  });

  it("groupe les actifs par classe, sans les classes vides", () => {
    const sections = sectionsByClass([
      asset({ id: "a1", type: "pea", balance: 1_000 }),
      asset({ id: "a2", type: "securities", balance: 3_000 }),
      asset({ id: "a3", type: "loan", balance: -500 }),
    ]);
    expect(sections.map((s) => s.cls.slug)).toEqual(["investissements", "passifs"]);
    // PEA et compte-titres tombent dans la même classe, du plus lourd au plus léger.
    expect(sections[0].total).toBe(4_000);
    expect(sections[0].assets.map((a) => a.id)).toEqual(["a2", "a1"]);
  });
});

describe("classes d'actifs", () => {
  it("range chaque type dans sa classe", () => {
    expect(classOfType("crypto").slug).toBe("crypto");
    expect(classOfType("life_insurance").slug).toBe("investissements");
    expect(classOfType("loan").slug).toBe("passifs");
  });

  it("fait retomber un type inconnu dans « Autres » plutôt que de le perdre", () => {
    // @ts-expect-error — type volontairement hors contrat (store d'une version antérieure)
    expect(classOfType("nft").slug).toBe("autres");
  });

  it("ne résout pas un slug inconnu", () => {
    expect(classBySlug("investissements")?.slug).toBe("investissements");
    expect(classBySlug("licorne")).toBeNull();
  });
});

describe("historique", () => {
  it("pose le point du jour sur un historique vide", () => {
    const next = withTodayPoint([], 1_000);
    expect(next).toEqual([{ date: dayKey(), total: 1_000 }]);
  });

  it("écrase le point du jour au lieu d'en empiler un second", () => {
    const next = withTodayPoint([{ date: dayKey(), total: 1_000 }], 1_500);
    expect(next).toHaveLength(1);
    expect(next[0].total).toBe(1_500);
  });

  it("garde les jours précédents", () => {
    const next = withTodayPoint([{ date: "2020-01-01", total: 10 }], 20);
    expect(next).toHaveLength(2);
    expect(next[0]).toEqual({ date: "2020-01-01", total: 10 });
  });

  it("renvoie le MÊME tableau quand rien ne change — l'appelant évite ainsi une écriture en boucle", () => {
    const history = [{ date: dayKey(), total: 1_000 }];
    expect(withTodayPoint(history, 1_000)).toBe(history);
  });

  /* Le brut est relevé avec le net : la courbe brute ne peut pas retirer les
     crédits d'un total net déjà figé, il faut l'avoir gardé le jour même. */
  it("relève le brut à côté du net quand on le lui donne", () => {
    const next = withTodayPoint([], -195_000, 5_000);
    expect(next).toEqual([{ date: dayKey(), total: -195_000, gross: 5_000 }]);
  });

  it("réécrit le point du jour quand seul le brut a bougé", () => {
    const history = [{ date: dayKey(), total: 1_000, gross: 1_000 }];
    expect(withTodayPoint(history, 1_000, 1_000)).toBe(history);
    expect(withTodayPoint(history, 1_000, 1_200)[0].gross).toBe(1_200);
  });

  it("traduit l'historique dans le contrat de PnlChart (`cum`, pas `total`)", () => {
    expect(toChartPoints([{ date: "2020-01-01", total: 42 }])).toEqual([
      { date: "2020-01-01", cum: 42 },
    ]);
  });
});

describe("variation sur la fenêtre affichée", () => {
  const pts = (...v: [string, number][]) => v.map(([date, cum]) => ({ date, cum }));

  it("compare le premier et le dernier point affichés", () => {
    const c = historyChange(pts(["2026-01-01", 10_000], ["2026-01-15", 11_000], ["2026-01-31", 12_500]));
    expect(c?.abs).toBe(2_500);
    expect(c?.pct).toBeCloseTo(25, 5);
    expect(c?.spanDays).toBe(30);
  });

  it("rend une variation négative telle quelle, pourcentage compris", () => {
    const c = historyChange(pts(["2026-01-01", 20_000], ["2026-02-01", 15_000]));
    expect(c?.abs).toBe(-5_000);
    expect(c?.pct).toBeCloseTo(-25, 5);
  });

  it("calcule le pourcentage sur la MAGNITUDE de départ, y compris en patrimoine négatif", () => {
    const c = historyChange(pts(["2026-01-01", -4_000], ["2026-02-01", -3_000]));
    expect(c?.abs).toBe(1_000);
    expect(c?.pct).toBeCloseTo(25, 5); // un endettement réduit d'un quart
  });

  it("ne rend aucun pourcentage quand le point de départ est nul", () => {
    const c = historyChange(pts(["2026-01-01", 0], ["2026-02-01", 900]));
    expect(c?.abs).toBe(900);
    expect(c?.pct).toBeNull();
  });

  it("n'a rien à dire en dessous de deux points", () => {
    expect(historyChange([])).toBeNull();
    expect(historyChange(pts(["2026-01-01", 10]))).toBeNull();
  });

  it("signale un historique plus court que la fenêtre demandée", () => {
    const short = pts(["2026-01-01", 10_000], ["2026-01-08", 10_400]);
    expect(historyChange(short, 365)?.partial).toBe(true);
    expect(historyChange(short, 7)?.partial).toBe(false);
    // Fenêtre sans données : `windowSeries` retombe sur les deux derniers
    // points, plus larges que demandé — l'horizon annoncé serait faux aussi.
    expect(historyChange(pts(["2026-01-01", 10_000], ["2026-03-01", 11_000]), 7)?.partial).toBe(true);
  });

  it("tolère quelques jours sans mesure dans la fenêtre", () => {
    // 28 jours couverts sur 30 demandés : la page n'a pas été ouverte deux
    // jours, ce n'est pas un historique partiel.
    expect(historyChange(pts(["2026-01-03", 10_000], ["2026-01-31", 10_100]), 30)?.partial).toBe(false);
  });

  it("sans fenêtre demandée, rien n'est partiel", () => {
    expect(historyChange(pts(["2026-01-01", 1], ["2026-01-02", 2]))?.partial).toBe(false);
  });
});
