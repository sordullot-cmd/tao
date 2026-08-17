"use client";

/**
 * Le résumé d'un flux : le diagramme d'un côté, l'anneau et ses quatre chiffres
 * de l'autre.
 *
 * Deux pages posent exactement la même question sur des fenêtres différentes —
 * Budget sur un mois calendaire, Cashflow sur une profondeur glissante — et la
 * réponse a la même forme dans les deux cas. Elle vit donc ici, et les pages ne
 * gardent que ce qui leur est propre : la fenêtre, et ce qu'elles mettent autour.
 *
 * ── Ce que le bloc décide ───────────────────────────────────────────────────
 *
 * • LES QUATRE CHIFFRES SONT DES ONGLETS, et pas une rangée de nombres : ils
 *   commandent l'anneau. Sans ce second rôle, l'anneau ne saurait dire qu'une
 *   chose (les dépenses) et les chiffres ne feraient que répéter ce que le
 *   diagramme montre déjà.
 *
 * • ILS VIVENT DANS LA CARTE DE L'ANNEAU, pas sous le diagramme. Une commande se
 *   pose à côté de ce qu'elle commande : alignés en bas de la carte du flux, ils
 *   se lisaient comme le pied de page du dessin, et le lien avec l'anneau d'à
 *   côté ne se voyait qu'en cliquant. Rangés en colonne, ils gagnent en plus la
 *   place d'un vrai libellé, là où quatre onglets en ligne devaient tenir en un
 *   mot.
 *
 * • L'ANNEAU CHANGE DE PROPOS avec l'onglet : les postes de dépense, les sources
 *   d'entrée, ou — sur « reste » — la place de ce reste dans le mois. C'est le
 *   seul des quatre qui n'a pas de répartition propre : ce qu'on veut voir de lui
 *   est sa part, d'où deux parts plutôt qu'une liste. Une ligne sous l'anneau dit
 *   ce qu'on regarde : « Dépenses » et « Charges fixes » sont deux totaux de la
 *   même matière, et le nom seul ne dit pas ce qui les sépare.
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
import { DRAW_COLOR, incomeBySource } from "@/lib/bank/cashflow";
import { buildCashflowGraph } from "@/lib/bank/cashflowGraph";
import { recurringOf } from "@/lib/bank/recurring";
import { useBreakpoint } from "@/lib/hooks/useBreakpoint";
import { flowLabel } from "@/lib/ui/flowLabel";
import { fmt } from "@/lib/ui/format";

/** Teintes des deux parts de l'onglet « Reste ». Elles ne sortent pas de la
 *  palette des postes : ces parts n'en SONT pas, et une couleur de poste leur
 *  donnerait l'air d'en être un. Bleu du nœud central pour ce qui est couvert,
 *  gris pour ce qui n'a pas été dépensé, terre cuite pour le découvert — la
 *  seule des trois qui mérite d'être vue.
 *
 *  La terre cuite vient de `lib/bank/cashflow` : c'est la couleur du nœud « Pris
 *  sur le solde » du diagramme, et les deux figures disent ici la même chose. */
const COVERED_COLOR = "#2C72C3";
const LEFT_COLOR = "#B9C2CB";

/** Écrêtage de REPLI, pour l'appelant qui n'en passe pas : dix-huit postes et
 *  huit sources, soit ce que l'épaisseur des rubans sait encore porter (le
 *  raisonnement est chez l'appelant, cf. `GRAPH_CLIP` dans CashflowPage). Pas de
 *  `topSubs` : le diagramme s'arrête aux postes, et les déplier double le nombre
 *  de branches pour un détail que les listes de la page donnent mieux.
 *
 *  `minAmount` à cinq euros : c'est le seuil d'un MOIS, la fenêtre de l'appelant
 *  qui ne précise rien (la page Budget travaille sur un mois calendaire). En
 *  dessous, une branche est un trait de trois pixels qui traîne un nom en face de
 *  lui ; elle rejoint le « + N autres postes », et reste chiffrée dans les listes
 *  sous le dessin. La page Cashflow, qui change de profondeur, passe le sien. */
const GRAPH_CLIP = { topOutflows: 18, topInflows: 8, minAmount: 5 };

/** Les onglets et l'anneau se DÉSIGNENT l'un l'autre (`aria-controls`,
 *  `aria-labelledby`) : sans ce lien, un lecteur d'écran annonce quatre boutons
 *  et une image, sans dire que les uns changent l'autre. Le bloc n'apparaît
 *  qu'une fois par page, les identifiants peuvent donc être fixes. */
