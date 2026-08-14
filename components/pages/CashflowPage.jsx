"use client";

/**
 * Cashflow — le flux d'argent d'une fenêtre : ce qui est RÉELLEMENT entré et
 * sorti, lu sur les relevés.
 *
 * Cette page a un temps porté aussi le prévisionnel (l'ancienne page « Budget »),
 * pour que le prévu et le réalisé soient sous les yeux en même temps. En pratique
 * c'était une page entière posée sous une autre : le plan est reparti dans sa
 * page, et il n'en reste ici qu'un renvoi, en bas, là où la question « et par
 * rapport à ce que je m'étais fixé ? » se pose.
 *
 * L'ordre de lecture est celui d'une réponse, du plus général au plus précis :
 *
 *   1. LE FLUX. Un diagramme de Sankey : les sources à gauche, ce qui a été
 *      encaissé au centre, les postes à droite, et le reste (ou le découvert)
 *      comme dernière branche. C'est la seule figure qui dise d'un coup d'où
 *      vient l'argent ET où il va — un anneau ne sait faire que la seconde
 *      moitié. Les proportions se lisent dans l'épaisseur des rubans.
 *   2. LE DÉTAIL, en deux colonnes : les postes de dépense à gauche, dépliables
 *      sur leurs opérations ; les entrées d'argent à droite. Les deux côtés du
 *      diagramme, chiffrés.
 *   3. LES DERNIÈRES OPÉRATIONS réelles — ce qui vient de se passer, sans
 *      quitter la page pour le relevé complet. Cinq d'emblée, la suite se
 *      déplie sur place, par paquets, jusqu'à toute la fenêtre choisie.
 *   4. LES ENSEIGNES qui pèsent le plus, logo compris : une fuite se voit là, et
 *      pas dans un poste.
 *   5. LE RENVOI VERS LE BUDGET, en dernier : ce qu'on VOUDRAIT, après ce qui
 *      EST. L'ordre inverse ferait discuter le plan avant de regarder les
 *      chiffres.
 *
 * Tout vient des RELEVÉS des comptes agrégés : il n'y a aucune saisie manuelle
 * de dépense dans tr4de, et il n'en est pas prévu. Sans banque connectée, la
 * page le dit et ne montre rien d'autre — des colonnes et des zéros se liraient
 * comme « tu n'as rien dépensé », ce qui est faux. Le renvoi vers le budget
 * reste, lui : le plan ne dépend d'aucun compte.
 *
 * Le classement (postes ET sources) est DEVINÉ d'après le libellé par
 * `lib/bank/categories`, et la page le dit : un classement faux se lit comme un
 * classement vrai.
 *
 * Profondeur demandée à la banque : la même règle que la synthèse Patrimoine
 * (`depthOf(days) <= 90 ? 90 : days`), donc le MÊME cache. Changer de fenêtre
 * ici ne redemande que ce que la banque n'a pas encore donné.
 *
 * La fenêtre choisie est rangée sous les clés de l'ancienne page Dépenses
 * (`tr4de_spending_period`) : c'est le même réglage, sur la même matière, et une
 * clé neuve aurait renvoyé chacun à « 1 mois » le jour de la fusion.
 */

import React from "react";
import { ArrowDownLeft, ArrowUpRight, ChevronDown, ChevronRight, ChevronUp, Landmark, PiggyBank } from "lucide-react";
import { T } from "@/lib/ui/tokens";
import { t, useLang } from "@/lib/i18n";
import { CARD, PeriodPills, SectionAction, SectionTitle, PERIODS, PERIOD_ALL } from "@/components/ui/da";
import SankeyGraph from "@/components/ui/SankeyGraph";
import MerchantAvatar from "@/components/ui/MerchantAvatar";
import { findMerchant } from "@/lib/bank/merchants";
import { useBankAccounts } from "@/lib/bank/useBankAccounts";
import { useBankTransactionsAll } from "@/lib/bank/useBankTransactions";
import {
  categorizeTransaction, categoryColor, categoryLabelKey, isCatchAllSub, parentOfSub,
  spendingByCategory, subLabelKey, subcategorizeTransaction,
} from "@/lib/bank/categories";
import { incomeBySource } from "@/lib/bank/cashflow";
import { buildCashflowGraph } from "@/lib/bank/cashflowGraph";
import { ALL_DAYS, depthOf, kindLabelKey, sortTransactions, withinDays } from "@/lib/bank/transactions";
import { useBreakpoint } from "@/lib/hooks/useBreakpoint";
import { useCloudState } from "@/lib/hooks/useCloudState";
import { fmt } from "@/lib/ui/format";

