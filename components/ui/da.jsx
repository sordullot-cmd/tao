"use client";

/* ============================================================================
   Briques visuelles de la nouvelle direction artistique (maquettes Figma).
   Extraites de DashboardPage pour être réutilisées par les autres pages.

   Règle : aucune couleur en dur. Tout passe par lib/ui/tokens.ts, dont les
   valeurs sont des var(--color-*) — c'est ce qui fait suivre le thème sombre.
   ========================================================================== */

import React from "react";
import { ArrowLeft, ChevronDown, ChevronLeft, ChevronRight, Check } from "lucide-react";
import { T } from "@/lib/ui/tokens";
import { dotRing } from "@/lib/ui/color";
import { fmt } from "@/lib/ui/format";
import { periodStart } from "@/lib/ui/period";
import Popover from "@/components/ui/Popover";

/** Carte blanche : coins 12, ombre très douce, pas de bordure. */
export const CARD = {
  background: T.white,
  borderRadius: 12,
  padding: 16,
  boxShadow: T.elevCard,
  overflow: "hidden",
};

/* ── Aplats et traits ───────────────────────────────────────────────────────
   Exprimés en TRANSPARENCE d'encre plutôt qu'en gris opaque : ils s'assombrissent
   ou s'éclaircissent tout seuls avec la surface qui les porte, et n'ont donc pas
   besoin d'un équivalent défini pour le thème sombre.
   ------------------------------------------------------------------------- */

/** Trait dilué : contour d'une case à cocher, d'une zone de dépôt, limite d'une
 *  zone qui défile — là où un bord doit se deviner sans devenir un cadre. */
export const HAIRLINE = "color-mix(in srgb, var(--color-text) 8%, transparent)";

/** Aplat d'un contrôle (pastille, champ, piste, ligne survolée). Assez pour
 *  délimiter une petite surface, trop peu pour faire un bloc dans le bloc. */
export const FIELD_BG = "color-mix(in srgb, var(--color-text) 4%, transparent)";

/** Aplat d'une zone d'écriture. Plus dilué que `FIELD_BG` : sur cent pixels de
 *  haut, le même gris ferait un pavé. */
export const WRITING_BG = "color-mix(in srgb, var(--color-text) 1.2%, transparent)";

/**
 * Survol d'une tuile déjà colorée (case de calendrier, vignette de mois) : un
 * voile d'encre posé par-dessus son aplat, à appliquer en `boxShadow`.
 *
 * `filter: brightness(0.97)` ne convenait pas : il assombrit TOUJOURS, donc en
 * thème sombre il éteignait la case au lieu de la relever. Le voile, lui, est de
 * l'encre — il s'inverse avec le thème comme le reste de la DA.
 */
export const TILE_HOVER = `inset 0 0 0 999px ${FIELD_BG}`;

/** Libellé d'un champ ou d'un bloc, dans une carte. */
export function FieldLabel({ children }) {
  return <div style={{fontSize:12,fontWeight:500,color:T.text,opacity:0.5}}>{children}</div>;
}

/** Ligne « libellé → valeur » : la mesure et son nom, sur une ligne. */
export function StatRow({ label, value, color }) {
  return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}>
      <span style={{fontSize:12,color:T.text,opacity:0.5,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{label}</span>
      <span style={{fontSize:13,fontWeight:600,letterSpacing:-0.15,color:color||T.text,whiteSpace:"nowrap",fontVariantNumeric:"tabular-nums"}}>{value}</span>
    </div>
  );
}

/**
 * Mesure secondaire posée sous un chiffre héros : libellé 11 px atténué, valeur
 * 14 px. Les pages de détail en alignent quatre à 28 px d'écart.
 * `tone` colore la valeur ("pos" | "neg"), sinon encre pleine.
 */
export function MiniKpi({ label, value, tone }) {
  const color = tone === "pos" ? T.pnlPos : tone === "neg" ? T.pnlNeg : T.text;
  return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"flex-start",gap:2}}>
      <span style={{fontSize:11,lineHeight:1,color:T.textSub,whiteSpace:"nowrap"}}>{label}</span>
      <span style={{fontSize:14,fontWeight:600,lineHeight:1,color,whiteSpace:"nowrap",fontVariantNumeric:"tabular-nums"}}>
        {value}
      </span>
    </div>
  );
}

/**
 * Carte de récapitulatif : un titre, puis des lignes `{ label, value, color? }`.
 * Repliée elle n'en montre que `visible` — le « Voir plus » du titre de section
 * déplie le reste, aucune mesure n'est perdue.
 *
 * Source unique du bloc « Statistiques » des pages de détail (compte, prop
 * firm), qui en portaient chacune une copie divergente.
 */
export function StatsCard({ title, rows = [], expanded = false, visible = 4 }) {
  const shown = expanded ? rows : rows.slice(0, visible);
  return (
    <div style={{...CARD, display:"flex", flexDirection:"column", gap:14}}>
      <div style={{fontSize:15,fontWeight:600,lineHeight:1.2,color:T.text}}>{title}</div>
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {shown.map(r => (
          <StatRow key={r.label} label={r.label} value={r.value} color={r.color} />
        ))}
      </div>
    </div>
  );
}

/* ── Répartition d'un tout ──────────────────────────────────────────────────
   Une même donnée — des parts d'un total — sous DEUX formes, au choix de
   l'utilisateur : l'anneau montre la silhouette de la répartition, la barre
   tient sur une ligne et se compare d'un bloc à l'autre. Les deux vivent ici
   parce que la page Budget et la synthèse Patrimoine affichent la MÊME
   répartition : elles doivent la dessiner avec le même code, comme elles
   partagent déjà ses couleurs.

   `parts` : [{ id, label, color, pct, amount }] — `pct` en pourcentage du total.
   `scale` : dénominateur des parts. Au-delà de 100 %, l'appelant passe le total
   afin que le dessin reste plein et les proportions comparables entre elles.
   ------------------------------------------------------------------------- */

/** Les deux formes, pour le sélecteur ; `label` est résolu à l'appel. */
export const ALLOCATION_KINDS = ["ring", "bar"];

/**
 * Écart entre deux parts voisines, dans l'unité de chaque forme. C'est
 * l'encodage secondaire de la palette : il sépare deux parts même quand leurs
 * teintes se confondent (vision des couleurs déficiente, impression en niveaux
 * de gris).
 */
const PART_GAP = 2;

