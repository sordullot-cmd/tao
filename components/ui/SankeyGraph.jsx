"use client";

/**
 * Diagramme de flux (Sankey) à plusieurs niveaux.
 *
 * `SankeyFlow` dessine le cas à un nœud central, avec les libellés rangés dans
 * deux gouttières, à gauche et à droite. Ce dessin-ci répond à la même question
 * un cran plus loin — les postes s'y déplient sur leurs sous-postes — et il ne
 * peut donc plus s'appuyer sur des gouttières : les colonnes du milieu n'en ont
 * pas. Les noms se posent en PASTILLES sur les rubans, contre le nœud qu'ils
 * désignent. C'est ce qui permet de garder toute la largeur pour le dessin.
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
 * • PASTILLES EN HTML, posées par-dessus le SVG aux coordonnées du dessin. Un
 *   `<text>` SVG ne sait pas couper proprement un nom trop long, ne suit pas la
 *   taille de police du système et rend mal les chiffres alignés.
 *
 * • DEUX RÉGIMES selon la place, et non un seul dessin rétréci. Sous 720 px, les
 *   pastilles se marcheraient dessus dans chaque colonne : on les retire et la
 *   figure devient une figure de PROPORTIONS — les noms et les montants se
 *   lisent alors dans les listes juste en dessous, qui portent la même matière.
 */

import React from "react";
import { T } from "@/lib/ui/tokens";
import { tint } from "@/lib/ui/color";
import { sankeyGraphLayout } from "@/lib/ui/sankeyGraph";

/** En dessous, la figure se passe de pastilles (cf. en-tête). */
const COMPACT_AT = 720;

/** Hauteurs du dessin, hors marges. */
const H_MIN = 300;
const H_MAX = 640;

/** Hauteur donnée à une ligne de la colonne la plus peuplée : c'est la place
 *  qu'une pastille demande pour ne pas toucher sa voisine. */
const ROW = 34;

/** Marges verticales : sans elles, la première et la dernière branche collent
 *  au bord de la carte. */
const PAD_TOP = 12;
const PAD_BOTTOM = 12;

/** Part de blanc dans un ruban, puis dans une barre (cf. en-tête). */
const RIBBON_TINT = 0.58;
const NODE_TINT = 0.06;

/** Opacité des rubans, et ce que devient celui dont on survole un autre. */
const RIBBON = 0.92;
const DIMMED = 0.14;

