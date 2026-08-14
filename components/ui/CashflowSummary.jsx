"use client";

/**
 * Le résumé d'un flux : le diagramme, ses trois chiffres, sa répartition.
 *
 * Deux pages posent exactement la même question sur des fenêtres différentes —
 * Budget sur un mois calendaire, Cashflow sur une profondeur glissante — et la
 * réponse a la même forme dans les deux cas. Elle vit donc ici, et les pages ne
 * gardent que ce qui leur est propre : la fenêtre, et ce qu'elles mettent autour.
 *
 * ── Ce que le bloc décide ───────────────────────────────────────────────────
 *
 * • LES TROIS CHIFFRES SONT DES ONGLETS, et pas une rangée de nombres : ils
 *   commandent l'anneau d'à côté. Sans ce second rôle, l'anneau ne saurait dire
 *   qu'une chose (les dépenses) et les chiffres ne feraient que répéter ce que
 *   le diagramme montre déjà.
 *
 * • L'ANNEAU CHANGE DE PROPOS avec l'onglet : les postes de dépense, les sources
 *   d'entrée, ou — sur « reste » — la place de ce reste dans le mois. C'est le
 *   seul des trois qui n'a pas de répartition propre : ce qu'on veut voir de lui
 *   est sa part, d'où deux parts plutôt qu'une liste.
 *
 * • LE DÉCOUPAGE N'EST PAS FAIT ICI. Le composant reçoit des opérations DÉJÀ
 *   recadrées : c'est la page qui sait de quelle fenêtre elle parle, et deux
 *   fenêtres différentes ne doivent pas se négocier dans un composant d'affichage.
 *
 * Le classement des postes comme des sources est DEVINÉ d'après le libellé
 * (`lib/bank/categories`), et le bloc le dit sous l'anneau : un classement faux
 * se lit comme un classement vrai.
 */

import React from "react";
import { T } from "@/lib/ui/tokens";
import { t, useLang } from "@/lib/i18n";
import { AllocationChart, CARD } from "@/components/ui/da";
import SankeyGraph from "@/components/ui/SankeyGraph";
import { categoryLabelKey, spendingByCategory, subLabelKey } from "@/lib/bank/categories";
import { incomeBySource } from "@/lib/bank/cashflow";
import { buildCashflowGraph } from "@/lib/bank/cashflowGraph";
import { recurringOf } from "@/lib/bank/recurring";
import { useBreakpoint } from "@/lib/hooks/useBreakpoint";
import { flowLabel } from "@/lib/ui/flowLabel";
import { fmt } from "@/lib/ui/format";

/** Teintes des deux parts de l'onglet « Reste ». Elles ne sortent pas de la
 *  palette des postes : ces parts n'en SONT pas, et une couleur de poste leur
 *  donnerait l'air d'en être un. Bleu du nœud central pour ce qui est couvert,
 *  gris pour ce qui n'a pas été dépensé, terre cuite pour le découvert — la
 *  seule des trois qui mérite d'être vue. */
const COVERED_COLOR = "#2C72C3";
const LEFT_COLOR = "#B9C2CB";
const DRAW_COLOR = "#C05A46";

/** Six postes, cinq sources et trois sous-postes au diagramme : au-delà, les
 *  branches deviennent des traits et leurs noms se marchent dessus. Ce qui est
 *  écrêté est rassemblé sous une branche qui dit combien elle en porte. */
const GRAPH_CLIP = { topOutflows: 6, topInflows: 5, topSubs: 3 };

