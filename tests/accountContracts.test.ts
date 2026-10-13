/**
 * Le contrat d'un compte de prop firm.
 *
 * Deux choses sont sous test, et ce sont les deux qui se calculaient faux :
 * le DRAWDOWN, qui ne se mesure pas pareil selon la firme, et le SOLDE
 * RETIRABLE, qui n'est pas le P&L — un retrait déjà encaissé ne peut pas être
 * retiré deux fois.
 */

import { describe, it, expect } from "vitest";
import { resolveAccountRules } from "@/lib/propFirmRules";
import {
  accountAxis, accountsToFail, contractOf, contractTypeOf, evalProgress, isFailedAccount,
  normalizeContract, normalizeStore, payoutState, progressByAccount,
  payoutsByAccount, resolveObjectives, withContract, withPayout, withoutPayout,
} from "@/lib/accountContracts";

const tr = (date: string, pnl: number, time = "10:00") => ({ date, exit_time: time, pnl });
const EMPTY = normalizeContract({});

/** Les objectifs d'un compte 50k sans firme connue : repli 6 % / 4 %. */
const plain = (over: Record<string, unknown> = {}) =>
  resolveObjectives(normalizeContract(over), resolveAccountRules(null, 50_000));

describe("barème des firmes", () => {
  it("prend la grille de la firme plutôt que le repli en pourcentage", () => {
    // Apex 50k : 2 000 de drawdown, là où 4 % en donnerait 2 000 aussi — mais
    // sur un 100k la grille dit 3 000 quand le repli dirait 4 000.
    expect(resolveAccountRules("apex", 100_000)).toMatchObject({ target: 6_000, maxDD: 3_000, source: "firm" });
    expect(resolveAccountRules(null, 100_000)).toMatchObject({ target: 6_000, maxDD: 4_000, source: "default" });
  });

  it("dit que le drawdown d'Apex et de Topstep suit le pic, pas celui de FTMO", () => {
    expect(resolveAccountRules("apex", 50_000).trailing).toBe(true);
    expect(resolveAccountRules("topstep", 50_000).trailing).toBe(true);
    expect(resolveAccountRules("ftmo", 100_000).trailing).toBe(false);
  });

  it("met la grille à l'échelle d'une taille absente du catalogue", () => {
    // 75k chez Apex : entre le 50k et le 100k, personne ne l'a écrit.
    const r = resolveAccountRules("apex", 75_000);
    expect(r.target).toBe(4_500);
    expect(r.source).toBe("firm");
  });

  it("reprend le safety net d'Apex comme matelas à conserver", () => {
    // Apex le publie en valeur de compte — 52 100 sur un 50k, 103 100 sur un
    // 100k — soit le drawdown de la taille plus 100 $, ramené ici en profit.
    expect(resolveAccountRules("apex", 50_000).payoutBuffer).toBe(2_100);
    expect(resolveAccountRules("apex", 100_000).payoutBuffer).toBe(3_100);
    // Personne d'autre n'en impose un : un matelas inventé bloquerait un retrait
    // légitime, ce qui est pire que de ne rien annoncer.
    expect(resolveAccountRules(null, 50_000).payoutBuffer).toBe(0);
    expect(resolveAccountRules("topstep", 50_000).payoutBuffer).toBe(0);
  });

  it("ne prête à personne le barème d'une voisine", () => {
    expect(resolveAccountRules("tradeify", 50_000).source).toBe("default");
  });
});

describe("progression d'une évaluation", () => {
  const parcours = [tr("2026-09-01", 2_000), tr("2026-09-02", -800), tr("2026-09-03", 1_900)];

  it("mesure le drawdown depuis le PIC quand la firme le veut ainsi", () => {
    // +2 000 puis -800 : le trailing a mangé 800, le statique rien du tout —
    // le cumul n'est jamais repassé sous zéro.
    const deuxJours = parcours.slice(0, 2);
    const ftmo = resolveObjectives(EMPTY, resolveAccountRules("ftmo", 100_000));
    expect(evalProgress(deuxJours, ftmo).ddUsed).toBe(0);
    const apex = resolveObjectives(EMPTY, resolveAccountRules("apex", 50_000));
    expect(evalProgress(deuxJours, apex).ddUsed).toBe(800);
  });

  it("n'annonce le passage que si la cible ET les jours minimum sont tenus", () => {
    const atteint = plain({ target: 3_000, minDays: 3 });
    expect(evalProgress(parcours, atteint).passed).toBe(true);
    expect(evalProgress(parcours, plain({ target: 3_000, minDays: 5 })).passed).toBe(false);
    expect(evalProgress(parcours, plain({ target: 9_000, minDays: 3 })).passed).toBe(false);
  });

  it("distingue une limite franchie d'un objectif pas encore atteint", () => {
    const perdu = evalProgress([tr("2026-09-01", -3_000)], plain({ target: 3_000, maxDD: 2_500 }));
    expect(perdu.breached).toBe(true);
    expect(perdu.passed).toBe(false);
    expect(evalProgress([tr("2026-09-01", 500)], plain({ target: 3_000 })).breached).toBe(false);
  });

  it("compte la pire JOURNÉE, pas le pire trade", () => {
    const journee = [tr("2026-09-01", -400, "09:00"), tr("2026-09-01", 300, "14:00")];
    expect(evalProgress(journee, plain({ dailyLoss: 350 })).worstDay).toBe(-100);
  });
});

