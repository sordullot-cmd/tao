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
import { fmt } from "@/lib/ui/format";

/** Carte blanche : coins 12, ombre très douce, pas de bordure. */
export const CARD = {
  background: T.white,
  borderRadius: 12,
  padding: 16,
  boxShadow: T.elevCard,
  overflow: "hidden",
};

/** En-tête de colonne : 12px Medium en capitales (à poser dans un bloc opacity .4). */
export const TH = {
  fontSize: 12,
  fontWeight: 500,
  lineHeight: "17.05px",
  color: T.text,
  textTransform: "uppercase",
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

/** Titre de section (24px Medium), posé hors carte, action optionnelle à droite. */
export function SectionTitle({ children, action }) {
  return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",width:"100%"}}>
      <h2 style={{fontSize:24,fontWeight:500,lineHeight:"26.35px",color:T.text,margin:0}}>{children}</h2>
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
 * Instruments reconnus : nom lisible + marqueur court de la vignette.
 *
 * `badge` est ce qui s'affiche DANS le cercle (maquette « Trades » : « 100 »
 * pour le Nasdaq-100). C'est volontairement l'indice de l'indice et non des
 * initiales : c'est ce qui identifie l'instrument d'un coup d'œil.
 */
export const SYMBOL_LOGOS = [
  { match: /^(mnq|nq|nasdaq|ndx|us100)/i, name: "Nasdaq",       badge: "100" },
  { match: /^(mes|es|spx|us500)/i,        name: "S&P 500",      badge: "500" },
  { match: /^(mym|ym|dow|us30)/i,         name: "Dow Jones",    badge: "30"  },
  { match: /^(m2k|rty|russell)/i,         name: "Russell 2000", badge: "2K"  },
  { match: /^(ftse|uk100)/i,             name: "FTSE 100",     badge: "100" },
  { match: /^(dax|ger40|de40)/i,         name: "DAX",          badge: "40"  },
  { match: /^(nik|jp225)/i,              name: "Nikkei 225",   badge: "225" },
];

/**
 * Décompose un symbole en nom lisible + code, comme dans la maquette
 * (« Nasdaq » au-dessus de « MNQU6 »). Sans correspondance connue, le code
 * seul est affiché plutôt qu'un libellé inventé.
 */
export function symbolLabel(symbol) {
  const code = String(symbol || "").trim();
  const known = SYMBOL_LOGOS.find(l => l.match.test(code));
  return known ? { name: known.name, code } : { name: code, code: null };
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
  return (
    <div
      aria-hidden
      style={{
        width: size, height: size, borderRadius: "50%", flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: T.symbolBadge, color: T.symbolBadgeText,
        fontSize: Math.round(size * 0.375), fontWeight: 600,
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

/** Fenêtres temporelles de la maquette. */
export const PERIODS = [
  { id: "1S", days: 7 },
  { id: "1M", days: 30 },
  { id: "3M", days: 90 },
  { id: "6M", days: 180 },
  { id: "1A", days: 365 },
];

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
 * Les flèches sont de vrais boutons — la zone cliquable atteint 34 px de haut,
 * et le libellé central n'est pas cliquable pour éviter une cible ambiguë.
 */
export function StepperPill({ label, onPrev, onNext, prevLabel = "Précédent", nextLabel = "Suivant" }) {
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
      <button type="button" onClick={onPrev} aria-label={prevLabel} style={arrow}>
        <ChevronLeft size={16} strokeWidth={1.75} />
      </button>
      <span style={{fontSize:14,lineHeight:"18.6px",color:T.text,whiteSpace:"nowrap",textTransform:"capitalize"}}>
        {label}
      </span>
      <button type="button" onClick={onNext} aria-label={nextLabel} style={arrow}>
        <ChevronRight size={16} strokeWidth={1.75} />
      </button>
    </div>
  );
}

/**
 * Ne garde que la fin d'une série pour la fenêtre demandée. La série reste
 * cumulée depuis le début (c'est un zoom, pas un filtre de données) et on
 * retombe sur les deux derniers points si la fenêtre est trop étroite.
 */
export function windowSeries(points, periodId, getDate = p => p.date) {
  const days = (PERIODS.find(p => p.id === periodId) || PERIODS[1]).days;
  if (!points || points.length === 0) return points || [];
  const last = new Date(getDate(points[points.length - 1]));
  if (isNaN(last.getTime())) return points;
  const from = new Date(last);
  from.setDate(from.getDate() - days);
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
export function TableFilter({ label, value, options, onChange, multi = false }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const selected = multi ? (Array.isArray(value) ? value : []) : value;
  const active = multi ? selected.length > 0 : (value != null && value !== "");
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
          style={{transform: open ? "rotate(0deg)" : "rotate(-90deg)", transition:"transform 140ms var(--ease-out, ease)"}}
        />
      </button>
      {open && (
        <div
          role="listbox"
          className="anim-pop"
          style={{
            position:"absolute", top:"calc(100% + 8px)", left:0, zIndex:40,
            minWidth:200, maxHeight:280, overflowY:"auto",
            background:T.white, borderRadius:12, boxShadow:"var(--elev-overlay)",
            border:`1px solid ${T.border}`, padding:6,
          }}
        >
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
        </div>
      )}
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

  const t0 = msOf(points[0].date);
  const t1 = msOf(points[points.length - 1].date);
  const tSpan = (t1 - t0) || 1;
  const xFor = (date) => ((msOf(date) - t0) / tSpan) * W;

  /* Les autres comptes sont recadrés sur la même fenêtre temporelle, puis
     ANCRÉS au bord gauche : un compte ouvert plus tard commencerait sinon au
     milieu du graphique, ce qui laisse croire à une interruption. On préfixe
     donc sa série d'un point à t0 sur sa valeur de départ — le trait est plat
     jusqu'à son premier trade, puis la courbe démarre réellement.
     Symétriquement, une série qui s'arrête avant t1 est prolongée à plat
     jusqu'au bord droit, pour ne pas donner l'illusion d'un retour à zéro. */
  const otherClipped = (others || [])
    // Un compte sans aucun trade n'a rien à montrer : on ne trace pas de ligne
    // plate à zéro pour lui, elle serait indiscernable d'un compte à l'équilibre.
    .filter(s => Array.isArray(s?.points) && s.points.length > 0)
    .map(s => {
      const inWindow = s.points.filter(p => msOf(p.date) >= t0 && msOf(p.date) <= t1);
      // Aucun trade dans la fenêtre affichée : même raison, pas de ligne.
      if (inWindow.length === 0) return { ...s, points: [] };
      // Valeur au moment d'entrer dans la fenêtre : dernier point connu avant
      // t0 s'il y en a un (le compte existait déjà), sinon 0 (il n'a pas encore
      // tradé, sa courbe est plate à zéro).
      const before = s.points.filter(p => msOf(p.date) < t0);
      const startCum = before.length ? before[before.length - 1].cum : 0;
      const head = msOf(inWindow[0].date) > t0
        ? [{ date: points[0].date, cum: startCum }]
        : [];
      const last = inWindow[inWindow.length - 1];
      const tail = msOf(last.date) < t1
        ? [{ date: points[points.length - 1].date, cum: last.cum }]
        : [];
      return { ...s, points: [...head, ...inWindow, ...tail] };
    })
    .filter(s => s.points.length > 1);

  const values = points.map(p => p.cum);
  otherClipped.forEach(s => s.points.forEach(p => values.push(p.cum)));
  const yMax = Math.max(...values);
  const yMin = Math.min(...values);
  const ySpan = (yMax - yMin) || 1;
  const yFor = (v) => plotBottom - ((v - yMin) / ySpan) * plotH;

  // Couleur d'identité du compte : la maquette montre le compte XTB en rouge
  // ici ET sur sa carte de la liste. La couleur suit le compte, pas le P&L.
  const lineColor = color || T.kraken;
  const coords = points.map(p => [xFor(p.date), yFor(p.cum)]);
  const pathD = coords.map((c, i) => `${i === 0 ? "M" : "L"} ${c[0].toFixed(2)} ${c[1].toFixed(2)}`).join(" ");
  // Aire fermée sous la courbe : c'est elle qui porte la trame de points.
  const areaD = `${pathD} L ${coords[coords.length - 1][0].toFixed(2)} ${H} L ${coords[0][0].toFixed(2)} ${H} Z`;

  /* Seuil d'opacité « après le curseur » : son abscisse, en fraction de la
     largeur. `null` hors survol = aucun masque. Ici l'axe est TEMPOREL — les
     points ne sont pas répartis régulièrement —, on relit donc l'abscisse déjà
     calculée dans `coords` plutôt que de diviser un index par la longueur. */
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


  const cellW = W / Math.max(points.length - 1, 1);

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
            {otherClipped.map(s => {
              const d = s.points
                .map((p, i) => `${i === 0 ? "M" : "L"} ${xFor(p.date).toFixed(2)} ${yFor(p.cum).toFixed(2)}`)
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

          {/* Zones de capture, bornées à [0, W] : le <svg> est en
              overflow:visible, et sur une courbe à deux points la
              demi-cellule de débord atteindrait W/2 au-delà du bord — invisible
              en desktop (le conteneur clippe) mais capable d'ouvrir un scroll
              horizontal en mobile, où ce clip est désactivé. */}
          {coords.map((c, i) => {
            const x0 = Math.max(0, c[0] - cellW / 2);
            const x1 = Math.min(W, c[0] + cellW / 2);
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
