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
 * • EN HTML, posés par-dessus le SVG aux coordonnées du dessin. Un `<text>` SVG
 *   ne sait pas couper proprement un nom trop long, ne suit pas la taille de
 *   police du système et rend mal les chiffres alignés.
 *
 * • AUCUN SURVOL. Le dessin ne réagit pas au passage de la souris : tout ce
 *   qu'un survol révélait (le nom, le montant) est maintenant écrit à côté de
 *   chaque branche, et une figure qui s'éteint à moitié dès qu'on passe dessus
 *   se lit plus mal qu'une figure fixe.
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

/** En dessous, la figure se passe de pastilles (cf. en-tête). */
const COMPACT_AT = 720;

/** Hauteurs du dessin, hors marges. */
const H_MIN = 300;
const H_MAX = 640;

/** Hauteur donnée à une ligne de la colonne la plus peuplée : c'est la place
 *  qu'un libellé demande pour ne pas toucher son voisin. Un libellé fait deux
 *  lignes de 16 px ; le reste est le blanc qui les sépare, et il en faut assez
 *  pour qu'on rattache sans hésiter un montant au nom qui est au-dessus de lui
 *  plutôt qu'à celui d'en dessous. */
const ROW = 42;

/** Marges verticales : sans elles, la première et la dernière branche collent
 *  au bord de la carte — et en bas, au texte posé sous le dessin. Elles valent
 *  une demi-hauteur de libellé, de quoi séparer sans creuser un trou. */
const PAD_TOP = 20;
const PAD_BOTTOM = 20;

/** Part de blanc dans un ruban, puis dans une barre (cf. en-tête). */
const RIBBON_TINT = 0.58;
const NODE_TINT = 0.06;

/** Opacité des rubans. Une seule valeur : le dessin ne réagit pas au survol. */
const RIBBON = 0.92;

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
}) {
  const ref = React.useRef(null);
  const [width, setWidth] = React.useState(0);

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
      labelPad: 10,
      labelGap: compact ? 0 : 34,
      // Pas de gouttières en régime compact : sans libellés, elles ne feraient
      // que rétrécir le dessin.
      gutter: compact ? 0 : GUTTER,
    }),
    [nodes, links, width, height, compact],
  );

  const labels = React.useMemo(
    () => new Map(nodes.map((n) => [n.id, n.label])),
    [nodes],
  );
  const labelOf = (id) => labels.get(id) ?? id;

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
      >
        {/* Les rubans d'abord, les barres par-dessus : la barre ferme proprement
            le bout du ruban, quelle que soit sa courbure. */}
        {layout.links.map((band, i) => (
          <path
            key={`ribbon-${band.id}`}
            className="tr4de-sankeygraph-part"
            d={band.path}
            fill={tint(band.color, RIBBON_TINT)}
            opacity={RIBBON}
            style={{ animationDelay: `${Math.min(i, 16) * 28}ms` }}
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
          >
            <title>{`${labelOf(n.id)} · ${formatValue(n.value)}`}</title>
          </rect>
        ))}

        {/* Traits de rappel : une branche fine dont le libellé a été poussé plus
            bas (pour ne pas recouvrir celui de sa voisine) se verrait attribuer
            le nom d'à côté. Le trait dit lequel va avec lequel — et seulement
            quand le libellé a QUITTÉ l'épaisseur de son nœud : tant qu'il tombe
            en face, il le désigne sans ambiguïté. Les libellés centrés, eux,
            sont sur leur barre : rien à relier. */}
        {!compact && layout.nodes.map((n) => {
          if (n.labelSide === "centre") return null;
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
              opacity={0.4}
            />
          );
        })}

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
              pointerEvents: "none",
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
              fontSize: 12, lineHeight: "16px", marginTop: 2, color: T.textSub,
              fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap",
            }}>
              {formatValue(n.value)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
