"use client";

/**
 * Diagramme de flux (Sankey) à plusieurs niveaux.
 *
 * `SankeyFlow` dessine le cas à un nœud central. Ce dessin-ci répond à la même
 * question un cran plus loin — les postes peuvent s'y déplier sur leurs
 * sous-postes — et travaille sur un graphe quelconque.
 *
 * La géométrie est dans `lib/ui/sankeyGraph` — testable sans navigateur. Ici :
 * la mesure de la largeur disponible, la peinture, les pastilles et le survol.
 *
 * ── Ce qui rend la figure lisible, et pourquoi c'est fait ainsi ─────────────
 *
 * • RUBANS PASTEL, À PLAT. Les teintes des postes (`lib/bank/categories`) sont
 *   choisies pour des pastilles de légende et des barres pleines : à l'échelle
 *   d'un ruban qui traverse tout le dessin, elles saturent la figure et le texte
 *   posé dessus ne se lit plus. On les éclaircit donc fortement pour les rubans,
 *   et on garde la teinte franche pour les BARRES, petites, où la couleur sert
 *   encore à identifier. Le ruban reste reconnaissable, il ne domine plus.
 *
 * • UN APLAT PAR RUBAN, et pas un dégradé. Un dégradé raconte le trajet, ce que
 *   la courbe dit déjà ; il coûte en revanche la constance de la couleur, et donc
 *   la possibilité de reconnaître une branche à sa teinte quand dix rubans se
 *   croisent au milieu. La teinte retenue est celle du bout DISTINCTIF du ruban
 *   (cf. `color` dans `lib/ui/sankeyGraph`) : celle de la source vers le budget,
 *   où tout se rejoint, celle de la cible partout ailleurs.
 *
 * • LES NOMS DANS DEUX GOUTTIÈRES, à gauche pour la colonne de départ, à droite
 *   pour celle d'arrivée ; le montant sur une DEUXIÈME LIGNE, sous le nom. Posés
 *   sur les rubans, ils se lisaient sur un fond qui change et deux voisins
 *   finissaient par se toucher ; en marge, ils s'alignent et le dessin reste
 *   net. Les colonnes du milieu n'ont pas de marge où se ranger : leur libellé
 *   se centre sur la barre, qui est étroite et le porte bien.
 *
 * • UN NOM RESTE EN FACE DE SA BRANCHE, TOUJOURS, et c'est le dessin qui s'y
 *   plie. Deux lignes de libellé demandent 34 px ; quand une colonne n'a pas
 *   autant à donner à chacune de ses branches, deux choses arrivent, dans cet
 *   ordre : les branches FINES s'écartent entre elles (celles qui sont épaisses
 *   ont déjà la place, elles ne bougent pas), et si cela ne suffit pas, LE BLOC
 *   GRANDIT — la hauteur du dessin suit le nombre de branches (`heightNeeded`,
 *   cf. `lib/ui/sankeyGraph`).
 *
 *   Ce qui a été retiré : le déplacement des libellés vers le haut, les traits
 *   de rappel qui disaient quel nom allait avec quelle branche, et le repli sur
 *   une seule ligne des colonnes serrées. Un nom lu au-dessus de son ruban
 *   désigne le voisin du dessus, trait ou pas.
 *
 * • EN HTML, posés par-dessus le SVG aux coordonnées du dessin. Un `<text>` SVG
 *   ne sait pas couper proprement un nom trop long, ne suit pas la taille de
 *   police du système et rend mal les chiffres alignés.
 *
 * • UN SURVOL QUI NE TOUCHE QUE SON CÔTÉ. Poser la souris sur une branche allume
 *   sa chaîne — « Logement » avec « Loyer » et « Charges », ce sont les mêmes
 *   euros — et atténue les branches VOISINES, celles auxquelles elle se compare.
 *   Le reste ne bouge pas : d'où vient l'argent n'apprend rien sur le poste
 *   qu'on regarde, et éteindre la moitié du dessin à chaque passage de souris se
 *   lisait plus mal qu'une figure fixe (c'est pourquoi il n'y en avait aucun).
 *   La règle — jusqu'où va la chaîne, quel côté s'atténue — est dans
 *   `lib/ui/sankeyFocus`, testable sans navigateur.
 *
 *   Les libellés portent déjà le nom et le montant : le survol n'a donc rien à
 *   RÉVÉLER, il ne fait que trier. C'est ce qui permet de l'atténuer franchement
 *   sans rien perdre.
 *
 * • DEUX RÉGIMES selon la place, et non un seul dessin rétréci. Sous 720 px, les
 *   gouttières mangeraient la figure : on les retire avec les libellés, et le
 *   dessin devient une figure de PROPORTIONS — les noms et les montants se
 *   lisent alors dans les listes juste en dessous, qui portent la même matière.
 */

