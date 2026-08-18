"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Check as LucideCheck,
  Upload as LucideUpload,
  X as LucideX,
  Star,
} from "lucide-react";
import { T } from "@/lib/ui/tokens";
import { luminance } from "@/lib/ui/color";
import { STRATEGY_COLORS, STRATEGY_COLOR_DEFAULT } from "@/lib/ui/tradingColors";
import { t, useLang, getLang } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/client";
import { parseCSV } from "@/lib/csvParsers";
import SearchableSelect from "@/components/ui/SearchableSelect";
import TradeTargetSelector from "@/components/TradeTargetSelector";
import { PLATFORMS } from "@/lib/brokers/platforms";
import { CARD, SectionTitle, TH } from "@/components/ui/da";
/* Couleur par type de compte — convention de l'app (eval ambre, funded bleu,
   live vert, démo violet), désormais partagée par toute l'app depuis
   lib/ui/accountTypes.ts. Ici elle sert de repère de groupe : pastille du
   titre, case à cocher et aplat léger d'une ligne cochée. */
import { accountTypeStyle } from "@/lib/ui/accountTypes";
import { FIELD_BG as DA_FIELD_BG, WRITING_BG as DA_WRITING_BG } from "@/lib/ui/tokens";
import { Modal as DAModal, PillButton as DAPillButton } from "@/components/ui/form";

/* Case à cocher de la liste des comptes. Même dessin que les cases en ligne du
   reste de l'app (TradesPage) ; `partial` sert au titre de groupe quand seule
   une partie de ses comptes est cochée. */
function CheckBox({ on, partial = false, color, size = 15 }) {
  const filled = on || partial;
  /* La coche s'adapte à l'aplat qui la porte. Les couleurs de type de compte
     sont les principales de la charte : sur l'ambre (Fox) ou le jaune, une
     coche blanche rend 2:1 et disparaît, alors qu'elle tient sur le violet.
     Seuil à 0,45 de luminance — au-delà, l'aplat est clair, c'est l'encre. */
  const glyph = color && luminance(color) > 0.45 ? T.text : T.onSolid;
  return (
    <span
      aria-hidden="true"
      style={{
        width: size, height: size, borderRadius: "var(--radius-field)", flexShrink: 0,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        border: `1.5px solid ${filled ? color : T.border2}`,
        background: filled ? color : T.white,
        transition: "border-color .12s ease, background .12s ease",
      }}
    >
      {on && <LucideCheck size={size - 4} strokeWidth={3} color={glyph} />}
      {!on && partial && (
        <span style={{ width: size - 7, height: 1.5, borderRadius: 1, background: glyph }} />
      )}
    </span>
  );
}

/**
 * En-tête d'une carte d'étape : pastille numérotée + titre, action à droite.
 *
 * L'import se fait en trois temps (où, quel format, quel fichier) et l'ordre
 * compte : le numéro dit où l'on en est. La pastille passe au vert dès que
 * l'étape est remplie — ce qui manque encore se voit sans avoir à relire la
 * page. Le vert n'est pas le seul signal : le chiffre laisse la place à une
 * coche, lisible même sans distinguer les couleurs.
 */
function StepHeader({ n, title, done, action }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
      <span
        aria-hidden="true"
        style={{
          width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          background: done ? T.pnlPos : T.accentBg,
          color: done ? T.onSolid : T.textSub,
          fontSize: 12, fontWeight: 500, lineHeight: 1,
          transition: "background 140ms var(--ease-out, ease)",
        }}
      >
        {done ? <LucideCheck size={13} strokeWidth={2.5} /> : n}
      </span>
      <span style={{ fontSize: 16, fontWeight: 500, lineHeight: "18.6px", color: T.text, minWidth: 0 }}>
        {title}
      </span>
      {action && <span style={{ marginLeft: "auto", flexShrink: 0 }}>{action}</span>}
    </div>
  );
}

/** Une étape de l'import : son en-tête, puis ses champs. */
const STEP = { display: "flex", flexDirection: "column", gap: 14 };

/* Filet entre deux étapes. Il file d'un bord à l'autre de la carte (les marges
   négatives reprennent son padding) : arrêté avant les bords, il se lirait
   comme le souligné du bloc du dessus au lieu d'une coupure entre les deux. */
const STEP_SEP = { height: 1, background: T.border, margin: "20px -24px" };

/** Lien texte discret posé à droite d'un en-tête d'étape. */
function InlineLink({ children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: 0, border: "none", background: "transparent", color: T.textSub,
        fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit",
        textDecoration: "underline", textUnderlineOffset: 2,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.color = T.text; }}
      onMouseLeave={(e) => { e.currentTarget.style.color = T.textSub; }}
    >
      {children}
    </button>
  );
}

