"use client";

/**
 * Page « Ajouter des trades » — l'écran d'import.
 *
 * Elle se lit dans l'ordre où l'on décide : d'où vient le relevé (la plateforme),
 * où il va (le compte, puis les comptes visés d'une prop firm), et enfin le
 * fichier. La zone de dépôt vient EN DERNIER parce que c'est le geste qui
 * conclut — une fois le fichier posé, il ne reste plus qu'à cliquer.
 *
 * Ce que la page n'a PAS, et volontairement :
 *
 * • pas d'étapes numérotées. Il y a trois champs, pas trois étapes ; les
 *   numéroter transformait un formulaire de dix lignes en démarche
 *   administrative, et cachait que l'on peut revenir sur n'importe lequel ;
 * • pas de grille de plateformes. On n'importe jamais que d'une seule
 *   plateforme — étaler les vignettes faisait payer à chaque import le prix
 *   d'un choix déjà fait. Un champ à menu, les favoris en tête ;
 * • pas de colonne récapitulative. Le nombre de trades lus tient sur une ligne,
 *   contre le bouton : c'est tout ce qu'il y a à récapituler.
 *
 * La marche à suivre d'export est repliée par défaut : on ne la lit qu'une
 * fois, la première.
 *
 * Tout tient dans une colonne bornée en largeur. Un formulaire étalé sur 1400
 * pixels oblige l'œil à traverser l'écran entre le libellé et son champ.
 */

import React, { useState, useEffect, useRef } from "react";
import {
  Check, ChevronDown, ChevronUp, FileText, Search, Star, UploadCloud, X,
  AlertCircle, CheckCircle2, Wallet,
} from "lucide-react";
import { t, useLang, getLang } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/client";
import { parseCSV } from "@/lib/csvParsers";
import { firmBrandId } from "@/lib/accountBrand";
import {
  DEFAULT_PLATFORM_ID,
  EXECUTION_PLATFORMS,
  platformById,
  platformsForFirm,
  primaryPlatformForFirm,
  resolveExecutionPlatform,
} from "@/lib/brokers/platforms";
import { T, FIELD_BG, HAIRLINE } from "@/lib/ui/tokens";
import { TYPE, TABULAR } from "@/lib/ui/type";
import { PillButton, Field, CheckBox, FIELD, FIELD_FOCUS_RING } from "@/components/ui/form";
import { CARD, TILE_HOVER } from "@/components/ui/da";
import { LogoTile, AccountLine, ACCOUNT_LINE } from "@/components/ui/accountRows";
import { accountTypeStyle } from "@/lib/ui/accountTypes";
import Popover from "@/components/ui/Popover";
import TradeTargetSelector from "@/components/TradeTargetSelector";

/* ── Marche à suivre d'export, par plateforme ────────────────────────────────
   Au niveau du module : la table est constante, la reconstruire à chaque rendu
   ne servait qu'à la relire. Ses deux langues sont posées côte à côte plutôt
   que dans lib/i18n.ts — c'est un contenu rédigé (cinq lignes par plateforme,
   une dizaine de plateformes), pas des libellés d'interface, et le noyer dans
   le dictionnaire aurait rendu les deux illisibles.

   Une seule famille y figure : les plateformes d'EXÉCUTION. Une prop firm
   n'exporte rien elle-même — sa marche à suivre est celle de la plateforme
   qu'elle fournit, et c'est cette plateforme que le champ propose.

   Chaque ligne est écrite « 1. … » et la numérotation est retirée à
   l'affichage (`stripIndex`) : la liste pose ses propres pastilles, mais le
   texte reste lisible tel quel ici. */