/* Les fenêtres de la DA, plus « Tout » — comme la courbe du patrimoine. Un mois
   par défaut : c'est le pas auquel un budget se pense. */
const CASHFLOW_PERIODS = [...PERIODS, { id: PERIOD_ALL }];
const daysOfPeriod = (id) => PERIODS.find((p) => p.id === id)?.days ?? null;

/** Marchands montrés dans le classement. Au-delà, ce n'est plus un « top ». */
const TOP_MERCHANTS = 8;

/** Opérations montrées par poste avant dépliage complet. */
const TX_FOLDED = 6;

/** Opérations récentes montrées d'emblée : de quoi reconnaître les derniers
 *  jours, pas de quoi refaire le relevé — la fiche du compte le fait déjà, en
 *  mieux. La suite se déplie sur place, par paquets : cinq lignes suffisent à se
 *  situer, mais « qu'est-ce qui est passé cette semaine » en demande plus, et
 *  aller chercher la réponse dans le relevé fait perdre la période choisie. */
const RECENT = 5;
const RECENT_STEP = 15;

/* Colonnes des tableaux — les mêmes largeurs que le prévisionnel en bas de page :
   le prévu et le réalisé se lisent l'un après l'autre, et deux tableaux qui
   disent la même chose doivent s'aligner pareil. La dernière colonne est celle
   du chevron ; le prévisionnel y met ses deux actions. */
const COL_PCT = 80;
const COL_AMOUNT = 116;
const COL_BTN = 36;

/** « 13 août » — l'année n'apparaît que si le jour n'est pas de cette année. */
function shortDay(iso) {
  if (!iso) return "";
  const [y, m, d] = String(iso).split("-").map(Number);
  const date = new Date(y, (m || 1) - 1, d || 1);
  const sameYear = y === new Date().getFullYear();
  try {
    return new Intl.DateTimeFormat(undefined, {
      day: "numeric", month: "short", ...(sameYear ? null : { year: "numeric" }),
    }).format(date);
  } catch {
    return String(iso);
  }
}

/**
 * Libellé d'un nœud du flux.
 *
 * Les nœuds de synthèse ont leurs propres clés — ce ne sont ni des postes ni des
 * sources, et « + 4 autres postes » doit dire COMBIEN il en rassemble, sans quoi
 * il passerait pour un poste réel.
 *
 * Le sous-poste fourre-tout d'un poste (`housing` sous « Logement ») porte le
 * nom de son poste : écrit juste à droite de lui dans le diagramme, ce serait le
 * même mot deux fois de suite, et on croirait à un ruban qui ne mène nulle part.
 * Il se dit donc « Divers », comme sous l'anneau des dépenses.
 *
 * Une SOURCE se dit par sa nature (« Salaire & activité »), le diagramme
 * regroupant les payeurs d'une même nature (cf. `buildCashflowGraph`) : deux
 * employeurs y faisaient deux rubans dont l'un était souvent un trait, et la
 * colonne des entrées finissait plus détaillée que celle des dépenses. Le nom de
 * qui paie reste dans la liste « Entrées d'argent », qui a la place de le
 * chiffrer ; on le reprend ici dès qu'il existe, pour le jour où l'appelant
 * redemanderait le détail par payeur.
 */
function flowLabel(node) {
  switch (node.kind) {
    case "hub":
      return t("cashflow.hub");
    case "income":
      return node.source || t(subLabelKey(node.ref));
    case "category":
      return t(categoryLabelKey(node.ref));
    case "sub":
      return isCatchAllSub(node.ref) ? t("patrimoine.sub.divers") : t(subLabelKey(node.ref));
    default:
      return t(`cashflow.node.${node.ref}`).replace("{n}", String(node.count));
  }
}