describe("drawdown EOD et échec du compte", () => {
  const apex = resolveObjectives(EMPTY, resolveAccountRules("apex", 50_000));

  it("ne fait pas payer un pic intraday rendu dans la séance", () => {
    // +2 000 à 10 h, −1 800 à 14 h : la clôture est à +200, le plancher n'a
    // monté que de 200. En trailing intraday il serait déjà verrouillé à 0.
    const seance = [tr("2026-09-01", 2_000, "10:00"), tr("2026-09-01", -1_800, "14:00")];
    const p = evalProgress(seance, apex);
    expect(p.peak).toBe(200);
    expect(p.floor).toBe(-1_800);
    expect(p.breached).toBe(false);
  });

  it("fait monter le plancher avec la clôture, et le touche en séance", () => {
    // Clôture à +2 000 : plancher verrouillé à 0. Le lendemain, −2 500 le touche.
    const p = evalProgress([tr("2026-09-01", 2_000), tr("2026-09-02", -2_500)], apex);
    expect(p.breached).toBe(true);
    expect(p.failReason).toBe("drawdown");
    expect(p.failedAt).toBe("2026-09-02");
    expect(p.ddLeft).toBe(0);
  });

  it("arrête le plancher au capital de départ", () => {
    // +6 000 à la clôture : sans verrou le plancher serait à +4 000.
    const p = evalProgress([tr("2026-09-01", 6_000), tr("2026-09-02", -3_000)], apex);
    expect(p.floor).toBe(0);
    expect(p.breached).toBe(false);
    expect(p.ddLeft).toBe(3_000);
  });

  it("reste en échec même quand le P&L remonte ensuite", () => {
    const p = evalProgress([tr("2026-09-01", -2_600), tr("2026-09-02", 4_000)], apex);
    expect(p.breached).toBe(true);
    expect(p.passed).toBe(false);
    expect(p.failedAt).toBe("2026-09-01");
  });

  it("garde le drawdown statique quand le compte le demande", () => {
    const statique = plain({ maxDD: 2_500, trailing: false });
    const p = evalProgress([tr("2026-09-01", 2_000), tr("2026-09-02", -2_400)], statique);
    expect(p.floor).toBe(-2_500);
    expect(p.breached).toBe(false);
  });

  it("met en échec un financé qui touche son plancher depuis le passage", () => {
    const contrat = normalizeContract({ fundedAt: "2026-09-01" });
    // Les gains d'éval (avant le passage) ne prêtent aucune marge au financé.
    const trades = [tr("2026-08-20", 3_000), tr("2026-09-02", -2_500)];
    const p = evalProgress(trades, apex, { from: contrat.fundedAt, payouts: contrat.payouts });
    expect(p.breached).toBe(true);
    const etat = payoutState(trades, contrat, apex);
    expect(etat.failed).toBe(true);
    expect(etat.eligible).toBe(false);
    expect(etat.blocker).toBe("Compte en échec");
  });

  it("déduit les retraits du solde sans faire bouger le plancher", () => {
    const contrat = normalizeContract({
      fundedAt: "2026-09-01",
      payouts: [{ date: "2026-09-03", amount: 3_000 }],
    });
    // Clôture à +6 000 : plancher verrouillé à 0. Retrait de 3 000 → +3 000.
    const trades = [tr("2026-09-02", 6_000), tr("2026-09-04", -2_000)];
    const p = evalProgress(trades, apex, { from: contrat.fundedAt, payouts: contrat.payouts });
    expect(p.pnl).toBe(1_000);
    expect(p.floor).toBe(0);
    expect(p.breached).toBe(false);
  });
});