const EXPORT_STEPS = {
  fr: {
    tradovate: { subtext: "Actifs : Futures (CME, ICE, Eurex)", steps: [
      "1. Ouvrir l'onglet Account de Tradovate",
      "2. Aller dans Settings → Orders",
      "3. Sélectionner la plage de dates et cliquer Go",
      "4. Cliquer Download Report (export CSV)",
      "5. Charger le fichier CSV ici"] },
    rithmic: { subtext: "Actifs : Futures (multi-bourses)", steps: [
      "1. Ouvrir Rithmic R|Trader Pro",
      "2. Menu Reports → Order History (ou Trade History)",
      "3. Choisir la plage de dates puis Run Report",
      "4. Bouton Save / Export → format CSV",
      "5. Charger le fichier CSV ici"] },
    ninjatrader: { subtext: "Actifs : Futures, Forex, Actions", steps: [
      "1. Ouvrir NinjaTrader Control Center",
      "2. Menu Account → Account Performance (ou Trade Performance)",
      "3. Filtrer par compte et période",
      "4. Clic-droit sur le tableau des Trades → Export → CSV",
      "5. Charger le fichier CSV ici"] },
    alphatrader: { subtext: "Actifs : Futures – plateforme d'Alpha Futures", steps: [
      "1. Ouvrir AlphaTrader et se connecter au compte",
      "2. Panneau Orders / Trade History",
      "3. Choisir la plage de dates",
      "4. Bouton Export → CSV",
      "5. Charger le fichier CSV ici"] },
    quantower: { subtext: "Actifs : Futures – multi-brokers", steps: [
      "1. Ouvrir Quantower",
      "2. Panneau Trading → onglet History / Trades",
      "3. Filtrer par compte et période",
      "4. Clic-droit sur le tableau → Export → CSV",
      "5. Charger le fichier CSV ici"] },
    deepchart: { subtext: "Actifs : Futures – plateforme d'Alpha Futures", steps: [
      "1. Ouvrir DeepChart et se connecter au compte",
      "2. Onglet Trade Log / History",
      "3. Choisir la plage de dates",
      "4. Bouton Export → CSV",
      "5. Charger le fichier CSV ici"] },
    tradesea: { subtext: "Actifs : Futures – plateforme de prop firms", steps: [
      "1. Ouvrir TradeSea et se connecter au compte",
      "2. Onglet Trade History / Orders",
      "3. Choisir la plage de dates",
      "4. Bouton Export → CSV",
      "5. Charger le fichier CSV ici"] },
    tradingview: { subtext: "Charts + brokers connectés", steps: [
      "1. Ouvrir le panneau Trading en bas de TradingView",
      "2. Onglet History des ordres ou trades",
      "3. Bouton Export ou ⋯ → Download CSV",
      "4. Charger le fichier CSV ici"] },
    mt5: { subtext: "Forex, Actions, Indices, Crypto", steps: [
      "1. Ouvrir le terminal MetaTrader 5",
      "2. Onglet Toolbox → History",
      "3. Clic-droit → Custom Period et choisir la plage",
      "4. Clic-droit à nouveau → Report → Open XML (HTML)",
      "5. Charger le fichier HTML ici"] },
    mt4: { subtext: "Forex, CFD", steps: [
      "1. Ouvrir le terminal MetaTrader 4",
      "2. Onglet Terminal → Account History",
      "3. Clic-droit → All History (ou période personnalisée)",
      "4. Clic-droit à nouveau → Save as Detailed Report (HTML)",
      "5. Charger le fichier HTML ici"] },
    wealthcharts: { subtext: "Plateforme charts – Futures, Actions, Indices", steps: [
      "1. Ouvrir WealthCharts Trading Platform",
      "2. Aller dans Orders ou History",
      "3. Exporter en CSV",
      "4. Vérifier que le fichier contient : order_id, qty_sent, qty_done, price_done",
      "5. Charger le fichier CSV ici"] },
  },
  en: {
    tradovate: { subtext: "Assets: Futures (CME, ICE, Eurex)", steps: [
      "1. Open the Account tab in Tradovate",
      "2. Go to Settings → Orders",
      "3. Select the date range and click Go",
      "4. Click Download Report (CSV export)",
      "5. Upload the CSV file here"] },
    rithmic: { subtext: "Assets: Futures (multi-exchange)", steps: [
      "1. Open Rithmic R|Trader Pro",
      "2. Reports menu → Order History (or Trade History)",
      "3. Choose the date range then Run Report",
      "4. Save / Export button → CSV format",
      "5. Upload the CSV file here"] },
    ninjatrader: { subtext: "Assets: Futures, Forex, Stocks", steps: [
      "1. Open NinjaTrader Control Center",
      "2. Account menu → Account Performance (or Trade Performance)",
      "3. Filter by account and period",
      "4. Right-click on the Trades table → Export → CSV",
      "5. Upload the CSV file here"] },
    alphatrader: { subtext: "Assets: Futures – Alpha Futures platform", steps: [
      "1. Open AlphaTrader and log in to the account",
      "2. Orders / Trade History panel",
      "3. Pick the date range",
      "4. Export button → CSV",
      "5. Upload the CSV file here"] },
    quantower: { subtext: "Assets: Futures – multi-broker", steps: [
      "1. Open Quantower",
      "2. Trading panel → History / Trades tab",
      "3. Filter by account and period",
      "4. Right-click the table → Export → CSV",
      "5. Upload the CSV file here"] },
    deepchart: { subtext: "Assets: Futures – Alpha Futures platform", steps: [
      "1. Open DeepChart and log in to the account",
      "2. Trade Log / History tab",
      "3. Pick the date range",
      "4. Export button → CSV",
      "5. Upload the CSV file here"] },
    tradesea: { subtext: "Assets: Futures – prop firm platform", steps: [
      "1. Open TradeSea and log in to the account",
      "2. Trade History / Orders tab",
      "3. Pick the date range",
      "4. Export button → CSV",
      "5. Upload the CSV file here"] },
    tradingview: { subtext: "Charts + connected brokers", steps: [
      "1. Open the Trading panel at the bottom of TradingView",
      "2. Orders or Trades History tab",
      "3. Export button or ⋯ → Download CSV",
      "4. Upload the CSV file here"] },
    mt5: { subtext: "Forex, Stocks, Indices, Crypto", steps: [
      "1. Open the MetaTrader 5 terminal",
      "2. Toolbox tab → History",
      "3. Right-click → Custom Period and pick the range",
      "4. Right-click again → Report → Open XML (HTML)",
      "5. Upload the HTML file here"] },
    mt4: { subtext: "Forex, CFD", steps: [
      "1. Open the MetaTrader 4 terminal",
      "2. Terminal tab → Account History",
      "3. Right-click → All History (or custom period)",
      "4. Right-click again → Save as Detailed Report (HTML)",
      "5. Upload the HTML file here"] },
    wealthcharts: { subtext: "Charting platform – Futures, Stocks, Indices", steps: [
      "1. Open WealthCharts Trading Platform",
      "2. Go to Orders or History",
      "3. Export to CSV",
      "4. Make sure the file contains: order_id, qty_sent, qty_done, price_done",
      "5. Upload the CSV file here"] },
  },
};

const exportGuide = (id) => {
  const table = EXPORT_STEPS[getLang() === "en" ? "en" : "fr"];
  return table[id] || table.tradovate;
};

/** « 3. Cliquer Go » → « Cliquer Go » : la pastille porte déjà le numéro. */
const stripIndex = (line) => String(line).replace(/^\s*\d+\.\s*/, "");

/** Extensions proposées au dialogue de fichiers, selon le format attendu. */
/* Extensions proposées au dialogue de fichiers. Sans plateforme nommée on
   n'exclut rien : le dialogue ne doit pas masquer le fichier que l'utilisateur
   est venu chercher sous prétexte qu'on ne sait pas encore d'où il vient. */
const acceptFor = (format) =>
  format === "html" ? ".html,.htm" : format === "csv" ? ".csv,.txt" : ".csv,.txt,.html,.htm";

/* Déclencheur d'un champ à menu : la pilule en aplat de la charte (`FIELD`),
   sans contour. Identique à celle du sélecteur de destination juste au-dessus —
   les deux champs s'enchaînent, un écart de dessin entre eux se verrait. */
const TRIGGER = {
  ...FIELD,
  display: "flex", alignItems: "center", gap: 8,
  fontWeight: 500, textAlign: "left", cursor: "pointer",
  transition: "var(--tr-ui)",
};

/**
 * Choix de la plateforme d'export : un champ à menu, pas une grille.
 *
 * On n'importe jamais que d'une seule plateforme — les étaler en vignettes
 * faisait payer à chaque import le prix d'un choix déjà fait. Les favoris
 * remontent en tête de liste, ce qui suffit : c'est toujours le même qui
 * revient. La liste elle-même est celle que le parent autorise : les
 * plateformes de la prop firm visée, tout le catalogue hors firme.
 */
