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
 * mesure de la largeur disponible, la peinture, les libellés et le survol.
 *
 * ── Ce qui rend la figure lisible, et pourquoi c'est fait ainsi ─────────────
 *
 * • DÉGRADÉ DANS LE SENS DU FLUX. Chaque ruban est vif contre son nœud et
 *   s'éteint vers le centre. C'est ce qui sauve le milieu du dessin : dix rubans
 *   opaques qui se rejoignent font une tache où plus aucune branche ne se suit,
 *   alors que dix rubans qui s'effacent en arrivant laissent voir la convergence.
 *   Et la couleur reste franche là où on la lit — à côté de son libellé.
 *
 * • UN JOUR ENTRE LES BRANCHES, des deux côtés (cf. `hubGap`). Jointives, elles
 *   se lisaient comme un seul bloc de couleur.
 *
 * • LIBELLÉS EN HTML, posés par-dessus le SVG aux coordonnées du dessin. Un
 *   `<text>` SVG ne sait pas couper proprement un nom trop long, ne suit pas la
 *   taille de police du système et rend mal les chiffres alignés. Ici : deux
 *   lignes, le nom puis le montant, avec la vraie ellipse du navigateur.
 *
 * • DEUX RÉGIMES selon la place, et non un seul dessin rétréci. Sous 640 px les
 *   gouttières de libellés mangeraient la figure : on les supprime et le
 *   diagramme devient une figure de PROPORTIONS — les noms et les montants se
 *   lisent alors dans les listes juste en dessous, qui portent la même matière.
 */

import React from "react";
import { T } from "@/lib/ui/tokens";
import { sankeyLayout } from "@/lib/ui/sankey";

/** En dessous, la figure se passe de libellés (cf. en-tête). */
const COMPACT_AT = 640;

/** Place d'un libellé, de part et d'autre du dessin. */
const GUTTER = 168;

/** Hauteurs du dessin, hors marge du titre central. */
const H_MIN = 280;
const H_MAX = 460;

/** Hauteur donnée à une branche : c'est elle qui fixe la hauteur de la figure,
 *  et c'est la place qu'un libellé sur deux lignes demande pour ne pas toucher
 *  son voisin. */
const ROW = 42;

/** Marge haute : le nom du nœud central s'y écrit. */
const PAD_TOP = 34;

/** Marge basse : sans elle, la dernière branche colle au bord de la carte. */
const PAD_BOTTOM = 10;

/** Opacités des rubans : contre le nœud, puis contre le centre. */
const VIVID = 0.9;
const FADED = 0.24;