const TAB_ID = "cashflow-tab";
const PANEL_ID = "cashflow-ring";

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

  /* Le même chiffre porte les deux cas, de part et d'autre de zéro — ce qui
     reste, ou ce qu'il a fallu prendre ailleurs —, mais ce ne sont pas deux
     valeurs du même mot : l'onglet CHANGE DE NOM avec le signe. Et il prend
     celui de la dernière branche du diagramme, qui dit déjà lequel des deux
     c'est ; deux mots pour une seule branche laisseraient croire à deux
     chiffres. */
  const drawn = flow.net < 0;
  const leftLabel = t(drawn ? "cashflow.drawn" : "cashflow.left");

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
        hint: t("cashflow.hint.in"),
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
        hint: t("cashflow.hint.recurring"),
      };
    }

    /* « Disponible » n'a pas de répartition à montrer : ce qu'on veut voir, c'est
       sa place dans la fenêtre. L'anneau porte donc DEUX parts, et le sens des
       deux change avec le signe — ce qui reste sur ce qui est entré, ou ce qu'il
       a fallu prendre en plus de ce qui est entré. */
    if (tab === "left") {
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
            id: "edge", label: leftLabel,
            color: drawn ? DRAW_COLOR : LEFT_COLOR, pct: share(edge), amount: edge,
          },
        ],
        label: leftLabel,
        value: drawn ? -edge : edge,
        tone: drawn ? T.pnlNeg : undefined,
        hint: t(drawn ? "cashflow.hint.drawn" : "cashflow.hint.left"),
      };
    }

    return {
      parts: spending.slices.map((s) => ({
        id: s.id, label: t(categoryLabelKey(s.id)),
        color: s.color, pct: s.pct, amount: s.amount,
      })),
      label: t("cashflow.moneyOut"),
      value: flow.spent,
      hint: t("cashflow.hint.out"),
    };
    // `lang` : les libellés des parts passent par `t()` (cf. `flowNodes`).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, incomes, spending, recurring, flow, drawn, leftLabel, lang]);

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
        /* 280 px et non 260 pour la colonne de droite : elle porte maintenant les
           quatre chiffres, et un libellé de deux mots suivi d'un montant ne tient
           pas sur une ligne en dessous.

           1,8 et non 2,1 à gauche : le diagramme s'étalait plus que sa matière ne
           le demande — un ruban tiré en longueur ne se lit pas mieux, il traverse
           juste plus de vide.

           Ce que ça déplace : le diagramme perd ses libellés sous 720 px de
           dessin (cf. `COMPACT_AT`), soit une colonne de 768 px une fois le
           rembourrage de la carte retiré. Avec 2,1 le régime nommé démarrait
           vers 1450 px de fenêtre, avec 1,8 vers 1510 — les écrans entre les
           deux passent donc en figure de proportions, où les noms se lisent dans
           les listes en dessous. En dessous de 1450, rien ne change : ils y
           étaient déjà. */
        gridTemplateColumns: twoCols ? "minmax(0, 1.8fr) minmax(280px, 1fr)" : "minmax(0, 1fr)",
        gap: 20,
        /* Étirées et non calées en haut : les deux cartes descendent jusqu'au
           bas de la plus haute, et chacune centre son contenu dans la hauteur
           qu'elle reçoit. Deux cartes de hauteurs différentes côte à côte
           laissaient un vide sous la plus courte. */
        alignItems: "stretch",
      }}
    >
      {/* Le diagramme, SEUL dans sa carte, et sans titre : il se reconnaît sans
          qu'on le nomme, et les quatre chiffres qui traînaient sous lui sont
          partis rejoindre l'anneau qu'ils commandent. Centré dans la hauteur —
          c'est l'autre carte qui fixe désormais celle de la rangée, et un dessin
          calé en haut laissait un vide sous lui d'autant plus visible qu'il est
          large. */}
      <section style={{ ...CARD, padding: "16px 24px", display: "flex", flexDirection: "column", justifyContent: "center", minWidth: 0 }}>
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
      </section>

      <section style={{ ...CARD, padding: "20px 20px 10px", display: "flex", flexDirection: "column", gap: 12, minWidth: 0, height: "100%" }}>
        {/* L'anneau et sa légende : ce que l'onglet actif détaille. Le bloc prend
            toute la hauteur qui reste au-dessus des chiffres, et se centre
            dedans — la rangée fait la hauteur du diagramme d'à côté, qui varie
            avec le nombre de branches. */}
        <div
          id={PANEL_ID}
          role="tabpanel"
          aria-labelledby={`${TAB_ID}-${tab}`}
          style={{
            flex: 1, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", gap: 6, minHeight: 0,
          }}
        >
          {/* Survol lié au diagramme de flux : la branche pointée d'un côté
              allume sa part de l'autre. */}
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
          {/* Ce que le chiffre veut dire, en une ligne. Le centre de l'anneau ne
              porte qu'un nom, et « Dépenses » comme « Charges fixes » sont deux
              totaux de la même matière : sans cette ligne, rien ne dit ce qui
              les sépare. Muette en gris clair — elle se lit une fois, pas à
              chaque coup d'œil. */}
          {ring.hint && (
            <p style={{
              margin: 0, maxWidth: 232, textAlign: "center",
              fontSize: 12, lineHeight: 1.45, color: T.textMut,
            }}>
              {ring.hint}
            </p>
          )}
        </div>

        {/* Les quatre chiffres de la fenêtre, en onglets : ils résument ET ils
            commandent l'anneau juste au-dessus. En COLONNE et non en rangée —
            une colonne étroite ne tient pas quatre onglets côte à côte, et
            empilés ils gagnent la place d'écrire « Charges fixes » en entier là
            où une rangée aurait imposé un mot.

            En deux colonnes, le filet qui les sépare de l'anneau va d'un bord à
            l'autre de la carte : d'où les marges négatives, qui annulent son
            rembourrage. Empilée, la carte prend toute la largeur de la page et
            la colonne se BORNE, centrée sous l'anneau : étirée, chaque ligne
            posait son montant à un demi-écran de son libellé, et plus rien ne
            disait que les deux se lisent ensemble. */}
        <div
          role="tablist"
          aria-orientation="vertical"
          aria-label={t("budget.tabsAria")}
          style={{
            display: "flex", flexDirection: "column", gap: 2,
            borderTop: `1px solid ${T.border}`,
            ...(twoCols
              ? { margin: "0 -20px", padding: "8px 8px 0" }
              : { width: "100%", maxWidth: 400, alignSelf: "center", padding: "8px 0 0" }),
          }}
        >
          <FlowRow
            id="in" active={tab === "in"} onClick={() => setTab("in")}
            label={t("cashflow.moneyIn")} value={flow.income} tone={T.pnlPos}
          />
          <FlowRow
            id="out" active={tab === "out"} onClick={() => setTab("out")}
            label={t("cashflow.moneyOut")} value={flow.spent}
          />
          {/* Le reste, ou le découvert : le libellé suit le signe (cf. `leftLabel`),
              parce que ce ne sont pas deux valeurs de la même chose. */}
          <FlowRow
            id="left" active={tab === "left"} onClick={() => setTab("left")}
            label={leftLabel}
            value={flow.net}
            tone={drawn ? T.pnlNeg : undefined}
          />
          <FlowRow
            id="recurring" active={tab === "recurring"} onClick={() => setTab("recurring")}
            label={t("cashflow.recurring")} value={recurring.total}
          />
        </div>
      </section>
    </div>
  );
}