describe("bascule en type « échec »", () => {
  const trades = [
    { ...tr("2026-09-01", -2_600), account_id: "ko" },
    { ...tr("2026-09-01", 300), account_id: "ok" },
  ];
  const comptes = [
    { id: "ko", account_type: "eval", eval_account_size: "50k" },
    { id: "ok", account_type: "eval", eval_account_size: "50k" },
    { id: "live", account_type: "live" },
  ];

  it("désigne les seuls comptes vivants dont le plancher vient d'être touché", () => {
    expect(accountsToFail(comptes, trades, {}, new Map())).toEqual([{ id: "ko", from: "eval" }]);
  });

  it("ne rebascule jamais un compte déjà en échec", () => {
    const tombé = comptes.map(a => (a.id === "ko" ? { ...a, account_type: "failed" } : a));
    expect(accountsToFail(tombé, trades, {}, new Map())).toEqual([]);
    expect(isFailedAccount(tombé[0])).toBe(true);
  });

  it("relit un compte tombé sous son type d'avant", () => {
    const contrat = normalizeContract({ failedFrom: "funded" });
    expect(contractTypeOf({ account_type: "failed" }, contrat)).toBe("funded");
    // Sans trace du type d'avant, l'éval est la lecture la plus fréquente.
    expect(contractTypeOf({ account_type: "failed" }, EMPTY)).toBe("eval");
    const store = { ko: normalizeContract({ failedFrom: "eval" }) };
    const tombé = [{ id: "ko", account_type: "failed", eval_account_size: "50k" }];
    expect(progressByAccount(tombé, trades, store, new Map()).get("ko")?.breached).toBe(true);
  });
});

describe("l'axe du compte", () => {
  const apex = resolveObjectives(EMPTY, resolveAccountRules("apex", 50_000));
  const axeDe = (trades: Array<{ date: string; exit_time?: string; pnl: number }>) =>
    accountAxis(50_000, evalProgress(trades, apex), apex);

  it("pose le plancher à « capital moins drawdown » tant qu'aucun pic n'a été fait", () => {
    const axe = axeDe([tr("2026-09-01", -300)]);
    expect(axe.floor).toBe(48_000);
    expect(axe.ceiling).toBe(53_000);
    expect(axe.current).toBe(49_700);
  });

  it("fait monter le plancher avec le pic quand le drawdown suit", () => {
    // +2 000 puis -800 : le pic reste à 2 000, le plancher a suivi.
    expect(axeDe([tr("2026-09-01", 2_000), tr("2026-09-02", -800)]).floor).toBe(50_000);
  });

  it("laisse le plancher immobile quand le drawdown est statique", () => {
    const ftmo = resolveObjectives(EMPTY, resolveAccountRules("ftmo", 100_000));
    const axe = accountAxis(100_000, evalProgress([tr("2026-09-01", 4_000)], ftmo), ftmo);
    expect(axe.floor).toBe(90_000);
  });

  it("retombe en P&L pur quand la taille du compte n'est pas renseignée", () => {
    const axe = accountAxis(null, evalProgress([tr("2026-09-01", 500)], apex), apex);
    expect(axe.start).toBe(0);
    expect(axe.floor).toBe(-1_500);
  });
});