export function AllocationChart({
  kind = "ring",
  parts = [],
  scale = 100,
  ariaLabel,
  size = 180,
  thickness = 22,
  barHeight = 14,
  centreLabel,
  centreValue,
  centreTone,
  /* Part en % sous le montant du centre. À couper quand les parts couvrent tout
     le total affiché : la ligne dirait alors « 100 % » en permanence, ce qui
     n'apprend rien et fait un troisième étage au centre de l'anneau. */
  showPct = true,
  formatValue = (v) => String(Math.round(v)),
  /**
   * Parts à mettre en avant depuis L'EXTÉRIEUR — un id, une liste d'ids, ou
   * rien. C'est ce qui permet à une figure voisine (le diagramme de flux, à
   * gauche) de désigner ici la même matière : survoler « Logement » dans le flux
   * doit éclairer « Logement » dans l'anneau, sinon les deux dessins de la même
   * carte parlent chacun dans leur coin.
   *
   * Le survol de l'anneau lui-même reste PRIORITAIRE : la souris est dessus, ce
   * qu'elle désigne l'emporte sur ce qu'on lui souffle d'ailleurs.
   */
  highlight = null,
  /** Prévenu quand la souris entre sur une part, ou la quitte (`null`). Symétrique
   *  de `highlight` : c'est par là que l'anneau désigne à son tour. */
  onHover,
}) {
  const [hover, setHover] = React.useState(null);
  const live = parts.filter(p => p.pct > 0);

  const external = React.useMemo(() => {
    const ids = highlight == null ? [] : (Array.isArray(highlight) ? highlight : [highlight]);
    return ids.length > 0 ? new Set(ids) : null;
  }, [highlight]);

  const lit = hover != null ? new Set([hover]) : external;
  /* Le centre ne montre une part que s'il n'y en a qu'UNE de désignée : deux
     parts éclairées d'un coup n'ont pas de montant commun à afficher, et le
     libellé de la carte reste alors la bonne réponse. */
  const single = lit && lit.size === 1 ? live.find(p => lit.has(p.id)) : null;
  const shown = single ?? null;

  /* Infobulle native : la valeur exacte reste accessible sur chaque part sans
     construire un calque flottant, les pages portant déjà leurs chiffres en
     clair juste à côté. */
  const partTitle = (p) => `${p.label} · ${formatValue(p.amount)} · ${Math.round(p.pct * 10) / 10}%`;

  if (kind === "bar") {
    return (
      <div
        role="img"
        aria-label={ariaLabel}
        style={{ display: "flex", gap: PART_GAP, height: barHeight, width: "100%", borderRadius: 999, overflow: "hidden", background: T.accentBg }}
      >
        {live.map(p => (
          <div
            key={p.id}
            title={partTitle(p)}
            style={{
              width: `${(p.pct / scale) * 100}%`,
              background: p.color,
              transition: "width 200ms var(--ease-out, ease)",
            }}
          />
        ))}
      </div>
    );
  }

  /* Anneau : un cercle par part, tracé en pointillé et pivoté à son décalage —
     plus exact que des arcs calculés à la main, et le trait garde une épaisseur
     constante. La piste de fond est ce qui reste : le reste n'est pas dessiné
     comme une part, il n'en est pas une. */
  const R = (size - thickness) / 2;
  const CIRC = 2 * Math.PI * R;
  let acc = 0;
  const arcs = live.map(p => {
    const frac = p.pct / scale;
    const arc = { ...p, frac, offset: acc };
    acc += frac;
    return arc;
  });

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "4px 0" }}>
      <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
        <svg
          viewBox={`0 0 ${size} ${size}`} width={size} height={size}
          role="img" aria-label={ariaLabel}
          style={{ display: "block", transform: "rotate(-90deg)" }}
        >
          <circle cx={size / 2} cy={size / 2} r={R} fill="none" stroke={T.accentBg} strokeWidth={thickness} />
          {arcs.map(a => {
            const len = Math.max(a.frac * CIRC - PART_GAP, 0.5);
            return (
              <circle
                key={a.id}
                cx={size / 2} cy={size / 2} r={R}
                fill="none" stroke={a.color} strokeWidth={thickness}
                strokeDasharray={`${len} ${CIRC - len}`}
                strokeDashoffset={-a.offset * CIRC}
                strokeLinecap="butt"
                onMouseEnter={() => { setHover(a.id); onHover?.(a.id); }}
                onMouseLeave={() => { setHover(null); onHover?.(null); }}
                style={{
                  opacity: lit == null || lit.has(a.id) ? 1 : 0.45,
                  transition: "opacity 140ms var(--ease-out, ease), stroke-dasharray 200ms var(--ease-out, ease)",
                }}
              >
                <title>{partTitle(a)}</title>
              </circle>
            );
          })}
        </svg>

        {/* Centre : ce que l'appelant y met, ou la part survolée. Le texte porte
            les tokens d'encre, jamais la couleur de la série — seul le point de
            couleur porte l'identité. */}
        <div style={{
          position: "absolute", inset: thickness + 6, borderRadius: "50%",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          gap: 2, pointerEvents: "none", textAlign: "center",
        }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, lineHeight: 1.1, color: T.textSub, maxWidth: "100%" }}>
            {shown && <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: "50%", background: shown.color, boxShadow: dotRing(shown.color), flexShrink: 0 }} />}
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {shown ? shown.label : centreLabel}
            </span>
          </span>
          <span style={{
            fontSize: 18, fontWeight: 600, lineHeight: 1.1, whiteSpace: "nowrap",
            fontVariantNumeric: "tabular-nums",
            color: !shown && centreTone ? centreTone : T.text,
          }}>
            {formatValue(shown ? shown.amount : centreValue)}
          </span>
          {showPct && (
            <span style={{ fontSize: 11, lineHeight: 1.1, color: T.textMut, fontVariantNumeric: "tabular-nums" }}>
              {Math.round((shown ? shown.pct : live.reduce((s, p) => s + p.pct, 0)) * 10) / 10}%
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/** En-tête de colonne : 12px Medium (à poser dans un bloc opacity .4).
 *  Sans capitales forcées : en français les intitulés portent des accents que
 *  les capitales rendent mal, et « P&L » ou « % total » n'y gagnaient rien.
 *  L'en-tête se distingue déjà par sa taille et son opacité. */
export const TH = {
  fontSize: 12,
  fontWeight: 500,
  lineHeight: "17.05px",
  color: T.text,
};

/**
 * Lien de retour posé en tête d'une page de détail (compte, prop firm).
 *
 * L'app n'a pas de bouton « précédent » : chaque page de détail doit offrir la
 * remontée d'un cran vers son parent. Cible de 32 px de haut ; le conteneur
 * appelant la ramène dans la gouttière par une marge négative, pour que le
 * libellé reste aligné sur le titre en dessous.
 *
 * @param {React.ReactNode=} icon  Posé avant la flèche (le logo d'une firme).
 */
export function BackLink({ label, icon, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6, minWidth: 0,
        padding: "7px 8px", borderRadius: 8, border: "none", background: "none",
        color: T.textSub, fontSize: 13, fontWeight: 500,
        fontFamily: "inherit", cursor: "pointer",
        transition: "background 120ms ease, color 120ms ease",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = T.accentBg; e.currentTarget.style.color = T.text; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = T.textSub; }}
    >
      <ArrowLeft size={14} strokeWidth={1.75} style={{ flexShrink: 0 }} />
      {icon}
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
    </button>
  );
}

/**
 * Titre de section (24 px Medium), posé hors carte, action optionnelle à droite.
 *
 * `size="sm"` (18 px) : variante pour les pages qui empilent beaucoup de
 * sections courtes — le 24 px y prend le dessus sur le contenu qu'il annonce.
 */
export function SectionTitle({ children, action, size = "md" }) {
  const sm = size === "sm";
  return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,width:"100%"}}>
      <h2 style={{fontSize: sm ? 18 : 24,fontWeight:500,lineHeight: sm ? "22px" : "26.35px",color:T.text,margin:0}}>{children}</h2>
      {action}
    </div>
  );
}

/** Lien discret « Voir plus » aligné à droite d'un titre de section. */
export function SectionAction({ children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{background:"none",border:"none",padding:0,cursor:"pointer",fontFamily:"inherit",
              fontSize:14,lineHeight:"26.35px",color:T.text,opacity:0.4}}
    >
      {children}
    </button>
  );
}

/** Pastille Long / Short. */
export function DirectionTag({ direction }) {
  const isShort = String(direction || "").toLowerCase().startsWith("s");
  return (
    <span style={{
      display:"inline-flex", alignItems:"center", justifyContent:"center",
      padding:"2px 12px", borderRadius:48, fontSize:14, lineHeight:"17.05px",
      background: isShort ? T.tagShortBg : T.tagLongBg,
      color: isShort ? T.tagShortText : T.tagLongText,
    }}>
      {isShort ? "Short" : "Long"}
    </span>
  );
}

/**
 * Instruments reconnus : nom lisible, marqueur court de la vignette et couleur
 * d'identité.
 *
 * `badge` est ce qui s'affiche DANS le cercle (maquette « Trades » : « 100 »
 * pour le Nasdaq-100). C'est volontairement l'indice de l'indice et non des
 * initiales : c'est ce qui identifie l'instrument d'un coup d'œil.
 *
 * `color` est la couleur du disque. Ce sont des couleurs d'IDENTITÉ, pas des
 * couleurs de thème : elles ne passent donc pas par les tokens `T` et ne
 * changent pas en mode sombre — un logo garde sa couleur, comme les pastilles
 * de type de compte dans lib/ui/accountTypes.
 *
 * `icon` : chemin d'une vraie image dans /public/symbols/, si vous en déposez
 * une. Elle prime alors sur le disque coloré. Rien n'est téléchargé depuis un
 * tiers : les pastilles rondes des plateformes de cotation sont leurs propres
 * marques, on ne peut pas les redistribuer dans l'app.
 */