/**
 * Un des chiffres de la fenêtre, en ligne d'onglet.
 *
 * Le nom à gauche, le montant à droite, comme les lignes de postes du reste de la
 * page : quatre chiffres empilés sous un anneau se lisent comme une légende, et
 * c'est bien ce qu'ils sont en plus d'être une commande. Le montant reste à
 * droite, aligné avec les trois autres — c'est la colonne qu'on parcourt.
 *
 * TROIS marques pour l'onglet actif, et pas une : le fond, l'encre pleine, et un
 * trait vertical qui prend la TEINTE du chiffre (vert pour les entrées, rouge
 * pour un découvert). Le fond seul se confond avec un survol, et la teinte seule
 * disparaît sur les deux onglets qui n'en ont pas.
 */
function FlowRow({ id, active, onClick, label, value, tone }) {
  const [hover, setHover] = React.useState(false);

  return (
    <button
      type="button"
      role="tab"
      id={`${TAB_ID}-${id}`}
      aria-selected={active}
      aria-controls={PANEL_ID}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex", alignItems: "center", gap: 10, width: "100%",
        padding: "8px 12px", border: "none", borderRadius: 10,
        background: active ? T.accentBg : hover ? T.rowHighlight : "transparent",
        cursor: "pointer", fontFamily: "inherit", textAlign: "left",
        transition: "background 140ms var(--ease-out, ease)",
      }}
    >
      <span aria-hidden="true" style={{
        width: 3, height: 16, flexShrink: 0, borderRadius: 999,
        background: active ? (tone || T.text) : "transparent",
        transition: "background 140ms var(--ease-out, ease)",
      }} />
      <span style={{
        flex: 1, minWidth: 0, fontSize: 13, lineHeight: "18px", fontWeight: 500,
        color: active ? T.text : T.textSub,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {label}
      </span>
      <span style={{
        flexShrink: 0, fontSize: 14, fontWeight: 600, lineHeight: "18px",
        color: tone || (active ? T.text : T.textSub),
        fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap",
      }}>
        {fmt(value)}
      </span>
    </button>
  );
}