/** Ce que devient une branche dont on survole une autre. */
const DIMMED = 0.16;

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
  /* Les <defs> sont référencées par id : il doit être unique, sinon deux
     diagrammes sur la même page partagent les dégradés du premier. */
  const uid = React.useId().replace(/:/g, "");

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
      nodeW: compact ? 7 : 9,
      gap: compact ? 6 : 12,
    }),
    [inflows, outflows, width, height, gutter, compact],
  );

  /* Les libellés sont cherchés PAR CÔTÉ : un même id peut vivre des deux côtés
     du diagramme (les nœuds de synthèse « reste » et « pris sur le solde » sont
     voisins de nom), et les confondre mettrait le libellé de l'un sur l'autre. */
  const labels = React.useMemo(() => ({
    in: new Map(inflows.map((f) => [f.id, f.label])),
    out: new Map(outflows.map((f) => [f.id, f.label])),
  }), [inflows, outflows]);

  const keyOf = (band) => `${band.side}-${band.id}`;
  const labelOf = (band) => labels[band.side].get(band.id) ?? band.id;
  const dimmed = (band) => hover != null && hover !== keyOf(band);

  const total = PAD_TOP + height + PAD_BOTTOM;
  const empty = layout.bands.length === 0;

  if (empty) {
    return (
      <div ref={ref} style={{ width: "100%" }}>
        <div style={{ height: H_MIN, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: T.textSub, textAlign: "center" }}>
          {emptyLabel}
        </div>
      </div>
    );
  }

  return (
    <div ref={ref} style={{ width: "100%", position: "relative" }}>
      <style>{`
        @keyframes tr4de-sankey-in { from { opacity: 0 } to { opacity: 1 } }
        .tr4de-sankey-band { animation: tr4de-sankey-in 460ms var(--ease-out, ease) both }
        @media (prefers-reduced-motion: reduce) {
          .tr4de-sankey-band { animation: none }
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
        <defs>
          {layout.bands.map((band, i) => (
            /* Un dégradé par ruban, en coordonnées du dessin : il suit donc le
               SENS du flux, de son nœud vers le centre à gauche, du centre vers
               son nœud à droite. */
            <linearGradient
              key={`grad-${keyOf(band)}`}
              id={`${uid}-${i}`}
              gradientUnits="userSpaceOnUse"
              x1={band.from}
              x2={band.to}
            >
              <stop offset="0%" stopColor={band.color} stopOpacity={band.side === "in" ? VIVID : FADED} />
              <stop offset="100%" stopColor={band.color} stopOpacity={band.side === "in" ? FADED : VIVID} />
            </linearGradient>
          ))}
        </defs>

        {/* Les rubans d'abord, les nœuds par-dessus : le nœud ferme proprement le
            bout du ruban, quelle que soit sa courbure. */}
        {layout.bands.map((band, i) => (
          <path
            key={`ribbon-${keyOf(band)}`}
            className="tr4de-sankey-band"
            d={band.path}
            fill={`url(#${uid}-${i})`}
            opacity={dimmed(band) ? DIMMED : 1}
            onMouseEnter={() => setHover(keyOf(band))}
            style={{
              animationDelay: `${Math.min(i, 12) * 35}ms`,
              transition: "opacity 160ms var(--ease-out, ease)",
            }}
          >
            <title>{`${labelOf(band)} · ${formatValue(band.amount)}`}</title>
          </path>
        ))}

        {layout.bands.map((band) => (
          <rect
            key={`node-${keyOf(band)}`}
            x={band.node.x}
            y={band.node.y}
            width={band.node.w}
            height={band.node.h}
            rx={Math.min(band.node.w / 2, band.node.h / 2)}
            fill={band.color}
            opacity={dimmed(band) ? 0.28 : 1}
            style={{ transition: "opacity 160ms var(--ease-out, ease)" }}
          />
        ))}

        {/* Traits de rappel : une petite branche dont le libellé a été poussé
            plus bas (pour ne pas recouvrir celui de sa voisine) se verrait
            attribuer le nom d'à côté. Le trait dit lequel va avec lequel. */}
        {!compact && layout.bands.map((band) => band.label.connector && (
          <path
            key={`lead-${keyOf(band)}`}
            d={band.label.connector}
            fill="none"
            stroke={band.color}
            strokeWidth={1}
            opacity={dimmed(band) ? 0.12 : 0.45}
            style={{ transition: "opacity 160ms var(--ease-out, ease)" }}
          />
        ))}

        {/* Le nœud central : la barre que tout traverse. Discrète — ce n'est pas
            une catégorie, c'est le total, et le chiffre au-dessus le dit déjà.
            Une barre foncée au milieu d'un dégradé couperait le flux en deux. */}
        <rect
          x={layout.hub.x}
          y={layout.hub.y}
          width={layout.hub.w}
          height={layout.hub.h}
          rx={layout.hub.w / 2}
          fill={T.text}
          opacity={0.16}
        />
      </svg>

      {/* Le total, centré au-dessus de la barre centrale. En HTML comme les
          libellés : même police, même rendu des chiffres que le reste de la page. */}
      <div
        style={{
          position: "absolute", top: 0, left: 0, width: "100%",
          display: "flex", flexDirection: "column", alignItems: "center",
          gap: 1, pointerEvents: "none",
        }}
      >
        <span style={{ fontSize: 11, lineHeight: 1.2, color: T.textMut }}>{centreLabel}</span>
        <span style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.2, color: T.text, fontVariantNumeric: "tabular-nums" }}>
          {formatValue(centreValue)}
        </span>
      </div>

      {/* Les libellés, posés aux coordonnées du dessin. Ils restent survolables :
          pointer le nom d'une branche est le geste naturel pour l'isoler. */}
      {!compact && layout.bands.map((band) => {
        const left = band.side === "in";
        return (
          <div
            key={`label-${keyOf(band)}`}
            className="tr4de-sankey-band"
            onMouseEnter={() => setHover(keyOf(band))}
            onMouseLeave={() => setHover(null)}
            style={{
              position: "absolute",
              top: band.label.y,
              left: left ? 0 : band.label.x,
              width: GUTTER - 12,
              transform: "translateY(-50%)",
              textAlign: left ? "right" : "left",
              opacity: dimmed(band) ? 0.32 : 1,
              transition: "opacity 160ms var(--ease-out, ease)",
              cursor: "default",
            }}
          >
            <span style={{
              display: "block", fontSize: 13, fontWeight: 500, lineHeight: "17px", color: T.text,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {labelOf(band)}
            </span>
            <span style={{
              display: "block", fontSize: 12, lineHeight: "16px", color: T.textSub,
              fontVariantNumeric: "tabular-nums",
            }}>
              {formatValue(band.amount)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