export const SYMBOL_LOGOS = [
  { match: /^(mnq|nq|nasdaq|ndx|us100)/i, name: "Nasdaq",       badge: "100", color: "#0BA1E2" },
  { match: /^(mes|es|spx|us500)/i,        name: "S&P 500",      badge: "500", color: "#E03C31" },
  { match: /^(mym|ym|dow|us30)/i,         name: "Dow Jones",    badge: "30",  color: "#1B3A6B" },
  { match: /^(m2k|rty|russell)/i,         name: "Russell 2000", badge: "2K",  color: "#7A4FBF" },
  { match: /^(ftse|uk100)/i,             name: "FTSE 100",     badge: "100", color: "#00205B" },
  { match: /^(dax|ger40|de40)/i,         name: "DAX",          badge: "40",  color: "#E8A33D" },
  { match: /^(nik|jp225)/i,              name: "Nikkei 225",   badge: "225", color: "#BC002D" },
  { match: /^(cl|mcl|wti|usoil)/i,       name: "Pétrole WTI",  badge: "WTI", color: "#3F4A3C", icon: "/symbols/oil.png" },
  { match: /^(gc|mgc|xau|gold)/i,        name: "Or",           badge: "AU",  color: "#C9A227", icon: "/symbols/gold.png" },
  { match: /^(si|xag|silver)/i,          name: "Argent",       badge: "AG",  color: "#8E9196" },
  { match: /^(btc|xbt)/i,                name: "Bitcoin",      badge: "₿",   color: "#F7931A" },
  { match: /^(eth)/i,                    name: "Ethereum",     badge: "Ξ",   color: "#627EEA" },
];

/* ── Paires de devises ──────────────────────────────────────────────────────
   Une paire ne se représente pas par un seul disque : elle met en rapport DEUX
   monnaies. On reprend donc la convention des plateformes de cotation — le
   drapeau de la devise de base en grand, celui de la devise de cotation en
   petit derrière, en haut à droite.
   ------------------------------------------------------------------------ */

/** Drapeau rond de chaque devise reconnue (fichiers de /public/symbols/). */
export const CURRENCY_ICONS = {
  EUR: "/symbols/eur.png",
  USD: "/symbols/usd.jpg",
  GBP: "/symbols/gbp.png",
  JPY: "/symbols/jpy.png",
};

/** Contrats futures sur devise : leur code ne dit pas la paire, cette table si. */
const FUTURES_FX = {
  "6E": ["EUR", "USD"],
  "6B": ["GBP", "USD"],
  "6J": ["JPY", "USD"],
  M6E: ["EUR", "USD"],
  M6B: ["GBP", "USD"],
};

const CURRENCY_CODES = ["EUR", "USD", "GBP", "JPY", "CHF", "CAD", "AUD", "NZD"];

/**
 * Décompose un symbole en paire de devises, ou null si ce n'en est pas une.
 * Accepte « EURUSD », « EUR/USD », « eur-usd », « EURUSD=X » et les codes de
 * contrats futures (« 6E », « M6B »).
 */
export function forexPair(symbol) {
  const raw = String(symbol || "").trim().toUpperCase();
  if (!raw) return null;

  const futures = FUTURES_FX[raw.replace(/[^A-Z0-9]/g, "")];
  if (futures) return { base: futures[0], quote: futures[1] };

  const m = raw.replace(/=X$/, "").match(/^([A-Z]{3})[\/\-. ]?([A-Z]{3})$/);
  if (!m) return null;
  const [, base, quote] = m;
  if (!CURRENCY_CODES.includes(base) || !CURRENCY_CODES.includes(quote)) return null;
  return { base, quote };
}

/**
 * Décompose un symbole en nom lisible + code, comme dans la maquette
 * (« Nasdaq » au-dessus de « MNQU6 »). Sans correspondance connue, le code
 * seul est affiché plutôt qu'un libellé inventé.
 */
export function symbolLabel(symbol) {
  const code = String(symbol || "").trim();
  const known = SYMBOL_LOGOS.find(l => l.match.test(code));
  if (known) return { name: known.name, code };
  // Paire de devises : « EURUSD » se lit « EUR/USD ».
  const pair = forexPair(code);
  if (pair) return { name: `${pair.base}/${pair.quote}`, code };
  return { name: code, code: null };
}

/**
 * Vignette RONDE d'un instrument (maquette « Trades », node 319:14004) :
 * cercle plein de 32 px portant le marqueur de l'indice en blanc. Pas d'image —
 * un logo par instrument dériverait vite, et le cercle plein reste lisible à
 * 32 px là où un logo détaillé devient illisible.
 */