export default function CashflowPage({ setPage }) {
  // La langue sert de dépendance aux libellés du diagramme : sans elle, changer
  // de langue laisserait les pastilles dans l'ancienne, le graphe n'ayant pas bougé.
  const lang = useLang();
  const bank = useBankAccounts();
  const bp = useBreakpoint();

  /* La fenêtre suit le COMPTE et non l'onglet : quelqu'un qui suit son mois en
     cours ne doit pas retrouver « Tout » à chaque visite. Même mécanique que la
     synthèse Patrimoine. */
  const [rawPeriod, setPeriod] = useCloudState("tr4de_spending_period", "spending_period", "1M");
  const period = CASHFLOW_PERIODS.some((p) => p.id === rawPeriod) ? rawPeriod : "1M";

  const days = daysOfPeriod(period) ?? ALL_DAYS;
  // Même règle que la courbe du patrimoine : sous 90 jours il n'y a rien de plus
  // à demander, c'est le minimum que l'API rend de toute façon.
  const depth = days === ALL_DAYS ? ALL_DAYS : depthOf(days) <= 90 ? 90 : days;

  const uids = React.useMemo(() => bank.accounts.map((a) => a.uid), [bank.accounts]);
  const { byUid, loading } = useBankTransactionsAll(uids, depth);

  /* Les relevés de tous les comptes mis bout à bout. Le cache peut contenir plus
     profond que ce qu'on affiche : le recadrage se fait ici, pas à la requête. */
  const all = React.useMemo(() => {
    const list = [];
    for (const uid of uids) {
      const txs = byUid[uid];
      if (txs) list.push(...txs);
    }
    return list;
  }, [byUid, uids]);

  const txs = React.useMemo(() => withinDays(all, days), [all, days]);

  /* Six postes, cinq sources et trois sous-postes par poste, pas plus : au-delà,
     les branches deviennent des traits et leurs noms se marchent dessus. Ce qui
     est écrêté est rassemblé sous une branche qui dit combien elle en porte, et
     le détail complet est dans les listes juste en dessous.

     Cinq sources et non quatre : depuis qu'une source porte le NOM de qui paie,
     un même salaire versé par deux employeurs fait deux branches là où il n'en
     faisait qu'une. À quatre, un relevé ordinaire (deux salaires, une aide, un
     remboursement, un virement) commençait à regrouper. */
  const flow = React.useMemo(
    () => buildCashflowGraph(txs, { topOutflows: 6, topInflows: 5, topSubs: 3 }),
    [txs],
  );
  const { slices } = React.useMemo(() => spendingByCategory(txs), [txs]);
  const incomes = React.useMemo(() => incomeBySource(txs), [txs]);

  /* Opérations de chaque poste, la plus grosse d'abord — c'est la question qu'on
     pose en dépliant un poste (« qu'est-ce qui l'a fait monter »), pas l'ordre
     chronologique d'un relevé. Seuls les DÉBITS : un remboursement vient en
     déduction du total du poste (cf. `spendingByCategory`) mais n'a rien à faire
     dans une liste de dépenses. */
  const byCategory = React.useMemo(() => {
    const map = new Map();
    for (const tx of txs) {
      if (tx.amount >= 0) continue;
      const id = categorizeTransaction(tx);
      if (id === "income") continue;
      const list = map.get(id);
      if (list) list.push(tx);
      else map.set(id, [tx]);
    }
    for (const list of map.values()) list.sort((a, b) => a.amount - b.amount);
    return map;
  }, [txs]);

  /* Les dernières opérations, tous comptes confondus — entrées comprises : ce
     bloc répond à « qu'est-ce qui vient de passer », question qui ne trie pas
     par signe. La liste entière est triée ici ; c'est l'affichage qui coupe. */
  const recentAll = React.useMemo(() => sortTransactions(txs), [txs]);

  /* Combien de lignes on montre. Se remet à cinq quand la fenêtre change : un
     compteur gardé à 50 d'une période à l'autre déplierait « 1 semaine » en
     entier sans qu'on l'ait demandé, et le bouton n'aurait plus rien à dire. */
  const [recentShown, setRecentShown] = React.useState(RECENT);
  React.useEffect(() => { setRecentShown(RECENT); }, [period]);

  const recent = React.useMemo(
    () => recentAll.slice(0, recentShown),
    [recentAll, recentShown],
  );
  const recentRest = recentAll.length - recent.length;

  /* Classement des enseignes. Seuls les marchands RECONNUS y figurent : le
     libellé brut d'une carte porte la date et le numéro de terminal, deux
     passages chez le même commerçant n'y ont donc pas la même chaîne et un
     regroupement dessus ne compterait rien. La note sous la liste le dit. */
  const merchants = React.useMemo(() => {
    const map = new Map();
    for (const tx of txs) {
      if (tx.amount >= 0) continue;
      const m = findMerchant(tx);
      if (!m) continue;
      const row = map.get(m.slug) || { merchant: m, amount: 0, count: 0 };
      row.amount -= tx.amount;
      row.count += 1;
      map.set(m.slug, row);
    }
    return [...map.values()].sort((a, b) => b.amount - a.amount).slice(0, TOP_MERCHANTS);
  }, [txs]);

  /* Le diagramme ne veut que trois choses d'un nœud : son identité, sa teinte et
     son nom. Le reste (le montant, le rang, le poste d'appartenance) a déjà servi
     à construire le graphe et ne doit pas repartir dans le dessin. */
  const flowNodes = React.useMemo(
    () => flow.nodes.map((n) => ({ id: n.id, color: n.color, label: flowLabel(n) })),
    // `lang` n'apparaît pas dans le corps mais `flowLabel` appelle `t()`, qui lit
    // la langue courante : sans cette dépendance, changer de langue laisserait les
    // pastilles dans l'ancienne, le graphe n'ayant lui pas bougé.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [flow, lang],
  );

  /* Deux colonnes sur grand écran, empilées en dessous : le tableau des postes
     porte quatre colonnes chiffrées, il ne tient pas dans une demi-largeur de
     tablette. La colonne des postes est la plus large — elle en a plus à dire. */
  const twoCols = bp === "desktop";

  const header = (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0, flex: 1 }}>
        <SectionTitle>{t("cashflow.title")}</SectionTitle>
        <div style={{ fontSize: 14, lineHeight: "18.6px", color: T.textSub, maxWidth: 620 }}>
          {t("cashflow.subtitle")}
        </div>
      </div>
      {bank.accounts.length > 0 && (
        <PeriodPills
          value={period}
          onChange={setPeriod}
          options={CASHFLOW_PERIODS.map((p) =>
            p.id === PERIOD_ALL ? { ...p, label: t("patrimoine.periodAll") } : p,
          )}
        />
      )}
    </div>
  );

  /* Aucun compte agrégé : le réalisé n'a pas de matière, et il n'y a pas de
     saisie manuelle à proposer à la place. On renvoie là où ça se branche — et
     le prévisionnel, qui ne dépend d'aucune banque, reste en dessous. */
  const noBank = bank.accounts.length === 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28, paddingTop: 14, fontFamily: "var(--font-sans)" }} className="anim-1">
      {header}

      {noBank ? (
        <section style={{ ...CARD, padding: "48px 32px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
          <div style={{ fontSize: 14, color: T.textSub, maxWidth: 420 }}>
            {bank.loading ? t("patrimoine.spending.loading") : t("patrimoine.spending.noAccount")}
          </div>
          <button
            type="button"
            onClick={() => setPage?.("patrimoine-bank")}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6, minHeight: 40,
              padding: "0 16px", borderRadius: 999, border: "none",
              background: T.accentBg, color: T.text, fontSize: 14, fontWeight: 500,
              cursor: "pointer", fontFamily: "inherit",
            }}
          >
            <Landmark size={15} strokeWidth={1.75} /> {t("patrimoine.bank.connect")}
          </button>
        </section>
      ) : flow.total <= 0 ? (
        <section style={{ ...CARD, padding: "48px 32px", textAlign: "center", fontSize: 14, color: T.textSub }}>
          {loading ? t("patrimoine.spending.loading") : t("patrimoine.spending.empty")}
        </section>
      ) : (
        <>
          {/* ── 1. Le flux ─────────────────────────────────────────────────── */}
          <section style={{ ...CARD, padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 32, flexWrap: "wrap" }}>
              <Figure label={t("cashflow.in")} value={flow.income} tone={T.pnlPos} />
              <Figure label={t("cashflow.out")} value={flow.spent} />
              {/* Le même chiffre porte les deux cas, de part et d'autre de zéro :
                  ce qui reste, ou ce qu'il a fallu prendre ailleurs. */}
              <Figure
                label={t(flow.net < 0 ? "cashflow.drawn" : "cashflow.left")}
                value={Math.abs(flow.net)}
                tone={flow.net < 0 ? T.pnlNeg : undefined}
              />
            </div>

            <SankeyGraph
              nodes={flowNodes}
              links={flow.links}
              formatValue={(v) => fmt(v)}
              ariaLabel={t("cashflow.flowAria")
                .replace("{in}", fmt(flow.income))
                .replace("{out}", fmt(flow.spent))}
              emptyLabel={t("cashflow.flowEmpty")}
            />

            {/* Le classement est deviné, pas déclaré : le dire évite de prendre
                pour argent comptant un « Autres » qui n'est qu'un libellé
                illisible. */}
            <div style={{ fontSize: 12, lineHeight: 1.6, color: T.textMut }}>
              {t("patrimoine.spending.hint")}
            </div>
          </section>

          {/* ── 2. Le détail : les postes, puis les entrées ─────────────────── */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: twoCols ? "minmax(0, 1.45fr) minmax(0, 1fr)" : "minmax(0, 1fr)",
              gap: 20,
              alignItems: "start",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
              <SectionTitle size="sm">{t("cashflow.spending")}</SectionTitle>
              <section style={{ ...CARD, padding: "16px 20px 8px", display: "flex", flexDirection: "column" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, paddingBottom: 6, fontSize: 12, color: T.textMut }}>
                  <span aria-hidden="true" style={{ width: 10, flexShrink: 0 }} />
                  <span style={{ flex: 1 }}>{t("spending.colCategory")}</span>
                  <span style={{ width: COL_PCT, textAlign: "right", flexShrink: 0 }}>{t("budget.colShare")}</span>
                  <span style={{ width: COL_AMOUNT, textAlign: "right", flexShrink: 0 }}>{t("budget.colAmount")}</span>
                  <span aria-hidden="true" style={{ width: COL_BTN, flexShrink: 0 }} />
                </div>

                {slices.length === 0 ? (
                  <div style={{ padding: "12px 0 16px", fontSize: 14, color: T.textSub }}>
                    {t("patrimoine.spending.empty")}
                  </div>
                ) : (
                  slices.map((s) => (
                    <CategoryRow key={s.id} slice={s} txs={byCategory.get(s.id) || []} />
                  ))
                )}
              </section>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
              <SectionTitle size="sm">{t("cashflow.incomes")}</SectionTitle>
              <section style={{ ...CARD, padding: incomes.slices.length === 0 ? "16px 20px" : 0 }}>
                {incomes.slices.length === 0 ? (
                  <div style={{ fontSize: 14, lineHeight: 1.5, color: T.textSub }}>
                    {t("cashflow.incomesEmpty")}
                  </div>
                ) : (
                  <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                    {incomes.slices.map((s, i) => (
                      <li
                        key={s.id}
                        style={{
                          display: "flex", alignItems: "center", gap: 10, padding: "12px 20px",
                          borderTop: i === 0 ? "none" : `1px solid ${T.border}`,
                        }}
                      >
                        <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: "50%", background: s.color, flexShrink: 0 }} />
                        <span style={{ flex: 1, minWidth: 0 }}>
                          {/* Qui paie en titre, sa nature en dessous : « Unowhy »
                              répond à la question, « Salaire & activité » dit ce
                              que c'est. Sans nom lu sur le relevé, la nature
                              remonte en titre — une ligne vide dirait moins. */}
                          <span style={{ display: "block", fontSize: 14, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {s.source || t(subLabelKey(s.sub))}
                          </span>
                          <span style={{ display: "block", fontSize: 12, color: T.textSub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {[
                              s.source ? t(subLabelKey(s.sub)) : null,
                              t("spending.nTxns").replace("{n}", String(s.count)),
                            ].filter(Boolean).join(" · ")}
                          </span>
                        </span>
                        <span style={{ flexShrink: 0, fontSize: 14, fontWeight: 500, color: T.text, fontVariantNumeric: "tabular-nums" }}>
                          {fmt(s.amount)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              <div style={{ fontSize: 12, lineHeight: 1.6, color: T.textMut }}>
                {t("cashflow.incomesHint")}
              </div>
            </div>
          </div>

          {/* ── 3. Les dernières opérations ─────────────────────────────────── */}
          {recent.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <SectionTitle
                size="sm"
                action={<SectionAction onClick={() => setPage?.("patrimoine-bank")}>{t("cashflow.recentAll")}</SectionAction>}
              >
                {t("cashflow.recent")}
              </SectionTitle>
              <section style={{ ...CARD, padding: 0 }}>
                <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                  {recent.map((tx, i) => (
                    <RecentRow key={tx.id} tx={tx} first={i === 0} />
                  ))}
                </ul>

                {/* La suite, sur place. Le bouton dit COMBIEN il reste : « voir
                    plus » sur trois lignes restantes et sur deux cents, ce n'est
                    pas la même décision. Une fois tout déplié, il rend la liste
                    à sa taille de départ plutôt que de disparaître — sinon on
                    reste avec deux cents lignes sous les yeux jusqu'au
                    rechargement. */}
                {(recentRest > 0 || recentShown > RECENT) && (
                  <div style={{ borderTop: `1px solid ${T.border}`, display: "flex" }}>
                    <button
                      type="button"
                      onClick={() =>
                        setRecentShown(recentRest > 0 ? recentShown + RECENT_STEP : RECENT)
                      }
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                        width: "100%", minHeight: 44, padding: "0 20px",
                        border: "none", background: "transparent", cursor: "pointer",
                        fontFamily: "inherit", fontSize: 13, fontWeight: 500, color: T.textSub,
                      }}
                    >
                      {recentRest > 0 ? (
                        <>
                          {t("cashflow.recentMore").replace(
                            "{n}",
                            String(Math.min(RECENT_STEP, recentRest)),
                          )}
                          <ChevronDown size={15} strokeWidth={1.75} />
                        </>
                      ) : (
                        <>
                          {t("spending.txLess")}
                          <ChevronUp size={15} strokeWidth={1.75} />
                        </>
                      )}
                    </button>
                  </div>
                )}
              </section>

              {/* Ce qui est déplié reste borné à la FENÊTRE choisie en haut de
                  page : le relevé complet du compte, lui, ne l'est pas. */}
              {recentRest > 0 && (
                <div style={{ fontSize: 12, lineHeight: 1.6, color: T.textMut }}>
                  {t("cashflow.recentCount")
                    .replace("{shown}", String(recent.length))
                    .replace("{total}", String(recentAll.length))}
                </div>
              )}
            </div>
          )}

          {/* ── 4. Les enseignes ───────────────────────────────────────────── */}
          {merchants.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <SectionTitle size="sm">{t("spending.merchants")}</SectionTitle>
              <section style={{ ...CARD, padding: 0 }}>
                <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                  {merchants.map((m, i) => (
                    <li
                      key={m.merchant.slug}
                      style={{
                        display: "flex", alignItems: "center", gap: 12, padding: "12px 20px",
                        borderTop: i === 0 ? "none" : `1px solid ${T.border}`,
                      }}
                    >
                      <MerchantAvatar merchant={m.merchant} size={32} />
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: "block", fontSize: 14, fontWeight: 500, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {m.merchant.name}
                        </span>
                        <span style={{ display: "block", fontSize: 12, color: T.textSub }}>
                          {t("spending.nTxns").replace("{n}", String(m.count))}
                        </span>
                      </span>
                      <span style={{ flexShrink: 0, fontSize: 14, fontWeight: 600, color: T.text, fontVariantNumeric: "tabular-nums" }}>
                        {fmt(m.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
              <div style={{ fontSize: 12, lineHeight: 1.6, color: T.textMut }}>
                {t("spending.merchantsHint")}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── 5. Le prévisionnel, ailleurs ─────────────────────────────────────
          Le plan se SAISIT et ne vient d'aucun relevé : il a sa page. Il en
          reste ce renvoi, parce que la question « et par rapport à ce que je
          m'étais fixé ? » se pose ici, une fois le réalisé lu. */}
      <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 20 }}>
        <button
          type="button"
          onClick={() => setPage?.("budget")}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6, minHeight: 40,
            padding: "0 16px", borderRadius: 999, border: "none",
            background: T.accentBg, color: T.text, fontSize: 14, fontWeight: 500,
            cursor: "pointer", fontFamily: "inherit",
          }}
        >
          <PiggyBank size={15} strokeWidth={1.75} /> {t("cashflow.openBudget")}
        </button>
      </div>
    </div>
  );
}

/** Un chiffre de tête de la carte du flux. */
function Figure({ label, value, tone }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
      <span style={{ fontSize: 13, color: T.textSub }}>{label}</span>
      <span style={{ fontSize: 26, fontWeight: 600, letterSpacing: -0.4, color: tone || T.text, fontVariantNumeric: "tabular-nums" }}>
        {fmt(value)}
      </span>
    </div>
  );
}

/**
 * Une des dernières opérations : d'où elle vient, ce qu'elle est, son montant.
 *
 * Le logo de l'enseigne quand on la reconnaît — le tableau des enseignes est
 * juste en dessous, la même vignette y répond. À défaut, une flèche qui dit le
 * SENS : dans une liste où entrées et sorties se mêlent, le signe du montant
 * seul se rate.
 */
function RecentRow({ tx, first }) {
  const credit = tx.amount >= 0;
  const merchant = findMerchant(tx);
  const sub = subcategorizeTransaction(tx);
  const category = parentOfSub(sub);
  const title = merchant?.name || tx.label || t(kindLabelKey(tx.kind));

  return (
    <li style={{
      display: "flex", alignItems: "center", gap: 12, padding: "12px 20px",
      borderTop: first ? "none" : `1px solid ${T.border}`,
    }}>
      {merchant ? (
        <MerchantAvatar merchant={merchant} size={32} />
      ) : (
        <span aria-hidden="true" style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: 32, height: 32, flexShrink: 0, borderRadius: 999,
          background: T.accentBg, color: credit ? T.pnlPos : T.textSub,
        }}>
          {credit
            ? <ArrowDownLeft size={15} strokeWidth={1.75} />
            : <ArrowUpRight size={15} strokeWidth={1.75} />}
        </span>
      )}

      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 14, fontWeight: 500, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {title}
        </span>
        {/* Le jour, et le sous-poste quand on a su le nommer. « Autres » ne se
            dit pas : l'absence de classement n'apprend rien. */}
        <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, fontSize: 12, color: T.textSub }}>
          {category !== "other" && (
            <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: "50%", background: categoryColor(category), flexShrink: 0 }} />
          )}
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {[shortDay(tx.date), category === "other" ? null : t(subLabelKey(sub))].filter(Boolean).join(" · ")}
          </span>
        </span>
      </span>

      <span style={{
        flexShrink: 0, fontSize: 14, fontWeight: 600, fontVariantNumeric: "tabular-nums",
        color: credit ? T.pnlPos : T.text,
      }}>
        {fmt(tx.amount, true)}
      </span>
    </li>
  );
}

/**
 * Un poste : sa part et son montant, dépliable sur ses opérations.
 *
 * La ligne est celle des catégories du prévisionnel — pastille, nom, part,
 * montant, séparée par un filet — à ceci près que le plan se SAISIT et qu'ici le
 * poste se CONSTATE : la dernière colonne porte donc un chevron là où le plan met
 * le cadenas et la suppression, et la ligne entière est le bouton qui déplie.
 *
 * Replié par défaut : il y a une quinzaine de postes et on n'en ouvre qu'un —
 * tout déplier ferait de la page un relevé complet, ce que la fiche d'un compte
 * fait déjà mieux.
 */
function CategoryRow({ slice, txs }) {
  const [open, setOpen] = React.useState(false);
  const [all, setAll] = React.useState(false);
  const panelId = `poste-${slice.id}`;
  const label = t(categoryLabelKey(slice.id));
  const shown = all ? txs : txs.slice(0, TX_FOLDED);

  return (
    <div style={{ borderTop: `1px solid ${T.border}` }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls={panelId}
        style={{
          display: "flex", alignItems: "center", gap: 10, width: "100%",
          padding: "10px 0", border: "none", background: "transparent",
          cursor: "pointer", fontFamily: "inherit", textAlign: "left",
        }}
      >
        <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: "50%", background: categoryColor(slice.id), flexShrink: 0 }} />
        <span style={{ flex: 1, minWidth: 0, fontSize: 14, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {label}
        </span>
        <span style={{ width: COL_PCT, flexShrink: 0, textAlign: "right", fontSize: 14, color: T.textSub, fontVariantNumeric: "tabular-nums" }}>
          {Math.round(slice.pct)} %
        </span>
        <span style={{ width: COL_AMOUNT, flexShrink: 0, textAlign: "right", fontSize: 14, fontWeight: 500, color: T.text, fontVariantNumeric: "tabular-nums" }}>
          {fmt(slice.amount)}
        </span>
        <span
          aria-hidden="true"
          style={{
            width: COL_BTN, flexShrink: 0, display: "inline-flex",
            alignItems: "center", justifyContent: "center", color: T.textMut,
          }}
        >
          <ChevronRight
            size={16}
            strokeWidth={1.75}
            style={{
              transform: open ? "rotate(90deg)" : "none",
              transition: "transform 200ms var(--ease-out, ease)",
            }}
          />
        </span>
      </button>

      {/* Monté seulement quand le poste est ouvert, et non replié par le CSS :
          quinze postes fermés qui gardent chacun leurs opérations dans le
          document, c'est une page entière lue à voix haute par un lecteur
          d'écran, et cent nœuds pour rien. Le prix est l'animation de hauteur,
          qu'on perd — le chevron, lui, tourne toujours. */}
      {open && (
        <div id={panelId}>
          {/* 20 px d'indentation : la pastille (10) et son espace (10), soit
              exactement là où commence le nom du poste au-dessus. */}
          <ul style={{ listStyle: "none", margin: 0, padding: "0 0 10px 20px", display: "flex", flexDirection: "column", gap: 8 }} className="anim-1">
            {shown.map((tx) => {
              const merchant = findMerchant(tx);
              return (
                <li key={tx.id} style={{ display: "flex", alignItems: "baseline", gap: 10, fontSize: 13 }}>
                  <span style={{ flexShrink: 0, width: 62, color: T.textMut, fontVariantNumeric: "tabular-nums" }}>
                    {shortDay(tx.date)}
                  </span>
                  <span style={{ flex: 1, minWidth: 0, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {/* Le nom canonique du marchand quand on le reconnaît :
                        « Carrefour » plutôt que « CARTE 12/08 CARREFOURCITY4979 ». */}
                    {merchant?.name || tx.label || t(kindLabelKey(tx.kind))}
                  </span>
                  <span style={{ flexShrink: 0, width: COL_AMOUNT, textAlign: "right", color: T.text, fontVariantNumeric: "tabular-nums" }}>
                    {fmt(-tx.amount)}
                  </span>
                  <span aria-hidden="true" style={{ width: COL_BTN, flexShrink: 0 }} />
                </li>
              );
            })}

            {txs.length > TX_FOLDED && (
              <li>
                <button
                  type="button"
                  onClick={() => setAll(!all)}
                  style={{
                    border: "none", background: "transparent", padding: 0, cursor: "pointer",
                    fontFamily: "inherit", fontSize: 13, color: T.textSub,
                  }}
                >
                  {all
                    ? t("spending.txLess")
                    : t("spending.txMore").replace("{n}", String(txs.length - TX_FOLDED))}
                </button>
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