function PlatformField({ value, platforms, favorites, onChange, onToggleFavorite }) {
  const ref = useRef(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  /* La recherche est vidée à l'OUVERTURE, pas à la fermeture : remettre l'état
     dans un effet déclenche un rendu en cascade pour un champ que plus personne
     ne regarde. */
  const openMenu = () => { setQuery(""); setOpen(true); };
  const closeMenu = () => setOpen(false);

  /* Rien n'est présélectionné : `current` peut être nul, et le champ affiche
     alors son invite. Retomber sur une plateforme par défaut faisait passer un
     choix jamais fait pour un choix fait — avec le mauvais parseur au bout. */
  const current = platformById(value);
  const options = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    /* `platforms` ne contient que des plateformes d'EXÉCUTION, et seulement
       celles de la prop firm visée quand il y en a une : ce champ choisit le
       parseur du fichier, et une firme n'exporte rien elle-même — c'est la
       plateforme qu'elle fournit qui produit le CSV. */
    return platforms
      .filter((p) => !q || p.name.toLowerCase().includes(q) || p.id.includes(q))
      .sort((a, b) => {
        const fa = favorites.includes(a.id) ? 0 : 1;
        const fb = favorites.includes(b.id) ? 0 : 1;
        return fa !== fb ? fa - fb : a.name.localeCompare(b.name, "fr");
      });
  }, [platforms, query, favorites]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => (open ? closeMenu() : openMenu())}
        /* Le champ annonce qu'il ouvre une liste, et s'il l'a ouverte : sans
           ça, un lecteur d'écran présente un bouton dont l'action est une
           surprise. Son nom accessible reste sa VALEUR — c'est elle qu'on veut
           entendre en le survolant, pas le mot « plateforme » que le libellé
           juste au-dessus prononce déjà. */
        aria-haspopup="listbox"
        aria-expanded={open}
        /* L'anneau ne se montre QUE menu ouvert : un trait permanent autour
           d'un champ est un rectangle de plus à lire avant son contenu. */
        style={{ ...TRIGGER, boxShadow: open ? FIELD_FOCUS_RING : "none" }}
      >
        {current && <LogoTile src={current.iconPath} size={18} name={current.name} />}
        <span style={{
          flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          color: current ? T.text : T.textMut,
        }}>
          {current ? current.name : t("addTrade.pickPlatform")}
        </span>
        {current && (
          <span style={{ ...TYPE.caption2, color: T.textMut, textTransform: "uppercase", flexShrink: 0 }}>
            {current.format}
          </span>
        )}
        {open ? <ChevronUp size={14} color={T.textMut} /> : <ChevronDown size={14} color={T.textMut} />}
      </button>

      <Popover
        anchorRef={ref}
        open={open}
        onClose={closeMenu}
        gap={4}
        matchAnchorWidth
        scroll={false}
        maxHeight={320}
        style={{
          background: "var(--color-card-bg, #FFFFFF)", border: "none", borderRadius: 10,
          boxShadow: "var(--elev-overlay)",
        }}
      >
        <>
          {/* Un aplat sépare l'en-tête de la liste, pas un filet. */}
          <div style={{ flexShrink: 0, padding: 8, background: FIELD_BG }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 4px" }}>
              <Search size={13} color={T.textMut} />
              <input
                type="text"
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("addTrade.searchBroker")}
                spellCheck={false}
                autoComplete="off"
                style={{
                  flex: 1, border: "none", background: "transparent", outline: "none",
                  fontSize: 13, padding: "6px 0", color: T.text, fontFamily: "inherit",
                }}
              />
            </div>
          </div>

          <div className="scroll-thin" style={{ flex: 1, minHeight: 0, overflowY: "auto", overscrollBehavior: "contain", maxHeight: 280, padding: 4 }}>
            {options.length === 0 && (
              <div style={{ padding: "12px 14px", ...TYPE.label, color: T.textMut, textAlign: "center" }}>
                {t("addTrade.noBroker")}
              </div>
            )}
            {options.map((p) => {
              const active = p.id === value;
              const fav = favorites.includes(p.id);
              return (
                /* L'étoile est un FRÈRE de la ligne, pas son enfant : un bouton
                   dans un bouton n'est pas du HTML valide, et le clic sur
                   l'étoile choisirait aussi la plateforme. */
                <div key={p.id} style={{ position: "relative", display: "flex" }}>
                  <button
                    type="button"
                    onClick={() => { onChange(p.id); closeMenu(); }}
                    style={{
                      flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 8,
                      padding: "8px 44px 8px 10px", border: "none", borderRadius: 6,
                      background: active ? "var(--color-active-bg)" : "transparent",
                      color: "var(--color-text)", fontSize: 13, fontWeight: 500,
                      fontFamily: "inherit", textAlign: "left", cursor: "pointer",
                      transition: "background 100ms ease",
                    }}
                    onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = "var(--color-hover-bg, #F5F5F5)"; }}
                    onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}
                  >
                    <LogoTile src={p.iconPath} size={18} name={p.name} />
                    <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {p.name}
                    </span>
                    {active && <Check size={14} color={T.text} style={{ flexShrink: 0 }} />}
                  </button>
                  <button
                    type="button"
                    onClick={() => onToggleFavorite(p.id)}
                    aria-pressed={fav}
                    aria-label={fav ? t("addTrade.removeFav") : t("addTrade.addFav")}
                    title={fav ? t("addTrade.removeFav") : t("addTrade.addFav")}
                    style={{
                      position: "absolute", right: 4, top: "50%", transform: "translateY(-50%)",
                      width: 28, height: 28, borderRadius: "50%", border: "none",
                      background: "transparent", cursor: "pointer",
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      color: fav ? T.amber : T.textMut, opacity: fav ? 1 : 0.45,
                      transition: "var(--tr-ui)",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = FIELD_BG; e.currentTarget.style.opacity = 1; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.opacity = fav ? 1 : 0.45; }}
                  >
                    <Star size={13} strokeWidth={1.75} fill={fav ? T.amber : "none"} />
                  </button>
                </div>
              );
            })}
          </div>
        </>
      </Popover>
    </div>
  );
}