export default function SankeyGraph({
  nodes = [],
  links = [],
  formatValue = (v) => String(Math.round(v)),
  ariaLabel,
  emptyLabel,
}) {
  const ref = React.useRef(null);
  const [width, setWidth] = React.useState(0);
  const [hover, setHover] = React.useState(null);

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

  /* La hauteur se règle sur la colonne la plus peuplée, qu'on ne connaît qu'après
     le calcul. On l'ESTIME par les deux extrémités — les racines et les feuilles —
     parce que sur un arbre, la colonne la plus chargée est toujours l'une des
     deux, et se tromper ne coûterait qu'un peu de blanc en haut et en bas. */
  const rows = React.useMemo(() => {
    const hasIn = new Set(links.map((l) => l.target));
    const hasOut = new Set(links.map((l) => l.source));
    const roots = nodes.filter((n) => !hasIn.has(n.id)).length;
    const leaves = nodes.filter((n) => !hasOut.has(n.id)).length;
    return Math.max(roots, leaves, 1);
  }, [nodes, links]);

  const height = Math.min(Math.max(rows * ROW, H_MIN), H_MAX);

  const layout = React.useMemo(
    () => sankeyGraphLayout(nodes, links, {
      width: width || 960,
      height,
      padTop: PAD_TOP,
      nodeW: compact ? 6 : 9,
      /* Les jours d'une colonne se paient sur l'épaisseur des rubans : à treize
         branches, 16 px d'écart mangeaient la moitié de la hauteur et il ne
         restait plus de flux à regarder. 10 px suffisent à séparer deux
         branches voisines. */
      nodeGap: compact ? 6 : 10,
      minBand: compact ? 2 : 3,
      labelPad: 9,
      labelGap: compact ? 0 : 26,
    }),
    [nodes, links, width, height, compact],
  );

  const labels = React.useMemo(
    () => new Map(nodes.map((n) => [n.id, n.label])),
    [nodes],
  );
  const labelOf = (id) => labels.get(id) ?? id;

  /* Le survol met en avant un nœud ET tout ce qui le touche : un poste sans ses
     rubans, ce sont deux barres isolées dont on ne voit plus le lien. */
  const lit = React.useMemo(() => {
    if (!hover) return null;
    const keep = new Set([hover]);
    for (const l of layout.links) {
      if (l.source === hover || l.target === hover) {
        keep.add(l.id);
        keep.add(l.source);
        keep.add(l.target);
      } else if (l.id === hover) {
        keep.add(l.source);
        keep.add(l.target);
      }
    }
    return keep;
  }, [hover, layout.links]);

  const dim = (id) => lit != null && !lit.has(id);

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
    <div ref={ref} style={{ width: "100%", position: "relative" }}>
      <style>{`
        @keyframes tr4de-sankeygraph-in { from { opacity: 0 } to { opacity: 1 } }
        .tr4de-sankeygraph-part { animation: tr4de-sankeygraph-in 460ms var(--ease-out, ease) both }
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
        onMouseLeave={() => setHover(null)}
      >
        {/* Les rubans d'abord, les barres par-dessus : la barre ferme proprement
            le bout du ruban, quelle que soit sa courbure. */}
        {layout.links.map((band, i) => (
          <path
            key={`ribbon-${band.id}`}
            className="tr4de-sankeygraph-part"
            d={band.path}
            fill={tint(band.color, RIBBON_TINT)}
            opacity={dim(band.id) ? DIMMED : RIBBON}
            onMouseEnter={() => setHover(band.id)}
            style={{
              animationDelay: `${Math.min(i, 16) * 28}ms`,
              transition: "opacity 160ms var(--ease-out, ease)",
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
            rx={Math.min(n.w / 2, n.h / 2)}
            fill={tint(n.color, NODE_TINT)}
            opacity={dim(n.id) ? 0.24 : 1}
            onMouseEnter={() => setHover(n.id)}
            style={{ transition: "opacity 160ms var(--ease-out, ease)" }}
          >
            <title>{`${labelOf(n.id)} · ${formatValue(n.value)}`}</title>
          </rect>
        ))}

        {/* Traits de rappel : une branche fine dont la pastille a été poussée
            plus bas (pour ne pas recouvrir celle de sa voisine) se verrait
            attribuer le nom d'à côté. Le trait dit lequel va avec lequel. On ne
            le trace que si la pastille a QUITTÉ l'épaisseur de son nœud — tant
            qu'elle tombe en face, elle le désigne sans ambiguïté. */}
        {!compact && layout.nodes.map((n) => {
          const outside = n.labelY < n.y - 2 || n.labelY > n.y + n.h + 2;
          if (!outside) return null;
          const from = n.labelSide === "before" ? n.x - 1 : n.x + n.w + 1;
          const to = n.labelSide === "before" ? n.labelX + 3 : n.labelX - 3;
          const mid = (from + to) / 2;
          return (
            <path
              key={`lead-${n.id}`}
              d={`M${from},${n.centreY} C${mid},${n.centreY} ${mid},${n.labelY} ${to},${n.labelY}`}
              fill="none"
              stroke={n.color}
              strokeWidth={1}
              opacity={dim(n.id) ? 0.1 : 0.4}
              style={{ transition: "opacity 160ms var(--ease-out, ease)" }}
            />
          );
        })}
      </svg>

      {/* Les pastilles, posées aux coordonnées du dessin. Elles restent
          survolables : pointer le nom d'une branche est le geste naturel pour
          l'isoler. Translucides, pour que le ruban reste lisible dessous. */}
      {!compact && layout.nodes.map((n) => (
        <div
          key={`label-${n.id}`}
          className="tr4de-sankeygraph-part"
          onMouseEnter={() => setHover(n.id)}
          onMouseLeave={() => setHover(null)}
          style={{
            position: "absolute",
            top: n.labelY,
            left: n.labelX,
            transform: n.labelSide === "before"
              ? "translate(-100%, -50%)"
              : "translateY(-50%)",
            maxWidth: "26%",
            padding: "2px 8px",
            borderRadius: 7,
            background: "color-mix(in srgb, var(--color-card-bg, #FFFFFF) 84%, transparent)",
            border: `1px solid color-mix(in srgb, var(--color-border, #E5E5E5) 70%, transparent)`,
            fontSize: 12,
            lineHeight: "17px",
            color: T.text,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            opacity: dim(n.id) ? 0.3 : 1,
            transition: "opacity 160ms var(--ease-out, ease)",
            cursor: "default",
            pointerEvents: "auto",
          }}
        >
          {labelOf(n.id)}
          <span style={{ color: T.textSub, fontVariantNumeric: "tabular-nums" }}>
            {" : "}{formatValue(n.value)}
          </span>
        </div>
      ))}
    </div>
  );
}