describe("retraits d'un compte financé", () => {
  const financé = normalizeContract({ fundedAt: "2026-09-01" });
  const trades = [tr("2026-08-20", 5_000), tr("2026-09-02", 1_000), tr("2026-09-03", 500)];

  it("ignore ce qui a été gagné AVANT le passage financé", () => {
    expect(payoutState(trades, financé, plain()).earned).toBe(1_500);
  });

  it("retire du disponible ce qui a déjà été sorti", () => {
    const avec = normalizeContract({
      fundedAt: "2026-09-01",
      payouts: [{ id: "p1", date: "2026-09-04", amount: 1_000 }],
    });
    const st = payoutState(trades, avec, plain());
    expect(st.withdrawn).toBe(1_000);
    expect(st.available).toBe(500);
  });

  it("bloque tant que les jours de la firme ne sont pas faits, et dit lesquels", () => {
    const st = payoutState(trades, financé, plain({ payoutDays: 5 }));
    expect(st.eligible).toBe(false);
    expect(st.available).toBe(0);
    expect(st.blocker).toBe("Encore 3 jours tradés");
  });

  it("ne compte comme gagnante qu'une journée au-dessus du seuil de la firme", () => {
    const topstep = resolveObjectives(
      normalizeContract({ fundedAt: "2026-09-01" }),
      resolveAccountRules("topstep", 50_000),
    );
    // Topstep : une journée ne compte qu'à partir de 200 $. La séance à +500 y
    // est, celle à +1 000 aussi ; il en manque donc trois sur cinq.
    const st = payoutState(trades, financé, topstep);
    expect(st.winDays).toBe(2);
    expect(st.blocker).toBe("Encore 3 jours gagnants");
  });

  it("laisse le matelas sur le compte au lieu de le proposer au retrait", () => {
    // +3 200 avec 2 600 de matelas : 600 sortent, et les 2 600 restent là —
    // demander les 3 200 ferait refuser le payout en entier.
    const st = payoutState([tr("2026-09-02", 3_200)], financé, plain({ payoutBuffer: 2_600 }));
    expect(st.buffer).toBe(2_600);
    expect(st.withdrawable).toBe(600);
    expect(st.available).toBe(600);
    expect(st.eligible).toBe(true);
  });

  it("bloque tant que le matelas n'est pas dépassé, compte en gain ou non", () => {
    const st = payoutState([tr("2026-09-02", 2_000)], financé, plain({ payoutBuffer: 2_600 }));
    expect(st.available).toBe(0);
    expect(st.blocker).toBe("Buffer à conserver pas encore dépassé");
    // Pile au niveau : le matelas est constitué, mais rien ne le dépasse — une
    // demande à 0 n'existe pas.
    const pile = payoutState([tr("2026-09-02", 2_600)], financé, plain({ payoutBuffer: 2_600 }));
    expect(pile.eligible).toBe(false);
  });

  it("compare le minimum de retrait à ce qui dépasse le matelas, pas au solde", () => {
    // 3 000 de solde passeraient le minimum de 500 ; les 400 qui dépassent le
    // matelas, non.
    const st = payoutState([tr("2026-09-02", 3_000)], financé, plain({ payoutBuffer: 2_600, payoutMin: 500 }));
    expect(st.blocker).toBe("Minimum de retrait non atteint");
    expect(st.available).toBe(0);
  });

  it("ne propose rien à retirer quand le compte est en perte", () => {
    const st = payoutState([tr("2026-09-02", -400)], financé, plain());
    expect(st.available).toBe(0);
    expect(st.blocker).toBe("Rien à retirer pour le moment");
  });
});

describe("magasin des contrats", () => {
  it("laisse le barème de la firme là où l'utilisateur n'a rien posé", () => {
    const obj = resolveObjectives(normalizeContract({ target: 4_000 }), resolveAccountRules("apex", 50_000));
    expect(obj.target).toBe(4_000);
    expect(obj.maxDD).toBe(2_000);
    expect(obj.source).toBe("custom");
  });

  it("range les retraits du plus récent au plus ancien et jette ceux sans date", () => {
    const c = normalizeContract({
      payouts: [
        { id: "a", date: "2026-07-01", amount: 100 },
        { id: "b", date: "2026-09-01", amount: 200 },
        { id: "c", amount: 300 },
      ],
    });
    expect(c.payouts.map(p => p.id)).toEqual(["b", "a"]);
  });

  it("ajoute et retire un retrait sans toucher aux autres comptes", () => {
    const s1 = withPayout({}, "acc1", { date: "2026-09-01", amount: 500 });
    const s2 = withContract(s1, "acc2", { target: 1_000 });
    const id = s1.acc1.payouts[0].id;
    const s3 = withoutPayout(s2, "acc1", id);
    expect(s3.acc1.payouts).toEqual([]);
    expect(s3.acc2.target).toBe(1_000);
  });

  it("rend un contrat vide pour un compte inconnu plutôt que rien du tout", () => {
    expect(contractOf({}, "jamais-vu").payouts).toEqual([]);
    expect(normalizeStore(null)).toBeTypeOf("object");
  });
});

describe("vue d'ensemble des payouts", () => {
  it("ne rend un état que pour les comptes financés, et retranche leurs retraits", () => {
    const accounts = [
      { id: "f1", account_type: "funded", eval_account_size: "50k" },
      { id: "e1", account_type: "eval", eval_account_size: "50k" },
    ];
    const trades = [
      { account_id: "f1", date: "2026-09-02", pnl: 2_000 },
      { account_id: "e1", date: "2026-09-02", pnl: 9_000 },
    ];
    const store = withPayout({}, "f1", { date: "2026-09-03", amount: 800 });
    const map = payoutsByAccount(accounts, trades, store, new Map());
    expect(map.get("f1")?.available).toBe(1_200);
    expect(map.has("e1")).toBe(false);
  });
});
