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

  /* ── Les deux figures survolent ensemble ──────────────────────────────────
     Le diagramme et l'anneau montrent la MÊME matière sous deux angles : passer
     sur « Logement » à gauche sans que « Logement » s'allume à droite laisse
     croire à deux dessins étrangers l'un à l'autre, et oblige à rechercher des
     yeux, dans l'anneau, la part qu'on tient déjà sous la souris.

     La table de correspondance dépend de l'ONGLET, puisque c'est lui qui décide
     ce que l'anneau détaille :
       • sorties / récurrent — une part par POSTE. Un sous-poste du diagramme
         (« Loyer ») désigne donc la part de son poste (« Logement ») ;
       • entrées — l'anneau sépare les PAYEURS quand le relevé les nomme, là où
         le diagramme regroupe par nature (cf. `cashflowGraph`). Une branche y
         éclaire donc PLUSIEURS parts, toutes celles de sa nature ;
       • disponible — l'anneau n'a que deux parts, « ce qui est couvert » et
         « ce qui reste » : aucune branche ne leur correspond une à une, et
         seule la branche de synthèse (« reste », « pris sur le solde ») a un
         équivalent. Les autres n'allument rien plutôt que d'allumer au hasard.

     Le retour (l'anneau qui désigne une branche) n'existe que là où la part ne
     vise qu'un nœud — c'est-à-dire partout sauf « disponible ». */
  const cross = React.useMemo(() => {
    const partsOfNode = new Map();
    const nodeOfPart = new Map();
    const partIds = new Set(ring.parts.map((p) => p.id));

    const add = (nodeId, partId) => {
      if (!partIds.has(partId)) return;
      const list = partsOfNode.get(nodeId);
      if (list) list.push(partId);
      else partsOfNode.set(nodeId, [partId]);
      if (!nodeOfPart.has(partId)) nodeOfPart.set(partId, nodeId);
    };

    const drawn = flow.net < 0;
    for (const n of flow.nodes) {
      if (tab === "in") {
        if (n.kind !== "income") continue;
        // Toutes les parts de cette nature — un salaire, deux employeurs.
        for (const s of incomes.slices) if (s.sub === n.ref) add(n.id, s.id);
      } else if (tab === "left") {
        if (n.ref === "left" || n.ref === "draw") add(n.id, "edge");
        else if (n.kind === "income") { if (drawn) add(n.id, "covered"); }
        else if (n.kind === "category" || n.kind === "sub") { if (!drawn) add(n.id, "covered"); }
      } else {
        const cat = n.kind === "category" ? n.ref : n.kind === "sub" ? n.parent : null;
        if (cat) add(n.id, cat);
      }
    }
    // « disponible » : une part désigne une poignée de branches, pas une seule.
    if (tab === "left") nodeOfPart.clear();
    return { partsOfNode, nodeOfPart };
  }, [flow, incomes, ring, tab]);

  /* Un seul état pour les deux figures — celle qui a la souris le pose, l'autre
     le suit. Deux états séparés se seraient chassés l'un l'autre. */
  const [linked, setLinked] = React.useState(null);

  const hoverBranch = React.useCallback((nodeId) => {
    setLinked(nodeId ? { node: nodeId, parts: cross.partsOfNode.get(nodeId) ?? [] } : null);
  }, [cross]);

  const hoverPart = React.useCallback((partId) => {
    setLinked(partId ? { node: cross.nodeOfPart.get(partId) ?? null, parts: [partId] } : null);
  }, [cross]);

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
          onHoverNode={hoverBranch}
          highlight={linked?.node ?? null}
          formatValue={(v) => fmt(v)}
          ariaLabel={t("cashflow.flowAria")
            .replace("{in}", fmt(flow.income))
            .replace("{out}", fmt(flow.spent))}
          emptyLabel={t("cashflow.flowEmpty")}
        />

        {/* Les chiffres de la fenêtre, en onglets : ils résument ET ils
            commandent l'anneau.

            SUR UNE PISTE SEGMENTÉE, et non posés à nu sous un filet. Quatre
            textes alignés dans du blanc, dont seule l'OPACITÉ disait lequel
            était choisi, ne ressemblaient à rien de cliquable : on lisait une
            rangée de chiffres à moitié effacés, et le trait de 2 px sous l'actif
            était le seul indice de leur rôle. La piste est le geste que la DA
            emploie déjà partout où l'on choisit entre plusieurs vues
            (`PeriodPills`) : fond gris léger, et l'onglet retenu ressort en
            carte blanche. Chaque onglet est alors lisible à pleine encre —
            l'état ne se paie plus en délavant trois chiffres sur quatre.

            Groupés à gauche et non étirés sur toute la largeur : étalés, les
            quatre chiffres se lisaient comme quatre colonnes d'un tableau, alors
            que ce sont quatre boutons. */}
        <div
          role="tablist"
          aria-label={t("budget.tabsAria")}
          style={{
            display: "inline-flex", alignSelf: "flex-start", flexWrap: "wrap",
            gap: 2, padding: 3, borderRadius: 14,
            background: T.segmentTrack, boxShadow: T.elevCard,
            /* La carte n'a pas de rembourrage en bas (le dessin va s'y appuyer) :
               c'est la piste qui pose sa propre marge, sans quoi elle toucherait
               le bord. Au-dessus, l'écart de la carte suffit. */
            margin: "0 0 16px",
          }}
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
          highlight={linked?.parts ?? null}
          onHover={hoverPart}
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
 * Un des chiffres de la fenêtre, en onglet sur la piste.
 *
 * Bâti comme un `MiniKpi` de la DA — le nom de la mesure en 11 px atténué, le
 * chiffre en 15 px demi-gras dessous —, parce que c'est ce que ces quatre blocs
 * SONT : des mesures. L'onglet retenu prend la carte blanche des pastilles de
 * période (`PeriodPills`), fine ombre comprise ; c'est le seul signal d'état, et
 * il suffit — la teinte du chiffre (vert pour les entrées, rouge pour un
 * découvert) reste alors disponible pour dire ce qu'elle a à dire, au lieu de
 * servir aussi de soulignement.
 *
 * Les trois autres gardent leur pleine encre : une mesure à demi effacée se lit
 * moins bien, et on n'a rien gagné à ne pas pouvoir la lire.
 */
function FlowTab({ active, onClick, label, value, tone }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      style={{
        display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 3,
        minWidth: 0, padding: "8px 14px 9px", border: "none", borderRadius: 11,
        background: active ? T.white : "transparent",
        boxShadow: active ? T.elevPill : "none",
        cursor: "pointer", fontFamily: "inherit",
        transition: "background 140ms var(--ease-out, ease), box-shadow 140ms var(--ease-out, ease)",
      }}
      /* Le survol pose la carte sans l'ombre : de quoi désigner la cible sans
         faire croire qu'elle est déjà choisie. */
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = T.white; }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}
    >
      <span style={{ fontSize: 11, lineHeight: 1, color: T.textSub, whiteSpace: "nowrap" }}>{label}</span>
      <span style={{
        fontSize: 15, fontWeight: 600, lineHeight: 1, letterSpacing: -0.15,
        color: tone || T.text, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap",
      }}>
        {fmt(value)}
      </span>
    </button>
  );
}
