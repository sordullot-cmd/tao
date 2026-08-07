"use client";

/* ============================================================================
   Briques visuelles de la nouvelle direction artistique (maquettes Figma).
   Extraites de DashboardPage pour être réutilisées par les autres pages.

   Règle : aucune couleur en dur. Tout passe par lib/ui/tokens.ts, dont les
   valeurs sont des var(--color-*) — c'est ce qui fait suivre le thème sombre.
   ========================================================================== */

import React from "react";
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

/** Instruments reconnus : nom lisible + logo quand on en a un. */
export const SYMBOL_LOGOS = [
  { match: /^(mnq|nq|nasdaq|ndx|us100)/i, name: "Nasdaq", src: "/symbols/nasdaq.png" },
  { match: /^(mes|es|spx|us500)/i,        name: "S&P 500" },
  { match: /^(mym|ym|dow|us30)/i,         name: "Dow Jones" },
  { match: /^(m2k|rty|russell)/i,         name: "Russell 2000" },
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

/** Vignette 32×32 du symbole, avec repli sur une pastille d'initiales. */
export function SymbolBadge({ symbol, size = 32 }) {
  const logo = SYMBOL_LOGOS.find(l => l.match.test(String(symbol || "")) && l.src);
  if (logo) {
    return (
      <img
        src={logo.src}
        alt=""
        width={size}
        height={size}
        style={{width:size,height:size,borderRadius:4,objectFit:"cover",flexShrink:0,display:"block"}}
      />
    );
  }
  const initials = String(symbol || "?").replace(/[^A-Za-z0-9]/g, "").slice(0, 2).toUpperCase();
  return (
    <div style={{
      width:size, height:size, borderRadius:4, flexShrink:0,
      display:"flex", alignItems:"center", justifyContent:"center",
      background:T.accentBg, color:T.textSub, fontSize:12, fontWeight:500,
    }}>
      {initials}
    </div>
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

/**
 * Couleur d'identité d'un compte, partagée par la liste (« Live ») et la page
 * de détail : sur la maquette, trois comptes au même P&L portent trois couleurs
 * différentes, et le compte XTB est rouge sur les deux écrans. La couleur suit
 * donc le compte, pas le signe du P&L.
 *
 * Déterministe par identifiant (et non par position) pour qu'un compte garde sa
 * couleur quand la liste est triée ou filtrée.
 */
export const ACCOUNT_COLORS = [T.pnlNeg, T.pnlPos, T.kraken, T.blue, T.amber, T.cyan, T.purple];

export function accountColor(accountId, fallbackIndex = 0) {
  const key = String(accountId ?? "");
  if (!key) return ACCOUNT_COLORS[fallbackIndex % ACCOUNT_COLORS.length];
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return ACCOUNT_COLORS[hash % ACCOUNT_COLORS.length];
}

/** Fenêtres temporelles de la maquette. */
export const PERIODS = [
  { id: "1S", days: 7 },
  { id: "1M", days: 30 },
  { id: "3M", days: 90 },
  { id: "6M", days: 180 },
  { id: "1A", days: 365 },
];

/** Groupe de pastilles 1S/1M/3M/6M/1A — l'actif est blanc avec une ombre fine. */
export function PeriodPills({ value, onChange, options = PERIODS }) {
  return (
    <div style={{display:"flex",alignItems:"center",gap:4}}>
      {options.map(p => {
        const active = value === p.id;
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onChange?.(p.id)}
            aria-pressed={active}
            style={{
              padding:"6px 14px", borderRadius:999, border:"none",
              background: active ? T.white : "transparent",
              boxShadow: active ? T.elevPill : "none",
              color: T.text, opacity: active ? 1 : 0.6,
              fontSize:12, lineHeight:"18.6px", cursor:"pointer", fontFamily:"inherit",
              transition:"background 140ms ease, opacity 140ms ease",
            }}
          >
            {p.id}
          </button>
        );
      })}
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