export function SymbolBadge({ symbol, size = 32 }) {
  const known = SYMBOL_LOGOS.find(l => l.match.test(String(symbol || "")));
  const label = known?.badge
    || String(symbol || "?").replace(/[^A-Za-z0-9]/g, "").slice(0, 2).toUpperCase();

  /* Paire de devises : deux disques. Le grand (devise de base) est posé en bas
     à gauche, le petit (devise de cotation) en haut à droite et DERRIÈRE —
     l'ordre du DOM suffit à l'empilement, le grand étant opaque. L'ensemble
     tient dans la même boîte carrée que n'importe quelle autre vignette : la
     ligne ne bouge pas selon l'instrument. */
  const pair = forexPair(symbol);
  if (pair && (CURRENCY_ICONS[pair.base] || CURRENCY_ICONS[pair.quote])) {
    const big = Math.round(size * 0.8);
    const small = Math.round(size * 0.56);
    const disc = (code, d, pos) => (
      <span style={{
        position: "absolute", ...pos, width: d, height: d, borderRadius: "50%",
        overflow: "hidden", background: T.accentBg,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        fontSize: Math.round(d * 0.34), fontWeight: 600, color: T.textSub, letterSpacing: -0.4,
      }}>
        {CURRENCY_ICONS[code] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={CURRENCY_ICONS[code]} alt="" width={d} height={d}
               style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        ) : code.slice(0, 2)}
      </span>
    );
    return (
      <span aria-hidden style={{ position: "relative", width: size, height: size, flexShrink: 0, display: "inline-block" }}>
        {disc(pair.quote, small, { top: 0, right: 0 })}
        {disc(pair.base, big, { bottom: 0, left: 0 })}
      </span>
    );
  }

  // Une vraie image déposée dans /public/symbols/ prime sur le disque coloré.
  if (known?.icon) {
    return (
      <span
        aria-hidden
        style={{
          width: size, height: size, borderRadius: "50%", flexShrink: 0,
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          overflow: "hidden", background: T.accentBg,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={known.icon} alt="" width={size} height={size}
             style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      </span>
    );
  }

  /* Un marqueur long ne tient pas à la taille d'un chiffre, mais le palier à
     trois caractères était trop sévère : « 100 » et « 500 » — les deux
     marqueurs les plus fréquents — s'en trouvaient rapetissés sans nécessité.
     Trois caractères tiennent à 0.32 ; on ne resserre vraiment qu'au-delà. */
  const scale = label.length >= 4 ? 0.26 : label.length === 3 ? 0.32 : 0.375;
  return (
    <div
      aria-hidden
      style={{
        width: size, height: size, borderRadius: "50%", flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: known?.color || T.symbolBadge, color: T.symbolBadgeText,
        fontSize: Math.round(size * scale), fontWeight: 600,
        letterSpacing: -0.65, lineHeight: 1, whiteSpace: "nowrap",
      }}
    >
      {label}
    </div>
  );
}

/**
 * Cellule « instrument » de la maquette : vignette ronde + nom (16 Medium) au
 * dessus du code (12 Regular atténué). Source unique pour la page Trades, le
 * dashboard et le détail d'un compte, qui affichaient trois variantes du même
 * bloc.
 */
export function SymbolCell({ symbol, size = 32, gap = 8, nameSize = 16, inline = false }) {
  const { name, code } = symbolLabel(symbol);
  // `inline` : nom et code sur une seule ligne (listes compactes) au lieu de
  // l'empilement de la maquette. Même composant, deux densités.
  return (
    <span style={{display:"inline-flex",alignItems:"center",gap,minWidth:0}}>
      <SymbolBadge symbol={symbol} size={size} />
      <span style={{display:"flex",flexDirection:inline?"row":"column",
                    alignItems:inline?"baseline":undefined,gap:inline?6:0,minWidth:0}}>
        <span style={{fontSize:nameSize,fontWeight:500,lineHeight:"17.05px",color:T.text,
                      overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
          {name}
        </span>
        {code && (
          <span style={{fontSize:12,lineHeight:"13.95px",color:T.textMut,
                        overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
            {code}
          </span>
        )}
      </span>
    </span>
  );
}

/** Montant héros sur deux tons : partie entière en encre pleine, décimales grisées. */
export function HeroAmount({ value, size = 40 }) {
  const text = fmt(value, false);          // ex. "-€98.16"
  const dot = text.lastIndexOf(".");
  const head = dot === -1 ? text : text.slice(0, dot);
  const tail = dot === -1 ? "" : text.slice(dot);
  return (
    <div style={{fontSize:size,fontWeight:500,lineHeight:`${Math.round(size * 0.775)}px`,letterSpacing:-0.2,whiteSpace:"nowrap"}}>
      <span style={{color:T.text}}>{head}</span>
      <span style={{color:T.numMuted}}>{tail}</span>
    </div>
  );
}

/** Montant sur deux lignes : valeur puis pourcentage entre parenthèses. */
export function StackedAmount({ value, percent, align = "flex-end" }) {
  const color = value > 0 ? T.pnlPos : value < 0 ? T.pnlNeg : T.textSub;
  return (
    <div style={{display:"flex",flexDirection:"column",alignItems:align,justifyContent:"center",color,fontWeight:500,whiteSpace:"nowrap"}}>
      <span style={{fontSize:16,lineHeight:"18.6px"}}>{value > 0 ? "+" : ""}{fmt(value, false)}</span>
      {percent != null && <span style={{fontSize:12,lineHeight:1}}>( {percent.toFixed(2)}% )</span>}
    </div>
  );
}

/* Couleur d'identité d'un compte : elle vient de son TYPE (eval ambre, funded
   bleu, live vert, démo violet) et de nulle part ailleurs. Source unique :
   lib/ui/accountTypes.ts — réexportée ici parce que les pages de la DA
   importent leurs briques depuis ce module. */
export {
  accountColor,
  accountTypeOf,
  accountTypeStyle,
  ACCOUNT_TYPE_COLORS,
  AGGREGATE_CURVE_COLOR,
} from "@/lib/ui/accountTypes";

/**
 * Fenêtres temporelles de la maquette.
 *
 * Les identifiants seuls : ce qu'ils COUVRENT est calculé par `lib/ui/period`,
 * qui les cale sur le calendrier — « 1 mois » part du 1er du mois, « 1 an » du
 * 1er janvier. Une durée en jours écrite ici aurait donné deux règles, l'une
 * dans le tableau et l'autre dans le module, qui auraient divergé.
 */
export const PERIODS = [
  { id: "1S" }, { id: "1M" }, { id: "3M" }, { id: "6M" }, { id: "1A" },
];

/** Fenêtre « depuis le début » : `windowSeries` rend alors la série entière.
 *  Les pages qui la proposent lui donnent un libellé traduit (« Tout »), l'id
 *  seul n'étant pas affichable. */
export const PERIOD_ALL = "ALL";

/**
 * Groupe de pastilles 1S/1M/3M/6M/1A — l'actif est blanc avec une ombre fine.
 *
 * `options` accepte un `label` pour les groupes dont l'identifiant n'est pas
 * affichable tel quel (Mois / Année du calendrier, node 297:12677). `track`
 * pose le groupe sur la piste grise arrondie de cette même maquette, et
 * `size` passe à la métrique 14 px de la page Calendrier.
 */
export function PeriodPills({ value, onChange, options = PERIODS, track = false, size = 12 }) {
  return (
    <div style={{
      display:"flex", alignItems:"center", gap: track ? 8 : 4,
      ...(track ? {background:T.segmentTrack, padding:2, borderRadius:999, boxShadow:T.elevCard} : null),
    }}>
      {options.map(p => {
        const active = value === p.id;
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onChange?.(p.id)}
            aria-pressed={active}
            style={{
              padding: track ? "5.5px 14px" : "6px 14px",
              borderRadius:999, border:"none",
              background: active ? T.white : "transparent",
              boxShadow: active ? T.elevPill : "none",
              color: T.text, opacity: active ? 1 : 0.6,
              fontSize:size, lineHeight:"18.6px", cursor:"pointer", fontFamily:"inherit",
              whiteSpace:"nowrap",
              transition:"background 140ms var(--ease-out, ease), opacity 140ms var(--ease-out, ease)",
            }}
          >
            {p.label ?? p.id}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Pastille de navigation « ‹ Juillet › » (maquette Calendrier, node 283:5171) :
 * carte blanche arrondie portant le libellé de la période entre deux chevrons.
 * Les flèches sont de vrais boutons — la zone cliquable atteint 34 px de haut.
 *
 * Le libellé central n'est PAS cliquable par défaut : entre deux flèches, une
 * troisième cible sans affordance serait ambiguë. `onLabel` l'active pour les
 * pages qui ouvrent un sélecteur de date dessus — il prend alors un survol, qui
 * est ce qui le signale comme cliquable.
 *
 * `prevDisabled` / `nextDisabled` éteignent une flèche qui ne mène nulle part —
 * le mois prochain sur un budget, par exemple. Éteinte plutôt que retirée : la
 * pastille garderait sinon deux largeurs différentes selon l'endroit où l'on se
 * trouve, et le libellé sauterait d'un cran à chaque bout de course.
 */
export function StepperPill({ label, onPrev, onNext, onLabel, labelTitle, prevLabel = "Précédent", nextLabel = "Suivant", prevDisabled = false, nextDisabled = false }) {
  // La flèche mesure 16 px comme sur la maquette, mais sa zone cliquable prend
  // toute la hauteur de la pastille (marges négatives) : la cible reste
  // atteignable au pouce sans épaissir le contrôle.
  const arrow = {
    display:"flex", alignItems:"center", justifyContent:"center",
    width:28, height:34, margin:"-7px -6px", padding:0,
    background:"none", border:"none", borderRadius:999,
    color:T.text, cursor:"pointer", flexShrink:0,
  };
  return (
    <div style={{
      display:"flex", alignItems:"center", gap:8,
      height:34, padding:"7px 14px", borderRadius:999,
      background:T.white, boxShadow:T.elevPill,
    }}>
      <button
        type="button" onClick={onPrev} aria-label={prevLabel} disabled={prevDisabled}
        style={{...arrow, cursor: prevDisabled ? "default" : "pointer", opacity: prevDisabled ? 0.3 : 1}}
      >
        <ChevronLeft size={16} strokeWidth={1.75} />
      </button>
      {onLabel ? (
        <button
          type="button"
          onClick={onLabel}
          title={labelTitle}
          style={{
            margin:"-7px -6px", padding:"7px 6px", border:"none", background:"none",
            borderRadius:8, cursor:"pointer", fontFamily:"inherit",
            fontSize:14, lineHeight:"18.6px", color:T.text, whiteSpace:"nowrap",
            textTransform:"capitalize", transition:"background 120ms ease",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = T.accentBg; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
        >
          {label}
        </button>
      ) : (
        <span style={{fontSize:14,lineHeight:"18.6px",color:T.text,whiteSpace:"nowrap",textTransform:"capitalize"}}>
          {label}
        </span>
      )}
      <button
        type="button" onClick={onNext} aria-label={nextLabel} disabled={nextDisabled}
        style={{...arrow, cursor: nextDisabled ? "default" : "pointer", opacity: nextDisabled ? 0.3 : 1}}
      >
        <ChevronRight size={16} strokeWidth={1.75} />
      </button>
    </div>
  );
}

/**
 * Ne garde que la fin d'une série pour la fenêtre demandée. La série reste
 * cumulée depuis le début (c'est un zoom, pas un filtre de données) et on
 * retombe sur les deux derniers points si la fenêtre est trop étroite.
 *
 * `PERIOD_ALL` rend la série entière. La fenêtre se mesure depuis le DERNIER
 * point et non depuis aujourd'hui : une série qui s'arrête il y a un mois doit
 * montrer sa dernière semaine de données, pas un graphique vide.
 *
 * Le début est CALÉ SUR LE CALENDRIER (cf. `lib/ui/period`) : « 1 mois » part du
 * 1er du mois du dernier point, « 1 an » de son 1er janvier. Une courbe et un
 * total qui portent la même pastille doivent couvrir les mêmes jours.
 */
export function windowSeries(points, periodId, getDate = p => p.date) {
  if (!points || points.length === 0) return points || [];
  if (periodId === PERIOD_ALL) return points;
  const last = new Date(getDate(points[points.length - 1]));
  if (isNaN(last.getTime())) return points;
  const from = periodStart(periodId, last) || periodStart("1M", last);
  const windowed = points.filter(p => {
    const d = new Date(getDate(p));
    return !isNaN(d.getTime()) && d >= from;
  });
  return windowed.length > 1 ? windowed : points.slice(-2);
}

/**
 * Filtre de tableau de la maquette « Trades » (node 293:12628) : libellé 14px +
 * chevron, posé à 40 % d'opacité, sans cadre. Passe à pleine opacité dès qu'un
 * filtre est actif — sinon rien ne distingue « aucun filtre » de « filtré », et
 * l'utilisateur croit voir tous ses trades.
 *
 * `options` : [{ id, label }]. `multi` autorise plusieurs valeurs (value = tableau).
 */
/**
 * @param {boolean=} neutral  Le contrôle porte une valeur par DÉFAUT, pas un
 *   filtre choisi (le tri « plus récents d'abord », par exemple). Il garde son
 *   libellé nu et son gris : la pleine opacité est réservée à ce que
 *   l'utilisateur a lui-même restreint, sinon « filtré » et « non filtré » se
 *   ressemblent.
 */
export function TableFilter({ label, value, options, onChange, multi = false, neutral = false }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  // Clic extérieur et Échap : délégués au Popover, qui sait que son panneau
  // n'est plus un descendant du déclencheur.
  const close = React.useCallback(() => setOpen(false), []);

  const selected = multi ? (Array.isArray(value) ? value : []) : value;
  const active = neutral
    ? false
    : (multi ? selected.length > 0 : (value != null && value !== ""));
  // Le libellé porte l'état : « Types » seul, « Types · Long » filtré.
  const current = multi
    ? (selected.length === 1
        ? options.find(o => o.id === selected[0])?.label
        : selected.length > 1 ? `${selected.length}` : null)
    : options.find(o => o.id === value)?.label;

  return (
    <div ref={ref} style={{position:"relative"}}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        style={{
          display:"inline-flex", alignItems:"center", justifyContent:"center", gap:4,
          border:"none", background:"transparent", padding:0, cursor:"pointer",
          fontFamily:"inherit", fontSize:14, lineHeight:1, color:T.text,
          opacity: active || open ? 1 : 0.4,
          transition:"opacity 140ms var(--ease-out, ease)",
        }}
      >
        <span style={{whiteSpace:"nowrap"}}>{active && current ? `${label} · ${current}` : label}</span>
        <ChevronDown
          size={16} strokeWidth={1.75}
          /* Fermé, le chevron pointe vers le BAS — « ceci ouvre une liste en
             dessous ». Il ne bascule vers le haut qu'une fois ouvert. Il était
             couché vers la droite au repos, ce qui annonçait un sous-menu
             latéral. */
          style={{transform: open ? "rotate(180deg)" : "rotate(0deg)", transition:"transform 140ms var(--ease-out, ease)"}}
        />
      </button>
      <Popover
        anchorRef={ref}
        open={open}
        onClose={close}
        gap={8}
        minWidth={200}
        maxHeight={280}
        role="listbox"
        className="anim-pop"
        style={{
          background:T.white, borderRadius:12, boxShadow:"var(--elev-overlay)",
          border:`1px solid ${T.border}`, padding:6,
        }}
      >
        <>
          {!multi && (
            <FilterOption
              label="Tous"
              checked={!active}
              onClick={() => { onChange?.(""); setOpen(false); }}
            />
          )}
          {options.map(o => {
            const checked = multi ? selected.includes(o.id) : value === o.id;
            return (
              <FilterOption
                key={o.id}
                label={o.label}
                checked={checked}
                onClick={() => {
                  if (multi) {
                    onChange?.(checked ? selected.filter(x => x !== o.id) : [...selected, o.id]);
                  } else {
                    onChange?.(o.id);
                    setOpen(false);
                  }
                }}
              />
            );
          })}
          {multi && active && (
            <FilterOption label="Tout effacer" onClick={() => { onChange?.([]); setOpen(false); }} />
          )}
        </>
      </Popover>
    </div>
  );
}

function FilterOption({ label, checked, onClick }) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={!!checked}
      onClick={onClick}
      style={{
        display:"flex", alignItems:"center", gap:8, width:"100%",
        padding:"8px 10px", minHeight:36, borderRadius:8, border:"none",
        background: checked ? T.rowHighlight : "transparent",
        color:T.text, fontFamily:"inherit", fontSize:13, textAlign:"left",
        cursor:"pointer", transition:"background 120ms ease",
      }}
      onMouseEnter={(e) => { if (!checked) e.currentTarget.style.background = T.rowHighlight; }}
      onMouseLeave={(e) => { if (!checked) e.currentTarget.style.background = "transparent"; }}
    >
      <Check size={13} strokeWidth={2.25} style={{flexShrink:0,opacity: checked ? 1 : 0}} />
      <span style={{flex:1,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{label}</span>
    </button>
  );
}

/**
 * Petite tuile de KPI : libellé 14px atténué + valeur 20px Medium.
 * `tone` colore la valeur ("pos" | "neg"), sinon encre pleine.
 */
export function KpiCard({ label, value, tone }) {
  const color = tone === "pos" ? T.pnlPos : tone === "neg" ? T.pnlNeg : T.text;
  return (
    <div style={{...CARD, display:"flex", flexDirection:"column", gap:12}}>
      <span style={{fontSize:14,lineHeight:"18.6px",color:T.textSub}}>{label}</span>
      <span style={{fontSize:20,fontWeight:500,lineHeight:1,color}}>{value}</span>
    </div>
  );
}

/** Horodatage d'un point de série. */
export const msOf = (d) => new Date(d).getTime();

/**
 * Réduit une série de valeurs à `threshold` points en préservant sa silhouette
 * (algorithme « Largest Triangle Three Buckets »).
 *
 * Utile pour les sparklines : au-delà de quelques dizaines de trades, tracer un
 * segment par trade produit un trait illisible. Prendre « un point sur N »
 * écrêterait les pics ; LTTB garde, dans chaque tranche, le point qui forme le
 * plus grand triangle avec ses voisins — c'est-à-dire celui qui porte le plus
 * d'information visuelle. Le premier et le dernier point sont toujours gardés.
 */
export function downsampleLTTB(values, threshold) {
  const n = values?.length || 0;
  if (!n || threshold >= n || threshold < 3) return values || [];

  const sampled = [values[0]];
  // Taille d'une tranche, en excluant le premier et le dernier point.
  const every = (n - 2) / (threshold - 2);
  let a = 0;

  for (let i = 0; i < threshold - 2; i++) {
    // Barycentre de la tranche suivante, qui sert de troisième sommet.
    const nextStart = Math.floor((i + 1) * every) + 1;
    const nextEnd = Math.min(Math.floor((i + 2) * every) + 1, n);
    const nextLen = Math.max(nextEnd - nextStart, 1);
    let avgX = 0, avgY = 0;
    for (let j = nextStart; j < nextEnd; j++) { avgX += j; avgY += values[j]; }
    avgX /= nextLen; avgY /= nextLen;

    // Dans la tranche courante, on garde le point de plus grande aire.
    const rangeStart = Math.floor(i * every) + 1;
    const rangeEnd = Math.min(Math.floor((i + 1) * every) + 1, n - 1);
    const ax = a, ay = values[a];
    let maxArea = -1, chosen = rangeStart, chosenValue = values[rangeStart];
    for (let j = rangeStart; j < rangeEnd; j++) {
      const area = Math.abs((ax - avgX) * (values[j] - ay) - (ax - j) * (avgY - ay)) / 2;
      if (area > maxArea) { maxArea = area; chosenValue = values[j]; chosen = j; }
    }
    sampled.push(chosenValue);
    a = chosen;
  }

  sampled.push(values[n - 1]);
  return sampled;
}

/**
 * Nombre de points à tracer pour `n` trades dans une sparkline.
 * En dessous du plafond on garde tout (le tracé suit exactement les trades) ;
 * au-delà on plafonne, un segment de moins de ~6 px n'apportant plus rien à
 * l'œil sur une carte de ~350 px de large.
 */
export function sparklineBudget(n, max = 60) {
  return Math.max(2, Math.min(n, max));
}

/* Les séries secondaires d'un graphique multi-comptes ne tirent plus dans une
   palette : chacune prend la couleur du type de son compte (accountColor). */
const SERIES_BG_OPACITY = "var(--opacity-series-bg, 0.35)";

/* Position (en % de la largeur) des 2 traits verticaux intérieurs du fond de
   graphique. Colonnes volontairement inégales, la première plus étroite :
   24 % / 36 % / 40 %. Partagé avec le graphique du dashboard. */
export const GRID_COLUMN_STOPS = [24, 60];

/* Nombre de repères de valeur. 5 repères → 4 bandes en hauteur, dont les 3
   traits intérieurs sont tracés (haut et bas restent ouverts). */
export const GRID_TICKS = 5;

/* Trame de points de l'aire sous la courbe — la texture de la DA, partagée par
   TOUS les graphiques du site. Le masque en dégradé (cf. AreaDotsDefs) estompe
   ensuite la trame vers le bas, ce qui abaisse l'opacité perçue dans la moitié
   inférieure : d'où une encre soutenue ici pour que les points restent lisibles
   jusqu'en bas, et un pas serré pour une texture dense plutôt qu'un semis. La
   densité fait le travail — inutile de pousser l'encre au maximum, la trame
   prendrait le pas sur la courbe qu'elle accompagne. */
export const AREA_DOTS = { step: 6, r: 0.85, opacity: 0.5 };

/**
 * <defs> de l'aire tramée : le motif de points, le dégradé d'estompage et le
 * masque qui l'applique. À poser dans le <svg>, puis étaler `areaDotsFill(id)`
 * sur le path de l'aire.
 *
 * Les points prennent TOUJOURS la couleur de la série : la trame se lit comme
 * le prolongement de la courbe, jamais comme un gris décoratif.
 *
 * `top`/`bottom` délimitent la zone de tracé (l'estompage s'y calcule),
 * `width`/`height` couvrent le viewBox du masque. `step`/`r` se surchargent
 * pour les sparklines, dont le viewBox compte peu d'unités.
 */
export function AreaDotsDefs({
  id, color, top = 0, bottom, width, height,
  step = AREA_DOTS.step, r = AREA_DOTS.r, opacity = AREA_DOTS.opacity,
}) {
  const h = height ?? bottom;
  return (
    <>
      <pattern id={`${id}-dots`} width={step} height={step} patternUnits="userSpaceOnUse">
        <circle cx={step / 2} cy={step / 2} r={r} fill={color} fillOpacity={opacity} />
      </pattern>
      {/* L'estompage ne démarre qu'à 60 % de la hauteur : la trame reste pleine
          sur la majorité de l'aire et ne s'efface que tout en bas. */}
      <linearGradient id={`${id}-fade`} x1="0" y1={top} x2="0" y2={bottom} gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#FFFFFF" stopOpacity="1" />
        <stop offset="60%" stopColor="#FFFFFF" stopOpacity="1" />
        <stop offset="82%" stopColor="#FFFFFF" stopOpacity="0.4" />
        <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
      </linearGradient>
      <mask id={`${id}-mask`} maskUnits="userSpaceOnUse" x="0" y="0" width={width} height={h}>
        <rect x="0" y="0" width={width} height={h} fill={`url(#${id}-fade)`} />
      </mask>
    </>
  );
}

/** Attributs à étaler sur le path d'une aire tramée par <AreaDotsDefs id>. */
export const areaDotsFill = (id) => ({ fill: `url(#${id}-dots)`, mask: `url(#${id}-mask)` });

/* ─── Opacité « après le curseur » ────────────────────────────────────────────
   Au survol d'un graphique, tout ce qui se trouve à DROITE du curseur retombe à
   une opacité basse : ce qui est déjà lu reste plein, la suite s'efface.

   La bascule est FRANCHE — les deux paliers d'opacité se rejoignent au pixel du
   trait de survol, sans zone de transition. C'est un seuil, pas un dégradé : la
   démarcation doit se lire comme une frontière, exactement là où le curseur est
   posé.

   Deux implémentations sont nécessaires et doivent rester calées sur la même
   abscisse, parce que le quadrillage des graphiques n'est pas dans le SVG mais
   posé en HTML absolu par-dessus — aucun masque SVG ne peut l'atteindre :
     • côté SVG  → <HoverFadeDefs id ratio> + hoverFadeMask(id, ratio)
     • côté HTML → hoverFadeStyle(ratio, widthPx), masque CSS de même profil
   `ratio` = abscisse du curseur en fraction de la largeur (0 → 1), `null` hors
   survol (l'opacité est alors absente, pas neutre : rien n'est masqué).

   `rest` = opacité de la partie droite. Assez basse pour que la frontière se
   lise, assez haute pour que la suite de la courbe reste déchiffrable : on
   atténue ce qui vient après, on ne l'efface pas. */
export const HOVER_FADE = { rest: 0.45 };

export function HoverFadeDefs({ id, ratio, width, height }) {
  if (ratio == null) return null;
  const cut = Math.max(0, Math.min(1, ratio));
  /* La région du masque déborde de quelques pixels : les courbes ont un trait
     épais aux extrémités arrondies, qui dépasse librement du viewBox hors survol
     (les <svg> sont en overflow:visible). Un masque calé pile sur [0, W] le
     rognerait, et la courbe paraîtrait raccourcir à chaque survol. */
  const PAD = 6;
  return (
    <>
      {/* Deux paliers au MÊME offset : la transition est nulle, l'opacité bascule
          d'un coup au niveau du curseur. */}
      <linearGradient id={`${id}-hfade`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="#FFFFFF" stopOpacity="1" />
        <stop offset={`${cut * 100}%`} stopColor="#FFFFFF" stopOpacity="1" />
        <stop offset={`${cut * 100}%`} stopColor="#FFFFFF" stopOpacity={HOVER_FADE.rest} />
        <stop offset="100%" stopColor="#FFFFFF" stopOpacity={HOVER_FADE.rest} />
      </linearGradient>
      <mask id={`${id}-hmask`} maskUnits="userSpaceOnUse" x={-PAD} y={-PAD} width={width + PAD * 2} height={height + PAD * 2}>
        {/* Le gradient est en objectBoundingBox : il se cale sur ce rect, dont la
            boîte reste [0, W] — le seuil tombe donc au même x que le trait de
            survol, malgré la région élargie. */}
        <rect x="0" y="0" width={width} height={height} fill={`url(#${id}-hfade)`} />
        {/* Les débords sont peints à l'opacité de leur côté. */}
        <rect x={-PAD} y={-PAD} width={PAD} height={height + PAD * 2} fill="#FFFFFF" />
        <rect x={width} y={-PAD} width={PAD} height={height + PAD * 2} fill="#FFFFFF" fillOpacity={HOVER_FADE.rest} />
        <rect x="0" y={-PAD} width={width} height={PAD} fill={`url(#${id}-hfade)`} />
        <rect x="0" y={height} width={width} height={PAD} fill={`url(#${id}-hfade)`} />
      </mask>
    </>
  );
}

/** À poser sur le <g> qui regroupe aire + courbe (jamais sur le trait de survol
 *  ni sur les zones de capture : elles doivent rester pleines et cliquables). */
export const hoverFadeMask = (id, ratio) => (ratio == null ? undefined : `url(#${id}-hmask)`);

/**
 * Même seuil, en masque CSS, pour les calques HTML du quadrillage.
 *
 * `widthPx` : largeur de RÉFÉRENCE du graphique. À fournir dès que l'élément
 * masqué est plus étroit que le graphique — c'est le cas des filets de
 * graduation, qui s'arrêtent avant leur libellé de valeur. Sans elle, un
 * gradient en pourcentages se résoudrait sur la boîte de l'élément et la coupure
 * des filets tomberait quelques dizaines de pixels avant celle de la courbe. Les
 * éléments masqués démarrent tous au bord gauche du graphique, donc un seuil
 * exprimé en pixels tombe au bon endroit quelle que soit leur largeur.
 */
export function hoverFadeStyle(ratio, widthPx = null) {
  if (ratio == null) return null;
  const r = Math.max(0, Math.min(1, ratio));
  // Même position pour les deux bornes = arête nette, aucun dégradé.
  const cut = widthPx ? `${r * widthPx}px` : `${r * 100}%`;
  const g = `linear-gradient(to right, rgba(0,0,0,1) ${cut}, rgba(0,0,0,${HOVER_FADE.rest}) ${cut})`;
  return { maskImage: g, WebkitMaskImage: g };
}

/**
 * Courbe de P&L cumulé de la DA.
 *
 * `bleedLeft` : la courbe reprend toute la réserve gauche de la page
 * (`--content-left` = place de la barre latérale + gouttière) pour filer jusqu'au
 * premier pixel de la fenêtre et passer DERRIÈRE la barre, qui la recouvre. La
 * gouttière droite, elle, reste. C'est le comportement voulu partout où le
 * graphique est posé à même le fond gris ; à désactiver s'il est un jour placé
 * dans une carte, où la marge négative le ferait déborder de son contenant.
 */
export function PnlChart({ points, others, color, bleedLeft = true }) {
  const ref = React.useRef(null);
  const [width, setWidth] = React.useState(1160);
  const [hover, setHover] = React.useState(null);
  /* Les <defs> SVG sont référencées par id : il doit être unique, sinon deux
     graphiques sur la même page partagent la trame et le masque du premier. */
  const uid = React.useId().replace(/:/g, "");

  React.useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(entries => {
      const w = Math.round(entries[0].contentRect.width);
      if (w > 0) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Géométrie relevée sur la maquette.
  const H = 358, W = width;
  const topY = 30, plotBottom = 340;
  const plotH = plotBottom - topY;

  if (!points || points.length < 2) {
    return (
      <div ref={ref} style={{ height: H, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: T.text, opacity: 0.4 }}>
        Pas assez de données pour tracer la courbe.
      </div>
    );
  }

  /* ─── Abscisse : un PAS PAR POINT, pas le temps écoulé ──────────────────────
     Les points sont posés à intervalle régulier, dans leur ordre. Une semaine
     sans trade ne creuse donc plus un vide au milieu du tracé : ce que la courbe
     raconte, c'est une suite de résultats, pas un calendrier — deux trades
     consécutifs sont voisins qu'ils soient séparés d'une heure ou d'un mois.
     (L'axe était temporel : les périodes creuses étiraient le tracé et
     tassaient les séries actives contre le bord.) */
  const t1 = msOf(points[points.length - 1].date);
  const lastIdx = Math.max(points.length - 1, 1);
  const xAt = (i) => (i / lastIdx) * W;

  /* Les autres séries sont projetées SUR CET AXE : à chaque rang de la série
     principale, on lit la valeur que l'autre avait à cette date-là (son dernier
     point connu, à défaut 0 tant qu'elle n'a rien produit). Elles restent donc
     comparables rang par rang, et une série ouverte plus tard part à plat depuis
     le bord gauche au lieu de surgir au milieu du graphique.
     Le report à plat vaut aussi après son dernier point : la ligne se prolonge
     au niveau atteint, sans redescendre vers zéro. */
  const otherProjected = (others || [])
    // Une série sans aucun point n'a rien à montrer : on ne trace pas de ligne
    // plate à zéro pour elle, elle serait indiscernable d'un compte à l'équilibre.
    .filter(s => Array.isArray(s?.points) && s.points.length > 0)
    .map(s => {
      const sorted = [...s.points].sort((a, b) => msOf(a.date) - msOf(b.date));
      // Rien dans la fenêtre affichée : même raison, pas de ligne.
      if (msOf(sorted[0].date) > t1) return { ...s, values: [] };
      let cursor = 0, held = 0;
      const values = points.map(p => {
        const at = msOf(p.date);
        while (cursor < sorted.length && msOf(sorted[cursor].date) <= at) {
          held = sorted[cursor].cum;
          cursor += 1;
        }
        return held;
      });
      return { ...s, values };
    })
    .filter(s => s.values.length > 1);

  const values = points.map(p => p.cum);
  otherProjected.forEach(s => s.values.forEach(v => values.push(v)));
  const yMax = Math.max(...values);
  const yMin = Math.min(...values);
  const ySpan = (yMax - yMin) || 1;
  const yFor = (v) => plotBottom - ((v - yMin) / ySpan) * plotH;

  // Couleur d'identité du compte : la maquette montre le compte XTB en rouge
  // ici ET sur sa carte de la liste. La couleur suit le compte, pas le P&L.
  const lineColor = color || T.kraken;
  const coords = points.map((p, i) => [xAt(i), yFor(p.cum)]);
  const pathD = coords.map((c, i) => `${i === 0 ? "M" : "L"} ${c[0].toFixed(2)} ${c[1].toFixed(2)}`).join(" ");
  // Aire fermée sous la courbe : c'est elle qui porte la trame de points.
  const areaD = `${pathD} L ${coords[coords.length - 1][0].toFixed(2)} ${H} L ${coords[0][0].toFixed(2)} ${H} Z`;

  /* Seuil d'opacité « après le curseur » : son abscisse, en fraction de la
     largeur. `null` hors survol = aucun masque. On relit l'abscisse déjà calculée
     dans `coords` plutôt que de la recalculer ici — une seule source pour la
     position du seuil et celle du trait de survol. */
  const fadeRatio = hover !== null && coords[hover]
    ? coords[hover][0] / (W || 1)
    : null;
  /* Le même seuil en masque CSS : le quadrillage n'est pas dans le SVG mais posé
     en <div>/<span> absolus par-dessus, hors d'atteinte d'un masque SVG. Les deux
     doivent rester calés sur la MÊME abscisse, sinon la démarcation se dédouble.
     La largeur de référence est indispensable pour les filets de graduation,
     plus étroits que le graphique (ils s'arrêtent avant leur libellé). */
  const fade = hoverFadeStyle(fadeRatio, W);
  /* Les libellés hors du SVG ne peuvent pas être masqués comme la courbe : on
     bascule leur opacité selon qu'ils tombent avant ou après le curseur. */
  const dimAfter = (pct) =>
    fadeRatio != null && pct / 100 > fadeRatio ? HOVER_FADE.rest : 1;

  const fmtTick = (v) => {
    const sign = v < 0 ? "-" : "";
    const abs = Math.abs(v);
    if (abs >= 1000) return `${sign}${(abs / 1000).toFixed(abs >= 10000 ? 0 : 1)}k`;
    return `${sign}${Math.round(abs)}`;
  };
  /* Chaque repère se cale sur l'ordonnée de la valeur qu'il désigne : la rangée
     mesure 14 px centrés, donc `top = yFor(value) - 7`. Les constantes en dur
     d'avant (16 → 348) décalaient le premier repère de 7 px vers le haut et le
     dernier de 15 px vers le bas : les traits ne tombaient pas sur leur
     graduation. */
  const ticks = Array.from({ length: GRID_TICKS }, (_, i) => {
    const ratio = i / (GRID_TICKS - 1);
    return { value: yMax - ratio * ySpan, top: topY - 7 + ratio * plotH };
  });


  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%" }}>
      {/* Seul le TRACÉ part à fond perdu : la marge négative est portée ici, pas
          par le bloc entier — les libellés de dates, eux, restent dans la colonne
          de texte, sinon les premiers passeraient sous la barre latérale.
          `width: auto` laisse la boîte s'élargir de ce que la marge lui rend. */}
      <div
        ref={ref}
        style={{
          position: "relative", height: H,
          marginLeft: bleedLeft ? "calc(-1 * var(--content-left, 40px))" : undefined,
          width: bleedLeft ? "auto" : "100%",
        }}
        onMouseLeave={() => setHover(null)}
      >
        {/* ─── Quadrillage OUVERT ────────────────────────────────────────
            3 rectangles en largeur, de tailles INÉGALES (le premier est le plus
            étroit — cf. GRID_COLUMN_STOPS), et aucun n'est fermé : seuls les
            traits INTÉRIEURS sont tracés. Rien aux bords, donc le premier
            rectangle paraît avoir commencé avant le cadre et le dernier se
            poursuivre après. Idem en hauteur : pas de trait en haut ni en bas,
            les cases du haut et du bas restent ouvertes.
            Le masque CSS reprend, au pixel, le seuil appliqué à la courbe côté
            SVG : ces traits sont en HTML, aucun masque SVG ne les atteint. */}
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none", ...(fade || {}) }}>
          {GRID_COLUMN_STOPS.map(pct => (
            <span key={pct} style={{
              // Ils s'arrêtent sous le haut du cadre : ils encadrent la zone de
              // tracé, pas le titre posé au-dessus du graphique.
              position: "absolute", top: topY - 10, bottom: 0, left: `${pct}%`,
              width: 1, background: T.text, opacity: 0.05,
            }} />
          ))}
        </div>

        {/* Repères de valeur — libellé à droite ; le trait n'est tracé que pour
            les repères INTERMÉDIAIRES (ni le premier ni le dernier), et il
            s'arrête avant le libellé : le quadrillage reste ouvert à droite.
            Seul le trait est masqué au survol : le libellé, lui, reste lisible
            même du côté estompé. */}
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          {ticks.map((tk, i) => {
            const inner = i > 0 && i < ticks.length - 1;
            return (
              <div key={i} style={{
                position: "absolute", left: 0, right: 0, top: tk.top,
                height: 14, display: "flex", alignItems: "center", gap: 8,
              }}>
                <span style={{ flex: 1, height: 1, background: inner ? T.text : "transparent", opacity: 0.05, ...(fade || {}) }} />
                <span style={{ fontSize: 14, color: T.text, opacity: 0.4, lineHeight: 1, whiteSpace: "nowrap" }}>
                  {fmtTick(tk.value)}
                </span>
              </div>
            );
          })}
        </div>

        <svg
          width="100%" height="100%" viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          style={{ display: "block", position: "absolute", inset: 0, overflow: "visible" }}
        >
          <defs>
            {/* Trame de l'aire : points à la couleur de la courbe, estompés vers
                le bas — l'aire s'efface au lieu de s'arrêter net sur le bord. */}
            <AreaDotsDefs id={uid} color={lineColor} top={topY} bottom={plotBottom} width={W} height={H} />
            {/* Seuil d'opacité de ce qui suit le curseur. */}
            <HoverFadeDefs id={uid} ratio={fadeRatio} width={W} height={H} />
          </defs>

          {/* Tout le tracé masqué ensemble : un seul masque pour les autres
              comptes, l'aire et la courbe, appliqué au groupe — l'aire porte déjà
              le sien (la trame), et un élément ne peut en porter qu'un. */}
          <g mask={hoverFadeMask(uid, fadeRatio)}>
            {/* Autres comptes — lignes fines en arrière-plan */}
            {otherProjected.map(s => {
              const d = s.values
                .map((v, i) => `${i === 0 ? "M" : "L"} ${xAt(i).toFixed(2)} ${yFor(v).toFixed(2)}`)
                .join(" ");
              return (
                <path
                  key={s.id}
                  d={d}
                  fill="none"
                  stroke={s.color}
                  strokeOpacity={SERIES_BG_OPACITY}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              );
            })}

            {/* Compte affiché — aire tramée + trait épais */}
            <path d={areaD} {...areaDotsFill(uid)} stroke="none" />
            <path
              d={pathD}
              stroke={lineColor}
              strokeWidth="4"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </g>

          {/* Hors du groupe : le repère du curseur reste à pleine encre — c'est
              lui qui matérialise la démarcation. */}
          {hover !== null && coords[hover] && (
            <line
              x1={coords[hover][0]} y1={topY}
              x2={coords[hover][0]} y2={plotBottom}
              stroke={lineColor} strokeWidth="1" strokeDasharray="3 3"
              vectorEffect="non-scaling-stroke" pointerEvents="none"
            />
          )}

          {/* Zones de capture du survol : chacune s'étend jusqu'à MI-CHEMIN de
              ses voisines, donc elles pavent exactement la largeur — aucun
              chevauchement, aucun trou, et le point attrapé est toujours le plus
              proche du curseur.
              Elles avaient toutes la même largeur (W / nombre de points), ce qui
              ne vaut que si les points sont régulièrement espacés. L'axe est
              TEMPOREL : dès que le rythme des points est irrégulier — une pause
              dans les trades, plusieurs trades le même jour —, ces cellules
              uniformes se recouvraient et c'est la dernière rendue qui gagnait le
              survol, d'où un curseur qui désignait un autre point que celui
              affiché.
              Bornées à [0, W] : le <svg> est en overflow:visible, et un débord
              pourrait ouvrir un scroll horizontal en mobile, où le conteneur ne
              clippe plus. */}
          {coords.map((c, i) => {
            const prevX = i > 0 ? coords[i - 1][0] : null;
            const nextX = i < coords.length - 1 ? coords[i + 1][0] : null;
            const x0 = Math.max(0, prevX == null ? 0 : (c[0] + prevX) / 2);
            const x1 = Math.min(W, nextX == null ? W : (c[0] + nextX) / 2);
            return (
              <rect
                key={`hover-${i}`}
                x={x0}
                y="0"
                width={Math.max(0, x1 - x0)}
                height={H}
                fill="transparent"
                style={{ cursor: "pointer" }}
                onMouseEnter={() => setHover(i)}
              />
            );
          })}
        </svg>

        {/* Tooltip */}
        {hover !== null && points[hover] && (() => {
          const p = points[hover];
          const leftPct = (coords[hover][0] / W) * 100;
          const topPct = (coords[hover][1] / H) * 100;
          const flip = leftPct > 60;
          const d = new Date(p.date);
          const label = isNaN(d.getTime())
            ? p.date
            : d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
          return (
            <div style={{
              position: "absolute",
              left: `${leftPct}%`,
              top: `${topPct}%`,
              transform: `translateY(-100%) translateY(-12px) ${flip ? "translateX(-100%) translateX(-8px)" : "translateX(8px)"}`,
              background: T.white,
              borderRadius: 8,
              boxShadow: T.elevCard,
              padding: "8px 10px",
              pointerEvents: "none",
              zIndex: 20,
              whiteSpace: "nowrap",
              fontFamily: "var(--font-sans)",
            }}>
              <div style={{ fontSize: 12, color: T.textSub, marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: 14, fontWeight: 500, color: p.cum > 0 ? T.pnlPos : p.cum < 0 ? T.pnlNeg : T.text }}>
                {p.cum > 0 ? "+" : ""}{fmt(p.cum, false)}
              </div>
            </div>
          );
        })()}
      </div>

    </div>
  );
}