export default function AddTradePage({ trades, setPage, setAccounts, accounts = [], firms = [], selectedAccountIds = [], addTrade, addStrategy, strategies = [], user }) {
  useLang();
  /* Destination de l'import, en deux temps :
     1. `target` = la firme (compte mère) OU un compte hors firme ;
     2. `targetIds` = les comptes précis visés. Pour une firme, tous ses comptes
        sont listés d'un coup, seulement regroupés par type — il n'y a plus
        d'étape « choisir un type » avant de cocher.
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
  const allFirmChecked =
    firmAccounts.length > 0 && firmAccounts.every((a) => targetIds.includes(a.id));

  /* Choix de la destination → on repart d'une sélection cohérente : un compte
     isolé se vise seul ; une firme présélectionne les comptes de son premier
     groupe (éval avant funded, etc.) plutôt que tous — mélanger éval et funded
     dans un même import est rarement voulu. Les autres restent visibles et se
     cochent d'un clic. */
  React.useEffect(() => {
    if (!target) { setTargetIds([]); return; }
    if (target.kind === "account") { setTargetIds([target.id]); return; }
    const first = firmAccountsByType[0];
    setTargetIds(first ? first.accounts.map((a) => a.id) : []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  const toggleTargetId = (id) => {
    setTargetIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  /** Titre de groupe : coche tout le groupe, ou le décoche s'il l'est déjà entièrement. */
  const toggleGroup = (group) => {
    const ids = group.accounts.map((a) => a.id);
    const allOn = ids.every((id) => targetIds.includes(id));
    setTargetIds((prev) =>
      allOn ? prev.filter((id) => !ids.includes(id)) : [...new Set([...prev, ...ids])]
    );
  };

  const selectedAccountObjects = React.useMemo(
    () => (accounts || []).filter((a) => targetIds.includes(a.id)),
    [targetIds, accounts]
  );
  // Nom du compte quand un seul est visé : sert à présélectionner le parseur.
  const accountName = selectedAccountObjects.length === 1 ? selectedAccountObjects[0].name : "";
  const [selectedBroker, setSelectedBroker] = useState("tradovate");

  // Favoris brokers : localStorage = cache rapide, Supabase = source de vérité.
  const [favoriteBrokers, setFavoriteBrokers] = useState(() => {
    try { return JSON.parse(localStorage.getItem("tr4de_favorite_brokers") || "[]"); }
    catch { return []; }
  });

  // Charger depuis Supabase au montage + au focus
  React.useEffect(() => {
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
    setFavoriteBrokers(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
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
  // Fichiers de trades sélectionnés : [{ name, content }] — supporte l'import multi-fichiers
  const [files, setFiles] = useState([]);
  const [preview, setPreview] = useState([]);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedImportStrategy, setSelectedImportStrategy] = useState("");
  const [showStrategyForm, setShowStrategyForm] = useState(false);
  const [strategyFormData, setStrategyFormData] = useState({ name: "", description: "", color: STRATEGY_COLOR_DEFAULT, groups: [{ id: Date.now(), name: "", rules: [{ id: Date.now() + 1, text: "" }] }] });
  const fileInputRef = useRef(null);

  /* La palette de la charte, la meme que sur la page « Strategies ». */
  const colors = STRATEGY_COLORS;

  // ✅ Les stratégies viennent maintenant du hook passé en props

  const getDefaultStrategyFormData = () => ({
    name: "",
    description: "",
    color: STRATEGY_COLOR_DEFAULT,
    groups: [{ id: Date.now(), name: "", rules: [{ id: Date.now() + 1, text: "" }] }]
  });

  const handleCreateStrategyFromForm = async () => {
    if (strategyFormData.name.trim() && strategyFormData.groups.length > 0) {
      const validGroups = strategyFormData.groups.every(g => g.rules && g.rules.length > 0);
      if (validGroups) {
        // ✅ Generate a proper UUID instead of timestamp
        const newId = crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        const newStrategy = {
          id: newId,
          name: strategyFormData.name,
          description: strategyFormData.description,
          color: strategyFormData.color,
          groups: strategyFormData.groups,
          // Don't add 'created' - it's added by addStrategy as 'created_at'
        };
        // ✅ Ajouter la stratégie via le hook avec gestion d'erreur
        try {
          const created = await addStrategy(newStrategy);
          setSelectedImportStrategy(newId);
          setStrategyFormData(getDefaultStrategyFormData());
          setShowStrategyForm(false);
        } catch (err) {
          const errMsg = err?.message || JSON.stringify(err) || "Unknown error";
          console.error("❌ Failed to create strategy:", errMsg);
          alert(t("addTrade.err.createStrategy").replace("{msg}", errMsg));
        }
      }
    }
  };

  const addGroup = () => {
    setStrategyFormData({
      ...strategyFormData,
      groups: [...strategyFormData.groups, { id: Date.now(), name: "", rules: [{ id: Date.now(), text: "" }] }]
    });
  };

  const removeGroup = (groupId) => {
    setStrategyFormData({
      ...strategyFormData,
      groups: strategyFormData.groups.filter(g => g.id !== groupId)
    });
  };

  const updateGroup = (groupId, field, value) => {
    setStrategyFormData({
      ...strategyFormData,
      groups: strategyFormData.groups.map(g => g.id === groupId ? { ...g, [field]: value } : g)
    });
  };

  const addRule = (groupId) => {
    setStrategyFormData({
      ...strategyFormData,
      groups: strategyFormData.groups.map(g => g.id === groupId ? { ...g, rules: [...g.rules, { id: Date.now(), text: "" }] } : g)
    });
  };

  const removeRule = (groupId, ruleId) => {
    setStrategyFormData({
      ...strategyFormData,
      groups: strategyFormData.groups.map(g => g.id === groupId ? { ...g, rules: g.rules.filter(r => r.id !== ruleId) } : g)
    });
  };

  const updateRule = (groupId, ruleId, value) => {
    setStrategyFormData({
      ...strategyFormData,
      groups: strategyFormData.groups.map(g => g.id === groupId ? { ...g, rules: g.rules.map(r => r.id === ruleId ? { ...r, text: value } : r) } : g)
    });
  };

  // Catalogue partagé avec les modales de création de compte / firme.
  const brokers = PLATFORMS;

  const getBrokerInstructions = () => {
    const broker = brokers.find(b => b.id === selectedBroker);
    const iconPath = broker?.iconPath || "/trado.png";
    const name = broker?.name || "Broker";

    const isEN = getLang() === "en";
    const map = isEN ? {
      tradovate: {
        subtext: "Assets: Futures (CME, ICE, Eurex)",
        steps: [
          "1. Open the Account tab in Tradovate",
          "2. Go to Settings → Orders",
          "3. Select the date range and click Go",
          "4. Click Download Report (CSV export)",
          "5. Upload the CSV file here"
        ]
      },
      rithmic: {
        subtext: "Assets: Futures (multi-exchange)",
        steps: [
          "1. Open Rithmic R|Trader Pro",
          "2. Reports menu → Order History (or Trade History)",
          "3. Choose the date range then Run Report",
          "4. Save / Export button → CSV format",
          "5. Upload the CSV file here"
        ]
      },
      ninjatrader: {
        subtext: "Assets: Futures, Forex, Stocks",
        steps: [
          "1. Open NinjaTrader Control Center",
          "2. Account menu → Account Performance (or Trade Performance)",
          "3. Filter by account and period",
          "4. Right-click on the Trades table → Export → CSV",
          "5. Upload the CSV file here"
        ]
      },
      topstep: {
        subtext: "Futures prop firm – TopstepX platform",
        steps: [
          "1. Log in to the TopstepX dashboard",
          "2. Performance / Trade History tab",
          "3. Filter by account and date range",
          "4. Export button → CSV",
          "5. Upload the CSV file here"
        ]
      },
      ftmo: {
        subtext: "Forex / CFD prop firm – via MetaTrader",
        steps: [
          "1. Open MetaTrader 4/5 connected to the FTMO account",
          "2. Toolbox tab → History",
          "3. Right-click → Custom Period and pick the range",
          "4. Right-click again → Save as Report (HTML)",
          "5. Upload the HTML file here"
        ]
      },
      tradingview: {
        subtext: "Charts + connected brokers",
        steps: [
          "1. Open the Trading panel at the bottom of TradingView",
          "2. Orders or Trades History tab",
          "3. Export button or ⋯ → Download CSV",
          "4. Upload the CSV file here"
        ]
      },
      mt5: {
        subtext: "Forex, Stocks, Indices, Crypto",
        steps: [
          "1. Open the MetaTrader 5 terminal",
          "2. Toolbox tab → History",
          "3. Right-click → Custom Period and pick the range",
          "4. Right-click again → Report → Open XML (HTML)",
          "5. Upload the HTML file here"
        ]
      },
      mt4: {
        subtext: "Forex, CFD",
        steps: [
          "1. Open the MetaTrader 4 terminal",
          "2. Terminal tab → Account History",
          "3. Right-click → All History (or custom period)",
          "4. Right-click again → Save as Detailed Report (HTML)",
          "5. Upload the HTML file here"
        ]
      },
      thinkorswim: {
        subtext: "Charles Schwab – Stocks, Options, Futures",
        steps: [
          "1. Open thinkorswim Desktop",
          "2. Monitor tab → Account Statement",
          "3. Select the date range",
          "4. Menu button (⚙ icon) → Export to File → CSV",
          "5. Upload the CSV file here"
        ]
      },
      wealthcharts: {
        subtext: "Charting platform – Futures, Stocks, Indices",
        steps: [
          "1. Open WealthCharts Trading Platform",
          "2. Go to Orders or History",
          "3. Export to CSV",
          "4. Make sure the file contains: order_id, qty_sent, qty_done, price_done",
          "5. Upload the CSV file here"
        ]
      },
      ibkr: {
        subtext: "Stocks, Options, Futures, Forex (multi-market)",
        steps: [
          "1. Log in to the IBKR Client Portal",
          "2. Performance & Reports → Statements or Flex Queries",
          "3. Configure a Trades / Executions Flex Query",
          "4. Run the query and download the CSV",
          "5. Upload the CSV file here"
        ]
      },
      capitalcom: {
        subtext: "CFD on Forex, Stocks, Indices, Crypto",
        steps: [
          "1. Log in to your Capital.com account (web)",
          "2. My Account menu → Statements / Reports",
          "3. Filter by period → Trades / Closed positions tab",
          "4. Export button → CSV",
          "5. Upload the CSV file here"
        ]
      },
      ig: {
        subtext: "CFD, Spread Betting, Stocks",
        steps: [
          "1. Log in to My IG (Web)",
          "2. History menu (Live Account)",
          "3. Select the date range",
          "4. Download button → CSV",
          "5. Upload the CSV file here"
        ]
      },
      webull: {
        subtext: "Stocks, Options, Crypto (US)",
        steps: [
          "1. Open the Webull Desktop or Web app",
          "2. Account menu → Statements (Activity Statements)",
          "3. Choose the period and Trade Activity type",
          "4. Export to CSV",
          "5. Upload the CSV file here"
        ]
      },
    } : {
      tradovate: {
        subtext: "Actifs : Futures (CME, ICE, Eurex)",
        steps: [
          "1. Ouvrir l'onglet Account de Tradovate",
          "2. Aller dans Settings → Orders",
          "3. Sélectionner la plage de dates et cliquer Go",
          "4. Cliquer Download Report (export CSV)",
          "5. Charger le fichier CSV ici"
        ]
      },
      rithmic: {
        subtext: "Actifs : Futures (multi-bourses)",
        steps: [
          "1. Ouvrir Rithmic R|Trader Pro",
          "2. Menu Reports → Order History (ou Trade History)",
          "3. Choisir la plage de dates puis Run Report",
          "4. Bouton Save / Export → format CSV",
          "5. Charger le fichier CSV ici"
        ]
      },
      ninjatrader: {
        subtext: "Actifs : Futures, Forex, Actions",
        steps: [
          "1. Ouvrir NinjaTrader Control Center",
          "2. Menu Account → Account Performance (ou Trade Performance)",
          "3. Filtrer par compte et période",
          "4. Clic-droit sur le tableau des Trades → Export → CSV",
          "5. Charger le fichier CSV ici"
        ]
      },
      topstep: {
        subtext: "Prop firm Futures – plateforme TopstepX",
        steps: [
          "1. Se connecter au dashboard TopstepX",
          "2. Onglet Performance / Trade History",
          "3. Filtrer par compte et plage de dates",
          "4. Bouton Export → CSV",
          "5. Charger le fichier CSV ici"
        ]
      },
      ftmo: {
        subtext: "Prop firm Forex / CFD – via MetaTrader",
        steps: [
          "1. Ouvrir MetaTrader 4/5 connecté au compte FTMO",
          "2. Onglet Toolbox → History",
          "3. Clic-droit → Custom Period et choisir la plage",
          "4. Clic-droit à nouveau → Save as Report (HTML)",
          "5. Charger le fichier HTML ici"
        ]
      },
      tradingview: {
        subtext: "Charts + brokers connectés",
        steps: [
          "1. Ouvrir le panneau Trading en bas de TradingView",
          "2. Onglet History des ordres ou trades",
          "3. Bouton Export ou ⋯ → Download CSV",
          "4. Charger le fichier CSV ici"
        ]
      },
      mt5: {
        subtext: "Forex, Actions, Indices, Crypto",
        steps: [
          "1. Ouvrir le terminal MetaTrader 5",
          "2. Onglet Toolbox → History",
          "3. Clic-droit → Custom Period et choisir la plage",
          "4. Clic-droit à nouveau → Report → Open XML (HTML)",
          "5. Charger le fichier HTML ici"
        ]
      },
      mt4: {
        subtext: "Forex, CFD",
        steps: [
          "1. Ouvrir le terminal MetaTrader 4",
          "2. Onglet Terminal → Account History",
          "3. Clic-droit → All History (ou période personnalisée)",
          "4. Clic-droit à nouveau → Save as Detailed Report (HTML)",
          "5. Charger le fichier HTML ici"
        ]
      },
      thinkorswim: {
        subtext: "Charles Schwab – Actions, Options, Futures",
        steps: [
          "1. Ouvrir thinkorswim Desktop",
          "2. Onglet Monitor → Account Statement",
          "3. Sélectionner la plage de dates",
          "4. Bouton menu (icône ⚙) → Export to File → CSV",
          "5. Charger le fichier CSV ici"
        ]
      },
      wealthcharts: {
        subtext: "Plateforme charts – Futures, Actions, Indices",
        steps: [
          "1. Ouvrir WealthCharts Trading Platform",
          "2. Aller dans Orders ou History",
          "3. Exporter en CSV",
          "4. Vérifier que le fichier contient : order_id, qty_sent, qty_done, price_done",
          "5. Charger le fichier CSV ici"
        ]
      },
      ibkr: {
        subtext: "Actions, Options, Futures, Forex (multi-marchés)",
        steps: [
          "1. Se connecter au Client Portal IBKR",
          "2. Performance & Reports → Statements ou Flex Queries",
          "3. Configurer une Flex Query Trades / Executions",
          "4. Lancer la requête et télécharger le CSV",
          "5. Charger le fichier CSV ici"
        ]
      },
      capitalcom: {
        subtext: "CFD sur Forex, Actions, Indices, Crypto",
        steps: [
          "1. Se connecter au compte Capital.com (web)",
          "2. Menu My Account → Statements / Reports",
          "3. Filtrer par période → onglet Trades / Closed positions",
          "4. Bouton Export → CSV",
          "5. Charger le fichier CSV ici"
        ]
      },
      ig: {
        subtext: "CFD, Spread Betting, Actions",
        steps: [
          "1. Se connecter à My IG (Web)",
          "2. Menu History (Live Account)",
          "3. Sélectionner la plage de dates",
          "4. Bouton Download → CSV",
          "5. Charger le fichier CSV ici"
        ]
      },
      webull: {
        subtext: "Actions, Options, Crypto (US)",
        steps: [
          "1. Ouvrir l'app Webull Desktop ou Web",
          "2. Menu Account → Statements (Activity Statements)",
          "3. Choisir la période et type Trade Activity",
          "4. Export en CSV",
          "5. Charger le fichier CSV ici"
        ]
      },
    };

    const cfg = map[selectedBroker] || map.tradovate;
    return {
      iconPath,
      name,
      title: name,
      subtext: cfg.subtext,
      steps: cfg.steps,
    };
  };

  // Le format de fichier à parser suit la plateforme du compte sélectionné.
  // Cette page ne MODIFIE plus le compte : la création et l'édition des comptes
  // se font depuis la page Comptes (compte isolé) ou la page détail d'une firme.
  useEffect(() => {
    if (!accountName || accounts.length === 0) return;
    const selectedAccount = accounts.find(acc => acc.name === accountName);
    if (!selectedAccount?.broker) return;
    const brokerMatch = brokers.find(b =>
      b.name.toLowerCase() === String(selectedAccount.broker).toLowerCase() ||
      b.id.toLowerCase() === String(selectedAccount.broker).toLowerCase()
    );
    if (brokerMatch) setSelectedBroker(brokerMatch.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountName, accounts]);

  const handleFileSelect = async (e) => {
    const selected = Array.from(e.target.files || []);
    if (selected.length === 0) return;
    setError("");
    setLoading(true);
    try {
      const read = await Promise.all(
        selected.map(async (file) => ({ name: file.name, content: await file.text() }))
      );
      // Accumule avec les fichiers déjà choisis, en évitant les doublons par nom
      const existingNames = new Set(files.map((f) => f.name));
      const merged = [...files, ...read.filter((f) => !existingNames.has(f.name))];
      setFiles(merged);

      // Aperçu : trades concaténés de tous les fichiers
      const allTrades = merged.flatMap((f) => parseCSV(f.content, selectedBroker));
      if (allTrades.length === 0) {
        setError(t("addTrade.err.noTradesFound"));
        setPreview([]);
        setLoading(false);
        return;
      }
      setPreview(allTrades.slice(0, 3));
      setError("");
    } catch (err) {
      setError(t("addTrade.err.generic").replace("{msg}", err.message));
      setPreview([]);
    }
    setLoading(false);
  };

  const removeFile = (name) => {
    const merged = files.filter((f) => f.name !== name);
    setFiles(merged);
    if (merged.length === 0) {
      setPreview([]);
      return;
    }
    const allTrades = merged.flatMap((f) => parseCSV(f.content, selectedBroker));
    setPreview(allTrades.slice(0, 3));
  };

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
      const importedTrades = files.flatMap((f) => parseCSV(f.content, selectedBroker));
      if (importedTrades.length === 0) {
        setError(t("addTrade.err.noTrades"));
        setLoading(false);
        return;
      }

      // Les comptes visés sont déjà des IDs (le sélecteur ne propose que des
      // comptes existants). On revalide côté base : un compte supprimé dans un
      // autre onglet ne doit pas passer silencieusement.
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

      // Premier compte = "principal" pour la suite (rechargement, navigation)
      const accountId = targetAccountIds[0];

      const norm = (v) => (v == null ? "" : String(v));
      const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
      const sigOf = (t) => `${norm(t.date).slice(0, 10)}|${norm(t.symbol).toUpperCase()}|${round2(t.entry)}|${round2(t.exit)}|${norm(t.entry_time)}`;

      let totalInserted = 0;
      let duplicateCount = 0;

      // Insère les trades pour chaque compte cible
      for (const targetId of targetAccountIds) {
        const allTrades = importedTrades.map(t => ({
          user_id: userId,
          account_id: targetId,
          date: t.date,
          symbol: t.symbol,
          direction: t.direction,
          entry: t.entry,
          exit: t.exit,
          pnl: t.pnl,
          quantity: t.quantity ?? t.qty ?? null,
          volume: t.volume ?? null,
          entry_time: t.entryTime || t.entry_time || null,
          exit_time: t.exitTime || t.exit_time || null,
        }));

        if (allTrades.length === 0) continue;

        // Anti-doublons : par compte
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

        // Tolérance : si les colonnes quantity/volume n'existent pas encore en
        // base (migration 028 non appliquée), on réessaie sans elles.
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
      
      // ⭐ RECHARGER les trades depuis Supabase pour avoir les IDs UUID corrects
      // (et pas les IDs numériques du CSV qui causent des erreurs lors de la suppression)
      
      // ✅ CRITICAL FIX 1: Fetch ALL trades for the user (not just this account)
      // to update localStorage which feeds the useTrades() hook
      const { data: allUserTrades, error: fetchError } = await supabase
        .from("apex_trades")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      
      
      let freshTrades = [];
      if (fetchError) {
        console.error("❌ Error fetching fresh trades:", fetchError);
        // Continue anyway - at least trades are saved
      } else if (allUserTrades && allUserTrades.length > 0) {
        freshTrades = allUserTrades;
        
        // ✅ CRITICAL FIX 2: Update localStorage AND dispatch event so useTrades() hook sees new trades
        // This triggers the component to re-render with imported trades WITHOUT needing a refresh
        localStorage.setItem("tr4de_trades", JSON.stringify(allUserTrades));
        
        // ✅ CRITICAL FIX 2b: Dispatch custom event to notify useTrades hook in this same tab
        // (storage events don't fire in the same tab, only in other tabs)
        window.dispatchEvent(new CustomEvent("trades-refreshed", { detail: { trades: allUserTrades } }));
      } else {
        console.warn("⚠️  No fresh trades returned from Supabase");
      }
      
      // Link imported trades to strategy if selected
      // ⭐ IMPORTANT: Use ONLY freshTrades (the ones actually saved to DB), not importedTrades
      // because importedTrades includes ALL trades but some are filtered out (pnl < $50)
      if (selectedImportStrategy && freshTrades && freshTrades.length > 0) {
        
        const tradeStrategiesData = (() => {
          const saved = localStorage.getItem("tr4de_trade_strategies");
          return saved ? JSON.parse(saved) : {};
        })();
        
        
        freshTrades.forEach((trade, idx) => {
          // Normalize entry to string with 2 decimals for consistent key
          const normalizedEntry = parseFloat(trade.entry).toFixed(2);
          
          // Use multiple key formats to ensure compatibility:
          // 1. date + symbol + entry (for backward compatibility with old format)
          // 2. UUID id (for Supabase trades)
          const keys = [
            `${trade.date}${trade.symbol}${trade.entry}`,           // Original format
            `${trade.date}${trade.symbol}${normalizedEntry}`,       // Normalized format
            trade.id                                                // Supabase UUID - NEW!
          ];
          
          const strategyId = String(selectedImportStrategy);
          let keyUsed = null;
          
          // Try each key format, in case there's a format mismatch
          for (const tradeIdKey of keys) {
            if (!tradeStrategiesData[tradeIdKey]) {
              tradeStrategiesData[tradeIdKey] = [];
            }
            
            if (!tradeStrategiesData[tradeIdKey].includes(strategyId)) {
              tradeStrategiesData[tradeIdKey].push(strategyId);
              if (!keyUsed) keyUsed = tradeIdKey;
            }
          }
          
          if (!keyUsed) {
          }
        });
        
        localStorage.setItem("tr4de_trade_strategies", JSON.stringify(tradeStrategiesData));
      } else {
        if (!selectedImportStrategy) {
          console.warn("⚠️  No strategy selected - trades won't be linked");
        }
        if (!freshTrades || freshTrades.length === 0) {
          console.warn("⚠️  No fresh trades found - nothing to link");
        }
      }
      
      // Recharger les comptes en haut
      const { data: updatedAccounts } = await supabase
        .from("trading_accounts")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      
      if (setAccounts) {
        // Il n'y a plus de sélection de comptes : recharger la liste suffit,
        // tous les comptes actifs sont pris en compte partout.
        setAccounts(updatedAccounts || []);
      }

      setTargetIds([]);
      setFiles([]);
      setPreview([]);
      setSelectedBroker("tradovate");
      setSelectedImportStrategy("");
      setError("");
      setSuccessMsg(
        duplicateCount > 0
          ? t("addTrade.info.imported")
              .replace("{n}", String(totalInserted))
              .replace("{d}", String(duplicateCount))
              .replace(/\{s\}/g, totalInserted > 1 ? "s" : "")
              .replace(/\{ds\}/g, duplicateCount > 1 ? "s" : "")
          : t("addTrade.info.imported")
              .replace("{n}", String(totalInserted))
              .replace("{d}", "0")
              .replace(/\{s\}/g, totalInserted > 1 ? "s" : "")
              .replace(/\{ds\}/g, "")
      );
      setLoading(false);
      
      // Rediriger vers la page des trades après 1.5s
      setTimeout(() => {
        setPage("trades");
      }, 1500);
    } catch (err) {
      setSuccessMsg("");
      setError(t("addTrade.err.import").replace("{msg}", err.message));
      console.error("Import error:", err);
      setLoading(false);
    }
  };

  const brokerInfo = getBrokerInstructions();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, paddingTop: 14, fontFamily: "var(--font-sans)" }} className="anim-1">
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div id="tr4de-page-header-slot" style={{ marginLeft: "auto" }} />
      </div>

      {/* Corps de page : mêmes blocs de 36 px que les autres pages de la DA. */}
      <div style={{ display: "flex", flexDirection: "column", gap: 36 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <SectionTitle>{t("addTrade.title")}</SectionTitle>
          <div style={{ fontSize: 14, lineHeight: "18.6px", color: T.textSub }}>
            {t("addTrade.subtitle")}
          </div>
        </div>

        {/* Le formulaire à gauche, la marche à suivre du broker à droite. Les
            deux panneaux ne sont plus soudés dans un même cadre bordé : ce sont
            deux cartes posées sur le fond gris, comme partout ailleurs. */}
        <div className="tr4de-import-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 340px", gap: 24, alignItems: "start" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 24, minWidth: 0 }}>
            {/* UNE SEULE carte pour tout le formulaire : l'import est un
                parcours continu, pas trois sujets indépendants. Les étapes s'y
                suivent, séparées par un filet — une carte par étape hachait la
                colonne en petits blocs sans rien apporter de plus.
                `overflow: visible` : les listes déroulantes débordent
                volontairement du cadre, que le `overflow: hidden` de CARD
                rognerait. */}
            <section style={{ ...CARD, padding: 24, overflow: "visible" }}>
              {/* ── 1. DESTINATION — sélection seule : cette page n'ajoute pas
                  de compte, elle rattache les trades importés à des comptes
                  existants. */}
              <div style={STEP}>
                <StepHeader
                  n={1}
                  title={t("addTrade.account")}
                  done={targetIds.length > 0}
                  action={<InlineLink onClick={() => setPage?.("accounts")}>{t("addTrade.manageAccounts")}</InlineLink>}
                />
                <TradeTargetSelector
                  accounts={accounts}
                  firms={firms}
                  value={target}
                  onChange={setTarget}
                  onRequestManage={() => setPage?.("accounts")}
                />
                {accounts.length === 0 && (
                  <div style={{ fontSize: 13, color: T.textMut, lineHeight: 1.5 }}>
                    {t("addTrade.noAccountHint")}
                  </div>
                )}
                {/* COMPTES VISÉS — deuxième temps de la MÊME question (où vont ces
                    trades ?), donc dans la même étape : simplement décalé, sans
                    filet, celui-ci étant réservé au passage d'une étape à l'autre.
                    Firme sélectionnée : tous ses comptes sont listés d'un coup,
                    seulement regroupés par type ; le titre d'un groupe fait office
                    de case « tout ce type ».
                    Compte hors firme : son type est simplement rappelé (il se
                    modifie depuis la page Comptes ou les paramètres de la firme). */}
                {target?.kind === "firm" && (
                  <div style={{ marginTop: 2 }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 12 }}>
                      <label style={{ fontSize: 13, fontWeight: 500, color: T.textSub }}>
                        {t("addTrade.target.whichAccounts")}
                      </label>
                      {firmAccounts.length > 1 && (
                        <span style={{ marginLeft: "auto" }}>
                          <InlineLink onClick={() => setTargetIds(allFirmChecked ? [] : firmAccounts.map((a) => a.id))}>
                            {allFirmChecked ? t("addTrade.target.clearAll") : t("addTrade.target.selectAll")}
                          </InlineLink>
                        </span>
                      )}
                    </div>

                    {firmAccountsByType.length === 0 ? (
                      <div style={{ fontSize: 13, color: T.textMut, lineHeight: 1.5 }}>
                        {t("addTrade.target.firmEmpty")}
                      </div>
                    ) : (
                      <>
                        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                          {firmAccountsByType.map((g) => {
                            const c = accountTypeStyle(g.type);
                            const checked = g.accounts.filter((a) => targetIds.includes(a.id)).length;
                            const groupOn = checked === g.accounts.length;
                            return (
                              <div key={g.type}>
                                <button
                                  type="button"
                                  aria-pressed={groupOn}
                                  onClick={() => toggleGroup(g)}
                                  style={{
                                    display: "flex", alignItems: "center", gap: 8,
                                    padding: "3px 2px", marginBottom: 7, border: "none",
                                    background: "transparent", cursor: "pointer",
                                    fontFamily: "inherit", textAlign: "left",
                                  }}
                                >
                                  <CheckBox on={groupOn} partial={checked > 0 && !groupOn} color={c.fg} size={14} />
                                  <span style={{ fontSize: 12, fontWeight: 600, color: T.text }}>{c.label()}</span>
                                  <span style={{ fontSize: 11, color: T.textMut, fontWeight: 500 }}>
                                    {checked}/{g.accounts.length}
                                  </span>
                                </button>

                                {/* Une ligne par compte, cases alignées en colonnes :
                                    se balaie du regard, contrairement aux pilules. */}
                                <div style={{
                                  display: "grid",
                                  gridTemplateColumns: "repeat(auto-fill, minmax(min(190px, 100%), 1fr))",
                                  gap: 6,
                                }}>
                                  {g.accounts.map((acc) => {
                                    const on = targetIds.includes(acc.id);
                                    return (
                                      <button
                                        key={acc.id}
                                        type="button"
                                        aria-pressed={on}
                                        onClick={() => toggleTargetId(acc.id)}
                                        style={{
                                          display: "flex", alignItems: "center", gap: 9, minWidth: 0,
                                          padding: "9px 11px", borderRadius: "var(--radius-field)",
                                          border: `1px solid ${on ? c.bd : T.border}`,
                                          background: on ? c.bg : T.white,
                                          color: T.text, fontSize: 12.5, fontWeight: on ? 600 : 500,
                                          cursor: "pointer", fontFamily: "inherit", textAlign: "left",
                                          transition: "background .12s ease, border-color .12s ease",
                                        }}
                                      >
                                        <CheckBox on={on} color={c.fg} />
                                        <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                          {acc.name || "Compte"}
                                        </span>
                                        {acc.eval_account_size && (
                                          <span style={{ fontSize: 11, color: T.textMut, fontWeight: 500, flexShrink: 0 }}>
                                            {acc.eval_account_size}
                                          </span>
                                        )}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        <div style={{ fontSize: 13, color: T.textMut, marginTop: 14, lineHeight: 1.5 }}>
                          {targetIds.length === 0
                            ? t("addTrade.target.pickAtLeastOne")
                            : targetIds.length === 1
                              ? t("addTrade.target.oneHint")
                              : t("addTrade.target.multiHint").replace("{n}", String(targetIds.length))}
                        </div>
                      </>
                    )}
                  </div>
                )}

                {target?.kind === "account" && selectedAccountObjects.length === 1 && (() => {
                  const acc = selectedAccountObjects[0];
                  const c = accountTypeStyle(acc);
                  return (
                    <div style={{
                      display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 2,
                    }}>
                      <span style={{
                        display: "inline-flex", alignItems: "center", gap: 7,
                        padding: "6px 12px", borderRadius: 999,
                        /* Aplat sans contour : c'est la teinte qui dit le type,
                           pas un cadre. */
                        border: "none", background: c.bg,
                        fontSize: 12, color: T.text, fontWeight: 600,
                      }}>
                        <span style={{ width: 7, height: 7, borderRadius: "50%", background: c.fg, flexShrink: 0 }} />
                        {c.label()}{acc.eval_account_size ? ` · ${acc.eval_account_size}` : ""}
                      </span>
                      <span style={{ fontSize: 13, color: T.textMut, lineHeight: 1.5 }}>
                        {t("addTrade.typeReadOnly")}
                      </span>
                    </div>
                  );
                })()}
              </div>

              <div style={STEP_SEP} />

              {/* ── 2. FORMAT — le courtier ne sert QU'À choisir le parseur du
                  fichier ; il ne rattache rien. D'où une étape à part, et non un
                  champ de plus dans la destination. */}
              <div style={STEP}>
                <StepHeader n={2} title={t("addTrade.broker")} done={!!selectedBroker} />
                <SearchableSelect
                  value={selectedBroker}
                  onChange={(id) => {
                    setSelectedBroker(id);
                    setError("");
                  }}
                  options={(() => {
                    const isFav = (id) => favoriteBrokers.includes(id);
                    const sorted = [...brokers].sort((a, b) => {
                      const fa = isFav(a.id), fb = isFav(b.id);
                      if (fa !== fb) return fa ? -1 : 1;          // favoris en haut
                      return a.name.localeCompare(b.name);        // puis alphabétique
                    });
                    return sorted.map(b => ({
                      id: b.id,
                      label: b.name,
                      iconUrl: b.iconPath,
                      accessory: (
                        <span
                          role="button"
                          tabIndex={0}
                          aria-label={isFav(b.id) ? t("addTrade.removeFav") : t("addTrade.addFav")}
                          title={isFav(b.id) ? t("addTrade.removeFav") : t("addTrade.addFav")}
                          onClick={() => toggleFavoriteBroker(b.id)}
                          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleFavoriteBroker(b.id); } }}
                          style={{
                            display: "inline-flex", alignItems: "center", justifyContent: "center",
                            width: 22, height: 22, borderRadius: 4,
                            background: "transparent", cursor: "pointer", padding: 0,
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = T.accentBg; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                        >
                          <Star
                            size={13}
                            strokeWidth={1.75}
                            color={isFav(b.id) ? T.amber : T.textMut}
                            fill={isFav(b.id) ? T.amber : "none"}
                          />
                        </span>
                      ),
                    }));
                  })()}
                  searchPlaceholder={t("addTrade.searchBroker")}
                  emptyLabel={t("addTrade.noBroker")}
                />
              </div>

              <div style={STEP_SEP} />

              {/* ── 3. FICHIER ── */}
              <div style={STEP}>
                <StepHeader n={3} title={t("addTrade.file")} done={files.length > 0} />
                <div
                  style={{
                    padding: "36px 20px",
                    border: `1px dashed ${files.length > 0 ? T.pnlPos : T.border2}`,
                    borderRadius: 12,
                    textAlign: "center",
                    cursor: "pointer",
                    background: files.length > 0 ? T.greenBg : T.bg,
                    transition: "border-color 160ms var(--ease-out, ease), background 160ms var(--ease-out, ease)",
                  }}
                  onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = T.text; e.currentTarget.style.background = T.accentBg; }}
                  onDragLeave={(e) => { e.currentTarget.style.borderColor = files.length > 0 ? T.pnlPos : T.border2; e.currentTarget.style.background = files.length > 0 ? T.greenBg : T.bg; }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.currentTarget.style.borderColor = files.length > 0 ? T.pnlPos : T.border2;
                    e.currentTarget.style.background = files.length > 0 ? T.greenBg : T.bg;
                    const dropped = Array.from(e.dataTransfer.files || []);
                    if (dropped.length > 0) {
                      handleFileSelect({ target: { files: dropped } });
                    }
                  }}
                >
                  <input ref={fileInputRef} type="file" multiple onChange={handleFileSelect} style={{ display: "none" }} accept=".csv,.html,.txt" />
                  <button
                    aria-label={t("addTrade.importFileAria")}
                    onClick={() => fileInputRef.current?.click()}
                    style={{ background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 12, width: "100%", fontFamily: "var(--font-sans)" }}
                  >
                    <span style={{
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      width: 44, height: 44, borderRadius: "50%",
                      background: files.length > 0 ? T.greenBd : T.accentBg,
                      color: files.length > 0 ? T.pnlPos : T.textSub,
                      transition: "background 160ms var(--ease-out, ease), color 160ms var(--ease-out, ease)",
                    }}>
                      {files.length > 0
                        ? <LucideCheck size={20} strokeWidth={2} />
                        : <LucideUpload size={20} strokeWidth={1.75} />}
                    </span>
                    <div>
                      <div style={{ fontSize: 14, color: T.text, fontWeight: 500, marginBottom: 4 }}>
                        {files.length === 1
                          ? files[0].name
                          : files.length > 1
                            ? t("addTrade.filesReady").replace("{n}", String(files.length))
                            : t("addTrade.dropFiles")}
                      </div>
                      <div style={{ fontSize: 13, color: T.textMut }}>
                        {files.length > 0 ? t("addTrade.fileReady") : <>{t("addTrade.orBrowse2")} <span style={{ color: T.text, fontWeight: 500, textDecoration: "underline", textUnderlineOffset: 2 }}>{t("addTrade.browse")}</span> · {t("addTrade.fileTypes")}</>}
                      </div>
                    </div>
                  </button>
                </div>
                {/* Liste des fichiers sélectionnés (retrait individuel) */}
                {files.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {files.map((f) => (
                      <div
                        key={f.name}
                        style={{
                          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
                          padding: "8px 12px", background: T.bg, borderRadius: 8,
                        }}
                      >
                        <span style={{ fontSize: 13, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {f.name}
                        </span>
                        <button
                          type="button"
                          aria-label={t("addTrade.removeFile")}
                          title={t("addTrade.removeFile")}
                          onClick={() => removeFile(f.name)}
                          style={{
                            flexShrink: 0, width: 28, height: 28, margin: -4, borderRadius: 8,
                            background: "none", border: "none", cursor: "pointer", color: T.textMut,
                            display: "inline-flex", alignItems: "center", justifyContent: "center",
                            fontFamily: "var(--font-sans)", transition: "background 120ms ease, color 120ms ease",
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = T.accentBg; e.currentTarget.style.color = T.text; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = T.textMut; }}
                        >
                          <LucideX size={16} strokeWidth={2} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* APERÇU — trois premiers trades lus dans le fichier : c'est ce
                  qui permet de vérifier qu'on a pris le bon parseur AVANT
                  d'écrire en base. Pas de numéro : rien n'y est à remplir, c'est
                  le résultat de l'étape précédente. */}
              {preview.length > 0 && (
                <>
                  <div style={STEP_SEP} />
                  <div style={STEP}>
                    <div style={{ fontSize: 16, fontWeight: 500, lineHeight: "18.6px", color: T.text }}>
                      {t("addTrade.preview")}
                      <span style={{ color: T.textMut, fontWeight: 400 }}> · {preview.length} {t("addTrade.previewTrades")}</span>
                    </div>
                    <div style={{ overflowX: "auto" }} className="scroll-thin">
                      <table style={{ width: "100%", fontSize: 14, borderCollapse: "collapse", minWidth: 420 }}>
                        <thead>
                          <tr style={{ opacity: 0.4 }}>
                            <th style={{ ...TH, padding: "0 8px 10px 0", textAlign: "left" }}>Date</th>
                            <th style={{ ...TH, padding: "0 8px 10px", textAlign: "left" }}>Symbole</th>
                            <th style={{ ...TH, padding: "0 8px 10px", textAlign: "right" }}>Entrée</th>
                            <th style={{ ...TH, padding: "0 8px 10px", textAlign: "right" }}>Sortie</th>
                            <th style={{ ...TH, padding: "0 0 10px 8px", textAlign: "right" }}>P&L</th>
                          </tr>
                        </thead>
                        <tbody>
                          {preview.map((trade, idx) => (
                            <tr key={idx}>
                              <td style={{ padding: "8px 8px 8px 0", color: T.textSub, whiteSpace: "nowrap" }}>{trade.date}</td>
                              <td style={{ padding: "8px", color: T.text, fontWeight: 500 }}>{trade.symbol}</td>
                              <td style={{ padding: "8px", textAlign: "right", color: T.textSub }}>{trade.entry?.toFixed(2)}</td>
                              <td style={{ padding: "8px", textAlign: "right", color: T.textSub }}>{trade.exit?.toFixed(2)}</td>
                              <td style={{ padding: "8px 0 8px 8px", textAlign: "right", fontWeight: 500, color: trade.pnl >= 0 ? T.pnlPos : T.pnlNeg }}>
                                {trade.pnl >= 0 ? "+" : ""}{trade.pnl?.toFixed(2)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </section>

            {error && (
              <div role="alert" style={{ padding: "12px 16px", background: T.redBg, borderRadius: 12, fontSize: 14, lineHeight: 1.5, color: T.red }}>
                {error}
              </div>
            )}
            {successMsg && (
              <div role="status" style={{ padding: "12px 16px", background: T.greenBg, borderRadius: 12, fontSize: 14, lineHeight: 1.5, color: T.green }}>
                {successMsg}
              </div>
            )}

            {/* Action principale en fin de parcours, à droite comme dans les
                autres pages de la DA : pastille sombre quand elle est armée,
                pastille blanche atténuée tant qu'il manque une étape. */}
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              {(() => {
                const ready = files.length > 0 && targetIds.length > 0 && !loading;
                return (
                  <button
                    onClick={handleImport}
                    disabled={!ready}
                    style={{
                      display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
                      minHeight: 40, padding: "10px 20px", borderRadius: 999, border: "none",
                      background: ready ? T.text : T.white,
                      boxShadow: ready ? "none" : T.elevPill,
                      color: ready ? T.textInverted : T.textMut,
                      cursor: ready ? "pointer" : "not-allowed",
                      fontSize: 14, fontWeight: 500, fontFamily: "var(--font-sans)",
                      transition: "background 140ms var(--ease-out, ease), color 140ms var(--ease-out, ease)",
                    }}
                  >
                    {loading ? t("addTrade.processing") : t("addTrade.importTrades")}
                  </button>
                );
              })()}
            </div>

            {/* STRATEGY FORM MODAL */}
            {showStrategyForm && (
              <DAModal
                open
                title={t("addTrade.createStrategy")}
                onClose={() => { setShowStrategyForm(false); setStrategyFormData(getDefaultStrategyFormData()); }}
                width={600}
                maxHeight="90vh"
                footer={(
                  <>
                    <DAPillButton onClick={() => { setShowStrategyForm(false); setStrategyFormData(getDefaultStrategyFormData()); }}>{t("common.cancel")}</DAPillButton>
                    <DAPillButton variant="primary" onClick={handleCreateStrategyFromForm}>{t("addTrade.createStrategyBtn")}</DAPillButton>
                  </>
                )}
              >
                <>
                  {/* Le titre ouvre le contenu : l'en-tete de la DA ne porte
                      qu'une poignee et la fermeture. */}
                  <h2 style={{fontSize:15,fontWeight:600,color:T.text,margin:0,letterSpacing:-0.1}}>{t("addTrade.createStrategy")}</h2>

                  <div style={{marginBottom:16}}>
                    <label style={{display:"block",fontSize:12,fontWeight:600,marginBottom:6,color:T.textMut}}>{t("addTrade.strategyName")}</label>
                    <input type="text" value={strategyFormData.name} onChange={(e)=>setStrategyFormData({...strategyFormData,name:e.target.value})} placeholder={t("addTrade.strategyNamePh")} style={{width:"100%",padding:"10px 12px",border: "none",borderRadius:8,fontSize:14,outline:"none", background: DA_FIELD_BG,}}/>
                  </div>

                  <div style={{marginBottom:16}}>
                    <label style={{display:"block",fontSize:12,fontWeight:600,marginBottom:6,color:T.textMut}}>{t("addTrade.strategyDesc")}</label>
                    <textarea value={strategyFormData.description} onChange={(e)=>setStrategyFormData({...strategyFormData,description:e.target.value})} placeholder={t("addTrade.strategyDescPh")} style={{width:"100%",padding:"10px 12px",border: "none",borderRadius:8,fontSize:14,outline:"none",resize:"vertical",minHeight:60, background: DA_WRITING_BG,}}/>
                  </div>

                  <div style={{marginBottom:20}}>
                    <label style={{display:"block",fontSize:12,fontWeight:600,marginBottom:8,color:T.textMut}}>{t("addTrade.strategyColor")}</label>
                    <div style={{display:"flex",gap:8}}>
                      {colors.map(color=>(
                        <button key={color} aria-label={t("addTrade.colorAria").replace("{c}", color)} aria-pressed={strategyFormData.color===color} onClick={()=>setStrategyFormData({...strategyFormData,color})} style={{width:32,height:32,borderRadius:"50%",background:color,border:"none",boxShadow:strategyFormData.color===color?`0 0 0 2px ${T.white}, 0 0 0 4px ${T.text}`:"none",cursor:"pointer"}}/>
                      ))}
                    </div>
                  </div>

                  <div style={{marginBottom:20}}>
                    <label style={{display:"block",fontSize:12,fontWeight:600,marginBottom:8,color:T.textMut}}>{t("addTrade.ruleGroups")}</label>
                    {strategyFormData.groups && strategyFormData.groups.map((group,gIdx)=>(
                      <div key={group.id} style={{marginBottom:16,padding:12,border:"none",borderRadius:12,background:DA_FIELD_BG}}>
                        <div style={{display:"flex",gap:8,marginBottom:12}}>
                          <input type="text" placeholder={t("addTrade.groupName")} value={group.name} onChange={(e)=>updateGroup(group.id,"name",e.target.value)} style={{flex:1,padding:"8px 10px",border: "none",borderRadius:6,fontSize:12,outline:"none", background: DA_FIELD_BG,}}/>
                          {strategyFormData.groups.length > 1 && <button aria-label={t("addTrade.removeGroup")} onClick={()=>removeGroup(group.id)} style={{background:"transparent",border:"none",cursor:"pointer",fontSize:16,color:T.red}}>✕</button>}
                        </div>

                        <div style={{display:"flex",flexDirection:"column",gap:6,paddingLeft:20}}>
                          {group.rules && group.rules.map((rule,rIdx)=>(
                            <div key={rule.id} style={{display:"flex",alignItems:"center",gap:6}}>
                              <span style={{fontSize:10,color:T.textMut}}>•</span>
                              <input type="text" placeholder={t("addTrade.rulePh")} value={rule.text} onChange={(e)=>updateRule(group.id,rule.id,e.target.value)} style={{flex:1,padding:"6px 10px",borderRadius:4,border: "none",fontSize:11,outline:"none", background: DA_FIELD_BG,}}/>
                              {group.rules.length > 1 && <button aria-label={t("addTrade.removeRule")} onClick={()=>removeRule(group.id,rule.id)} style={{background:"transparent",border:"none",cursor:"pointer",fontSize:12,color:T.red}}>✕</button>}
                            </div>
                          ))}
                          <button onClick={()=>addRule(group.id)} style={{marginTop:4,fontSize:11,color:T.accent,background:"transparent",border:"none",cursor:"pointer",textAlign:"left",padding:0}}>{t("addTrade.addRule")}</button>
                        </div>
                      </div>
                    ))}
                    <button onClick={addGroup} style={{marginTop:12,fontSize:12,fontWeight:500,color:T.accent,background:DA_FIELD_BG,border:"none",cursor:"pointer",padding:"9px 14px",borderRadius:999,width:"100%",fontFamily:"inherit",transition:"var(--tr-ui)"}}>{t("addTrade.addGroup")}</button>
                  </div>

                </>
              </DAModal>
            )}
          </div>

          {/* ─── Marche à suivre du broker ───────────────────────────────────
              Collante : le formulaire est plus long qu'elle, et la consigne doit
              rester sous les yeux pendant qu'on l'exécute dans l'autre onglet. */}
          <aside style={{ ...CARD, padding: 20, position: "sticky", top: 0, display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={brokerInfo.iconPath} alt="" style={{ width: 32, height: 32, objectFit: "contain", flexShrink: 0 }} />
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 500, lineHeight: "18.6px", color: T.text }}>{brokerInfo.name}</h3>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 13, color: T.textSub }}>{t("addTrade.supportedAssets")}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {brokerInfo.subtext.replace("Types d'actifs supportés: ", "").split(", ").map((asset, idx) => (
                  <span key={idx} style={{
                    display: "inline-flex", alignItems: "center", padding: "4px 10px",
                    borderRadius: 999, background: T.accentBg, fontSize: 12, color: T.textSub,
                  }}>
                    {asset}
                  </span>
                ))}
              </div>
            </div>

            {/* Étapes numérotées à la main plutôt qu'un <ol> : les libellés
                portaient déjà « 1. », « 2. » dans les traductions, et la pastille
                aligne les retours à la ligne sur le texte, pas sur le chiffre. */}
            <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontSize: 13, color: T.textSub }}>{t("addTrade.howToExport")}</div>
              {brokerInfo.steps.map((step, idx) => (
                <div key={idx} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                  <span aria-hidden="true" style={{
                    width: 20, height: 20, borderRadius: "50%", flexShrink: 0, marginTop: 1,
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    background: T.accentBg, color: T.textSub, fontSize: 11, fontWeight: 500, lineHeight: 1,
                  }}>
                    {idx + 1}
                  </span>
                  <span style={{ fontSize: 13, color: T.textSub, lineHeight: 1.5, minWidth: 0 }}>
                    {step.replace(/^\d+\. /, "")}
                  </span>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}