import React from "react";
import { T } from "@/lib/ui/tokens";
import { tint } from "@/lib/ui/color";
import { sankeyGraphLayout } from "@/lib/ui/sankeyGraph";
import { sankeyFocus, inFocusRange, linkInFocusRange } from "@/lib/ui/sankeyFocus";

/** En dessous, la figure se passe de pastilles (cf. en-tête). */
const COMPACT_AT = 720;

/** Hauteurs du dessin, hors marges.
 *
 *  Le plafond est haut, et c'est voulu : entre tasser une vingtaine de noms les
 *  uns sur les autres et laisser la carte s'allonger, la carte gagne. Il ne
 *  reste là que comme garde-fou — un graphe accidentellement énorme ne doit pas
 *  produire une page de 8000 px. */
const H_MIN = 300;
const H_MAX = 1040;

/** Place qu'un libellé réclame : deux lignes de 16 px, plus le blanc qui les
 *  sépare de son voisin — assez pour qu'on rattache sans hésiter un montant au
 *  nom qui est au-dessus de lui plutôt qu'à celui d'en dessous. C'est l'écart
 *  minimal entre les milieux de deux branches voisines (`labelSlot`). */
const LABEL_SLOT = 34;

/** Marges verticales : sans elles, la première et la dernière branche collent
 *  au bord de la carte — et en bas, au texte posé sous le dessin. Elles valent
 *  une demi-hauteur de libellé, de quoi séparer sans creuser un trou. */
const PAD_TOP = 20;
const PAD_BOTTOM = 20;

/** Part de blanc dans un ruban, puis dans une barre (cf. en-tête).
 *
 *  Le ruban est passé de 0.58 à 0.25 avec la palette Duolingo : la palette
 *  d'origine était sombre et supportait d'en perdre 58 %, les teintes de la
 *  charte sont déjà claires et arrivaient délavées (contraste du ruban rendu
 *  1,22 à 1,46 sur blanc, contre 1,58 à 1,80 auparavant). À 0.25, les bases
 *  retombent dans la fourchette d'avant — 1,76 pour Feather Green, 1,97 pour
 *  Macaw, 3,13 pour Humpback —, ce qui évite d'assombrir la charte à la
 *  source pour rattraper un délavage introduit ici. */
const RIBBON_TINT = 0.25;
const NODE_TINT = 0.06;

/** Opacité d'un ruban, puis d'un ruban ATTÉNUÉ par le survol d'un voisin.
 *  0.14 plutôt que 0.4 : à mi-chemin, la branche éteinte reste assez présente
 *  pour qu'on la suive du regard, et le survol ne trie plus rien. */
const RIBBON = 0.92;
const RIBBON_OFF = 0.14;

/** Les mêmes, pour une barre et pour un libellé. Le texte s'atténue MOINS que
 *  son ruban : plus fin, il disparaîtrait au même réglage, et la colonne
 *  deviendrait illisible alors qu'on cherchait justement à y lire quelque
 *  chose. */
const NODE_OFF = 0.22;
const LABEL_OFF = 0.34;