/** Marche à suivre d'export, repliée par défaut : on ne la lit qu'une fois. */
function ExportGuide({ platform }) {
  const [open, setOpen] = useState(false);
  const guide = exportGuide(platform.id);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{
          alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 4,
          background: "none", border: "none", padding: 0, cursor: "pointer",
          fontFamily: "inherit", ...TYPE.caption, color: T.textSub,
        }}
      >
        {t("addTrade.howToExport")} — {platform.name}
        <ChevronDown
          size={12} strokeWidth={2} data-chevron
          style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform var(--dur-fast) var(--ease-out)" }}
        />
      </button>

      {open && (
        <div className="anim-fade-up" style={{ background: FIELD_BG, borderRadius: 12, padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={{ ...TYPE.caption, color: T.textMut }}>{guide.subtext}</span>
          <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
            {guide.steps.map((step, i) => (
              <li key={step} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                <span aria-hidden="true" style={{
                  width: 16, height: 16, borderRadius: "50%", flexShrink: 0, marginTop: 1,
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  background: T.white, color: T.textSub, ...TYPE.caption2, fontWeight: 600,
                }}>
                  {i + 1}
                </span>
                <span style={{ ...TYPE.label, color: T.textSub, lineHeight: 1.5 }}>{stripIndex(step)}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

/**
 * Un compte visé — la LIGNE DE COMPTE de l'app.
 *
 * C'est la présentation du menu « N comptes » de la page d'une prop firm
 * (`AccountLine`, components/ui/accountRows.jsx) : un créneau de marqueur, le
 * nom, le type, la taille — un seul étage de 32 px. Les pastilles à cocher
 * d'avant avaient deux défauts que cette liste n'a pas : le nom y était le seul
 * renseignement (« Eval 50k » ou « Compte 3 », et débrouille-toi), et une
 * rangée qui se réorganise à chaque ligne ne se parcourt pas du regard, alors
 * qu'une colonne, oui.
 *
 * Le créneau de marqueur porte ici la CASE À COCHER, là où le menu de la firme
 * met la pastille de couleur de la courbe : ce créneau dit « de quoi il s'agit
 * dans cet écran-ci », et ici la ligne est un choix, pas un lien. Pas de teinte
 * de type non plus — le type est écrit, la couleur ne dirait rien de plus.
 *
 * La taille du compte occupe la colonne de valeur. Cette page ne connaît pas
 * les trades : impossible d'y afficher un P&L, et la taille est ce qui
 * distingue réellement deux comptes d'une même firme.
 */
function AccountRow({ account, checked, onToggle }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={account.name || t("addTrade.account")}
      onClick={onToggle}
      style={{
        ...ACCOUNT_LINE, width: "100%", textAlign: "left", border: "none",
        background: "transparent", cursor: "pointer", fontFamily: "inherit",
        transition: "var(--tr-ui)",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = T.rowHighlight; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
    >
      <AccountLine
        marker={<CheckBox on={checked} />}
        name={account.name || t("addTrade.account")}
        type={accountTypeStyle(account).label()}
        value={account.eval_account_size || null}
        /* Le nom s'allume avec la case : sur une colonne de six lignes, la case
           seule est un signal trop petit pour se lire d'un coup d'œil. */
        dim={!checked}
      />
    </button>
  );
}

/**
 * Séparation entre deux sections de la carte.
 *
 * Un filet PLEINE LARGEUR — les marges négatives le font sortir du padding de
 * la carte pour toucher ses deux bords. C'est ce qui en fait une séparation et
 * non un contour : un trait qui s'arrête avant le bord dessine un rectangle,
 * un trait qui va d'un bord à l'autre découpe la surface en bandes. La nuance
 * est tout l'intérêt — on veut savoir où finit « le compte » et où commence
 * « la plateforme », pas voir trois cadres.
 *
 * Dilué (`HAIRLINE`, encre à 8 %) et exprimé en transparence : il s'inverse
 * tout seul en thème sombre.
 */
function Divider() {
  return <div aria-hidden="true" style={{ height: 1, flexShrink: 0, background: HAIRLINE, margin: "2px -20px" }} />;
}

/* ── La page ─────────────────────────────────────────────────────────────── */

export default function AddTradePage({ setPage, setAccounts, accounts = [], firms = [], user }) {
  useLang();
  /* Destination de l'import, en deux temps :
     1. `target` = la firme (compte mère) OU un compte hors firme ;
     2. `targetIds` = les comptes précis visés. Pour une firme, ses comptes sont
        listés d'un coup, seulement regroupés par type.
     L'insertion reste faite compte par compte. */
  const [target, setTarget] = useState(null);      // { kind: "firm"|"account", id }
  const [targetIds, setTargetIds] = useState([]);

  /** Comptes de la firme sélectionnée, groupés par type et dans un ordre stable. */
  const firmAccountsByType = React.useMemo(() => {
    if (target?.kind !== "firm") return [];
    const inFirm = (accounts || []).filter((a) => a.firm_id === target.id);
    const groups = new Map();
    for (const acc of inFirm) {
      const ty = acc.account_type || "live";
      if (!groups.has(ty)) groups.set(ty, []);
      groups.get(ty).push(acc);
    }
    return ["eval", "funded", "live", "demo"]
      .filter((ty) => groups.has(ty))
      .map((ty) => ({ type: ty, accounts: groups.get(ty) }));
  }, [target, accounts]);

  /** Tous les comptes de la firme visée, à plat et dans l'ordre des groupes. */
  const firmAccounts = React.useMemo(
    () => firmAccountsByType.flatMap((g) => g.accounts),
    [firmAccountsByType]
  );

  /* Choix de la destination → on repart d'une sélection cohérente : un compte
     isolé se vise seul ; une firme présélectionne les comptes de son premier
     groupe (éval avant funded, etc.) plutôt que tous — mélanger éval et funded
     dans un même import est rarement voulu. Les autres restent visibles et se
     cochent d'un clic. */
  useEffect(() => {
    if (!target) { setTargetIds([]); return; }
    if (target.kind === "account") { setTargetIds([target.id]); return; }
    const first = firmAccountsByType[0];
    setTargetIds(first ? first.accounts.map((a) => a.id) : []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  const toggleTargetId = (id) => {
    setTargetIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const selectedAccountObjects = React.useMemo(
    () => (accounts || []).filter((a) => targetIds.includes(a.id)),
    [targetIds, accounts]
  );
  // Nom du compte quand un seul est visé : sert à présélectionner le parseur.
  const accountName = selectedAccountObjects.length === 1 ? selectedAccountObjects[0].name : "";
  /* Vide à l'arrivée : la plateforme est un CHOIX, pas un réglage par défaut.
     Elle se remplit toute seule quand un compte visé en désigne une (effet plus
     bas) ; sinon l'utilisateur la nomme. Tant qu'elle est vide, le parseur
     travaille en détection automatique — un fichier reconnu passe donc quand
     même, et un fichier non reconnu affiche « aucun trade trouvé », ce qui dit
     précisément quoi faire : nommer sa plateforme. */
  const [selectedBroker, setSelectedBroker] = useState("");

  // Favoris brokers : localStorage = cache rapide, Supabase = source de vérité.
  const [favoriteBrokers, setFavoriteBrokers] = useState(() => {
    try { return JSON.parse(localStorage.getItem("tr4de_favorite_brokers") || "[]"); }
    catch { return []; }
  });

  // Charger depuis Supabase au montage + au focus de la fenêtre.
  useEffect(() => {
    if (!user?.id) return;
    const supabase = createClient();
    let cancelled = false;
    const load = async () => {
      try {
        const { data, error } = await supabase
          .from("user_preferences")
          .select("favorite_brokers")
          .eq("user_id", user.id)
          .maybeSingle();
        if (error) {
          if (error.message?.includes("Could not find the table") || error.code === "PGRST116") return;
          throw error;
        }
        if (cancelled) return;
        const list = Array.isArray(data?.favorite_brokers) ? data.favorite_brokers : [];
        setFavoriteBrokers(list);
        try { localStorage.setItem("tr4de_favorite_brokers", JSON.stringify(list)); } catch {}
      } catch (e) { console.error("⚠️ load favorite_brokers failed:", e?.message || e); }
    };
    load();
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => { cancelled = true; window.removeEventListener("focus", onFocus); };
  }, [user?.id]);

  const toggleFavoriteBroker = (id) => {
    setFavoriteBrokers((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      try { localStorage.setItem("tr4de_favorite_brokers", JSON.stringify(next)); } catch {}
      // Push vers Supabase (upsert sur user_id UNIQUE)
      if (user?.id) {
        const supabase = createClient();
        supabase.from("user_preferences")
          .upsert([{ user_id: user.id, favorite_brokers: next }], { onConflict: "user_id" })
          .then(({ error }) => {
            if (error) console.error("⚠️ save favorite_brokers failed:", error.message);
          });
      }
      return next;
    });
  };

  // Fichiers choisis : [{ name, content }] — l'import multi-fichiers est supporté.
  const [files, setFiles] = useState([]);
  /* Ce que les fichiers contiennent, relu par le parseur courant : le total, et
     le détail par fichier. */
  const [detected, setDetected] = useState(0);
  const [perFile, setPerFile] = useState({});
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef(null);
  /* Survol du glisser-déposer : un state, pas une mutation de `style`. */
  const [dragOver, setDragOver] = useState(false);

  /* Firme visée par l'import : celle choisie comme destination, ou celle du
     compte visé. C'est elle qui décide des plateformes offertes — proposer
     MetaTrader pour un compte Apex n'a pas de sens, et l'import partirait du
     mauvais parseur. Hors firme, tout le catalogue d'exécution. */
  const targetFirm = React.useMemo(() => {
    const firmId = target?.kind === "firm" ? target.id : selectedAccountObjects[0]?.firm_id;
    return firmId ? (firms || []).find((f) => f.id === firmId) || null : null;
  }, [target, firms, selectedAccountObjects]);

  const firmBrand = firmBrandId(targetFirm);
  const allowedPlatforms = React.useMemo(
    () => (firmBrand ? platformsForFirm(firmBrand) : EXECUTION_PLATFORMS),
    [firmBrand]
  );

  // Catalogue partagé avec les modales de création de compte / firme.
  // Nul tant qu'aucune plateforme n'a été nommée.
  const platform = platformById(selectedBroker);
  /* Ce qu'on passe au parseur : le repli déclaré par la plateforme, pas son id.
     ProjectX et DepthChart exportent les colonnes de Tradovate sans porter ce
     nom — sans cette indirection elles retomberaient sur le parseur générique.
     `null` quand rien n'est choisi : `parseCSV` reconnaît alors le format tout
     seul, plutôt que d'appliquer le parseur d'une plateforme au hasard. */
  const parserHint = platform ? (platform.hint || platform.id) : null;

  /* Le format de fichier à parser suit la plateforme du compte sélectionné.
     Cette page ne MODIFIE aucun compte : création et édition se font depuis la
     page Comptes (compte isolé) ou la page détail d'une firme. */
  useEffect(() => {
    if (!accountName || accounts.length === 0) return;
    const selectedAccount = accounts.find((acc) => acc.name === accountName);
    if (!selectedAccount?.broker) return;
    /* Un compte peut porter le nom de sa FIRME plutôt que celui d'une
       plateforme (données d'avant la séparation) : on résout alors la
       plateforme qu'elle fournit, sinon l'import repartirait du parseur
       générique. */
    const brokerMatch = resolveExecutionPlatform(selectedAccount.broker);
    if (brokerMatch) setSelectedBroker(brokerMatch.id);
  }, [accountName, accounts]);

  /* Changer de destination peut sortir la plateforme retenue de la liste : on la
     ramène alors sur la principale de la firme, jamais sur un choix qu'elle
     n'offre pas — le pied annoncerait un import que le parseur ne saurait pas
     faire. Cet effet passe APRÈS celui du compte ci-dessus, dont la plateforme
     enregistrée reste prioritaire quand la firme la propose. */
  useEffect(() => {
    // Le choix courant reste servi par la destination : on n'y touche pas.
    if (allowedPlatforms.some((p) => p.id === selectedBroker)) return;
    /* Hors firme, on ne remplit RIEN. C'est toute la différence entre déduire et
       présélectionner : une prop firm dit quelle plateforme elle fournit, donc
       la nommer est une déduction ; sans firme il n'y a rien à déduire, et poser
       une plateforme au hasard ferait passer un choix jamais fait pour un choix
       fait. Un choix devenu invalide est en revanche effacé. */
    if (!firmBrand) {
      if (selectedBroker) setSelectedBroker("");
      return;
    }
    const fallback = primaryPlatformForFirm(firmBrand) || allowedPlatforms[0];
    setSelectedBroker(fallback?.id || "");
  }, [allowedPlatforms, firmBrand, selectedBroker]);

  /* Relecture des fichiers — déclenchée par les fichiers ET par la plateforme.
     C'est le parseur qui dépend de la seconde : changer de plateforme APRÈS
     avoir déposé un fichier laissait sinon un compte périmé à l'écran alors que
     l'import, lui, repartait du bon parseur. Un seul endroit qui lit, donc un
     seul résultat possible. */
  useEffect(() => {
    if (files.length === 0) { setDetected(0); setPerFile({}); return; }
    try {
      const counts = {};
      const all = files.flatMap((f) => {
        const trades = parseCSV(f.content, parserHint);
        counts[f.name] = trades.length;
        return trades;
      });
      setPerFile(counts);
      setDetected(all.length);
      setError(all.length === 0 ? t("addTrade.err.noTradesFound") : "");
    } catch (err) {
      setPerFile({});
      setDetected(0);
      setError(t("addTrade.err.generic").replace("{msg}", err.message));
    }
  }, [files, parserHint]);

  /** Lecture des fichiers, quel que soit le chemin d'entrée (dialogue ou dépôt). */
  const addFiles = async (selected) => {
    if (!selected || selected.length === 0) return;
    setError("");
    setSuccessMsg("");
    setLoading(true);
    try {
      const read = await Promise.all(
        Array.from(selected).map(async (file) => ({ name: file.name, content: await file.text() }))
      );
      // Accumule avec les fichiers déjà choisis, en évitant les doublons par nom.
      const existingNames = new Set(files.map((f) => f.name));
      setFiles([...files, ...read.filter((f) => !existingNames.has(f.name))]);
    } catch (err) {
      setError(t("addTrade.err.generic").replace("{msg}", err.message));
    }
    setLoading(false);
  };

  const handleFileSelect = async (e) => {
    const input = e.target;
    await addFiles(input.files);
    /* Sans ça, redéposer le MÊME fichier après l'avoir retiré ne déclenche
       aucun `change` : la valeur de l'input n'a pas bougé. */
    input.value = "";
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    addFiles(e.dataTransfer?.files);
  };

  const removeFile = (name) => setFiles((prev) => prev.filter((f) => f.name !== name));

  const handleImport = async () => {
    if (targetIds.length === 0) {
      setError(t("addTrade.err.noAccountName"));
      return;
    }
    if (files.length === 0) {
      setError(t("addTrade.err.noFile"));
      return;
    }

    setLoading(true);
    setError("");
    setSuccessMsg("");

    try {
      const supabase = createClient();
      const userId = user?.id;
      const importedTrades = files.flatMap((f) => parseCSV(f.content, parserHint));
      if (importedTrades.length === 0) {
        setError(t("addTrade.err.noTrades"));
        setLoading(false);
        return;
      }

      /* Les comptes visés sont déjà des IDs (le sélecteur ne propose que des
         comptes existants). On revalide côté base : un compte supprimé dans un
         autre onglet ne doit pas passer silencieusement. */
      const { data: liveAccounts, error: checkErr } = await supabase
        .from("trading_accounts")
        .select("id, name")
        .eq("user_id", userId)
        .in("id", targetIds);
      if (checkErr) {
        setError(t("addTrade.err.generic").replace("{msg}", checkErr.message));
        setLoading(false);
        return;
      }
      const liveIds = new Set((liveAccounts || []).map((a) => a.id));
      const targetAccountIds = targetIds.filter((id) => liveIds.has(id));
      const missing = targetIds
        .filter((id) => !liveIds.has(id))
        .map((id) => (accounts || []).find((a) => a.id === id)?.name || id);

      if (missing.length > 0) {
        setError(t("addTrade.err.unknownAccount").replace("{names}", missing.join(", ")));
        setLoading(false);
        return;
      }

      if (targetAccountIds.length === 0) {
        setError(t("addTrade.err.noAccountName"));
        setLoading(false);
        return;
      }

      const norm = (v) => (v == null ? "" : String(v));
      const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
      const sigOf = (tr) =>
        `${norm(tr.date).slice(0, 10)}|${norm(tr.symbol).toUpperCase()}|${round2(tr.entry)}|${round2(tr.exit)}|${norm(tr.entry_time)}`;

      let totalInserted = 0;
      let duplicateCount = 0;

      // Insère les trades pour chaque compte cible.
      for (const targetId of targetAccountIds) {
        const allTrades = importedTrades.map((tr) => ({
          user_id: userId,
          account_id: targetId,
          date: tr.date,
          symbol: tr.symbol,
          direction: tr.direction,
          entry: tr.entry,
          exit: tr.exit,
          pnl: tr.pnl,
          quantity: tr.quantity ?? tr.qty ?? null,
          volume: tr.volume ?? null,
          entry_time: tr.entryTime || tr.entry_time || null,
          exit_time: tr.exitTime || tr.exit_time || null,
        }));

        if (allTrades.length === 0) continue;

        // Anti-doublons : par compte.
        const { data: existingTrades } = await supabase
          .from("apex_trades")
          .select("date, symbol, entry, exit, entry_time")
          .eq("user_id", userId)
          .eq("account_id", targetId);
        const existingSet = new Set((existingTrades || []).map(sigOf));

        const tradesToInsert = [];
        const seenInBatch = new Set();
        for (const tr of allTrades) {
          const sig = sigOf(tr);
          if (existingSet.has(sig) || seenInBatch.has(sig)) {
            duplicateCount += 1;
            continue;
          }
          seenInBatch.add(sig);
          tradesToInsert.push(tr);
        }

        if (tradesToInsert.length === 0) continue;

        let { error: insertError } = await supabase
          .from("apex_trades")
          .insert(tradesToInsert);

        /* Tolérance : si les colonnes quantity/volume n'existent pas encore en
           base (migration 028 non appliquée), on réessaie sans elles. */
        if (insertError && /could not find the '(quantity|volume)' column/i.test(insertError.message || "")) {
          console.warn("⚠️ Colonnes quantity/volume absentes — réessai sans (applique la migration 028 pour les conserver)");
          const stripped = tradesToInsert.map(({ quantity, volume, ...rest }) => rest);
          ({ error: insertError } = await supabase.from("apex_trades").insert(stripped));
        }

        if (insertError) {
          console.error("Error inserting trades:", insertError);
          setError(t("addTrade.err.saveTrades").replace("{msg}", insertError.message));
          setLoading(false);
          return;
        }
        totalInserted += tradesToInsert.length;
      }

      if (totalInserted === 0) {
        setError(t("addTrade.info.allDuplicates").replace("{n}", String(importedTrades.length)));
        setLoading(false);
        return;
      }

      /* Les trades relus depuis la base, et non ceux du CSV : ce sont les UUID
         de Supabase qui servent de clé partout ailleurs (suppression,
         rattachement d'une stratégie). Toute la liste de l'utilisateur est
         relue, pas seulement le compte visé — c'est elle que `useTrades()` lit
         dans localStorage. */
      const { data: allUserTrades, error: fetchError } = await supabase
        .from("apex_trades")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (fetchError) {
        // Les trades sont écrits en base : on continue malgré tout.
        console.error("Relecture des trades impossible :", fetchError);
      } else if (allUserTrades && allUserTrades.length > 0) {
        localStorage.setItem("tr4de_trades", JSON.stringify(allUserTrades));
        /* `storage` ne se déclenche PAS dans l'onglet qui écrit : sans cet
           événement, l'app n'affiche les trades importés qu'au rechargement. */
        window.dispatchEvent(new CustomEvent("trades-refreshed", { detail: { trades: allUserTrades } }));
      }

      // Recharger les comptes en haut.
      const { data: updatedAccounts } = await supabase
        .from("trading_accounts")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (setAccounts) setAccounts(updatedAccounts || []);

      setTargetIds([]);
      setFiles([]);
      setError("");
      setSuccessMsg(
        t("addTrade.info.imported")
          .replace("{n}", String(totalInserted))
          .replace("{d}", String(duplicateCount))
          .replace(/\{s\}/g, totalInserted > 1 ? "s" : "")
          .replace(/\{ds\}/g, duplicateCount > 1 ? "s" : "")
      );
      setLoading(false);

      /* On RESTE sur la page. Elle est repartie vierge (destination et fichiers
         vidés) et le compte rendu est affiché : importer un second relevé
         s'enchaîne sans avoir à revenir. Partir tout seul vers la liste des
         trades emportait aussi le compte rendu avant qu'on ait fini de le lire,
         et coûtait un aller-retour dès qu'il y avait un deuxième fichier. */
    } catch (err) {
      setSuccessMsg("");
      setError(t("addTrade.err.import").replace("{msg}", err.message));
      console.error("Import error:", err);
      setLoading(false);
    }
  };

  const nothingToTarget = (accounts || []).length === 0 && (firms || []).length === 0;
  const ready = targetIds.length > 0 && files.length > 0 && detected > 0 && !loading;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, minWidth: 0 }}>
      {/* ─── En-tête ─── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
          <h1 style={{ ...TYPE.title2, color: T.text, margin: 0 }}>{t("addTrade.title")}</h1>
          <p style={{ ...TYPE.callout, fontWeight: 400, color: T.textSub, margin: 0 }}>
            {t("addTrade.pageSubtitle")}
          </p>
        </div>
        {/* La création de comptes ne se fait pas ici : cette page n'en modifie
            aucun, elle y écrit. Le renvoi reste à portée pour le cas où la
            destination manque. */}
        <PillButton onClick={() => setPage("accounts")} style={{ flexShrink: 0 }}>
          <Wallet size={14} strokeWidth={1.75} /> {t("addTrade.manageAccounts")}
        </PillButton>
      </div>

      {/* Une seule surface, pleine largeur, et AUCUN contour : ni bordure, ni
          ombre, ni filet interne. Ce qui délimite les blocs, c'est le
          changement de SURFACE et l'espace — un aplat plus clair pour la zone
          de dépôt, un aplat plus dense pour les champs, et de l'air entre les
          deux. Un trait ne fait que redire une limite que l'œil voit déjà, et
          six traits sur un écran font six rectangles à traverser avant
          d'atteindre ce qu'on est venu remplir. */}
      <div style={{ ...CARD, padding: 0, boxShadow: "none", display: "flex", flexDirection: "column", minWidth: 0 }}>
        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>
          {/* ── Où ça va ── */}
          {/* La destination d'abord, la plateforme ensuite : c'est l'ordre des
              décisions. Le compte visé commande le reste — il désigne lui-même
              la plateforme du champ suivant, et sa prop firm en borne la liste.
              Choisir la plateforme en premier revenait à répondre à une question
              que le compte allait rectifier. */}
          <Field label={t("addTrade.account")}>
            {nothingToTarget ? (
              <p style={{ ...TYPE.body, color: T.textMut, margin: 0, lineHeight: 1.5 }}>
                {t("addTrade.noAccountHint")}
              </p>
            ) : (
              <TradeTargetSelector
                accounts={accounts}
                firms={firms}
                value={target}
                onChange={setTarget}
              />
            )}
          </Field>

          {/* Une firme peut viser plusieurs de ses comptes d'un coup. Liste
              PLATE, comme le menu « N comptes » de sa page : ses comptes y sont
              énumérés dans le même ordre de types (éval, funded, live, démo)
              sans en-tête de groupe, chaque ligne écrivant son type elle-même. */}
          {target?.kind === "firm" && (
            firmAccounts.length === 0 ? (
              <p style={{ ...TYPE.caption, color: T.textMut, margin: 0, lineHeight: 1.5 }}>
                {t("addTrade.target.firmEmpty")}
              </p>
            ) : (
              <div className="anim-fade-up" style={{ display: "flex", flexDirection: "column", margin: "0 -10px" }}>
                {firmAccounts.map((acc) => (
                  <AccountRow
                    key={acc.id}
                    account={acc}
                    checked={targetIds.includes(acc.id)}
                    onToggle={() => toggleTargetId(acc.id)}
                  />
                ))}
              </div>
            )
          )}

          <Divider />

          {/* ── Comment le lire ── */}
          {/* La marche à suivre d'export est collée au champ qu'elle explique,
              et repliée : on ne la lit qu'une fois, la première. */}
          <Field label={t("addTrade.broker")}>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
              <PlatformField
                value={selectedBroker}
                platforms={allowedPlatforms}
                favorites={favoriteBrokers}
                onChange={setSelectedBroker}
                onToggleFavorite={toggleFavoriteBroker}
              />
              {/* Pas de plateforme nommée : pas de marche à suivre à afficher —
                  elle est propre à chacune. */}
              {platform && <ExportGuide platform={platform} />}
            </div>
          </Field>

          <Divider />

          {/* ── Le fichier ── */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={acceptFor(platform?.format)}
            onChange={handleFileSelect}
            aria-label={t("addTrade.importFileAria")}
            style={{ display: "none" }}
          />

          {/* Un vrai <button>, donc atteignable au clavier — un <div> muni de
              gestionnaires de souris ne l'aurait pas été. */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(false); }}
            onDrop={handleDrop}
            style={{
              width: "100%", display: "flex", flexDirection: "column", alignItems: "center",
              /* Plus haute qu'un simple encart : c'est la plus grande cible de
                 la page, et sur toute la largeur elle n'aurait sinon plus
                 l'air d'une zone où l'on jette quelque chose. */
              gap: 5, padding: "34px 20px", borderRadius: 14, cursor: "pointer",
              /* Ni tirets ni cadre : un creux. Et le MÊME gris que les champs,
                 les pastilles et les lignes de fichiers — un seul aplat sur
                 toute la page. Le voile plus dilué qu'il portait avant faisait
                 une deuxième nuance de gris pour rien : deux valeurs si proches
                 ne se lisent pas comme une hiérarchie, seulement comme une
                 imprécision.
                 Le fichier tiré au-dessus l'assombrit d'un cran (`TILE_HOVER`,
                 le voile d'encre des tuiles déjà colorées) et fait apparaître
                 l'anneau. Ce sont des ÉTATS : l'anneau ne vit que le temps du
                 survol, seul moment où il faut voir jusqu'où va la cible. */
              border: "none",
              background: FIELD_BG,
              boxShadow: dragOver ? `inset ${FIELD_FOCUS_RING}, ${TILE_HOVER}` : "none",
              color: T.text, fontFamily: "inherit",
              transition: "var(--tr-ui)",
            }}
          >
            {/* Pas de conteneur `display: contents` pour neutraliser les pointeurs :
                il ne génère aucune boîte, donc `pointer-events` n'y prendrait pas.
                C'est le garde de `onDragLeave` qui distingue une sortie réelle d'un
                passage sur un enfant. */}
            <UploadCloud size={22} strokeWidth={1.5} color={dragOver ? T.text : T.textSub} />
            <span style={{ ...TYPE.callout, color: T.text }}>
              {files.length > 1 ? t("addTrade.dropFiles") : t("addTrade.dropFile")}
            </span>
            <span style={{ ...TYPE.label, color: T.textSub }}>
              {t("addTrade.orBrowse2")}{" "}
              <span style={{ textDecoration: "underline", textUnderlineOffset: 2 }}>{t("addTrade.browse")}</span>
            </span>
            <span style={{ ...TYPE.caption, color: T.textMut }}>{t("addTrade.fileTypes")}</span>
          </button>

          {files.length > 0 && (
            <div className="anim-fade-up" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {files.map((f) => (
                <div key={f.name} style={{
                  display: "flex", alignItems: "center", gap: 10, minHeight: 44,
                  padding: "0 6px 0 12px", borderRadius: 10, background: FIELD_BG,
                }}>
                  <FileText size={14} strokeWidth={1.75} color={T.textSub} style={{ flexShrink: 0 }} />
                  <span style={{ ...TYPE.body, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {f.name}
                  </span>
                  <span style={{ ...TYPE.caption, ...TABULAR, color: T.textMut, flexShrink: 0 }}>
                    {perFile[f.name] ?? 0}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeFile(f.name)}
                    aria-label={`${t("addTrade.removeFile")} — ${f.name}`}
                    title={t("addTrade.removeFile")}
                    style={{
                      width: 32, height: 32, flexShrink: 0, borderRadius: "50%", border: "none",
                      background: "transparent", color: T.textSub, cursor: "pointer",
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      transition: "var(--tr-ui)",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = T.redBg; e.currentTarget.style.color = T.red; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = T.textSub; }}
                  >
                    <X size={14} strokeWidth={2} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {error && (
            <div role="alert" className="anim-fade-up" style={{
              display: "flex", alignItems: "flex-start", gap: 8, padding: 12, borderRadius: 12,
              background: T.redBg, color: T.red, ...TYPE.label, lineHeight: 1.5,
            }}>
              <AlertCircle size={14} strokeWidth={1.75} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div role="status" className="anim-fade-up" style={{
              display: "flex", alignItems: "flex-start", gap: 8, padding: 12, borderRadius: 12,
              background: T.greenBg, color: T.green, ...TYPE.label, lineHeight: 1.5,
            }}>
              <CheckCircle2 size={14} strokeWidth={1.75} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{successMsg}</span>
            </div>
          )}
        </div>

        {/* Pied d'action. Le compte de trades y tient la place d'un
            récapitulatif : c'est la seule chose qu'on ait besoin de vérifier
            avant de cliquer, et quand il n'y a rien à compter, la ligne dit ce
            qui manque plutôt que de laisser un bouton éteint sans raison. */}
        <div style={{
          /* Même filet que les séparations internes : il n'y a pas de raison
             que le pied se détache autrement que les autres sections. */
          padding: "14px 20px", borderTop: `1px solid ${HAIRLINE}`,
          display: "flex", alignItems: "center",
          justifyContent: "space-between", gap: 12, flexWrap: "wrap",
        }}>
          <span style={{ ...TYPE.label, ...TABULAR, color: detected > 0 ? T.textSub : T.textMut }}>
            {detected > 0
              ? `${detected} ${t("addTrade.previewTrades")}`
              : targetIds.length === 0
                ? t("addTrade.sum.needAccount")
                : t("addTrade.sum.needFile")}
          </span>
          <PillButton variant="primary" onClick={handleImport} disabled={!ready}>
            {loading ? t("addTrade.processing") : t("addTrade.importBtn")}
          </PillButton>
        </div>
      </div>
    </div>
  );
}
