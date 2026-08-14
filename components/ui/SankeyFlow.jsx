"use client";

/**
 * Diagramme de flux (Sankey) — ce qui entre, ce qui traverse, ce qui sort.
 *
 * Pourquoi ce dessin plutôt qu'un anneau : un anneau répond à « comment se
 * répartit ce qui sort », et il le fait bien — c'est ce qu'il fait ailleurs dans
 * l'app. Il ne sait pas dire d'où vient l'argent, ni ce qu'il en reste. Un flux
 * met les trois sur la même figure : les sources à gauche, le total au centre,
 * les postes à droite, et l'épaisseur du ruban EST le montant.
 *
 * La géométrie est dans `lib/ui/sankey` — testable sans navigateur. Ici : la
 * mesure de la largeur disponible, les libellés, le survol et les textes de
 * remplacement.
 *
 * Deux régimes selon la place, et non un seul dessin rétréci : sous 620 px les
 * gouttières de libellés mangeraient la figure, on les supprime et le diagramme
 * devient une figure de PROPORTIONS — les noms et les montants se lisent alors
 * dans les listes juste en dessous, qui portent exactement la même matière.
 */

import React from "react";
import { T } from "@/lib/ui/tokens";
import { sankeyLayout } from "@/lib/ui/sankey";

/** En dessous, la figure se passe de libellés (cf. en-tête). */
const COMPACT_AT = 620;

/** Place d'un libellé, de part et d'autre du dessin. */
const GUTTER = 148;

/** Hauteurs du dessin, hors marge du titre central. */
const H_MIN = 260;
const H_MAX = 420;

/** Un nœud a besoin de cette hauteur pour que son libellé se pose sans toucher
 *  celui du voisin ; c'est ce qui fixe la hauteur totale de la figure. */
const ROW = 34;

/** Sous ces épaisseurs, un ruban n'a plus la place d'un libellé, puis d'un
 *  montant. Le nom disparaît avant le chiffre — dans le doute, on garde ce qui
 *  se retrouve dans les listes en dessous. */
const LABEL_AT = 11;
const AMOUNT_AT = 24;

/** Marge haute : le nom du nœud central s'y écrit. */
const PAD_TOP = 26;

/** Coupe un libellé trop long pour sa gouttière. Approximation assumée : on ne
 *  mesure pas le texte, on compte les caractères à la largeur moyenne du chiffre
 *  de la police — c'est faux de quelques pixels, jamais de quelques mots. */
function ellipsize(text, maxWidth, size) {
  const s = String(text ?? "");
  const max = Math.floor(maxWidth / (size * 0.56));
  return s.length <= max ? s : `${s.slice(0, Math.max(max - 1, 1))}…`;
}