export default function CashflowSummary({ txs = [], history, clip = GRAPH_CLIP }) {
  // La langue sert de dépendance aux libellés du diagramme : sans elle, changer
  // de langue laisserait les pastilles dans l'ancienne, le graphe n'ayant pas bougé.
  const lang = useLang();
  const bp = useBreakpoint();

  const flow = React.useMemo(() => buildCashflowGraph(txs, clip), [txs, clip]);
  const spending = React.useMemo(() => spendingByCategory(txs), [txs]);
  const incomes = React.useMemo(() => incomeBySource(txs), [txs]);

  /* Ce qui revient tous les mois, réparti par poste comme le reste — c'est la
     même matière, vue à travers un filtre. La DÉTECTION porte sur l'historique
     le plus large que la page ait chargé (`history`), jamais sur la seule
     fenêtre : sur un mois isolé, aucune dépense ne peut être dite récurrente. */
  const recurring = React.useMemo(
    () => spendingByCategory(recurringOf(txs, history ?? txs)),
    [txs, history],
  );

  /* L'onglet choisi décide ce que l'anneau détaille. « Dépensé » par défaut :
     c'est la question qu'on se pose devant un budget, et les deux autres onglets
     portent déjà leur chiffre en clair. */
  const [tab, setTab] = React.useState("out");

  const flowNodes = React.useMemo(
    () => flow.nodes.map((n) => ({ id: n.id, color: n.color, label: flowLabel(n) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [flow, lang],
  );

  const ring = React.useMemo(() => {
    if (tab === "in") {
      return {
        parts: incomes.slices.map((s) => ({
          id: s.id, label: s.source || t(subLabelKey(s.sub)),
          color: s.color, pct: s.pct, amount: s.amount,
        })),
        label: t("cashflow.moneyIn"),
        value: flow.income,
      };
    }

    /* Ce qui revient : les mêmes postes que « sorties », mais réduits aux
       contreparties qui reviennent tous les mois. L'anneau y répond à « qu'est-ce
       qui est engagé », là où l'onglet ne donne que le total. */
    if (tab === "recurring") {
      return {
        parts: recurring.slices.map((s) => ({
          id: s.id, label: t(categoryLabelKey(s.id)),
          color: s.color, pct: s.pct, amount: s.amount,
        })),
        label: t("cashflow.recurring"),
        value: recurring.total,
      };
    }

    /* « Disponible » n'a pas de répartition à montrer : ce qu'on veut voir, c'est
       sa place dans la fenêtre. L'anneau porte donc DEUX parts, et le sens des
       deux change avec le signe — ce qui reste sur ce qui est entré, ou ce qu'il
       a fallu prendre en plus de ce qui est entré. */
    if (tab === "left") {
      const drawn = flow.net < 0;
      const total = drawn ? flow.spent : flow.income;
      const covered = drawn ? flow.income : flow.spent;
      const edge = Math.abs(flow.net);
      const share = (v) => (total > 0 ? (v / total) * 100 : 0);
      return {
        parts: [
          {
            id: "covered", label: t(drawn ? "cashflow.moneyIn" : "cashflow.moneyOut"),
            color: COVERED_COLOR, pct: share(covered), amount: covered,
          },
          {
            id: "edge", label: t("cashflow.available"),
            color: drawn ? DRAW_COLOR : LEFT_COLOR, pct: share(edge), amount: edge,
          },
        ],
        label: t("cashflow.available"),
        value: drawn ? -edge : edge,
        tone: drawn ? T.pnlNeg : undefined,
      };
    }

    return {
      parts: spending.slices.map((s) => ({
        id: s.id, label: t(categoryLabelKey(s.id)),
        color: s.color, pct: s.pct, amount: s.amount,
      })),
      label: t("cashflow.moneyOut"),
      value: flow.spent,
    };
    // `lang` : les libellés des parts passent par `t()` (cf. `flowNodes`).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, incomes, spending, recurring, flow, lang]);

  /* Deux colonnes sur grand écran : l'anneau demande sa place et le diagramme ne
     se lit plus en dessous de 640 px de large. Empilés en dessous. */
  const twoCols = bp === "desktop";

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: twoCols ? "minmax(0, 2.1fr) minmax(260px, 1fr)" : "minmax(0, 1fr)",
        gap: 20,
        /* Étirées et non calées en haut : la carte de la répartition descend
           jusqu'au bas de celle du flux, et l'anneau se centre dans la hauteur
           qu'elle lui donne. Deux cartes de hauteurs différentes côte à côte
           laissaient un vide sous la plus courte. */
        alignItems: "stretch",
      }}
    >
      {/* Sans titre dans la carte : le diagramme se reconnaît sans qu'on le
          nomme, et l'anneau d'à côté porte déjà son propos au centre. Deux
          intitulés de plus ne faisaient qu'éloigner les figures du haut de la
          page. */}
      <section style={{ ...CARD, padding: "16px 24px 0", display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
        <SankeyGraph
          nodes={flowNodes}
          links={flow.links}
          formatValue={(v) => fmt(v)}
          ariaLabel={t("cashflow.flowAria")
            .replace("{in}", fmt(flow.income))
            .replace("{out}", fmt(flow.spent))}
          emptyLabel={t("cashflow.flowEmpty")}
        />

        {/* Les chiffres de la fenêtre, en onglets : ils résument ET ils
            commandent l'anneau. Le filet qui les sépare du dessin va d'un bord à
            l'autre de la carte — d'où les marges négatives, qui annulent son
            rembourrage.

            Petits, et c'est le propos : ce sont quatre repères qu'on balaie du
            regard, pas les chiffres de tête de la page. Gros, ils entraient en
            concurrence avec le diagramme juste au-dessus, qui dit déjà les
            proportions. */}
        <div
          role="tablist"
          aria-label={t("budget.tabsAria")}
          style={{ display: "flex", gap: 2, flexWrap: "wrap", borderTop: `1px solid ${T.border}`, margin: "0 -24px", padding: "0 12px" }}
        >
          <FlowTab
            active={tab === "in"} onClick={() => setTab("in")}
            label={t("cashflow.moneyIn")} value={flow.income} tone={T.pnlPos}
          />
          <FlowTab
            active={tab === "out"} onClick={() => setTab("out")}
            label={t("cashflow.moneyOut")} value={flow.spent}
          />
          {/* Disponible : le même chiffre porte les deux cas, de part et d'autre
              de zéro — ce qui reste, ou ce qu'il a fallu prendre ailleurs. Le
              signe suffit à les distinguer, et il vient du formatage. */}
          <FlowTab
            active={tab === "left"} onClick={() => setTab("left")}
            label={t("cashflow.available")}
            value={flow.net}
            tone={flow.net < 0 ? T.pnlNeg : undefined}
          />
          <FlowTab
            active={tab === "recurring"} onClick={() => setTab("recurring")}
            label={t("cashflow.recurring")} value={recurring.total}
          />
        </div>
      </section>

      <section style={{ ...CARD, padding: 24, display: "flex", flexDirection: "column", gap: 12, minWidth: 0, height: "100%" }}>
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 0 }}>
        <AllocationChart
          parts={ring.parts}
          ariaLabel={`${ring.label} : ${fmt(ring.value)}`}
          size={196}
          thickness={24}
          centreLabel={ring.label}
          centreValue={ring.value}
          centreTone={ring.tone}
          showPct={false}
          formatValue={(v) => fmt(v)}
        />
        </div>
      </section>
    </div>
  );
}

/**
 * Un des chiffres de la fenêtre, en onglet.
 *
 * Petit format assumé : quatre chiffres alignés sous un diagramme ne sont pas
 * quatre titres. Le trait sous l'onglet actif prend la TEINTE du chiffre (vert
 * pour les entrées, rouge pour un découvert) : c'est le même signal que la
 * couleur du montant, et il tient quand l'œil ne regarde que le bas de la carte.
 */
function FlowTab({ active, onClick, label, value, tone }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      style={{
        display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 1,
        minWidth: 0, padding: "9px 12px 8px", border: "none", background: "transparent",
        borderBottom: `2px solid ${active ? (tone || T.text) : "transparent"}`,
        opacity: active ? 1 : 0.55, cursor: "pointer", fontFamily: "inherit",
        transition: "opacity 140ms var(--ease-out, ease), border-color 140ms var(--ease-out, ease)",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.opacity = 1; }}
      onMouseLeave={(e) => { e.currentTarget.style.opacity = active ? 1 : 0.55; }}
    >
      <span style={{ fontSize: 11, lineHeight: "15px", color: T.textSub, whiteSpace: "nowrap" }}>{label}</span>
      <span style={{
        fontSize: 15, fontWeight: 600, lineHeight: "20px",
        color: tone || T.text, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap",
      }}>
        {fmt(value)}
      </span>
    </button>
  );
}