/** Place réservée aux libellés de part et d'autre du dessin. Deux lignes de
 *  texte (le nom, puis le montant) tiennent là-dedans sans coupure pour un nom
 *  de poste ordinaire ; au-delà, l'ellipse du navigateur s'en charge. */
const GUTTER = 132;

export default function SankeyGraph({
  nodes = [],
  links = [],
  formatValue = (v) => String(Math.round(v)),
  ariaLabel,
  emptyLabel,
  /** Prévenu à chaque changement de branche survolée (l'id du nœud, ou `null`).
   *  C'est ce qui permet à une figure voisine de suivre le même survol. */
  onHoverNode,
  /** Branche à mettre en avant depuis l'EXTÉRIEUR — le pendant de `onHoverNode`.
   *  Le survol local reste prioritaire : la souris est ici, ce qu'elle désigne
   *  l'emporte sur ce qu'on souffle d'ailleurs. */
  highlight = null,
}) {
  const ref = React.useRef(null);
  const [width, setWidth] = React.useState(0);
  const [hover, setHover] = React.useState(null);
  const focused = hover ?? highlight ?? null;

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof ResizeObserver === "undefined") {
      // jsdom, et navigateurs anciens : une largeur de repli vaut mieux qu'un
      // dessin vide, la figure reste juste puisque tout est proportionnel.
      setWidth(el.clientWidth || 960);
      return;
    }
    const ro = new ResizeObserver((entries) => {
      const w = Math.round(entries[0].contentRect.width);
      if (w > 0) setWidth(w);
    });
    ro.observe(el);
    setWidth(el.clientWidth || 960);
    return () => ro.disconnect();
  }, []);

  const compact = width > 0 && width < COMPACT_AT;

  /* DEUX PASSES, et c'est la hauteur qui se joue entre les deux : la place que
     réclament les noms dépend de la colonne la plus peuplée, qu'on ne connaît
     qu'une fois les colonnes formées. Le premier calcul la rend (`heightNeeded`)
     et ne dépend pas de la hauteur reçue ; le second lui donne cette hauteur, et
     rendrait la même — il n'y a donc pas de va-et-vient possible.
     (Avant, la hauteur était ESTIMÉE en comptant les racines et les feuilles, et
     plafonnée à 640 px : au-delà d'une quinzaine de branches, les noms se
     tassaient au lieu que la carte s'allonge.) */
  const { layout, height } = React.useMemo(() => {
    const opts = (h) => ({
      width: width || 960,
      height: h,
      padTop: PAD_TOP,
      nodeW: compact ? 6 : 9,
      /* Les jours d'une colonne se paient sur l'épaisseur des rubans : à treize
         branches, 16 px d'écart mangeaient la moitié de la hauteur et il ne
         restait plus de flux à regarder. 10 px suffisent à séparer deux
         branches voisines — et l'écart s'élargit tout seul là où les deux
         voisines sont trop fines pour porter leur nom (`labelSlot`). */
      nodeGap: compact ? 6 : 10,
      minBand: compact ? 2 : 3,
      labelPad: 10,
      // Pas de libellés en régime compact : rien à espacer, et pas de gouttières
      // non plus — elles ne feraient que rétrécir le dessin.
      labelSlot: compact ? 0 : LABEL_SLOT,
      gutter: compact ? 0 : GUTTER,
    });

    const first = sankeyGraphLayout(nodes, links, opts(H_MIN));
    const wanted = Math.min(Math.max(first.heightNeeded, H_MIN), H_MAX);
    if (wanted <= H_MIN) return { layout: first, height: H_MIN };
    return { layout: sankeyGraphLayout(nodes, links, opts(wanted)), height: wanted };
  }, [nodes, links, width, compact]);

  const labels = React.useMemo(
    () => new Map(nodes.map((n) => [n.id, n.label])),
    [nodes],
  );
  const labelOf = (id) => labels.get(id) ?? id;

  /* Ce que le survol allume, et la zone qu'il atténue (cf. `lib/ui/sankeyFocus`).
     Calculé sur la sortie de la géométrie : c'est elle qui porte les colonnes,
     et c'est en colonnes que se dit « son côté ». */
  const focus = React.useMemo(
    () => sankeyFocus(layout.nodes, layout.links, focused),
    [layout, focused],
  );

  const columnOf = React.useMemo(
    () => new Map(layout.nodes.map((n) => [n.id, n.column])),
    [layout],
  );

  const nodeDimmed = (id) =>
    !!focus && !focus.nodes.has(id) && inFocusRange(focus, columnOf.get(id) ?? 0);

  const linkDimmed = (band) =>
    !!focus && !focus.links.has(band.id)
    && linkInFocusRange(focus, columnOf.get(band.source) ?? 0, columnOf.get(band.target) ?? 0);

  /* Un ruban désigne son bout DISTINCTIF, celui-là même dont il porte la teinte
     (cf. `color` dans `lib/ui/sankeyGraph`) : survoler « Salaire → budget »
     parle du salaire, survoler « budget → Logement » parle du logement. La
     règle est la même des deux côtés — la cible quand elle distingue, la source
     quand tout s'y rejoint. */
  const inDegree = React.useMemo(() => {
    const m = new Map();
    for (const b of layout.links) m.set(b.target, (m.get(b.target) ?? 0) + 1);
    return m;
  }, [layout]);
  const bandOwner = (band) => ((inDegree.get(band.target) ?? 0) > 1 ? band.source : band.target);

  const enter = (id) => {
    setHover(id);
    onHoverNode?.(id);
  };
  const leave = () => {
    setHover(null);
    onHoverNode?.(null);
  };

  const total = PAD_TOP + height + PAD_BOTTOM;

  if (layout.links.length === 0) {
    return (
      <div ref={ref} style={{ width: "100%" }}>
        <div style={{
          height: H_MIN, display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 14, color: T.textSub, textAlign: "center",
        }}>
          {emptyLabel}
        </div>
      </div>
    );
  }

  return (
    /* Le relâchement est porté par le CADRE et non par chaque forme : entre deux
       rubans voisins il reste toujours un filet de blanc, et un `onMouseLeave`
       par forme y ferait clignoter la figure à chaque traversée. */
    <div ref={ref} style={{ width: "100%", position: "relative" }} onMouseLeave={leave}>
      {/* `backwards` et SURTOUT PAS `both` : une animation dont l'état final est
          retenu (`forwards`, donc `both`) garde la main sur `opacity` une fois
          finie — elle bat l'attribut du ruban comme le style du libellé, quelle
          que soit leur spécificité. Les rubans restaient donc à 1 quoi qu'on
          fasse, et le survol ne se voyait que sur les barres, seules formes non
          animées : la branche entière ne réagissait pas, son bout seulement.
          `backwards` garde ce qu'on voulait de `both` — l'élément attend son
          tour à opacité nulle pendant son délai — et rend `opacity` à la forme
          dès l'entrée terminée. */}
      <style>{`
        @keyframes tr4de-sankeygraph-in { from { opacity: 0 } to { opacity: 1 } }
        .tr4de-sankeygraph-part { animation: tr4de-sankeygraph-in 460ms var(--ease-out, ease) backwards }
        @media (prefers-reduced-motion: reduce) {
          .tr4de-sankeygraph-part { animation: none }
        }
      `}</style>

      <svg
        viewBox={`0 0 ${layout.width} ${total}`}
        width="100%"
        height={total}
        role="img"
        aria-label={ariaLabel}
        style={{ display: "block" }}
      >
        {/* Les rubans d'abord, les barres par-dessus : la barre ferme proprement
            le bout du ruban, quelle que soit sa courbure. */}
        {layout.links.map((band, i) => (
          <path
            key={`ribbon-${band.id}`}
            className="tr4de-sankeygraph-part"
            d={band.path}
            fill={tint(band.color, RIBBON_TINT)}
            opacity={linkDimmed(band) ? RIBBON_OFF : RIBBON}
            onMouseEnter={() => enter(bandOwner(band))}
            style={{
              animationDelay: `${Math.min(i, 16) * 28}ms`,
              transition: "opacity 140ms var(--ease-out, ease)",
            }}
          >
            <title>{`${labelOf(band.source)} → ${labelOf(band.target)} · ${formatValue(band.value)}`}</title>
          </path>
        ))}

        {layout.nodes.map((n) => (
          <rect
            key={`node-${n.id}`}
            x={n.x}
            y={n.y}
            width={n.w}
            height={n.h}
            /* Bouts CARRÉS : arrondie, une barre de 9 px de large se lit comme
               une gélule posée là, et son extrémité ne coïncide plus avec le
               bord du ruban qu'elle ferme. */
            fill={tint(n.color, NODE_TINT)}
            opacity={nodeDimmed(n.id) ? NODE_OFF : 1}
            onMouseEnter={() => enter(n.id)}
            style={{ transition: "opacity 140ms var(--ease-out, ease)" }}
          >
            <title>{`${labelOf(n.id)} · ${formatValue(n.value)}`}</title>
          </rect>
        ))}

        {/* Pas de traits de rappel : un libellé est toujours en face de sa
            branche, il n'y a rien à relier. */}
      </svg>

      {/* Les libellés, posés aux coordonnées du dessin : le nom, puis le montant
          sur une deuxième ligne. Deux lignes plutôt qu'une : « Alimentation :
          150,00 € » se coupait au milieu du nom dès que la gouttière était
          étroite, et c'est le nom qu'on lit en premier. Le montant, lui, s'aligne
          d'une branche à l'autre en chiffres tabulaires.

          Ils ne réagissent plus au survol (cf. en-tête) : ils portent déjà tout
          ce qu'un survol aurait montré. */}
      {!compact && layout.nodes.map((n) => {
        const centre = n.labelSide === "centre";
        const before = n.labelSide === "before";
        return (
          <div
            key={`label-${n.id}`}
            className="tr4de-sankeygraph-part"
            /* Le nom est une cible de survol au même titre que le ruban : c'est
               souvent lui qu'on vise, et une branche fine n'offre que 3 px de
               haut à la souris. */
            onMouseEnter={() => enter(n.id)}
            style={{
              position: "absolute",
              top: n.labelY,
              left: n.labelX,
              transform: before
                ? "translate(-100%, -50%)"
                : centre
                  ? "translate(-50%, -50%)"
                  : "translateY(-50%)",
              maxWidth: GUTTER - 8,
              textAlign: before ? "right" : centre ? "center" : "left",
              /* Le libellé du milieu se pose SUR sa barre : il lui faut un fond,
                 sinon le texte se lit par-dessus le nœud et les rubans. Ceux des
                 gouttières sont sur du blanc, ils n'en ont pas besoin.
                 Ce fond reste TRANSLUCIDE : le dessin doit continuer de passer
                 dessous, sans quoi le libellé devient une étiquette collée sur
                 la figure et coupe la barre en deux. */
              ...(centre ? {
                padding: "6px 12px",
                borderRadius: 8,
                background: "color-mix(in srgb, var(--color-card-bg, #FFFFFF) 88%, transparent)",
                border: `1px solid color-mix(in srgb, var(--color-border, #E5E5E5) 70%, transparent)`,
              } : null),
              opacity: nodeDimmed(n.id) ? LABEL_OFF : 1,
              transition: "opacity 140ms var(--ease-out, ease)",
            }}
          >
            <div style={{
              fontSize: 12, lineHeight: "16px", fontWeight: centre ? 600 : 500, color: T.text,
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            }}>
              {labelOf(n.id)}
            </div>
            {/* Le montant se décolle du nom : collés, les deux lignes d'un
                libellé forment un pavé qu'on lit comme un seul bloc, et l'œil
                ne sait plus où finit une branche et où commence sa voisine. */}
            <div style={{
              fontSize: 12, lineHeight: "16px", color: T.textSub,
              fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap",
              marginTop: 2,
            }}>
              {formatValue(n.value)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