export default function SankeyFlow({
  inflows = [],
  outflows = [],
  centreLabel,
  centreValue,
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
      setWidth(el.clientWidth || 900);
      return;
    }
    const ro = new ResizeObserver((entries) => {
      const w = Math.round(entries[0].contentRect.width);
      if (w > 0) setWidth(w);
    });
    ro.observe(el);
    setWidth(el.clientWidth || 900);
    return () => ro.disconnect();
  }, []);

  const compact = width > 0 && width < COMPACT_AT;
  const gutter = compact ? 0 : GUTTER;
  const rows = Math.max(inflows.length, outflows.length, 1);
  const height = Math.min(Math.max(rows * ROW, H_MIN), H_MAX);

  const layout = React.useMemo(
    () => sankeyLayout(inflows, outflows, {
      width: width || 900,
      height,
      gutter,
      padTop: PAD_TOP,
      nodeW: compact ? 8 : 10,
    }),
    [inflows, outflows, width, height, gutter, compact],
  );

  /* Les libellés sont cherchés PAR CÔTÉ : un même id peut vivre des deux côtés
     du diagramme (les nœuds de synthèse « reste » et « puisé » sont voisins de
     nom), et les confondre mettrait le libellé de l'un sur le ruban de l'autre. */
  const labels = React.useMemo(() => ({
    in: new Map(inflows.map((f) => [f.id, f.label])),
    out: new Map(outflows.map((f) => [f.id, f.label])),
  }), [inflows, outflows]);

  const labelOf = (band) => labels[band.side].get(band.id) ?? band.id;

  const total = PAD_TOP + height;
  const empty = layout.bands.length === 0;

  return (
    <div ref={ref} style={{ width: "100%" }}>
      {empty ? (
        <div style={{ height: H_MIN, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: T.textSub, textAlign: "center" }}>
          {emptyLabel}
        </div>
      ) : (
        <svg
          viewBox={`0 0 ${layout.width} ${total}`}
          width="100%"
          height={total}
          role="img"
          aria-label={ariaLabel}
          style={{ display: "block", overflow: "visible" }}
          onMouseLeave={() => setHover(null)}
        >
          {/* Les rubans d'abord, les nœuds par-dessus : le nœud ferme
              proprement le bout du ruban, quelle que soit sa courbure. */}
          {layout.bands.map((band) => {
            const label = labelOf(band);
            const dim = hover != null && hover !== `${band.side}${band.id}`;
            return (
              <path
                key={`ribbon-${band.side}-${band.id}`}
                d={band.path}
                fill={band.color}
                fillOpacity={dim ? 0.18 : 0.52}
                onMouseEnter={() => setHover(`${band.side}${band.id}`)}
                style={{ transition: "fill-opacity 140ms var(--ease-out, ease)" }}
              >
                <title>{`${label} · ${formatValue(band.amount)}`}</title>
              </path>
            );
          })}

          {layout.bands.map((band) => {
            const dim = hover != null && hover !== `${band.side}${band.id}`;
            return (
              <rect
                key={`node-${band.side}-${band.id}`}
                x={band.node.x}
                y={band.node.y}
                width={band.node.w}
                height={band.node.h}
                rx={Math.min(band.node.w / 2, band.node.h / 2)}
                fill={band.color}
                opacity={dim ? 0.35 : 1}
                style={{ transition: "opacity 140ms var(--ease-out, ease)" }}
              />
            );
          })}

          {/* Le nœud central : la barre que tout traverse, et son nom au-dessus.
              Il porte l'encre du thème, pas une couleur de série — ce n'est pas
              une catégorie, c'est le total. */}
          <rect
            x={layout.hub.x}
            y={layout.hub.y}
            width={layout.hub.w}
            height={layout.hub.h}
            rx={layout.hub.w / 2}
            fill={T.text}
            opacity={0.82}
          />
          <text
            x={layout.hub.x + layout.hub.w / 2}
            y={PAD_TOP - 14}
            textAnchor="middle"
            style={{ fontSize: 11, fill: T.textSub, fontFamily: "inherit" }}
          >
            {centreLabel}
          </text>
          <text
            x={layout.hub.x + layout.hub.w / 2}
            y={PAD_TOP - 2}
            textAnchor="middle"
            style={{ fontSize: 13, fontWeight: 600, fill: T.text, fontFamily: "inherit", fontVariantNumeric: "tabular-nums" }}
          >
            {formatValue(centreValue)}
          </text>

          {/* Les libellés en dernier : ils ne doivent jamais passer sous un
              ruban. Absents en régime compact, où la figure n'a plus de
              gouttière — les listes en dessous les portent. */}
          {!compact && layout.bands.map((band) => {
            if (band.thickness < LABEL_AT) return null;
            const two = band.thickness >= AMOUNT_AT;
            const dim = hover != null && hover !== `${band.side}${band.id}`;
            const label = ellipsize(labelOf(band), GUTTER - 12, 12);
            return (
              <g
                key={`label-${band.side}-${band.id}`}
                opacity={dim ? 0.4 : 1}
                style={{ transition: "opacity 140ms var(--ease-out, ease)" }}
              >
                <text
                  x={band.label.x}
                  y={band.label.y + (two ? -2 : 4)}
                  textAnchor={band.label.anchor}
                  style={{ fontSize: 12, fill: T.text, fontFamily: "inherit" }}
                >
                  {label}
                </text>
                {two && (
                  <text
                    x={band.label.x}
                    y={band.label.y + 11}
                    textAnchor={band.label.anchor}
                    style={{ fontSize: 11, fill: T.textSub, fontFamily: "inherit", fontVariantNumeric: "tabular-nums" }}
                  >
                    {formatValue(band.amount)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}
