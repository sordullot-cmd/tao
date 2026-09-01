"use client";

import React, { useState, useEffect, useRef } from "react";
import ReactDOM from "react-dom";
import {
  X as LucideX,
  ChevronDown as LucideChevronDown,
  MoreHorizontal as LucideMoreHorizontal,
  Trash2 as LucideTrash2,
  TrendingUp as LucideTrendingUp,
  ArrowDown as LucideArrowDown,
  ArrowUp as LucideArrowUp,
  ArrowDownUp as LucideArrowDownUp,
  SlidersHorizontal as LucideSlidersHorizontal,
  GripVertical as LucideGripVertical,
  Image as LucideImage,
  Plus as LucidePlus,
  Check as LucideCheck,
  Repeat as LucideRepeat,
  Pencil as LucidePencil,
  ChevronLeft as LucideChevronLeft,
  ChevronRight as LucideChevronRight,
} from "lucide-react";
import { T } from "@/lib/ui/tokens";
import { TAG_COLORS, STRATEGY_COLOR_DEFAULT } from "@/lib/ui/tradingColors";
import Popover from "@/components/ui/Popover";
import { t, useLang } from "@/lib/i18n";
import { useApp } from "@/lib/contexts/AppContext";
import { SkeletonScreen, Skeleton, showSkeleton } from "@/components/ui/Skeleton";
import { fmt } from "@/lib/ui/format";
import {
  CARD, TH, DirectionTag, SymbolCell, TableFilter, symbolLabel,
  HAIRLINE, FIELD_BG, WRITING_BG, FieldLabel, StatRow, CheckChip,
} from "@/components/ui/da";
import { rMultiple, fmtR } from "@/lib/userPrefs";
import { calculateFees } from "@/lib/tradeFees";
import { groupExecutions } from "@/lib/tradeGrouping";
import { useAuth } from "@/lib/auth/supabaseAuthProvider";
import { createClient } from "@/lib/supabase/client";
import { useTradeNotes } from "@/lib/hooks/useTradeNotes";
import { useTradeScreenshots } from "@/lib/hooks/useTradeScreenshots";
import { useCloudState } from "@/lib/hooks/useCloudState";
import { useTradeEmotionTags, useTradeErrorTags } from "@/lib/hooks/useTradeEmotionTags";
import { backdropDismiss } from "@/lib/hooks/useBackdropDismiss";
import { useEscapeDismiss } from "@/lib/hooks/useEscapeDismiss";
import { useIsMobile } from "@/lib/hooks/useBreakpoint";
import { FIELD_BG as DA_FIELD_BG } from "@/lib/ui/tokens";
import { Modal as DAModal, PillButton as DAPillButton } from "@/components/ui/form";

/* Tailles de page proposées sous le tableau. Le choix est mémorisé en local
   (clé tr4de_trades_page_size). */
const PAGE_SIZES = [25, 50, 100, 200];

/* Colonnes retirées des tableaux encastrés (journal, détail de stratégie) :
   la place y est comptée, et « Compte » n'y aurait rien à afficher — ces vues
   ne passent pas la liste des comptes. */
const HIDDEN_WHEN_EMBEDDED = ["entryDate", "exitDate", "pnlPct", "weekday", "account"];

/* ============================================================================
   PANNEAU « TRADE INFO » — briques de la direction artistique des pages
   récentes (détail d'un compte, détail d'une firme, journal).

   Ce que ces pages ont en commun et que le panneau reprend ici :
     • la carte EST la surface — on n'y repose ni cadre ni trait de séparation ;
       les sections se distinguent par l'espace et par leur libellé ;
     • les aplats s'expriment en transparence d'encre plutôt qu'en gris opaque,
       pour suivre la surface qui les porte (et le thème sombre) sans avoir à
       leur trouver un équivalent ;
     • un libellé se lit à 12 px atténué, sa valeur à 13 px en 600.
   ========================================================================== */

/* Les aplats (`FIELD_BG`, `WRITING_BG`), le trait dilué (`HAIRLINE`) et les deux
   briques de texte (`FieldLabel`, `StatRow`) vivent dans components/ui/da.jsx :
   les pages portées dans cette DA s'en servent toutes. */

export default function TradesPage({ trades = [], strategies = [], accounts = [], onImportClick, onDeleteTrade, onClearTrades, embedded = false, maxRows = null, lockColumns = false }) {
  useLang();
  const { user } = useAuth();
  const { notes: notesFromHook, setNote: setNoteHook } = useTradeNotes();
  const { urls: screenshotUrls, uploadScreenshot, removeScreenshot } = useTradeScreenshots();
  const [screenshotBusy, setScreenshotBusy] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState(null);
  // Échap referme la visionneuse — le premier réflexe sur une image plein écran.
  useEscapeDismiss(() => setLightboxUrl(null), !!lightboxUrl);
  const { emotionTags: emotionsFromHook, addEmotion, removeEmotion } = useTradeEmotionTags();
  const { errorTags: errorsFromHook, addError, removeError } = useTradeErrorTags();
  const [selectedTrade, setSelectedTrade] = useState(null);
  const isMobile = useIsMobile();
  // (Le filtrage par plage de dates est géré globalement dans le layout.)
  // Selection multiple via checkbox
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  // Index de la dernière case cochée pour permettre Shift+Clic = sélectionner la plage
  const [lastSelectedIndex, setLastSelectedIndex] = useState(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [isDeletingTrades, setIsDeletingTrades] = useState(false);
  const [hoveredRowId, setHoveredRowId] = useState(null);

  // Conteneur du tableau : on cale dynamiquement sa hauteur max sur le bas du
  // viewport (depuis sa position réelle) pour que la barre de défilement
  // HORIZONTALE reste toujours visible sans devoir scroller jusqu'en bas.
  // On écrit directement le style (pas de re-render) pour rester fluide au scroll.
  const tradesMainRef = useRef(null);
  const tradeSideRef = useRef(null);
  useEffect(() => {
    let raf = 0;
    const apply = () => {
      raf = 0;
      const node = tradesMainRef.current;
      const side = tradeSideRef.current;
      if (!node) return;
      // Désactivé en mobile (la CSS passe en max-height:none, layout empilé).
      if (window.innerWidth <= 767) {
        node.style.maxHeight = "";
        if (side) side.style.maxHeight = "";
        return;
      }
      const top = node.getBoundingClientRect().top;
      const h = Math.max(240, Math.round(window.innerHeight - top - 16));
      node.style.maxHeight = h + "px";
      // Le panneau « Trade info » partage la même origine verticale que le
      // tableau : on lui donne la même hauteur pour qu'il descende lui aussi
      // jusqu'au bas de la page.
      if (side) side.style.maxHeight = h + "px";
    };
    const schedule = () => { if (!raf) raf = requestAnimationFrame(apply); };
    schedule();
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true); // capture: capte le scroll des conteneurs internes
    let ro;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(schedule);
      ro.observe(document.body);
    }
    return () => {
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
      if (ro) ro.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [trades.length, embedded, selectedTrade]);

  // Ordre des colonnes du tableau, persisté côté compte (Supabase via useCloudState)
  // avec fallback localStorage. L'utilisateur peut les réordonner par drag-and-drop.
  // Colonnes existantes (visibles par défaut) + nouvelles catégories optionnelles
  // (masquées par défaut, activables depuis le bouton de config).
  /* Ordre de la maquette « Trades » (node 283:6791) :
     type · entry date · entry time · exit date · exit time · duration ·
     net p&l · p&l% · r · lots · frais · stratégie · entry · exit · session · day.
     `asset`, `volume` et le P&L brut restent disponibles mais masqués — la
     maquette ne les montre pas et le P&L affiché est le net (cf. barème de frais). */
  const TRADE_COLUMN_IDS = [
    "side","account","entryDate","entryTime","exitDate","exitTime","duration",
    "netPnl","pnlPct","r","lots","fees","strategy","entry","exit","session","weekday",
    "asset","volume","pnl",
  ];
  const DEFAULT_VISIBLE_COLUMNS = [
    "side","account","entryDate","entryTime","exitDate","exitTime","duration",
    "netPnl","pnlPct","r","lots","fees","strategy","entry","exit","session","weekday",
  ];
  /* Clés en v2 : l'ordre et la visibilité stockés par l'ancienne version
     l'emporteraient sur les nouveaux défauts, et la page ne ressemblerait pas à
     la maquette pour les comptes existants. Le renommage repart des défauts. */
  const [rawColumnOrder, setRawColumnOrder] = useCloudState("tr4de_trades_columns_v2", "trades_column_order_v2", TRADE_COLUMN_IDS);
  // Validation : tout id stocké doit appartenir à TRADE_COLUMN_IDS et toutes
  // les colonnes du code doivent y être. Une colonne ajoutée après coup reprend
  // sa place canonique (juste avant le premier voisin déjà présent) plutôt que
  // d'atterrir en fin de tableau : « Compte » se lit à côté du type, pas
  // derrière le P&L brut.
  const columnOrder = (() => {
    if (!Array.isArray(rawColumnOrder)) return TRADE_COLUMN_IDS;
    const out = rawColumnOrder.filter(id => TRADE_COLUMN_IDS.includes(id));
    TRADE_COLUMN_IDS.forEach((id, canonicalIdx) => {
      if (out.includes(id)) return;
      const nextPresent = TRADE_COLUMN_IDS.slice(canonicalIdx + 1).find(x => out.includes(x));
      const pos = nextPresent ? out.indexOf(nextPresent) : out.length;
      out.splice(pos, 0, id);
    });
    return out;
  })();
  const setColumnOrder = setRawColumnOrder;

  // Colonnes visibles : persistées séparément. Clé en v3 pour l'arrivée de la
  // colonne « Compte » — une liste stockée en v2 ne la contient pas, et rien ne
  // distingue « jamais proposée » de « décochée par l'utilisateur » : on repart
  // donc des défauts (l'ordre personnalisé, lui, est conservé en v2).
  const [rawVisibleColumns, setRawVisibleColumns] = useCloudState(
    "tr4de_trades_visible_columns_v3", "trades_visible_columns_v3", DEFAULT_VISIBLE_COLUMNS
  );
  const visibleColumns = Array.isArray(rawVisibleColumns)
    ? rawVisibleColumns.filter(id => TRADE_COLUMN_IDS.includes(id))
    : DEFAULT_VISIBLE_COLUMNS;
  const setVisibleColumns = setRawVisibleColumns;
  const toggleColumnVisibility = (id) => {
    setVisibleColumns(prev => {
      const arr = Array.isArray(prev) ? prev : DEFAULT_VISIBLE_COLUMNS;
      return arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id];
    });
  };
  const [columnsMenuOpen, setColumnsMenuOpen] = useState(false);

  // Tri des trades : critère + direction, persistés côté compte (comme les colonnes).
  const SORT_OPTIONS = [
    { id: "date",     label: "Date" },
    { id: "symbol",   label: "Symbole" },
    { id: "strategy", label: "Stratégie" },
    { id: "pnl",      label: "P&L" },
    { id: "side",     label: "Sens" },
    { id: "lots",     label: "Lots" },
  ];
  const [sortBy, setSortBy] = useCloudState("tr4de_trades_sort_by", "trades_sort_by", "date");
  const [sortDir, setSortDir] = useCloudState("tr4de_trades_sort_dir", "trades_sort_dir", "desc");
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  // Filtres de la barre au-dessus du tableau (maquette node 293:12628).
  const [symbolFilter, setSymbolFilter] = useState([]);
  const [accountFilter, setAccountFilter] = useState("");
  const [sideFilter, setSideFilter] = useState("");
  // Mode embarqué (journal) : "voir plus" pour dépasser la limite maxRows.
  const [embeddedShowAll, setEmbeddedShowAll] = useState(false);
  const [dragColId, setDragColId] = useState(null);
  const [dragGrabOffset, setDragGrabOffset] = useState(0);
  const [dragWidth, setDragWidth] = useState(0);
  const persistColumns = () => { /* useCloudState gère la persistance auto */ };
  const moveColRelative = (srcId, targetId, before) => {
    if (!srcId || srcId === targetId) return;
    setColumnOrder(prev => {
      const arr = prev.filter(x => x !== srcId);
      const targetIdx = arr.indexOf(targetId);
      if (targetIdx === -1) return prev;
      const insertAt = before ? targetIdx : targetIdx + 1;
      arr.splice(insertAt, 0, srcId);
      if (arr.length === prev.length && arr.every((x, i) => x === prev[i])) return prev;
      return arr;
    });
  };
  const [showBulkStrategyDropdown, setShowBulkStrategyDropdown] = useState(false);
  const bulkStrategyAnchor = useRef(null);
  const [openStratMenuId, setOpenStratMenuId] = useState(null);

  // Fermer le menu strategie au clic exterieur
  React.useEffect(() => {
    if (!openStratMenuId) return;
    const handler = (e) => {
      const target = e.target;
      if (!(target instanceof Element)) return;
      // Le panneau est portalisé : il n'est plus dans `[data-strat-menu]`.
      if (!target.closest('[data-strat-menu]') && !target.closest('[data-popover-panel]')) setOpenStratMenuId(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [openStratMenuId]);

  // Fermer le menu de tri au clic exterieur
  React.useEffect(() => {
    if (!sortMenuOpen) return;
    const handler = (e) => {
      const target = e.target;
      if (!(target instanceof Element)) return;
      if (!target.closest('[data-sort-menu]')) setSortMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [sortMenuOpen]);
  const [tradeNotes, setTradeNotes] = useState({});
  const [tradeStrategies, setTradeStrategies] = useState({});
  const [showStrategyDropdown, setShowStrategyDropdown] = useState(false);
  // Cases cochées des règles de stratégie : persistées côté compte (Supabase via
  // useCloudState) avec fallback localStorage. La clé localStorage reste
  // "tr4de_checked_rules" pour que les autres pages (Dashboard, Stratégies) les lisent.
  const [checkedRules, setCheckedRules] = useCloudState("tr4de_checked_rules", "trades_checked_rules", {});
  const [emotionTags, setEmotionTags] = useState({});
  const [errorTags, setErrorTags] = useState({});
  // Réponses à la checklist Oui/Non par trade : { [tradeId]: { [questionId]: "yes" | "no" } }
  // Persistées côté compte (Supabase via useCloudState) avec fallback localStorage.
  const [tradeChecklist, setTradeChecklist] = useCloudState("tr4de_trade_checklist", "trades_checklist", {});
  // Unité de temps (timeframe) d'analyse par trade : { [tradeId]: "M15" }. Sélection unique.
  // Persistée côté compte (Supabase via useCloudState) avec fallback localStorage.
  const [tradeTimeframe, setTradeTimeframe] = useCloudState("tr4de_trade_timeframe", "trades_timeframe", {});
  const TIMEFRAME_OPTIONS = ["M1", "M5", "M15", "H1", "H4"];
  // Catégorie multi-sélection du panneau détail : type d'entrée.
  // Structure { [tradeId]: [tagId, ...] }. Persistée côté compte
  // (Supabase via useCloudState) avec fallback localStorage.
  const [tradeEntryTags, setTradeEntryTags] = useCloudState("tr4de_trade_entry_tags", "trades_entry_tags", {});
  // Liste complète des règles de la checklist (base + ajoutées), toutes
  // éditables/supprimables. Persistée globalement.
  const DEFAULT_CHECKLIST_RULES = [
    { id: "plan", label: "Plan respecté ?" },
    { id: "signal", label: "Entrée sur signal ?" },
    { id: "sltp", label: "SL / TP placés ?" },
    { id: "exitplan", label: "Sortie selon le plan ?" },
    { id: "rr2", label: "Profit sortie à 2 RR ?" },
  ];
  const [checklistRules, setChecklistRules] = useState(DEFAULT_CHECKLIST_RULES);
  const [newRuleText, setNewRuleText] = useState("");
  const [addingRule, setAddingRule] = useState(false);
  const [hoveredRuleId, setHoveredRuleId] = useState(null);
  const [editingRuleId, setEditingRuleId] = useState(null);
  const [editRuleText, setEditRuleText] = useState("");
  const [dragRuleId, setDragRuleId] = useState(null);
  const [loadedStrategies, setLoadedStrategies] = useState([]);
  const [activeTab, setActiveTab] = useState("infos");

  const persistRules = (next) => { try { localStorage.setItem("tr4de_checklist_rules_v2", JSON.stringify(next)); } catch {} };
  const addCustomRule = (label) => {
    const text = String(label || "").trim();
    if (!text) return;
    setChecklistRules((prev) => { const next = [...prev, { id: `custom_${Date.now()}`, label: text }]; persistRules(next); return next; });
    setNewRuleText("");
  };
  const removeCustomRule = (id) => {
    setChecklistRules((prev) => { const next = prev.filter((r) => r.id !== id); persistRules(next); return next; });
  };
  const updateCustomRule = (id, label) => {
    const text = String(label || "").trim();
    if (!text) return;
    setChecklistRules((prev) => { const next = prev.map((r) => (r.id === id ? { ...r, label: text } : r)); persistRules(next); return next; });
  };
  // Réordonne une règle (glisser-déposer) : déplace srcId à la position de targetId.
  const moveRule = (srcId, targetId) => {
    if (!srcId || srcId === targetId) return;
    setChecklistRules((prev) => {
      const arr = [...prev];
      const from = arr.findIndex((r) => r.id === srcId);
      const to = arr.findIndex((r) => r.id === targetId);
      if (from === -1 || to === -1) return prev;
      const [moved] = arr.splice(from, 1);
      arr.splice(to, 0, moved);
      persistRules(arr);
      return arr;
    });
  };

  // Helper pour identifier un trade de maniere unique
  const tradeKey = (t) => t?.id != null ? `id:${t.id}` : `${t.date}_${t.symbol}_${t.entry}_${t.exit ?? ''}_${t.direction ?? ''}_${t.entryTime || ''}_${t.exitTime || ''}_${t.pnl ?? ''}`;

  // Clé de note d'un trade : on privilégie l'id (conserve les notes déjà
  // enregistrées en base sous trade_id) et on retombe sur tradeKey si l'id
  // manque. Le panneau de détail ET la colonne du tableau l'utilisent, ce qui
  // garantit que la note saisie s'affiche bien dans le tableau.
  const noteKeyOf = (t) => (t?.id != null ? t.id : tradeKey(t));

  // Toutes les clés sous lesquelles un trade peut être indexé pour ses notes /
  // stratégies. Identique au panneau de détail (id Supabase + 2 composites)
  // afin que le tableau lise EXACTEMENT ce que le panneau enregistre.
  // Inclut les clés de tous les trades enfants (cas d'un parent de groupe).
  const indexKeysOf = (tr) => {
    const keysFor = (one) => [
      one?.id,
      tradeKey(one),
      `${one?.date || ""}${one?.symbol || ""}${one?.entry ?? ""}`,
      (one?.date && one?.symbol && one?.entry != null)
        ? `${one.date}${one.symbol}${parseFloat(one.entry).toFixed(2)}`
        : null,
    ];
    let arr = keysFor(tr);
    if (Array.isArray(tr?._children)) tr._children.forEach((c) => { arr = arr.concat(keysFor(c)); });
    return Array.from(new Set(arr.filter((k) => k != null).map(String)));
  };

  // --- Frais de commission (futures) ---------------------------------------
  // Le P&L fourni par useTrades() est déjà NET de frais (le brut est conservé
  // dans `pnlGross`). On ne re-déduit donc jamais ici.
  //   - feesOf  : montant des frais du trade (pour la colonne "Frais")
  //   - netPnlOf: P&L net (= t.pnl, déjà net)
  const feesOf = (t) => {
    if (t == null) return 0;
    // Si le brut est connu, les frais réellement déduits = brut − net.
    if (t.pnlGross != null && Number.isFinite(Number(t.pnlGross))) {
      return Number(t.pnlGross) - (Number(t.pnl) || 0);
    }
    return calculateFees(t);
  };
  const netPnlOf = (t) => Number(t?.pnl) || 0;
  // --- Break-even (BE) ------------------------------------------------------
  // Un trade dont le P&L NET est compris entre -25 € et +25 € (bornes incluses)
  // est considéré « break-even » : ni gain ni perte franche. On le signale par
  // une couleur neutre (gris) plutôt que vert/rouge.
  const BE_THRESHOLD = 25;
  const tradeOutcome = (net) => {
    const n = Number(net) || 0;
    if (n > BE_THRESHOLD) return "win";
    if (n < -BE_THRESHOLD) return "loss";
    return "be";
  };
  // Couleur du P&L selon l'issue nette : vert (gain) / rouge (perte) / gris (BE).
  const pnlColorFor = (net) => {
    const o = tradeOutcome(net);
    return o === "win" ? T.green : o === "loss" ? T.red : T.textMut;
  };
  // Quantité de contrats/lots du trade (selon le champ disponible). null si inconnu.
  const qtyOf = (t) => {
    const q = Number(t?.quantity ?? t?.qty ?? t?.lots ?? t?.lot_size);
    return Number.isFinite(q) && q > 0 ? q : null;
  };
  // Volume notionnel du trade. null si inconnu.
  const volOf = (t) => {
    const v = Number(t?.volume);
    return Number.isFinite(v) && v > 0 ? v : null;
  };
  // Premier nom de stratégie assignée au trade (pour le tri). "" si aucune.
  const firstStrategyName = (tr) => {
    const stratIds = Array.from(new Set(indexKeysOf(tr).flatMap(k => tradeStrategies[k] || [])));
    for (const id of stratIds) {
      const name = (strategies.find(x => x.id === id) || loadedStrategies.find(x => x.id === id))?.name;
      if (name) return name;
    }
    return "";
  };

  // Nombre de trades distincts auxquels chaque stratégie est assignée.
  // (indexKeysOf déduplique les clés multiples d'un même trade → pas de double compte.)
  const strategyTradeCounts = React.useMemo(() => {
    const counts = {};
    (trades || []).forEach((tr) => {
      const ids = Array.from(new Set(indexKeysOf(tr).flatMap((k) => tradeStrategies[k] || [])));
      ids.forEach((id) => { counts[id] = (counts[id] || 0) + 1; });
    });
    return counts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trades, tradeStrategies]);

  // Liste effective des définitions de stratégie : fusion de la prop `strategies`
  // (source de vérité fournie par le parent, chargée depuis Supabase) et de
  // `loadedStrategies` (cache localStorage lu au montage). `loadedStrategies`
  // peut être vide/en retard au montage ; sans cette fusion, les stratégies
  // assignées à un trade deviennent orphelines et le panneau n'affiche que le titre.
  const effectiveStrategies = React.useMemo(() => {
    const byId = new Map();
    [...(loadedStrategies || []), ...(strategies || [])].forEach((s) => {
      if (s && s.id != null) byId.set(s.id, s);
    });
    return Array.from(byId.values());
  }, [loadedStrategies, strategies]);

  // Stratégies triées par nombre de trades (décroissant) pour la sélection.
  // À égalité, on conserve l'ordre alphabétique pour un affichage stable.
  const strategiesByUsage = React.useMemo(() => {
    return [...effectiveStrategies].sort((a, b) => {
      const diff = (strategyTradeCounts[b.id] || 0) - (strategyTradeCounts[a.id] || 0);
      return diff !== 0 ? diff : String(a.name || "").localeCompare(String(b.name || ""));
    });
  }, [effectiveStrategies, strategyTradeCounts]);

  // Groupes "trades pris sur plusieurs comptes" (même symbole/sens/prix d'entrée à 1 min près)
  const [expandedGroups, setExpandedGroups] = useState(() => new Set());

  /* Le partitionnement vit dans lib/tradeGrouping.ts — il ne réunit que des
     comptes DISTINCTS, sinon un scale-in (deux entrées au même prix à moins
     d'une minute sur le même compte) passait pour un seul trade et sa ligne
     annonçait le P&L des deux. Ici il ne reste que les sommes de la ligne
     d'accueil. */
  const buildGroups = (list, windowSec = 60) =>
    groupExecutions(list, windowSec).map(children => ({
      // Clé stable, fondée sur le premier enfant.
      key: `g_${tradeKey(children[0])}`,
      parent: children[0],
      children,
      pnlSum: children.reduce((s, x) => s + (Number(x.pnl) || 0), 0),
      feesSum: children.reduce((s, x) => s + feesOf(x), 0),
      netSum: children.reduce((s, x) => s + netPnlOf(x), 0),
      qtySum: children.reduce((s, x) => s + (qtyOf(x) || 0), 0),
      volSum: children.reduce((s, x) => s + (volOf(x) || 0), 0),
    }));

  // Propage une opération à tous les trades enfants d'un groupe (si applicable)
  const childrenOf = (selected) => Array.isArray(selected?._children) && selected._children.length > 1
    ? selected._children
    : (selected ? [selected] : []);

  const allEmotionTags = [
    { id: "fomo", label: "FOMO", color: TAG_COLORS.red },
    { id: "revenge", label: "Vengeance", color: TAG_COLORS.red },
    { id: "overconfident", label: "Trop confiant", color: TAG_COLORS.orange },
    { id: "hesitation", label: "Hésitation", color: TAG_COLORS.orange },
    { id: "calm", label: "Calme & focus", color: TAG_COLORS.green },
    { id: "followed", label: "Plan suivi", color: TAG_COLORS.green },
    { id: "boredom", label: "Trade ennui", color: TAG_COLORS.blue },
    { id: "earlyexit", label: "Sortie anticipée", color: TAG_COLORS.purple }
  ];

  // Type d'entrée (ICT/SMC) — multi-sélection.
  const allEntryTags = [
    { id: "fvg", label: "FVG", color: TAG_COLORS.blue },
    { id: "ifvg", label: "IFVG", color: TAG_COLORS.green },
    { id: "ob", label: "OB", color: TAG_COLORS.purple },
    { id: "rejectionblock", label: "RB", color: TAG_COLORS.orange }
  ];

  // Questions de la checklist Oui/Non du panneau détail (remplace direction + horaires)
  const checklistQuestions = Array.isArray(checklistRules) ? checklistRules : DEFAULT_CHECKLIST_RULES;

  // Nature de chaque émotion pour la note du trade (+1 positif, -1 négatif).
  const EMOTION_SENTIMENT = {
    calm: 1, followed: 1,
    fomo: -1, revenge: -1, overconfident: -1, hesitation: -1, boredom: -1, earlyexit: -1,
  };
  // Note du trade (sur 10) calculée depuis les règles respectées + les émotions.
  // Règle "Oui" = positif, "Non" = négatif ; émotion selon EMOTION_SENTIMENT.
  // Renvoie null si rien n'est renseigné.
  const computeTradeNote = (trade) => {
    const id = trade?.id;
    if (!id) return null;
    const answers = tradeChecklist[id] || {};
    let pos = 0, neg = 0;
    checklistQuestions.forEach((q) => {
      const a = answers[q.id];
      if (a === "yes") pos += 1;
      else if (a === "no") neg += 1;
    });
    (emotionTags[id] || []).forEach((eid) => {
      const s = EMOTION_SENTIMENT[eid] || 0;
      if (s > 0) pos += 1;
      else if (s < 0) neg += 1;
    });
    const total = pos + neg;
    if (total === 0) return null;
    const score = Math.round((pos / total) * 10);
    const color = score >= 7 ? TAG_COLORS.green : score >= 4 ? TAG_COLORS.orange : TAG_COLORS.red;
    return { score, color };
  };

  // Coche une réponse de checklist et la propage aux trades enfants d'un groupe.
  const setChecklistAnswer = (selectedTrade, questionId, answer) => {
    const targets = childrenOf(selectedTrade);
    setTradeChecklist((prev) => {
      const updated = { ...prev };
      for (const child of targets) {
        const cid = child.id;
        if (!cid) continue;
        const cur = { ...(updated[cid] || {}) };
        // Re-cliquer la réponse déjà active la retire (toggle)
        if (cur[questionId] === answer) delete cur[questionId];
        else cur[questionId] = answer;
        updated[cid] = cur;
      }
      try { localStorage.setItem("tr4de_trade_checklist", JSON.stringify(updated)); } catch {}
      return updated;
    });
  };

  // Sélectionne l'unité de temps (sélection unique) et la propage aux trades
  // enfants d'un groupe. Re-cliquer la valeur active la retire (toggle).
  const setTimeframeFor = (selectedTrade, tf) => {
    const targets = childrenOf(selectedTrade);
    setTradeTimeframe((prev) => {
      const updated = { ...prev };
      for (const child of targets) {
        const cid = child.id;
        if (!cid) continue;
        if (updated[cid] === tf) delete updated[cid];
        else updated[cid] = tf;
      }
      try { localStorage.setItem("tr4de_trade_timeframe", JSON.stringify(updated)); } catch {}
      return updated;
    });
  };

  // Bascule une émotion (multi-sélection) et propage aux trades enfants d'un groupe.
  const toggleEmotion = (selectedTrade, tagId) => {
    const tradeId = selectedTrade?.id;
    if (!tradeId) return;
    const targets = childrenOf(selectedTrade);
    const isSelected = emotionTags[tradeId] && emotionTags[tradeId].includes(tagId);
    const updated = { ...emotionTags };
    for (const child of targets) {
      const cid = child.id;
      if (!cid) continue;
      const cur = updated[cid] || [];
      if (isSelected) {
        updated[cid] = cur.filter((x) => x !== tagId);
        removeEmotion(cid, tagId).catch((err) => console.error("❌ Remove emotion failed:", err?.message));
      } else if (!cur.includes(tagId)) {
        updated[cid] = [...cur, tagId];
        addEmotion(cid, tagId).catch((err) => console.error("❌ Add emotion failed:", err?.message));
      }
    }
    setEmotionTags(updated);
    try { localStorage.setItem("tr4de_emotion_tags", JSON.stringify(updated)); } catch {}
  };

  // Bascule une erreur (multi-sélection) et propage aux trades enfants d'un groupe.
  const toggleError = (selectedTrade, tagId) => {
    const tradeId = selectedTrade?.id;
    if (!tradeId) return;
    const targets = childrenOf(selectedTrade);
    const isSelected = errorTags[tradeId] && errorTags[tradeId].includes(tagId);
    const updated = { ...errorTags };
    for (const child of targets) {
      const cid = child.id;
      if (!cid) continue;
      const cur = updated[cid] || [];
      if (isSelected) {
        updated[cid] = cur.filter((x) => x !== tagId);
        removeError(cid, tagId).catch((err) => console.error("❌ Remove error failed:", err?.message));
      } else if (!cur.includes(tagId)) {
        updated[cid] = [...cur, tagId];
        addError(cid, tagId).catch((err) => console.error("❌ Add error failed:", err?.message));
      }
    }
    setErrorTags(updated);
    try { localStorage.setItem("tr4de_error_tags", JSON.stringify(updated)); } catch {}
  };

  // Bascule un tag (multi-sélection) sur un state persisté par useCloudState et
  // propage aux trades enfants d'un groupe.
  const toggleCloudTag = (setState, selectedTrade, tagId) => {
    const tradeId = selectedTrade?.id;
    if (!tradeId) return;
    const targets = childrenOf(selectedTrade);
    setState((prev) => {
      const updated = { ...prev };
      const isSelected = (prev[tradeId] || []).includes(tagId);
      for (const child of targets) {
        const cid = child.id;
        if (!cid) continue;
        const cur = updated[cid] || [];
        if (isSelected) updated[cid] = cur.filter((x) => x !== tagId);
        else if (!cur.includes(tagId)) updated[cid] = [...cur, tagId];
      }
      return updated;
    });
  };
  const toggleEntryTag = (selectedTrade, tagId) => toggleCloudTag(setTradeEntryTags, selectedTrade, tagId);

  const allErrorTags = [
    { id: "poorentry", label: "Mauvaise entrée", color: TAG_COLORS.red },
    { id: "poorexit", label: "Mauvaise sortie", color: TAG_COLORS.red },
    { id: "nosltp", label: "Pas de SL/TP", color: TAG_COLORS.orange },
    { id: "overleveraged", label: "Sur-leveragé", color: TAG_COLORS.orange },
    { id: "ignoredsignal", label: "Signaux ignorés", color: TAG_COLORS.purple },
    { id: "badtiming", label: "Mauvais timing", color: TAG_COLORS.red },
    { id: "slttoosmall", label: "SL trop petite", color: TAG_COLORS.orange },
    { id: "wronganalysis", label: "Mauvaise analyse", color: TAG_COLORS.purple }
  ];

  // ✅ Sync depuis Supabase (notes/emotions/errors): hook = source de vérité.
  React.useEffect(() => {
    if (notesFromHook && Object.keys(notesFromHook).length > 0) {
      setTradeNotes(notesFromHook);
      try { localStorage.setItem("tr4de_trade_notes", JSON.stringify(notesFromHook)); } catch {}
    }
  }, [notesFromHook]);
  React.useEffect(() => {
    if (emotionsFromHook && Object.keys(emotionsFromHook).length > 0) {
      setEmotionTags(emotionsFromHook);
      try { localStorage.setItem("tr4de_emotion_tags", JSON.stringify(emotionsFromHook)); } catch {}
    }
  }, [emotionsFromHook]);
  React.useEffect(() => {
    if (errorsFromHook && Object.keys(errorsFromHook).length > 0) {
      setErrorTags(errorsFromHook);
      try { localStorage.setItem("tr4de_error_tags", JSON.stringify(errorsFromHook)); } catch {}
    }
  }, [errorsFromHook]);

  // Debounce notes Supabase save (textarea fires per keystroke)
  const noteSaveTimers = React.useRef({});
  const persistNote = React.useCallback((tradeId, text) => {
    if (!tradeId) { console.warn("⚠️ persistNote: tradeId manquant — note non sauvegardée en ligne"); return; }
    if (noteSaveTimers.current[tradeId]) clearTimeout(noteSaveTimers.current[tradeId]);
    noteSaveTimers.current[tradeId] = setTimeout(() => {
      setNoteHook(tradeId, text)
        .then(() => { /* note saved */ })
        .catch(err => console.error("❌ Save note failed:", err?.message || err));
    }, 600);
  }, [setNoteHook]);

  // Charger l'onglet actif depuis localStorage au démarrage
  React.useEffect(() => {
    const savedTab = localStorage.getItem("tr4de_active_tab");
    if (savedTab) {
      setActiveTab(savedTab);
    }
  }, []);

  // Sauvegarder l'onglet actif dans localStorage quand il change
  React.useEffect(() => {
    localStorage.setItem("tr4de_active_tab", activeTab);
  }, [activeTab]);

  // Load trade notes and strategies from localStorage - RUNS EVERY TIME COMPONENT MOUNTS
  React.useEffect(() => {
    
    try {
      const savedNotes = localStorage.getItem("tr4de_trade_notes");
      if (savedNotes) {
        setTradeNotes(JSON.parse(savedNotes));
      }
      
      // ✅ Fast path: localStorage. Sync depuis Supabase juste après (voir useEffect dédié).
      const savedTradeStrategies = localStorage.getItem("tr4de_trade_strategies");
      if (savedTradeStrategies) {
        const parsed = JSON.parse(savedTradeStrategies);
        setTradeStrategies(parsed);
      }
      
      // ✅ CRITICAL: Always reload strategies list
      // Source de vérité : tr4de_strategies (clé actuelle). Fallback sur apex_strategies (legacy).
      const savedStrategies = localStorage.getItem("tr4de_strategies") || localStorage.getItem("apex_strategies");
      if (savedStrategies) {
        const parsed = JSON.parse(savedStrategies);
        setLoadedStrategies(parsed);
      }

      const savedEmotionTags = localStorage.getItem("tr4de_emotion_tags");
      if (savedEmotionTags) {
        setEmotionTags(JSON.parse(savedEmotionTags));
      }

      const savedErrorTags = localStorage.getItem("tr4de_error_tags");
      if (savedErrorTags) {
        setErrorTags(JSON.parse(savedErrorTags));
      }

      // tradeChecklist & tradeTimeframe : hydratation gérée par useCloudState
      // (localStorage + Supabase), plus de chargement manuel ici.

      const savedRules = localStorage.getItem("tr4de_checklist_rules_v2");
      if (savedRules) {
        const parsed = JSON.parse(savedRules);
        // On respecte aussi un tableau vide : si l'utilisateur a supprimé toutes
        // ses règles, on n'affiche plus aucune case (et on ne réinjecte pas les
        // règles par défaut).
        if (Array.isArray(parsed)) setChecklistRules(parsed);
      } else {
        // Migration depuis l'ancienne clé (ne contenait que les règles ajoutées)
        const old = localStorage.getItem("tr4de_checklist_rules");
        if (old) {
          const oldArr = JSON.parse(old);
          if (Array.isArray(oldArr) && oldArr.length) {
            const merged = [...DEFAULT_CHECKLIST_RULES, ...oldArr];
            setChecklistRules(merged);
            try { localStorage.setItem("tr4de_checklist_rules_v2", JSON.stringify(merged)); } catch {}
          }
        }
      }

      // checkedRules : hydratation gérée par useCloudState (localStorage + Supabase).
    } catch (err) {
      console.error("Error loading data from localStorage:", err);
    }
  }, []); // Empty dependency - runs ONLY on component mount

  // Charger les assignments trade↔strategy depuis Supabase (source de vérité).
  // Refetch sur focus pour synchroniser entre navigateurs.
  React.useEffect(() => {
    if (!user?.id) return;
    const supabase = createClient();
    let cancelled = false;

    const loadFromSupabase = async () => {
      try {
        const { data, error } = await supabase
          .from("trade_strategies")
          .select("trade_id, strategy_id")
          .eq("user_id", user.id);
        if (error) {
          if (error.message?.includes("Could not find the table") || error.code === "PGRST116") return;
          throw error;
        }
        if (cancelled) return;
        const map = {};
        (data || []).forEach((row) => {
          if (!map[row.trade_id]) map[row.trade_id] = [];
          map[row.trade_id].push(row.strategy_id);
        });
        setTradeStrategies(map);
        try { localStorage.setItem("tr4de_trade_strategies", JSON.stringify(map)); } catch {}
      } catch (err) {
        console.error("❌ Erreur chargement trade_strategies:", err?.message || err);
      }
    };

    loadFromSupabase();
    const onFocus = () => loadFromSupabase();
    window.addEventListener("focus", onFocus);
    return () => { cancelled = true; window.removeEventListener("focus", onFocus); };
  }, [user?.id]);

  // Auto-save trade strategies: localStorage immédiat + Supabase (debounced full sync)
  const lastSyncedRef = React.useRef(null);
  React.useEffect(() => {
    if (Object.keys(tradeStrategies).length > 0) {
      try { localStorage.setItem("tr4de_trade_strategies", JSON.stringify(tradeStrategies)); } catch {}
    }

    if (!user?.id) return;
    const snapshot = JSON.stringify(tradeStrategies);
    if (snapshot === lastSyncedRef.current) return;

    const handle = setTimeout(async () => {
      const supabase = createClient();
      try {
        // Fetch existant pour diff
        const { data: existing, error: fetchErr } = await supabase
          .from("trade_strategies")
          .select("trade_id, strategy_id")
          .eq("user_id", user.id);
        if (fetchErr) {
          if (fetchErr.message?.includes("Could not find the table") || fetchErr.code === "PGRST116") return;
          throw fetchErr;
        }
        const existingSet = new Set((existing || []).map(r => `${r.trade_id}::${r.strategy_id}`));
        const desiredSet = new Set();
        const desiredRows = [];
        Object.entries(tradeStrategies).forEach(([tradeId, stratIds]) => {
          (stratIds || []).forEach(sid => {
            const key = `${tradeId}::${sid}`;
            desiredSet.add(key);
            desiredRows.push({ user_id: user.id, trade_id: String(tradeId), strategy_id: String(sid) });
          });
        });

        const toDelete = (existing || []).filter(r => !desiredSet.has(`${r.trade_id}::${r.strategy_id}`));
        const toInsert = desiredRows.filter(r => !existingSet.has(`${r.trade_id}::${r.strategy_id}`));

        // Delete supprimés
        for (const row of toDelete) {
          await supabase.from("trade_strategies")
            .delete()
            .eq("user_id", user.id)
            .eq("trade_id", row.trade_id)
            .eq("strategy_id", row.strategy_id);
        }
        // Insert ajoutés
        if (toInsert.length > 0) {
          await supabase.from("trade_strategies").insert(toInsert);
        }
        lastSyncedRef.current = snapshot;
      } catch (err) {
        console.error("❌ Erreur sync trade_strategies:", err?.message || err);
      }
    }, 600);

    return () => clearTimeout(handle);
  }, [tradeStrategies, user?.id]);

  // Notifie les autres composants du même onglet quand les cases changent
  // (la persistance localStorage + Supabase est assurée par useCloudState ci-dessus ;
  // le `storage` event natif ne se déclenche que pour les autres onglets).
  React.useEffect(() => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("tr4de:checked-rules-changed"));
    }
  }, [checkedRules]);

  // Paste depuis le presse-papier → upload sur le trade sélectionné (si pas déjà de screenshot)
  React.useEffect(() => {
    if (!selectedTrade || screenshotUrls[selectedTrade.id]) return;
    const onPaste = async (e) => {
      const ae = document.activeElement;
      const isEditable = ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA" || ae.isContentEditable);
      if (isEditable && ae.tagName !== "LABEL") return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const it of items) {
        if (it.kind === "file" && it.type?.startsWith("image/")) {
          const f = it.getAsFile();
          if (f) {
            e.preventDefault();
            setScreenshotBusy(true);
            try { await uploadScreenshot(selectedTrade.id, f); }
            finally { setScreenshotBusy(false); }
            return;
          }
        }
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [selectedTrade, screenshotUrls, uploadScreenshot]);

  // Auto-close selected trade panel if trade was deleted
  React.useEffect(() => {
    if (selectedTrade && trades) {
      const tradeExists = trades.some(t => 
        t.id === selectedTrade.id || 
        (t.date === selectedTrade.date && t.symbol === selectedTrade.symbol && t.entry === selectedTrade.entry)
      );
      
      if (!tradeExists) {
        setSelectedTrade(null);
      }
    }
  }, [trades]);

  /* Filtres de la maquette (node 293:12628) : symboles, compte, type, sens du
     tri sur la date d'entrée. Volontairement AUCUN filtre de plage de dates —
     le site montre tout l'historique, et « Date de débuts » ne pilote donc que
     l'ordre, pas le périmètre. */
  const symbolOptions = React.useMemo(() => {
    const seen = new Map();
    (trades || []).forEach(tr => {
      const code = String(tr.symbol || "").trim();
      if (code && !seen.has(code)) seen.set(code, symbolLabel(code));
    });
    return Array.from(seen.entries())
      /* Le contrat exact quand il en existe un (« MNQU6 »), la racine sinon :
         le filtre porte sur le symbole tel qu'il est stocké, donc deux
         échéances doivent rester deux entrées distinguables. */
      .map(([code, l]) => ({ id: code, label: l.code || l.name }))
      .sort((a, b) => a.label.localeCompare(b.label, "fr"));
  }, [trades]);
  const accountOptions = React.useMemo(
    () => (accounts || []).map(a => ({ id: a.id, label: a.name || "Compte" })),
    [accounts]
  );
  /* Colonne « Compte » : le trade ne porte qu'un account_id. Un id inconnu
     (compte supprimé au passage funded — la FK repasse à NULL) retombe sur
     le tiret plutôt que sur un identifiant illisible. */
  const accountNameById = React.useMemo(
    () => new Map((accounts || []).map(a => [a.id, a.name || "Compte"])),
    [accounts]
  );

  const filteredTrades = React.useMemo(() => {
    let out = trades || [];
    if (symbolFilter.length) out = out.filter(tr => symbolFilter.includes(String(tr.symbol || "").trim()));
    if (accountFilter) out = out.filter(tr => tr.account_id === accountFilter);
    if (sideFilter) {
      const wantShort = sideFilter === "short";
      out = out.filter(tr => String(tr.direction || "").toLowerCase().startsWith("s") === wantShort);
    }
    return out;
  }, [trades, symbolFilter, accountFilter, sideFilter]);

  /* ─── Groupes triés ────────────────────────────────────────────────────
     Le regroupement des exécutions et le tri vivaient dans le JSX ; ils sont
     hissés ici pour que la barre de pagination (rendue sous le tableau)
     connaisse le nombre total de lignes. */
  const sortedGroups = React.useMemo(() => {
    const groups = buildGroups(filteredTrades, 60);
    const sortVal = (g) => {
      const p = g.parent;
      switch (sortBy) {
        case "symbol":   return String(p.symbol || "").toUpperCase();
        case "strategy": return firstStrategyName(p).toUpperCase();
        case "pnl":      return g.netSum != null ? g.netSum : netPnlOf(p);
        case "side":     return String(p.direction || "").toUpperCase();
        case "lots":     return g.qtySum != null && g.qtySum > 0 ? g.qtySum : (qtyOf(p) || 0);
        case "date":
        default: {
          const d = String(p.date || "").slice(0, 10);
          const time = p.exitTime || p.exit_time || "00:00:00";
          return `${d}T${time}`;
        }
      }
    };
    const sortMul = sortDir === "asc" ? 1 : -1;
    groups.sort((a, b) => {
      const va = sortVal(a), vb = sortVal(b);
      let cmp;
      if (typeof va === "number" && typeof vb === "number") cmp = va - vb;
      else cmp = String(va).localeCompare(String(vb), "fr", { numeric: true });
      if (cmp !== 0) return cmp * sortMul;
      // Départage stable : date la plus récente d'abord
      const da = String(a.parent.date || "").slice(0, 10);
      const db = String(b.parent.date || "").slice(0, 10);
      return db.localeCompare(da);
    });
    return groups;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredTrades, sortBy, sortDir, tradeStrategies]);

  /* ─── Pagination ───────────────────────────────────────────────────────
     On pagine les GROUPES, pas les lignes aplaties : déplier un lot
     d'exécutions ne doit pas repousser des trades sur la page suivante ni
     faire varier le nombre de trades par page.
     Le mode embarqué (journal) garde son « voir plus » et n'est pas paginé. */
  const paginated = !embedded;
  const [pageSize, setPageSize] = React.useState(() => {
    if (typeof window === "undefined") return 50;
    const v = parseInt(localStorage.getItem("tr4de_trades_page_size") || "", 10);
    return PAGE_SIZES.includes(v) ? v : 50;
  });
  const [pageIndex, setPageIndex] = React.useState(0);
  const pageCount = paginated ? Math.max(1, Math.ceil(sortedGroups.length / pageSize)) : 1;

  // Revenir à la première page quand le contenu change (filtres, tri, taille).
  React.useEffect(() => { setPageIndex(0); }, [symbolFilter, accountFilter, sideFilter, sortBy, sortDir, pageSize]);
  // Et rester dans les bornes si la liste rétrécit (suppression de trades).
  React.useEffect(() => {
    setPageIndex((p) => Math.min(p, pageCount - 1));
  }, [pageCount]);

  const changePageSize = (n) => {
    setPageSize(n);
    try { localStorage.setItem("tr4de_trades_page_size", String(n)); } catch {}
  };

  const pagedGroups = React.useMemo(() => {
    if (!paginated) return sortedGroups;
    const start = pageIndex * pageSize;
    return sortedGroups.slice(start, start + pageSize);
  }, [sortedGroups, paginated, pageIndex, pageSize]);

  /* Les trades arrivent de Supabase. Sans ce garde, la page affiche « Aucun
     trade » le temps de la requête — un état vide qui n'est pas vrai, et le
     seul écran du site où l'utilisateur risque de croire ses données perdues.
     Le squelette reprend la forme du tableau, pas celle de l'état vide. */
  const { tradesLoading } = useApp();
  if (showSkeleton(tradesLoading && (!trades || trades.length === 0))) {
    if (embedded) return null;
    /* Le tableau ne trace pas de filets : ses lignes sont des blocs blancs
       séparés par les 8 px de `borderSpacing`, à 12 px de marge verticale.
       Le squelette reprend ce rythme-là, sinon la liste se resserre d'un coup
       quand elle arrive. */
    const CELLS = [182, 96, 88, 104, 76, 92, 84];
    return (
      <SkeletonScreen label={t("trades.title")} gap={48}>
        <div style={{ marginBottom: -30 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 26, padding: "0 28px", flexWrap: "wrap" }}>
            {[104, 84, 76, 128].map((w, i) => <Skeleton key={i} width={w} height={16} />)}
            <Skeleton width={132} height={34} radius={999} style={{ marginLeft: "auto", marginRight: -28 }} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
          <div style={{ ...CARD, flex: 1, minWidth: 0, display: "flex", flexDirection: "column", padding: 16, gap: 12 }}>
            <div style={{ display: "flex", gap: 12, paddingBottom: 10, borderBottom: `1px solid ${T.border}` }}>
              {CELLS.map((w, i) => <Skeleton key={i} width={w} height={13} />)}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {Array.from({ length: 10 }).map((_, r) => (
                <div key={r} style={{ display: "flex", gap: 12, padding: "12px 6px", borderRadius: 12 }}>
                  {CELLS.map((w, i) => <Skeleton key={i} width={w} height={13} />)}
                </div>
              ))}
            </div>
          </div>
        </div>
      </SkeletonScreen>
    );
  }

  if (!trades || trades.length === 0) {
    if (embedded) return null; // l'empty state est géré par le parent
    /* La page est posée sur le fond gris : l'état vide est donc une carte de la
       nouvelle DA (coins 12, ombre douce, sans bordure) comme le tableau. */
    return (
      <div style={{display:"flex",flexDirection:"column",gap:24,fontFamily:"var(--font-sans)"}} className="anim-1">
        <div style={{...CARD,padding:"64px 40px",textAlign:"center",minHeight:"50vh",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column"}}>
          <div style={{width:48,height:48,borderRadius:12,background:T.accentBg,display:"flex",alignItems:"center",justifyContent:"center",marginBottom:16}}>
            <LucideTrendingUp size={22} strokeWidth={1.75} color={T.text}/>
          </div>
          <div style={{fontSize:16,fontWeight:600,color:T.text,marginBottom:6,letterSpacing:-0.1}}>{t("journal.empty")}</div>
          <div style={{fontSize:13,color:T.textSub,marginBottom:20,maxWidth:380,lineHeight:1.5}}>{t("journal.emptySub")}</div>
          <button onClick={onImportClick} style={{display:"inline-flex",alignItems:"center",gap:6,minHeight: 34, padding: "8px 16px",borderRadius:999,background:T.white,color:T.text,fontSize: 13,fontWeight:500,cursor:"pointer",border:`1px solid ${T.text}`,fontFamily:"var(--font-sans)"}}>
            <LucidePlus size={14} strokeWidth={2}/> {t("trades.importBtn")}
          </button>
        </div>
      </div>
    );
  }

  // Calculate symbol statistics
  const symbolStats = {};
  filteredTrades.forEach(t => {
    if (!symbolStats[t.symbol]) {
      symbolStats[t.symbol] = {
        trades: [],
        totalPnL: 0,
        wins: 0,
        losses: 0,
        be: 0
      };
    }
    const net = netPnlOf(t);
    const outcome = tradeOutcome(net);
    symbolStats[t.symbol].trades.push(t);
    symbolStats[t.symbol].totalPnL += net;
    if (outcome === "win") symbolStats[t.symbol].wins++;
    else if (outcome === "loss") symbolStats[t.symbol].losses++;
    else symbolStats[t.symbol].be++;
  });

  // Find best and worst symbols
  let bestSymbol = null, worstSymbol = null, bestPnL = -Infinity, worstPnL = Infinity;
  Object.entries(symbolStats).forEach(([sym, stats]) => {
    if (stats.totalPnL > bestPnL) { bestPnL = stats.totalPnL; bestSymbol = sym; }
    if (stats.totalPnL < worstPnL) { worstPnL = stats.totalPnL; worstSymbol = sym; }
  });

  const totalPnL = filteredTrades.reduce((s,t)=>s+netPnlOf(t),0);
  const totalWins = filteredTrades.filter(t=>tradeOutcome(netPnlOf(t))==="win").length;
  const totalBe = filteredTrades.filter(t=>tradeOutcome(netPnlOf(t))==="be").length;
  const winRate = filteredTrades.length > 0 ? ((totalWins/filteredTrades.length)*100).toFixed(0) : 0;
  const symbolCount = Object.keys(symbolStats).length;

  const topSymbol = Object.entries(symbolStats).sort((a,b)=>b[1].totalPnL-a[1].totalPnL)[0];

  return (
    /* 14 px de retrait haut : la barre du haut apporte déjà 20 px, ce qui place
       le titre aux 34 px de la maquette (même calcul que le dashboard). */
    <div style={{display:"flex",flexDirection:"column",gap:embedded?16:48,fontFamily:"var(--font-sans)"}} className="anim-1">
      {/* MODAL CONFIG COLONNES — apparaît centrée devant l'écran avec backdrop. */}
      {columnsMenuOpen && (
        <DAModal
          title="Colonnes du tableau"
          onClose={() => setColumnsMenuOpen(false)}
          width={560}
          maxHeight="min(80vh, 720px)"
          bodyStyle={{ padding: "6px 16px 14px", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 4 }}>
              {TRADE_COLUMN_IDS.map(id => {
                const labelMap = {
                  asset: t("trades.colAsset"), side: t("trades.colSide"),
                  entryDate: t("trades.colEntryDate"), entryTime: t("trades.colEntryTime"),
                  entry: t("trades.colEntry"), exitDate: t("trades.colExitDate"),
                  exitTime: t("trades.colExitTime"), exit: t("trades.colExit"),
                  lots: t("trades.colLots"), volume: t("trades.colVolume"),
                  pnl: t("trades.colPnL"), pnlPct: t("trades.colPnLPct"),
                  r: "R", duration: t("trades.colDuration"),
                  fees: "Frais", netPnl: "P&L net", strategy: "Stratégie",
                  session: "Session", weekday: "Jour",
                  account: t("addTrade.account"),
                };
                const checked = visibleColumns.includes(id);
                return (
                  <label key={id}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "9px 12px", borderRadius: "var(--radius-card)", cursor: "pointer",
                      fontSize: 13, color: T.text, fontWeight: 500,
                      transition: "background .12s ease",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = T.bg; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleColumnVisibility(id)}
                      style={{ accentColor: T.text, cursor: "pointer", width: 14, height: 14, flexShrink: 0 }}
                    />
                    <span style={{ flex: 1 }}>{labelMap[id] || id}</span>
                  </label>
                );
              })}
        </DAModal>
      )}

      {/* BARRE DE FILTRES — libellés à 40 % d'opacité, hors carte, retrait de
          28 px pour s'aligner sur le contenu de la carte (maquette 293:12628). */}
      {!embedded && (
        /* La barre d'outils colle au tableau qu'elle pilote : le retrait négatif
           reprend l'essentiel des 48 px d'écart entre sections de la page, qui
           l'en éloignaient comme s'il s'agissait de deux blocs sans rapport.
           (Le conteneur en colonne qui enveloppait cette rangée n'avait qu'un
           seul enfant : il ne servait qu'à porter un gap inutilisé.) */
        <div style={{marginBottom:-30}}>
          <div style={{display:"flex",alignItems:"center",gap:26,padding:"0 28px",flexWrap:"wrap"}}>
            <TableFilter
              multi
              label={t("trades.filterSymbols")}
              value={symbolFilter}
              options={symbolOptions}
              onChange={setSymbolFilter}
            />
            {accountOptions.length > 0 && (
              <TableFilter
                label={t("addTrade.account")}
                value={accountFilter}
                options={accountOptions}
                onChange={setAccountFilter}
              />
            )}
            <TableFilter
              label={t("trades.filterTypes")}
              value={sideFilter}
              options={[{ id: "long", label: "Long" }, { id: "short", label: "Short" }]}
              onChange={setSideFilter}
            />
            <TableFilter
              /* Tri par défaut du tableau, pas un filtre posé par l'utilisateur :
                 il reste gris comme les autres. */
              neutral
              label={t("trades.filterEntryDate")}
              value={sortBy === "date" ? sortDir : ""}
              options={[{ id: "desc", label: t("trades.newestFirst") }, { id: "asc", label: t("trades.oldestFirst") }]}
              onChange={(dir) => { setSortBy("date"); setSortDir(dir || "desc"); }}
            />
            {/* « Importer » vit sur la MÊME ligne que les filtres, poussé à
                droite : c'est la barre d'outils du tableau, la séparer en deux
                rangées éloignait l'action de ce sur quoi elle agit.
                Le retrait négatif annule POUR LUI le padding de 28 px de la
                barre : ce retrait aligne les libellés de filtres sur le contenu
                de la carte, mais il arrêtait l'action 28 px avant le bord droit
                de la page, là où tous les autres boutons du site s'arrêtent. */}
            <button
              type="button"
              onClick={onImportClick}
              style={{display:"inline-flex",alignItems:"center",gap:6,marginLeft:"auto",marginRight:-28,padding: "8px 16px",minHeight: 34, borderRadius:999,
                      background:T.text,border:"none",color:T.textInverted,fontSize: 13,fontWeight:500,
                      cursor:"pointer",fontFamily:"inherit"}}
            >
              <LucidePlus size={13} strokeWidth={1.75} /> {t("trades.importBtn")}
            </button>
          </div>
        </div>
      )}

      {/* LAYOUT WITH TABLE + SIDE PANEL WITH TABS */}
      <div className="tr4de-trades-layout" style={{display:"flex",gap:16,alignItems:"flex-start"}}>

        {/* LEFT - TRADES TABLE.
            Carte de la maquette : coins 12, ombre très douce, PAS de bordure —
            la séparation des lignes se fait par l'espace, pas par des filets. */}
        <div ref={tradesMainRef} className="tr4de-trades-main" style={{...CARD,flex:selectedTrade?"0 0 calc(100% - 376px)":"1",minWidth:0,display:"flex",flexDirection:"column",maxHeight:isMobile?"none":"calc(100vh - 200px)",padding:isMobile?10:16,gap:12}}>

          {/* Sur téléphone, c'est la PAGE qui défile — pas un cadre interne.
              Un conteneur à défilement propre y créerait deux zones
              concurrentes : le doigt ne saurait pas laquelle il fait bouger, et
              la barre d'onglets masquerait la fin de la liste sans qu'on puisse
              l'atteindre. */}
          <div className="tr4de-trades-scroll" style={{overflowX:isMobile?"visible":"auto",overflowY:isMobile?"visible":"auto",overscrollBehavior:"contain",flex:1,minHeight:0}}>
            {/* `table-layout: fixed` : sans lui, chaque colonne s'élargissait à la
                taille de son contenu (`max-content`), et l'écart entre deux
                intitulés changeait d'une colonne à l'autre — et d'un filtre à
                l'autre. Les largeurs déclarées sur les `th` font désormais loi,
                donc l'espacement est le même partout. */}
            {/* `table-layout: fixed` + `width: max-content` font vivre le tableau
                de bureau. Sur téléphone les rangées sont des cartes pleine
                largeur (cf. le rendu tactile plus bas) : la table reprend une
                largeur de 100 % et une répartition automatique, sinon les
                largeurs de colonnes déclarées sur les `th` continueraient de
                s'appliquer à une cellule unique et rouvriraient le défilement
                horizontal qu'on vient de supprimer. */}
            <table style={{tableLayout:isMobile?"auto":"fixed",width:isMobile?"100%":"max-content",minWidth:"100%",borderCollapse:"separate",borderSpacing:"0 8px",fontSize:12,fontFamily:"var(--font-sans)"}}>
              {/* L'en-tête nomme dix-sept colonnes qui n'existent plus en
                  tactile : on le retire au lieu de le laisser flotter. */}
              <thead style={{position:"sticky",top:0,background:T.white,zIndex:10,display:isMobile?"none":undefined}}>
                <tr
                  style={{borderBottom:`1px solid ${T.border}`}}
                  onDragOver={(e) => {
                    if (!dragColId) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    const dragLeft = e.clientX - dragGrabOffset;
                    const dragRight = dragLeft + dragWidth;
                    const sourceIdx = columnOrder.indexOf(dragColId);
                    if (sourceIdx === -1) return;
                    // On parcourt les en-têtes des colonnes réordonnables
                    // (ils portent l'attribut data-col-id).
                    const cells = e.currentTarget.querySelectorAll("th[data-col-id]");
                    for (const th of cells) {
                      const cid = th.getAttribute("data-col-id");
                      if (!cid || cid === dragColId) continue;
                      const r = th.getBoundingClientRect();
                      const targetMid = r.left + r.width / 2;
                      const targetIdx = columnOrder.indexOf(cid);
                      if (targetIdx === -1) continue;
                      const movingRight = sourceIdx < targetIdx;
                      if (movingRight && dragRight >= targetMid) {
                        moveColRelative(dragColId, cid, false);
                        return;
                      }
                      if (!movingRight && dragLeft <= targetMid) {
                        moveColRelative(dragColId, cid, true);
                        return;
                      }
                    }
                  }}
                  onDrop={(e) => { e.preventDefault(); persistColumns(columnOrder); setDragColId(null); }}
                >
                  {/* Symbol : master checkbox quand >= 1 selectionne.
                      En-tête de la maquette : 12px Medium capitales, bloc entier
                      à 40 % d'opacité, colonne de 170 px. */}
                  <th style={{...TH,padding:"0 6px 0 12px",boxSizing:"border-box",textAlign:"left",opacity:0.4,whiteSpace:"nowrap",background:T.white,minWidth:182,width:182}}>
                    <span style={{display:"inline-flex",alignItems:"center",gap:8,height:22,verticalAlign:"middle"}}>
                      <span style={{width:22,height:22,display:"inline-flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                        {selectedIds.size > 0 && (
                          <input
                            type="checkbox"
                            checked={filteredTrades.length > 0 && filteredTrades.every(t => selectedIds.has(tradeKey(t)))}
                            onChange={(e) => {
                              if (e.target.checked) {
                                const next = new Set(selectedIds);
                                filteredTrades.forEach(t => next.add(tradeKey(t)));
                                setSelectedIds(next);
                              } else {
                                setSelectedIds(new Set());
                              }
                            }}
                            style={{cursor:"pointer",width:14,height:14,accentColor:T.text,margin:0,display:"block",verticalAlign:"middle"}}
                            onClick={(e)=>e.stopPropagation()}
                          />
                        )}
                      </span>
                      <span>{t("common.symbol")}</span>
                    </span>
                  </th>
                  {(() => {
                    const NUMERIC_COLS = new Set(["entry","exit","lots","volume","pnl","pnlPct","r","fees","netPnl"]);
                    const labels = {
                      asset:     { label: t("trades.colAsset") },
                      side:      { label: t("trades.colSide") },
                      entryDate: { label: t("trades.colEntryDate"), sorted: true },
                      entryTime: { label: t("trades.colEntryTime") },
                      entry:     { label: t("trades.colEntry") },
                      exitDate:  { label: t("trades.colExitDate") },
                      exitTime:  { label: t("trades.colExitTime") },
                      exit:      { label: t("trades.colExit") },
                      lots:      { label: t("trades.colLots") },
                      volume:    { label: t("trades.colVolume") },
                      pnl:       { label: t("trades.colPnL") },
                      pnlPct:    { label: t("trades.colPnLPct") },
                      r:         { label: "R" },
                      duration:  { label: t("trades.colDuration") },
                      // Nouvelles colonnes (activables via le bouton de config)
                      fees:      { label: "Frais" },
                      netPnl:    { label: "P&L net" },
                      strategy:  { label: "Stratégie" },
                      session:   { label: "Session" },
                      weekday:   { label: "Jour" },
                      account:   { label: t("addTrade.account") },
                    };
                    return columnOrder.filter(id => visibleColumns.includes(id) && !(embedded && HIDDEN_WHEN_EMBEDDED.includes(id))).map(id => {
                      const h = labels[id]; if (!h) return null;
                      const isDragging = dragColId === id;
                      return (
                        <th
                          key={id}
                          data-col-id={id}
                          draggable={!lockColumns}
                          onDragStart={lockColumns ? undefined : (e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            e.dataTransfer.setData("text/plain", id);
                            e.dataTransfer.effectAllowed = "move";
                            setDragColId(id);
                            setDragGrabOffset(e.clientX - rect.left);
                            setDragWidth(rect.width);
                          }}
                          onDragEnd={lockColumns ? undefined : () => { persistColumns(columnOrder); setDragColId(null); }}
                          title={lockColumns ? undefined : "Glisser pour réordonner"}
                          style={{
                            ...TH,
                            position: "relative",
                            padding: "0 6px",
                            boxSizing: "border-box",
                            textAlign: "left",
                            whiteSpace: "nowrap",
                            background: T.white,
                            minWidth: 100, width: 100,
                            cursor: lockColumns ? "default" : "grab",
                            opacity: isDragging ? 0.2 : 0.4,
                            userSelect: "none",
                          }}
                        >
                          {/* Poignée de réordonnancement, posée dans la GOUTTIÈRE entre
                              deux colonnes (left négatif) et non dans le padding : celui-ci
                              ne fait que 6 px alors que l'icône en mesure 11, elle mordait
                              donc sur le libellé. Elle n'apparaît qu'au survol de l'en-tête,
                              via `.tr4de-col-grip` (cf. globals.css) : au repos, rien ne
                              vient parasiter la ligne de titres. */}
                          {!lockColumns && (
                            <LucideGripVertical
                              className="tr4de-col-grip"
                              size={11}
                              strokeWidth={1.75}
                              style={{ position: "absolute", left: -5, top: "50%", transform: "translateY(-50%)", color: T.text }}
                            />
                          )}
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                            {h.label}
                            {h.sorted && <LucideArrowDown size={11} strokeWidth={1.75} />}
                          </span>
                        </th>
                      );
                    });
                  })()}
                  {/* Settings column header */}
                  <th style={{padding:"0 4px",textAlign:"right",background:T.white,width:32}}>
                    {!lockColumns && (
                    <button
                      aria-label="Configurer colonnes"
                      onClick={(e) => { e.stopPropagation(); setColumnsMenuOpen(v => !v); }}
                      style={{background: columnsMenuOpen ? "var(--color-hover-bg, #F0F0F0)" : "transparent",border:"none",padding:4,cursor:"pointer",color:T.textMut,display:"inline-flex",alignItems:"center",borderRadius:6,transition:"background .12s ease"}}
                      onMouseEnter={(e)=>{ if(!columnsMenuOpen) e.currentTarget.style.background="var(--color-hover-bg, #F0F0F0)" }}
                      onMouseLeave={(e)=>{ if(!columnsMenuOpen) e.currentTarget.style.background="transparent" }}
                    >
                      <LucideSlidersHorizontal size={14} strokeWidth={1.75} />
                    </button>
                    )}
                  </th>
                </tr>
              </thead>
              <tbody>
                {/* Filtres actifs mais aucun résultat : sans ce message, le tableau
                    vide se lit comme « je n'ai aucun trade » alors qu'il s'agit d'un
                    filtre. On donne la sortie dans la foulée. */}
                {filteredTrades.length === 0 && (
                  <tr>
                    <td colSpan={visibleColumns.length + 2} style={{padding:"32px 12px",textAlign:"center"}}>
                      <div style={{fontSize:14,color:T.textSub,marginBottom:12}}>{t("trades.noneForFilters")}</div>
                      <button
                        type="button"
                        onClick={() => { setSymbolFilter([]); setAccountFilter(""); setSideFilter(""); }}
                        style={{padding: "8px 16px",minHeight: 34, borderRadius:999,border:"none",
                                background:T.white,boxShadow:T.elevPill,color:T.text,
                                fontSize: 13,fontWeight:500,cursor:"pointer",fontFamily:"inherit"}}
                      >
                        {t("trades.clearFilters")}
                      </button>
                    </td>
                  </tr>
                )}
                {(() => {
                  const fmtTime = (v) => {
                    if (!v) return '—';
                    // Si c'est déjà une heure formatée "HH:MM" ou "HH:MM:SS"
                    if (/^\d{1,2}:\d{2}/.test(String(v))) return String(v);
                    // Sinon parser comme date
                    const d = new Date(v);
                    if (isNaN(d.getTime())) return '—';
                    return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
                  };
                  // Groupes triés puis découpés par page (cf. `pagedGroups`).
                  // Aplatir : pour chaque groupe → ligne parent (groupRow=true si N>1) + enfants si déplié
                  const rows = [];
                  for (const g of pagedGroups) {
                    const isGroup = g.children.length > 1;
                    const parentTrade = isGroup
                      ? { ...g.parent, _children: g.children, _groupKey: g.key, _groupPnl: g.pnlSum, _groupFees: g.feesSum, _groupNet: g.netSum, _groupQty: g.qtySum, _groupVolume: g.volSum }
                      : g.parent;
                    rows.push({ trade: parentTrade, isGroupParent: isGroup, isChild: false, groupKey: g.key, groupSize: g.children.length });
                    if (isGroup && expandedGroups.has(g.key)) {
                      for (let ci = 1; ci < g.children.length; ci++) {
                        rows.push({ trade: g.children[ci], isGroupParent: false, isChild: true, groupKey: g.key, groupSize: g.children.length });
                      }
                    }
                  }
                  // En mode embarqué : on borne le nombre de lignes visibles
                  // (maxRows) avec un bouton "voir plus / voir moins".
                  const rowsToShow = (maxRows != null && !embeddedShowAll) ? rows.slice(0, maxRows) : rows;
                  const mapped = rowsToShow.map(({ trade: t, isGroupParent, isChild, groupKey, groupSize }, i) => {
                  // Toutes les métriques dérivées (%, R, P&L net) sont calculées net de frais.
                  const rowNet = t._groupNet != null ? t._groupNet : netPnlOf(t);
                  const ret = ((rowNet/(t.entry*100))*100).toFixed(2);
                  const dateObj = new Date(t.date);
                  const openDate = dateObj.toLocaleDateString('fr-FR',{day:'2-digit',month:'short',year:'2-digit'});
                  const openTime = fmtTime(t.entryTime || t.entry_time);
                  const closeDate = openDate;
                  const closeTime = fmtTime(t.exitTime || t.exit_time);
                  const tKey = tradeKey(t);
                  // Pour un parent de groupe : la case est cochée seulement si
                  // TOUS les enfants du lot sont sélectionnés. Permet à la
                  // suppression en masse de viser le lot entier.
                  const groupChildKeys = isGroupParent && Array.isArray(t._children)
                    ? t._children.map(c => tradeKey(c))
                    : null;
                  const isChecked = isGroupParent
                    ? (groupChildKeys && groupChildKeys.length > 0 && groupChildKeys.every(k => selectedIds.has(k)))
                    : selectedIds.has(tKey);
                  const isHovered = hoveredRowId === tKey;
                  const isOpen = selectedTrade && tradeKey(selectedTrade) === tKey;
                  const showCheckbox = isChecked || isHovered;
                  // Coche/décoche la ligne (gère Shift+clic pour sélectionner une plage).
                  const onCheckboxClick = (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    const shouldCheck = !isChecked;
                    const next = new Set(selectedIds);
                    if (e.shiftKey && lastSelectedIndex != null && lastSelectedIndex !== i) {
                      const lo = Math.min(lastSelectedIndex, i);
                      const hi = Math.max(lastSelectedIndex, i);
                      for (let k = lo; k <= hi; k++) {
                        const r = rows[k];
                        if (!r || r.isChild) continue;
                        const rt = r.trade;
                        const rChildKeys = r.isGroupParent && Array.isArray(rt._children)
                          ? rt._children.map(c => tradeKey(c))
                          : null;
                        if (rChildKeys) {
                          if (shouldCheck) rChildKeys.forEach(kk => next.add(kk));
                          else rChildKeys.forEach(kk => next.delete(kk));
                        } else {
                          const rKey = tradeKey(rt);
                          if (shouldCheck) next.add(rKey); else next.delete(rKey);
                        }
                      }
                    } else if (isGroupParent && groupChildKeys) {
                      if (shouldCheck) groupChildKeys.forEach(k => next.add(k));
                      else groupChildKeys.forEach(k => next.delete(k));
                    } else {
                      if (shouldCheck) next.add(tKey); else next.delete(tKey);
                    }
                    setSelectedIds(next);
                    setLastSelectedIndex(i);
                  };
                  const selectedBg = "var(--color-hover-bg, #F0F0F0)";
                  const hoverBg = "var(--color-hover-bg, #F0F0F0)";
                  const openBg = "var(--color-hover-bg, #F0F0F0)";

                  /* ─── Rendu tactile ────────────────────────────────────────
                     Dix-sept colonnes ne tiennent pas sur 375 px. La réponse
                     habituelle — un défilement horizontal de 640 px de large —
                     est un tableau de bureau qu'on regarde par le trou d'une
                     serrure : on ne peut pas comparer deux lignes, on perd la
                     colonne qui identifie le trade dès le premier glissé, et le
                     geste horizontal entre en conflit avec le défilement de la
                     page.

                     Une ligne devient donc une CARTE, et l'on choisit : de quel
                     instrument il s'agit, dans quel sens, ce que ça a rapporté,
                     et quand. Le reste — frais, session, stratégie, prix
                     d'entrée et de sortie — est à un appui, dans le panneau de
                     détail qui existe déjà et qui s'ouvre en plein écran sur
                     téléphone.

                     Toutes les valeurs sont celles déjà calculées plus haut
                     pour le tableau : la carte ne recalcule rien, elle ne peut
                     donc pas diverger du bureau. */
                  if (isMobile) {
                    const qty = t._groupQty != null && t._groupQty > 0 ? t._groupQty : qtyOf(t);
                    const rTxt = fmtR(rMultiple({ ...t, pnl: rowNet }));
                    const tone = pnlColorFor(rowNet);
                    return (
                      <tr key={i}>
                        <td
                          colSpan={99}
                          onClick={() => {
                            const isSelectedDetail = selectedTrade && tradeKey(selectedTrade) === tKey;
                            setSelectedTrade(isSelectedDetail ? null : t);
                          }}
                          style={{
                            padding: 12,
                            borderRadius: 12,
                            background: isOpen || isChecked ? openBg : T.white,
                            cursor: "pointer",
                            /* Le retrait d'appui vit sur la cellule, pas sur la
                               rangée : un `<tr>` n'accepte ni rayon ni
                               transformation. */
                            transition: "background .12s ease",
                            paddingLeft: isChild ? 26 : 12,
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div style={{ minWidth: 0, flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                                <SymbolCell symbol={t.symbol} size={28} nameSize={14} />
                                <DirectionTag direction={t.direction} />
                                {isGroupParent && groupSize > 1 && (
                                  /* Un lot d'exécutions se signale par son
                                     compte : sans lui, deux cartes identiques
                                     s'expliqueraient mal. */
                                  <span style={{
                                    fontSize: 11, fontWeight: 500, color: T.textMut,
                                    background: FIELD_BG, borderRadius: 999, padding: "1px 7px",
                                    flexShrink: 0,
                                  }}>
                                    ×{groupSize}
                                  </span>
                                )}
                              </div>
                              <div style={{
                                fontSize: 12, color: T.textMut, fontVariantNumeric: "tabular-nums",
                                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                              }}>
                                {openDate}
                                {openTime !== "—" && ` · ${openTime}`}
                                {closeTime !== "—" && openTime !== "—" && ` → ${closeTime}`}
                                {qty != null && ` · ${qty} lot${qty > 1 ? "s" : ""}`}
                              </div>
                            </div>

                            {/* Le résultat à droite, en gros : c'est la seule
                                chose qu'on cherche en faisant défiler une liste
                                de trades. Le R sous lui, plus discret — c'est
                                une lecture de second temps. */}
                            <div style={{ textAlign: "right", flexShrink: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                              <div style={{
                                fontSize: 16, fontWeight: 600, color: tone,
                                fontVariantNumeric: "tabular-nums", letterSpacing: "-0.01em",
                              }}>
                                {rowNet >= 0 ? "+" : ""}{fmt(rowNet, false)}
                              </div>
                              <div style={{ fontSize: 12, color: T.textMut, fontVariantNumeric: "tabular-nums" }}>
                                {rTxt} · {ret > 0 ? "+" : ""}{ret}%
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  }

                  return (
                    <tr
                      key={i}
                      /* Ligne = carte de la maquette : fond blanc, coins 12 (posés
                         sur les td d'extrémité, un <tr> n'accepte pas le radius),
                         séparées par le borderSpacing du tableau et non par un filet. */
                      style={{
                        background: isOpen ? openBg : (isChecked ? selectedBg : (isHovered ? hoverBg : T.white)),
                        boxShadow: isOpen ? `inset 3px 0 0 0 ${T.text}` : "none",
                        cursor:"pointer",
                        transition:"background .12s ease, box-shadow .12s ease",
                      }}
                      onClick={()=>{
                        const isSelectedDetail = selectedTrade && tradeKey(selectedTrade) === tKey;
                        if(isSelectedDetail) {
                          setSelectedTrade(null);
                        } else {
                          setSelectedTrade(t);
                        }
                      }}
                      onMouseEnter={()=>setHoveredRowId(tKey)}
                      onMouseLeave={()=>setHoveredRowId(null)}
                    >
                      {/* Symbol : vignette ronde + nom/code (maquette 283:6806).
                          Le carré de 22 px qui porte le chevron de groupe ou la case
                          à cocher reste devant, à largeur fixe, pour que la vignette
                          ne se décale jamais au survol. */}
                      <td style={{padding:"12px 6px",boxSizing:"border-box",borderTopLeftRadius:12,borderBottomLeftRadius:12,color:T.text,minWidth:182,width:182, paddingLeft: isChild ? 34 : 12}}>
                        <span style={{display:"inline-flex",alignItems:"center",gap:8,verticalAlign:"middle"}}>
                          {!isChild && (
                            // Carré unique 22px : contient l'icône du symbole (ou le chevron de
                            // groupe) par défaut, et la case à cocher au survol/sélection. La
                            // largeur étant fixe, le texte ne se décale jamais.
                            <span style={{width:22,height:22,borderRadius:6,background:"transparent",display:"inline-flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                              {isGroupParent && !isChecked ? (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setExpandedGroups(prev => {
                                      const next = new Set(prev);
                                      if (next.has(groupKey)) next.delete(groupKey); else next.add(groupKey);
                                      return next;
                                    });
                                  }}
                                  aria-label={expandedGroups.has(groupKey) ? "Replier" : "Déplier"}
                                  style={{
                                    width: 22, height: 22, borderRadius: 6,
                                    background: "transparent", border: "none",
                                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                                    cursor: "pointer", color: T.textMut, flexShrink: 0, padding: 0,
                                    transform: expandedGroups.has(groupKey) ? "rotate(0deg)" : "rotate(-90deg)",
                                    transition: "transform .15s ease",
                                  }}
                                >
                                  <LucideChevronDown size={13} strokeWidth={2} />
                                </button>
                              ) : (isGroupParent || showCheckbox) ? (
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => {}}
                                  onClick={onCheckboxClick}
                                  style={{cursor:"pointer",width:14,height:14,accentColor:T.text,margin:0,display:"block",verticalAlign:"middle",flexShrink:0}}
                                />
                              ) : null}
                            </span>
                          )}
                          <SymbolCell symbol={t.symbol} />
                          {isGroupParent && (
                            <span style={{
                              fontSize: 10, fontWeight: 700, color: T.textSub,
                              padding: "1px 6px", borderRadius: 999,
                              background: T.bg, border: `1px solid ${T.border}`,
                            }}>
                              ×{groupSize}
                            </span>
                          )}
                        </span>
                      </td>
                      {(() => {
                        /* La maquette pose des boîtes de 88 px séparées par un gap
                           de 12. Un tableau n'a pas de `gap` : on répartit 6 px de
                           chaque côté (donc 12 entre deux contenus) et la boîte
                           passe à 100 px. `border-spacing` horizontal aurait laissé
                           passer le fond de la carte entre les cellules et cassé la
                           surbrillance de ligne. */
                        const tdBase = {
                          padding: "12px 6px", boxSizing: "border-box",
                          minWidth: 100, width: 100,
                          fontSize: 12, fontWeight: 500, lineHeight: 1,
                          color: T.textSub, textAlign: "left",
                          // En `table-layout: fixed`, un contenu trop long
                          // déborderait sur la colonne voisine.
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        };
                        const cellStyle = (_id, base) => base;
                        const duration = (() => {
                          const entry = t.entryTime || t.entry_time;
                          const exit = t.exitTime || t.exit_time;
                          if (!entry || !exit) return "—";
                          const toSec = (v) => {
                            const m = String(v).match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
                            if (!m) return null;
                            return (+m[1])*3600 + (+m[2])*60 + (+(m[3]||0));
                          };
                          const s1 = toSec(entry); const s2 = toSec(exit);
                          if (s1 === null || s2 === null) return "—";
                          let sec = s2 - s1;
                          if (sec < 0) sec += 24*3600;
                          if (Number.isNaN(sec)) return "—";
                          if (sec < 60) return `${sec}s`;
                          if (sec < 3600) return `${Math.floor(sec/60)}m`;
                          const h = Math.floor(sec/3600);
                          const mm = Math.floor((sec%3600)/60);
                          return mm === 0 ? `${h}h` : `${h}h${String(mm).padStart(2,"0")}`;
                        })();
                        // Helpers pour les nouvelles colonnes
                        // Pour un parent de groupe : on somme les frais/net des enfants.
                        const fees = t._groupFees != null ? t._groupFees : feesOf(t);
                        const netPnl = t._groupNet != null ? t._groupNet : netPnlOf(t);
                        const tk = tradeKey(t);
                        // Clés d'indexation communes au panneau de détail (notes + stratégies).
                        const idxKeys = indexKeysOf(t);
                        // Stratégie : le panneau stocke un TABLEAU d'ids de stratégies, réparti sur
                        // plusieurs clés. On fait l'union puis on affiche les noms correspondants.
                        const stratIds = Array.from(new Set(idxKeys.flatMap(k => tradeStrategies[k] || [])));
                        const stratNames = stratIds
                          .map(id => (strategies.find(x => x.id === id) || loadedStrategies.find(x => x.id === id))?.name)
                          .filter(Boolean);
                        const sessionLabel = (() => {
                          const v = t.entryTime || t.entry_time || "";
                          const m = String(v).match(/(\d{1,2}):/);
                          if (!m) return "—";
                          const h = +m[1];
                          if (h < 8) return "Asia";
                          if (h < 13) return "London";
                          if (h < 22) return "NY";
                          return "Asia";
                        })();
                        const weekdayLabel = (() => {
                          const d = new Date(t.date);
                          if (isNaN(d.getTime())) return "—";
                          return d.toLocaleDateString("fr-FR", { weekday: "short" });
                        })();
                        // Compte du trade (une ligne de groupe agrège des exécutions
                        // du même ordre : elles partagent leur compte).
                        const accountLabel = accountNameById.get(t.account_id) || "—";

                        /* Cellules de la maquette : 12px Medium, encre atténuée,
                           colonnes de 88 px, alignées à gauche comme l'en-tête.
                           Seuls P&L / % / R portent la couleur du résultat. */
                        const num = { fontVariantNumeric: "tabular-nums" };
                        const money = { ...num, fontWeight: 500 };
                        const cells = {
                          asset:     <td key="asset" style={cellStyle("asset",{...tdBase})}>Future</td>,
                          side:      <td key="side" style={cellStyle("side",{...tdBase,color:T.text})}><DirectionTag direction={t.direction} /></td>,
                          entryDate: <td key="entryDate" style={cellStyle("entryDate",{...tdBase})}>{openDate}</td>,
                          entryTime: <td key="entryTime" style={cellStyle("entryTime",{...tdBase,...num})}>{openTime}</td>,
                          entry:     <td key="entry" style={cellStyle("entry",{...tdBase,...money})}>${t.entry.toFixed(2)}</td>,
                          exitDate:  <td key="exitDate" style={cellStyle("exitDate",{...tdBase})}>{closeDate}</td>,
                          exitTime:  <td key="exitTime" style={cellStyle("exitTime",{...tdBase,...num})}>{closeTime}</td>,
                          exit:      <td key="exit" style={cellStyle("exit",{...tdBase,...money})}>${t.exit.toFixed(2)}</td>,
                          lots:      <td key="lots" style={cellStyle("lots",{...tdBase,...num,color:T.text})}>{(() => { const q = t._groupQty != null && t._groupQty > 0 ? t._groupQty : qtyOf(t); return q != null ? q : "—"; })()}</td>,
                          volume:    <td key="volume" style={cellStyle("volume",{...tdBase,...num})}>{(() => { const v = t._groupVolume != null && t._groupVolume > 0 ? t._groupVolume : volOf(t); return v != null ? fmt(v, false) : "—"; })()}</td>,
                          pnl:       (() => { const p = t._groupPnl != null ? t._groupPnl : t.pnl; return <td key="pnl" style={cellStyle("pnl",{...tdBase,...money,color:pnlColorFor(rowNet)})}>{p>=0?"+":""}{fmt(p,false)}{tradeOutcome(rowNet)==="be"?" BE":""}</td>; })(),
                          pnlPct:    <td key="pnlPct" style={cellStyle("pnlPct",{...tdBase,...money,color:pnlColorFor(rowNet)})}>{ret>0?"+":""}{ret}%</td>,
                          r:         <td key="r" style={cellStyle("r",{...tdBase,...money,color:pnlColorFor(rowNet),whiteSpace:"nowrap"})}>{fmtR(rMultiple({...t, pnl: rowNet}))}</td>,
                          duration:  <td key="duration" style={cellStyle("duration",{...tdBase,...num})}>{duration}</td>,
                          // Nouvelles cellules
                          fees:      <td key="fees" style={cellStyle("fees",{...tdBase,...money})}>{fees > 0 ? `$${fees.toFixed(2)}` : "—"}</td>,
                          netPnl:    <td key="netPnl" style={cellStyle("netPnl",{...tdBase,...money,color:pnlColorFor(netPnl)})}>{netPnl>=0?"+":""}{fmt(netPnl,false)}{tradeOutcome(netPnl)==="be"?" BE":""}</td>,
                          strategy:  <td key="strategy" style={cellStyle("strategy",{...tdBase,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"})}>{stratNames.length ? stratNames.join(", ") : "—"}</td>,
                          session:   <td key="session" style={cellStyle("session",{...tdBase})}>{sessionLabel}</td>,
                          weekday:   <td key="weekday" style={cellStyle("weekday",{...tdBase,textTransform:"capitalize"})}>{weekdayLabel}</td>,
                          account:   <td key="account" title={accountLabel !== "—" ? accountLabel : undefined} style={cellStyle("account",{...tdBase,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"})}>{accountLabel}</td>,
                        };
                        return columnOrder.filter(id => visibleColumns.includes(id) && !(embedded && HIDDEN_WHEN_EMBEDDED.includes(id))).map(id => cells[id] || null);
                      })()}
                      {/* Cellule vide pour aligner avec le header settings */}
                      <td style={{padding:"12px 12px 12px 6px",width:32,borderTopRightRadius:12,borderBottomRightRadius:12}} />
                    </tr>
                  );
                });
                if (maxRows != null && rows.length > maxRows) {
                  const hidden = rows.length - maxRows;
                  mapped.push(
                    <tr key="__showmore">
                      <td colSpan={visibleColumns.length + 2} style={{padding:0}}>
                        <button
                          onClick={() => setEmbeddedShowAll(v => !v)}
                          aria-label={embeddedShowAll ? t("trades.voirMoins") : t("trades.voirPlus").replace("{n}", String(hidden))}
                          style={{width:"100%",padding:"4px 0",background:"transparent",border:"none",borderTop:`1px solid ${T.border}`,cursor:"pointer",color:T.textMut,display:"flex",alignItems:"center",justifyContent:"center"}}
                          onMouseEnter={(e)=>(e.currentTarget.style.color=T.text)}
                          onMouseLeave={(e)=>(e.currentTarget.style.color=T.textMut)}
                        >
                          {embeddedShowAll
                            ? <LucideX size={14} strokeWidth={2} />
                            : <LucidePlus size={14} strokeWidth={2} />}
                        </button>
                      </td>
                    </tr>
                  );
                }
                return mapped;
                })()}
              </tbody>
            </table>
          </div>

          {/* PAGINATION — sous le tableau, dans la même carte. Absente en mode
              embarqué (le journal utilise son bouton « voir plus »). */}
          {paginated && sortedGroups.length > 0 && (
            <TradesPagination
              pageIndex={pageIndex}
              pageCount={pageCount}
              pageSize={pageSize}
              total={sortedGroups.length}
              onPage={setPageIndex}
              onPageSize={changePageSize}
            />
          )}
        </div>

        {/* RIGHT - DETAIL PANEL WITH TABS.
            Mobile : rendu via un portal (plein écran) pour échapper au bloc englobant
            créé par l'animation .anim-1 (transform résiduel), sinon le fixed serait confiné. */}
        {selectedTrade && (() => {
          // Mode embarqué (journal) : panneau "Trade info" plus compact
          // (paddings et marges verticales réduits). Le même panneau, plus dense.
          const compact = embedded;
          const panel = (
          <div ref={tradeSideRef} className="tr4de-trade-side" style={{...CARD,padding:0,width:360,maxHeight:"calc(100vh - 200px)",display:"flex",flexDirection:"column"}}>

            {/* EN-TÊTE — plus de titre : « Trade info » nommait ce que le
                contenu montre déjà (l'instrument, le sens, le P&L sont juste
                dessous). Ne reste que la fermeture, seule commande de la barre ;
                le filet disparaît avec le titre — il séparait deux blocs, il n'y
                en a plus qu'un. */}
            <div style={{padding:compact?"8px 14px 0":"12px 16px 0",display:"flex",justifyContent:"flex-end",alignItems:"center",flexShrink:0}}>
              <button onClick={()=>setSelectedTrade(null)} aria-label={t("trades.detail.close")}
                style={{width: 34,height: 34,borderRadius:999,background:"transparent",border:"none",cursor:"pointer",color:T.textSub,
                        display:"inline-flex",alignItems:"center",justifyContent:"center",flexShrink:0,
                        transition:"background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out)"}}
                onMouseEnter={(e)=>{e.currentTarget.style.background=FIELD_BG;e.currentTarget.style.color=T.text;}}
                onMouseLeave={(e)=>{e.currentTarget.style.background="transparent";e.currentTarget.style.color=T.textSub;}}>
                <LucideX size={16} strokeWidth={1.75} />
              </button>
            </div>

            {/* CONTENU — les sections ne sont plus séparées par des traits mais
                par l'espace, comme les cartes du détail d'un compte. */}
            <div style={{flex:1,overflow:"auto",display:"flex",flexDirection:"column",gap:compact?18:22,padding:compact?"8px 16px 18px":"10px 18px 22px"}}>

              {/* INFOS */}
              {(() => {
                const dirRaw = String(selectedTrade.direction || "").toUpperCase();
                const isLong = dirRaw.includes("LONG") || dirRaw === "BUY";
                const entryTime = selectedTrade.entryTime || selectedTrade.entry_time || "";
                const exitTime = selectedTrade.exitTime || selectedTrade.exit_time || "";
                const rVal = rMultiple({ ...selectedTrade, pnl: netPnlOf(selectedTrade) });
                const fmtDate = (d) => { if (!d) return "—"; const dt = new Date(d); return isNaN(dt.getTime()) ? String(d) : dt.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }); };
                const pnlVal = Number(selectedTrade.pnl) || 0; // déjà net de frais
                const outcome = tradeOutcome(pnlVal);
                const isBe = outcome === "be";
                const pnlColor = pnlColorFor(pnlVal);
                const dateTime = fmtDate(selectedTrade.date);
                const tradeNote = computeTradeNote(selectedTrade);
                return (
                <>
                  {/* HERO — données automatiques (P&L mis en avant).
                      L'instrument passe par la même vignette que le tableau
                      (`SymbolCell`) et le sens par la même pastille
                      (`DirectionTag`) : le panneau et la ligne qu'il détaille
                      montraient jusqu'ici deux représentations du même trade. */}
                  <div style={{order:-2,display:"flex",flexDirection:"column",gap:compact?10:14}}>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,flexWrap:"wrap"}}>
                      <SymbolCell symbol={selectedTrade.symbol} size={32} nameSize={15} />
                      <span style={{display:"inline-flex",alignItems:"center",gap:6,flexShrink:0}}>
                        <DirectionTag direction={isLong ? "long" : "short"} />
                        {isBe && (
                          <span style={{display:"inline-flex",alignItems:"center",justifyContent:"center",padding:"2px 12px",borderRadius:48,fontSize:14,lineHeight:"17.05px",background:FIELD_BG,color:T.textSub}}>
                            BE
                          </span>
                        )}
                      </span>
                    </div>

                    {/* P&L héro + R-multiple. Graisse 500 comme les montants
                        héros de la DA ; la couleur, elle, reste porteuse de
                        sens (gain / perte). */}
                    <div style={{display:"flex",alignItems:"baseline",gap:8,flexWrap:"wrap"}}>
                      <span style={{fontSize:compact?26:32,fontWeight:500,letterSpacing:-0.4,color:pnlColor,lineHeight:1}}>{pnlVal>=0?"+":""}{fmt(pnlVal,true)}</span>
                      {rVal != null && Number.isFinite(rVal) && (
                        <span style={{fontSize:14,fontWeight:500,color:pnlColor,opacity:0.75,letterSpacing:-0.1}}>{fmtR(rVal)}</span>
                      )}
                    </div>

                    {/* Ce que le trade dit de lui-même, en lignes
                        « libellé → valeur » comme les cartes de statistiques. */}
                    <div style={{display:"flex",flexDirection:"column",gap:compact?7:9}}>
                      <StatRow label="Date" value={dateTime} />
                      <StatRow label="Heure d'entrée" value={entryTime || "—"} />
                      <StatRow label="Heure de sortie" value={exitTime || "—"} />
                      <StatRow label="Note" value={tradeNote ? `${tradeNote.score}/10` : "—"} color={tradeNote ? tradeNote.color : T.textSub} />
                    </div>
                  </div>

                  {/* UNITÉ DE TEMPS (timeframe d'analyse) — sélection unique.
                      Le seul segmenté qui garde sa piste grise et sa mise en
                      page locale, pour deux raisons : il vit DANS la carte
                      blanche du panneau (sans piste, le bloc de l'actif serait
                      blanc sur blanc), et ses items sont à largeur égale
                      (`flex: 1`), ce que `PeriodPills` ne fait pas — elle
                      dimensionne chaque pastille sur son libellé. */}
                  <div style={{display:"flex",flexDirection:"column",gap:compact?8:10}}>
                    <FieldLabel>Unité de temps</FieldLabel>
                    <div role="radiogroup" aria-label="Unité de temps" style={{display:"flex",gap:2,padding:3,background:T.segmentTrack,borderRadius:999}}>
                      {TIMEFRAME_OPTIONS.map((opt)=>{
                        const active = (tradeTimeframe[selectedTrade.id] || "") === opt;
                        return (
                          <button key={opt} type="button" role="radio" aria-checked={active} aria-label={opt} onClick={()=>setTimeframeFor(selectedTrade, opt)}
                            style={{minHeight: 34,
                              flex:1,padding:"6px 0",borderRadius:999,border:"none",
                              background:active?T.white:"transparent",
                              color:active?T.text:T.textSub,
                              fontSize:12,fontWeight:500,cursor:"pointer",fontFamily:"inherit",
                              boxShadow:active?T.elevPill:"none",
                              transition:"color var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out)",
                            }}>
                            {opt}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* ENTRÉE — type d'entrée (multi-sélection) */}
                  <div style={{display:"flex",flexDirection:"column",gap:compact?8:10}}>
                    <FieldLabel>Entrée</FieldLabel>
                    <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                      {allEntryTags.map((tag)=>(
                        <CheckChip
                          key={tag.id}
                          label={tag.label}
                          color={tag.color}
                          checked={(tradeEntryTags[selectedTrade.id] || []).includes(tag.id)}
                          onClick={()=>toggleEntryTag(selectedTrade, tag.id)}
                        />
                      ))}
                    </div>
                  </div>

                  {/* EMOTION TAGS — menu déroulant multi-sélection */}
                  <div style={{display:"flex",flexDirection:"column",gap:compact?8:10}} key={`emotion-${selectedTrade.date}-${selectedTrade.symbol}-${selectedTrade.entry}`}>
                    <FieldLabel>{t("trades.detail.emotionTags")}</FieldLabel>
                    <TagMultiSelect
                      placeholder={t("trades.detail.emotionTags")}
                      allTags={allEmotionTags}
                      selected={emotionTags[selectedTrade.id] || []}
                      onToggle={(id)=>toggleEmotion(selectedTrade, id)}
                    />
                  </div>


                  {/* SCREENSHOT — placé sous les tags d'erreurs */}
                  {(() => {
                    const tradeId = selectedTrade.id;
                    const url = screenshotUrls[tradeId];
                    const handleFile = async (file) => {
                      if (!file || !file.type?.startsWith("image/")) return;
                      setScreenshotBusy(true);
                      try { await uploadScreenshot(tradeId, file); }
                      finally { setScreenshotBusy(false); }
                    };
                    const extractImageFromClipboard = (e) => {
                      const items = e.clipboardData?.items;
                      if (!items) return null;
                      for (const it of items) {
                        if (it.kind === "file" && it.type?.startsWith("image/")) {
                          const f = it.getAsFile();
                          if (f) return f;
                        }
                      }
                      return null;
                    };
                    return (
                      <div style={{display:"flex",flexDirection:"column",gap:compact?8:10}}>
                        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
                          <FieldLabel>Screenshot</FieldLabel>
                          {url && (
                            <div style={{display:"inline-flex",alignItems:"center",gap:2}}>
                              <label
                                style={{padding:"2px 6px",fontSize:12,fontWeight:500,color:T.text,opacity:0.5,background:"transparent",border:"none",cursor:screenshotBusy?"not-allowed":"pointer",fontFamily:"inherit"}}>
                                {t("trades.detail.modify")}
                                <input type="file" accept="image/*" disabled={screenshotBusy}
                                  onChange={async (e) => {
                                    const f = e.target.files?.[0]; if (!f) { return; }
                                    setScreenshotBusy(true);
                                    try { await removeScreenshot(tradeId); await uploadScreenshot(tradeId, f); }
                                    finally { setScreenshotBusy(false); e.target.value = ""; }
                                  }}
                                  style={{display:"none"}} />
                              </label>
                              <button type="button" onClick={async () => { setScreenshotBusy(true); try { await removeScreenshot(tradeId); } finally { setScreenshotBusy(false); } }}
                                disabled={screenshotBusy}
                                style={{padding: "2px 6px",fontSize:12,fontWeight:500,color:T.red,background:"transparent",border:"none",cursor:screenshotBusy?"not-allowed":"pointer",fontFamily:"inherit"}}>
                                {t("trades.detail.delete")}
                              </button>
                            </div>
                          )}
                        </div>
                        {url ? (
                          <button type="button" onClick={() => setLightboxUrl(url)}
                            style={{display:"block",width:"100%",padding:0,border:"none",borderRadius:12,overflow:"hidden",background:FIELD_BG,cursor:"zoom-in",fontFamily:"inherit"}}>
                            <img src={url} alt="Trade screenshot" style={{display:"block",width:"100%",maxHeight:320,objectFit:"contain"}} />
                          </button>
                        ) : (
                          /* Zone de dépôt : le pointillé est ce qui la signale
                             comme telle, on le garde — mais dilué comme les
                             autres traits du panneau. */
                          <label
                            tabIndex={0}
                            onPaste={async (e) => {
                              const f = extractImageFromClipboard(e);
                              if (f) { e.preventDefault(); await handleFile(f); }
                            }}
                            onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = T.text; }}
                            onDragLeave={(e) => { e.currentTarget.style.borderColor = HAIRLINE; }}
                            onDrop={async (e) => {
                              e.preventDefault();
                              e.currentTarget.style.borderColor = HAIRLINE;
                              const f = e.dataTransfer.files?.[0];
                              if (f) await handleFile(f);
                            }}
                            style={{
                              display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:10,
                              padding:compact?"16px":"26px 16px",border:`1.5px dashed ${HAIRLINE}`,borderRadius:12,
                              cursor:screenshotBusy?"not-allowed":"pointer",background:FIELD_BG,
                              color:T.textSub,fontSize:12,fontWeight:500,
                              outline: "none",
                              transition:"border-color var(--dur-fast) var(--ease-out)",
                            }}>
                            <span style={{width:40,height:40,borderRadius:"50%",background:T.white,boxShadow:T.elevPill,display:"inline-flex",alignItems:"center",justifyContent:"center"}}>
                              <LucideImage size={18} strokeWidth={1.75} color={T.textSub} />
                            </span>
                            <span style={{fontSize:12,fontWeight:500,color:T.textSub}}>{screenshotBusy ? t("trades.detail.uploading") : t("trades.detail.dragImage")}</span>
                            <input type="file" accept="image/*" disabled={screenshotBusy}
                              onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; await handleFile(f); e.target.value = ""; }}
                              style={{display:"none"}} />
                          </label>
                        )}
                      </div>
                    );
                  })()}

                  {/* NOTES (manuel) */}
                  <div style={{display:"flex",flexDirection:"column",gap:compact?8:10}}>
                    <FieldLabel>Notes</FieldLabel>
                    <textarea
                      placeholder={t("trades.notePlaceholder")}
                      value={tradeNotes[noteKeyOf(selectedTrade)] ?? tradeNotes[selectedTrade.id] ?? ""}
                      onChange={(e)=>{
                        const key = noteKeyOf(selectedTrade);
                        if (!key) return;
                        const updated = {...tradeNotes, [key]: e.target.value};
                        setTradeNotes(updated);
                        localStorage.setItem("tr4de_trade_notes", JSON.stringify(updated));
                        persistNote(key, e.target.value);
                      }}
                      /* Même zone d'écriture que les notes du journal : pas de
                         cadre — la carte est déjà une surface — et un aplat
                         exprimé en transparence d'encre. */
                      style={{
                        flex:1,
                        minHeight:compact?90:120,
                        border:"none",
                        borderRadius:10,
                        padding:"14px 16px",
                        fontSize:13,
                        lineHeight:1.55,
                        fontFamily:"var(--font-sans)",
                        color:T.text,
                        background:WRITING_BG,
                        resize:"none",
                        outline:"none"
                      }}
                    />
                  </div>
                </>
                );
              })()}

              {/* STRATÉGIE */}
              {(() => {
                const tradeId = selectedTrade.date + selectedTrade.symbol + selectedTrade.entry;
                // Toutes les clés sous lesquelles ce trade peut être indexé (l'import en crée 3) :
                // UUID Supabase, composite, composite normalisé. On les met TOUTES à jour pour
                // éviter qu'une stratégie reste fantôme via une clé non nettoyée.
                // Inclut les clés de TOUS les trades du groupe (si groupé) pour appliquer en bloc
                const allTrades = childrenOf(selectedTrade);
                const tradeKeys = Array.from(new Set(
                  allTrades.flatMap(tr => [
                    tr.id,
                    `${tr.date || ""}${tr.symbol || ""}${tr.entry ?? ""}`,
                    (tr.date && tr.symbol && tr.entry != null)
                      ? `${tr.date}${tr.symbol}${parseFloat(tr.entry).toFixed(2)}`
                      : null,
                  ]).filter(Boolean).map(String)
                ));
                // Source de vérité pour l'UI : union de toutes les stratégies trouvées sur n'importe quelle clé
                const selectedIds = Array.from(new Set(tradeKeys.flatMap(k => tradeStrategies[k] || [])));
                
                // Calculate total rules checked across all selected strategies
                const allSelectedStrats = effectiveStrategies.filter(s => selectedIds.includes(s.id));
                const totalRulesCount = allSelectedStrats.reduce((sum, s) => sum + (s.groups?.flatMap(g => g.rules) || []).length, 0);
                const totalCheckedCount = allSelectedStrats.reduce((sum, s) => {
                  const rulesForStrat = (s.groups?.flatMap(g => g.rules) || []);
                  const checkedInStrat = rulesForStrat.filter(r => {
                    const key = `${selectedTrade.date}_${selectedTrade.symbol}_${selectedTrade.entry}_${selectedTrade.exit}_${selectedTrade.direction}_${s.id}_${r.id}`;
                    return checkedRules[key];
                  }).length;
                  return sum + checkedInStrat;
                }, 0);
                const progressPercent = totalRulesCount > 0 ? (totalCheckedCount / totalRulesCount) * 100 : 0;
                
                return (
                  <div style={{order:-1,display:"flex",flexDirection:"column",gap:compact?8:10}}>
                    <FieldLabel>Stratégie</FieldLabel>
                    {allSelectedStrats.length === 0 ? (
                      <>
                        <div style={{position:"relative",width:"100%",display:"flex"}}>
                          <button
                            onClick={()=>setShowStrategyDropdown(!showStrategyDropdown)}
                            style={{
                              width:"100%",
                              minHeight: 34, padding: "8px 16px",
                              borderRadius:999,
                              border:"none",
                              background:FIELD_BG,
                              fontSize: 13,
                              fontWeight:500,
                              color:T.text,
                              cursor:"pointer",
                              display:"flex",
                              alignItems:"center",
                              justifyContent:"center",
                              gap:6,
                              transition:"background var(--dur-fast) var(--ease-out)",
                              fontFamily:"var(--font-sans)",
                            }}
                            onMouseEnter={(e)=>{e.currentTarget.style.background=HAIRLINE}}
                            onMouseLeave={(e)=>{e.currentTarget.style.background=FIELD_BG}}
                          >
                            <LucidePlus size={14} strokeWidth={1.75} />
                            {t("trades.detail.addStrategy")}
                          </button>

                          {/* STRATEGY DROPDOWN */}
                          {showStrategyDropdown && (
                            <div style={{
                              position:"absolute",
                              top:"100%",
                              left:0,
                              right:0,
                              marginTop:6,
                              background:T.white,
                              border:"none",
                              borderRadius:12,
                              boxShadow:"var(--elev-overlay)",
                              padding:6,
                              zIndex:100,
                              maxHeight:240,
                              overflowY:"auto"
                            }}>
                              {effectiveStrategies.length === 0 ? (
                                <div style={{padding:12,textAlign:"center",fontSize:12,color:T.textSub}}>{t("trades.detail.noStrategy")}</div>
                              ) : (
                                strategiesByUsage.map(strat=>{
                                  const isSelected = selectedIds.includes(strat.id);
                                  const tradeCount = strategyTradeCounts[strat.id] || 0;
                                  return (
                                    <button key={strat.id} onClick={()=>{
                                      // Mise à jour cohérente sur TOUTES les clés du trade
                                      const newTradeStrategies = {...tradeStrategies};
                                      tradeKeys.forEach(k => {
                                        const current = newTradeStrategies[k] || [];
                                        const updated = isSelected
                                          ? current.filter(id => id !== strat.id)
                                          : (current.includes(strat.id) ? current : [...current, strat.id]);
                                        newTradeStrategies[k] = updated;
                                      });
                                      setTradeStrategies(newTradeStrategies);
                                      setShowStrategyDropdown(false);
                                    }} style={{width:"100%",padding: "8px 10px",borderRadius:8,background:isSelected?FIELD_BG:"transparent",border:"none",cursor:"pointer",textAlign:"left",display:"flex",alignItems:"center",gap:8,fontFamily:"inherit",transition:"background var(--dur-fast) var(--ease-out)"}}
                                      onMouseEnter={(e)=>{if(!isSelected) e.currentTarget.style.background=FIELD_BG;}}
                                      onMouseLeave={(e)=>{if(!isSelected) e.currentTarget.style.background="transparent";}}>
                                    <div style={{width:8,height:8,borderRadius:"50%",flexShrink:0,background:strat.color}}/>
                                    {/* Le nom et son sous-titre étaient rendus à 9 px :
                                        illisibles. Ils reprennent l'échelle des listes
                                        de la DA (13 px / 12 px atténué). */}
                                    <div style={{flex:1,minWidth:0}}>
                                      <div style={{fontSize:13,fontWeight:500,color:T.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{strat.name}</div>
                                      <div style={{fontSize:12,color:T.text,opacity:0.5,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t("trades.detail.groupCount").replace("{n}", String(strat.groups?.length || 0))}{tradeCount > 0 ? ` · ${tradeCount} trade${tradeCount > 1 ? "s" : ""}` : ""}</div>
                                    </div>
                                    {isSelected && <LucideCheck size={14} strokeWidth={2} color={T.text} style={{flexShrink:0}} />}
                                    </button>
                                  );
                                })
                              )}
                            </div>
                          )}
                        </div>
                      </>
                    ) : null}

                    {/* SELECTED STRATEGIES DETAILS */}
                    {(() => {
                      const selectedStrats = effectiveStrategies.filter(s => selectedIds.includes(s.id));
                      return selectedStrats.length > 0 ? (
                        <div style={{width:"100%",display:"flex",flexDirection:"column",gap:18}}>
                          {selectedStrats.map((strat,idx)=>{
                            const allRules = strat.groups.flatMap(g=>g.rules);
                            const checkedCount = allRules.filter(r=>{
                              const key = `${selectedTrade.date}_${selectedTrade.symbol}_${selectedTrade.entry}_${selectedTrade.exit}_${selectedTrade.direction}_${strat.id}_${r.id}`;
                              return checkedRules[key];
                            }).length;
                            const stratProgressPercent = allRules.length > 0 ? (checkedCount / allRules.length) * 100 : 0;
                            return (
                              <div key={strat.id} style={{display:"flex",flexDirection:"column",gap:12}}>
                                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                                    <div style={{width:8,height:8,borderRadius:"50%",flexShrink:0,background:strat.color}}/>
                                    <div style={{fontSize:13,fontWeight:600,color:T.text,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{strat.name}</div>
                                    <StratMenu
                                      open={openStratMenuId === strat.id}
                                      onToggle={()=>setOpenStratMenuId(openStratMenuId===strat.id?null:strat.id)}
                                      onClose={()=>setOpenStratMenuId(null)}
                                      onDetach={(thenPick)=>{
                                        // Retirer la stratégie de TOUTES les clés du trade
                                        const newTradeStrategies = {...tradeStrategies};
                                        tradeKeys.forEach(k => {
                                          const current = newTradeStrategies[k] || [];
                                          newTradeStrategies[k] = current.filter(id => id !== strat.id);
                                        });
                                        setTradeStrategies(newTradeStrategies);
                                        localStorage.setItem("tr4de_trade_strategies", JSON.stringify(newTradeStrategies));
                                        setOpenStratMenuId(null);
                                        if (thenPick) setShowStrategyDropdown(true);
                                      }}
                                    />
                                  </div>
                                  {/* AVANCEMENT — libellé à gauche, compte à droite,
                                      comme les lignes de statistiques ; la piste
                                      reprend l'aplat des autres contrôles. */}
                                  <div style={{display:"flex",flexDirection:"column",gap:6}}>
                                    <StatRow label="Règles suivies" value={`${checkedCount}/${allRules.length}`} />
                                    <div style={{width:"100%",height:6,background:FIELD_BG,borderRadius:999,overflow:"hidden"}}>
                                      <div style={{height:"100%",borderRadius:999,background:T.text,width:`${stratProgressPercent}%`,transition:"width var(--dur-base) var(--ease-out)"}}/>
                                    </div>
                                  </div>
                                </div>

                                <div style={{display:"flex",flexDirection:"column",gap:14}}>
                                  {strat.groups.map(group=>(
                                    <div key={group.id} style={{display:"flex",flexDirection:"column",gap:8}}>
                                      <FieldLabel>{group.name}</FieldLabel>
                                      <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                                        {group.rules.map(rule=>{
                                          const ruleKey = `${selectedTrade.date}_${selectedTrade.symbol}_${selectedTrade.entry}_${selectedTrade.exit}_${selectedTrade.direction}_${strat.id}_${rule.id}`;
                                          const isChecked = checkedRules[ruleKey] || false;
                                          return (
                                            <CheckChip
                                              key={rule.id}
                                              label={rule.text}
                                              checked={isChecked}
                                              onClick={()=>setCheckedRules({...checkedRules,[ruleKey]:!isChecked})}
                                            />
                                          );
                                        })}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : null;
                    })()}
                  </div>
                );
              })()}

            </div>

          </div>
          );
          return isMobile ? ReactDOM.createPortal(panel, document.body) : panel;
        })()}

      </div>

      {/* CONFIRM DELETE MODAL */}
      {confirmDeleteOpen && (
        <DAModal
          title={t("trades.deleteConfirm").replace("{n}", String(selectedIds.size)).replace("{s}", selectedIds.size > 1 ? "s" : "")}
          onClose={() => { if (!isDeletingTrades) setConfirmDeleteOpen(false); }}
          width={420}
          draggable={false}
          scrim
          footer={<>
            <DAPillButton onClick={()=>setConfirmDeleteOpen(false)} disabled={isDeletingTrades}>
              {t("common.cancel")}
            </DAPillButton>
            <DAPillButton
              variant="primary"
              disabled={isDeletingTrades}
              style={isDeletingTrades ? undefined : {background:T.red,color:T.onSolid}}
              onClick={async ()=>{
                setIsDeletingTrades(true);
                try {
                  const tradesToDelete = filteredTrades.filter(t => selectedIds.has(tradeKey(t)));
                  for (const t of tradesToDelete) {
                    if (onDeleteTrade) await onDeleteTrade(t);
                  }
                  setSelectedIds(new Set());
                } catch (e) { console.error("delete trades failed:", e); }
                finally {
                  setIsDeletingTrades(false);
                  setConfirmDeleteOpen(false);
                }
              }}>
              {isDeletingTrades ? t("trades.deleting") : t("common.delete")}
            </DAPillButton>
          </>}>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <div style={{width:36,height:36,borderRadius:10,background:T.redBg,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
              <LucideTrash2 size={16} strokeWidth={1.75} color={T.red}/>
            </div>
            <div style={{fontSize:14,fontWeight:600,color:T.text,letterSpacing:-0.1}}>
              {t("trades.deleteConfirm").replace("{n}", String(selectedIds.size)).replace("{s}", selectedIds.size > 1 ? "s" : "")}
            </div>
          </div>
          <div style={{fontSize:13,color:T.text,opacity:0.6,lineHeight:1.55}}>
            {t("trades.deleteWarning")}
          </div>
        </DAModal>
      )}

      {/* BOTTOM ACTION BAR (visible quand au moins 1 trade selectionne) */}
      {selectedIds.size > 0 && (
        <div style={{
          position:"fixed",
          bottom:24,
          left:"50%",
          transform:"translateX(-50%)",
          maxWidth:"calc(100vw - 24px)",
          background:T.white,
          color:T.text,
          borderRadius:"var(--radius-card)",
          padding:"10px 14px",
          display:"flex",
          alignItems:"center",
          flexWrap:"wrap",
          justifyContent:"center",
          gap:14,
          fontFamily:"var(--font-sans)",
          fontSize:13,
          border:"none",
          boxShadow:"var(--elev-overlay)",
          zIndex:100,
        }}>
          <span style={{fontWeight:600}}>
            {t("trades.selected").replace("{n}", String(selectedIds.size)).replace(/\{s\}/g, selectedIds.size > 1 ? "s" : "")}
          </span>

          <span style={{width:1,height:18,background:T.border}} />

          {/* Ajouter une strategie */}
          <div ref={bulkStrategyAnchor} style={{position:"relative"}}>
            <button
              onClick={() => setShowBulkStrategyDropdown(v => !v)}
              aria-haspopup="menu"
              aria-expanded={showBulkStrategyDropdown}
              style={{background:"transparent",border:"none",color:T.text,fontSize:13,fontWeight:500,cursor:"pointer",fontFamily:"inherit",padding: "4px 8px",borderRadius:6,display:"inline-flex",alignItems:"center",gap:4}}
              onMouseEnter={(e)=>{e.currentTarget.style.background="var(--color-hover-bg, #F0F0F0)"}}
              onMouseLeave={(e)=>{e.currentTarget.style.background="transparent"}}
            >
              {t("trades.addStrategy")}
            </button>
            <Popover
              anchorRef={bulkStrategyAnchor}
              open={showBulkStrategyDropdown}
              onClose={() => setShowBulkStrategyDropdown(false)}
              minWidth={200}
              maxHeight={240}
              role="menu"
              style={{
                background:T.white,
                color:T.text,
                border:"none",
                borderRadius:10,
                boxShadow:"var(--elev-overlay)",
                padding:4,
              }}
            >
              <>
                {(strategiesByUsage && strategiesByUsage.length > 0) ? strategiesByUsage.map(s => (
                  <button
                    key={s.id}
                    onClick={() => {
                      // Assigne la stratégie à TOUS les trades sélectionnés.
                      // On retrouve chaque trade via sa tradeKey (contenu de selectedIds)
                      // puis on ajoute l'id de stratégie (en TABLEAU) sur toutes ses
                      // clés d'indexation — cohérent avec le panneau de détail et la
                      // sync cloud trade_strategies (qui attend des tableaux d'ids).
                      const next = {...tradeStrategies};
                      const selectedTrades = (trades || []).filter(tr => selectedIds.has(tradeKey(tr)));
                      selectedTrades.forEach(tr => {
                        indexKeysOf(tr).forEach(k => {
                          const cur = next[k] || [];
                          if (!cur.includes(s.id)) next[k] = [...cur, s.id];
                        });
                      });
                      setTradeStrategies(next);
                      setShowBulkStrategyDropdown(false);
                      setSelectedIds(new Set());
                    }}
                    style={{display:"flex",alignItems:"center",gap:8,width:"100%",padding: "8px 10px",border:"none",background:"transparent",cursor:"pointer",fontFamily:"inherit",fontSize:13,fontWeight:500,color:T.text,borderRadius:6,textAlign:"left"}}
                    onMouseEnter={(e)=>{e.currentTarget.style.background="var(--color-hover-bg, #F0F0F0)"}}
                    onMouseLeave={(e)=>{e.currentTarget.style.background="transparent"}}
                  >
                    <span style={{width:8,height:8,borderRadius:"50%",background:s.color||STRATEGY_COLOR_DEFAULT}}/>
                    <span style={{flex:1}}>{s.name}</span>
                    {(strategyTradeCounts[s.id] || 0) > 0 && (
                      <span style={{fontSize:11,color:T.textMut,fontWeight:500}}>{strategyTradeCounts[s.id]}</span>
                    )}
                  </button>
                )) : (
                  <div style={{padding:"10px 10px",fontSize:12,color:T.textMut}}>Aucune stratégie disponible</div>
                )}
              </>
            </Popover>
          </div>

          <span style={{width:1,height:18,background:T.border}} />

          <button
            onClick={() => setConfirmDeleteOpen(true)}
            style={{background:"transparent",border:"none",color:T.red,fontSize:13,fontWeight:500,cursor:"pointer",fontFamily:"inherit",padding: "4px 8px",borderRadius:6}}
            onMouseEnter={(e)=>{e.currentTarget.style.background="var(--color-red-bg, #FEF2F2)"}}
            onMouseLeave={(e)=>{e.currentTarget.style.background="transparent"}}
          >
            Supprimer
          </button>

          <button
            onClick={() => setSelectedIds(new Set())}
            aria-label="Tout désélectionner"
            style={{background:"transparent",border:"none",color:T.textMut,fontSize:16,cursor:"pointer",fontFamily:"inherit",padding: "2px 6px",lineHeight:1}}
            onMouseEnter={(e)=>{e.currentTarget.style.color=T.text}}
            onMouseLeave={(e)=>{e.currentTarget.style.color=T.textMut}}
          >
            ×
          </button>
        </div>
      )}

      {lightboxUrl && typeof document !== "undefined" && ReactDOM.createPortal(
        <div
          {...backdropDismiss(() => setLightboxUrl(null))}
          style={{position:"fixed",top:0,left:0,right:0,bottom:0,width:"100vw",height:"100vh",background:"rgba(0,0,0,0.2)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",cursor:"zoom-out"}}>
          <div onClick={(e)=>e.stopPropagation()} style={{position:"relative",display:"inline-block",lineHeight:0}}>
            <img src={lightboxUrl} alt="Trade screenshot"
              style={{display:"block",maxWidth:"70vw",maxHeight:"75vh",objectFit:"contain",borderRadius:"var(--radius-card)",boxShadow:"var(--elev-overlay)"}} />
            <button type="button" aria-label="Fermer" onClick={()=>setLightboxUrl(null)}
              style={{position:"absolute",top:8,right:8,width:24,height:24,borderRadius:999,background:"rgba(0,0,0,0.55)",border:"none",color:"#fff",fontSize:14,lineHeight:1,cursor:"pointer",fontFamily:"inherit",display:"inline-flex",alignItems:"center",justifyContent:"center"}}>
              ×
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

/* Menu déroulant multi-sélection (émotions / erreurs) du panneau détail.
   Affiche les tags choisis en pastilles dans le déclencheur ; le menu liste
   tous les tags avec une case à cocher. Se ferme au clic en dehors. */
/* Menu « … » d'une stratégie rattachée à un trade.
   Composant à part parce qu'il est rendu dans une boucle : chaque menu a besoin
   de SA propre ancre. Une référence partagée serait écrasée par la dernière
   stratégie rendue, et tous les menus s'ouvriraient au même endroit. */
function StratMenu({ open, onToggle, onClose, onDetach }) {
  const ref = React.useRef(null);
  const item = {
    display:"flex",alignItems:"center",gap:8,width:"100%",
    padding:"8px 10px",borderRadius:8,border:"none",
    background:"transparent",
    fontSize:13,fontWeight:500,cursor:"pointer",fontFamily:"inherit",textAlign:"left",
  };
  return (
    <div ref={ref} data-strat-menu style={{marginLeft:"auto",position:"relative"}}>
      <button
        onClick={(e)=>{e.stopPropagation();onToggle();}}
        aria-label="Options stratégie"
        aria-haspopup="menu"
        aria-expanded={open}
        style={{background:"transparent",border:"none",cursor:"pointer",color:T.textSub,width: 34,height: 34,borderRadius:999,display:"inline-flex",alignItems:"center",justifyContent:"center",transition:"background var(--dur-fast) var(--ease-out)"}}
        onMouseEnter={(e)=>{e.currentTarget.style.background=FIELD_BG}}
        onMouseLeave={(e)=>{e.currentTarget.style.background="transparent"}}
      >
        <LucideMoreHorizontal size={16} strokeWidth={1.75} />
      </button>
      <Popover
        anchorRef={ref}
        open={open}
        onClose={onClose}
        align="end"
        gap={4}
        minWidth={180}
        role="menu"
        style={{
          background:T.white, border:"none", borderRadius:12,
          boxShadow:"var(--elev-overlay)", padding:6, fontFamily:"var(--font-sans)",
        }}
      >
        <>
          <button
            onClick={(e)=>{ e.stopPropagation(); onDetach(true); }}
            style={{...item, color:T.text}}
            onMouseEnter={(e)=>{e.currentTarget.style.background=FIELD_BG}}
            onMouseLeave={(e)=>{e.currentTarget.style.background="transparent"}}
          >
            <LucideRepeat size={14} strokeWidth={1.75} />
            Changer de stratégie
          </button>
          <button
            onClick={(e)=>{ e.stopPropagation(); onDetach(false); }}
            style={{...item, borderRadius:6, color:T.red}}
            onMouseEnter={(e)=>{e.currentTarget.style.background="var(--color-red-bg, #FEF2F2)"}}
            onMouseLeave={(e)=>{e.currentTarget.style.background="transparent"}}
          >
            <LucideTrash2 size={14} strokeWidth={1.75} />
            Enlever la stratégie
          </button>
        </>
      </Popover>
    </div>
  );
}

function TagMultiSelect({ placeholder, allTags, selected, onToggle }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  // Clic extérieur : géré par le Popover (liste portalisée hors de `ref`).
  const close = React.useCallback(() => setOpen(false), []);
  const chosen = allTags.filter((tg) => selected.includes(tg.id));
  return (
    <div ref={ref} style={{ position: "relative", fontFamily: "var(--font-sans)" }}>
      <button type="button" onClick={() => setOpen((o) => !o)}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "8px 16px", fontSize: 13, border: "none", minHeight: 34, borderRadius: 999, background: FIELD_BG, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexWrap: "wrap", gap: 6 }}>
          {chosen.length === 0
            ? <span style={{ fontSize: 13, color: T.textSub }}>{placeholder}</span>
            : chosen.map((tg) => (
                /* Pastille sans contour : l'aplat teinté suffit à la détacher,
                   et un cadre de plus dans un champ déjà posé sur un aplat
                   faisait trois épaisseurs pour un seul mot. */
                <span key={tg.id} style={{ fontSize: 12, fontWeight: 500, color: tg.color, background: `${tg.color}1F`, border: "none", borderRadius: 999, padding: "2px 10px" }}>{tg.label}</span>
              ))}
        </div>
        <LucideChevronDown size={15} strokeWidth={1.75} color={T.textSub} style={{ flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform var(--dur-fast) var(--ease-out)" }} />
      </button>
      <Popover
        anchorRef={ref}
        open={open}
        onClose={close}
        matchAnchorWidth
        maxHeight={260}
        style={{ background: T.white, border: "none", borderRadius: 12, padding: 6, boxShadow: "var(--elev-overlay)" }}
      >
        <>
          {allTags.map((tg) => {
            const on = selected.includes(tg.id);
            return (
              <button key={tg.id} type="button" role="checkbox" aria-checked={on} aria-label={tg.label} onClick={() => onToggle(tg.id)}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", border: "none", borderRadius: 8, background: on ? FIELD_BG : "transparent", cursor: "pointer", fontFamily: "inherit", textAlign: "left", transition: "background var(--dur-fast) var(--ease-out)" }}
                onMouseEnter={(e) => { if (!on) e.currentTarget.style.background = FIELD_BG; }}
                onMouseLeave={(e) => { if (!on) e.currentTarget.style.background = "transparent"; }}>
                <span style={{ width: 15, height: 15, borderRadius: 5, flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", background: on ? tg.color : T.white, boxShadow: on ? "none" : `inset 0 0 0 1.5px ${HAIRLINE}` }}>
                  {on && <LucideCheck size={11} strokeWidth={3} color={T.onSolid} />}
                </span>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: tg.color, flexShrink: 0 }} />
                <span style={{ fontSize: 13, color: T.text }}>{tg.label}</span>
              </button>
            );
          })}
        </>
      </Popover>
    </div>
  );
}


/* ============================================================================
   PAGINATION DU TABLEAU DES TRADES
   Barre posée sous le tableau, dans la même carte : compteur « X–Y sur N »,
   sélecteur de taille de page, puis navigation par numéro de page.
   Les numéros sont fenêtrés autour de la page courante (avec « … ») pour ne
   jamais déborder, même avec des centaines de pages.
   ========================================================================== */
function TradesPagination({ pageIndex, pageCount, pageSize, total, onPage, onPageSize }) {
  useLang();
  const from = total === 0 ? 0 : pageIndex * pageSize + 1;
  const to = Math.min(total, (pageIndex + 1) * pageSize);

  /* Fenêtre de numéros : première, dernière, et les voisines de la page
     courante. `null` marque une ellipse. */
  const items = React.useMemo(() => {
    const span = 1; // voisines de chaque côté
    const keep = new Set([0, pageCount - 1]);
    for (let i = pageIndex - span; i <= pageIndex + span; i += 1) {
      if (i >= 0 && i < pageCount) keep.add(i);
    }
    const sorted = [...keep].sort((a, b) => a - b);
    const out = [];
    let prev = null;
    for (const n of sorted) {
      if (prev !== null && n - prev > 1) out.push(null);
      out.push(n);
      prev = n;
    }
    return out;
  }, [pageIndex, pageCount]);

  const navBtn = (disabled) => ({
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    width: 30, height: 30, borderRadius: 8, border: "none",
    background: "transparent", color: disabled ? T.textMut : T.text,
    cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.4 : 1,
    fontFamily: "inherit", flexShrink: 0,
  });

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
      padding: "12px 20px", borderTop: `1px solid ${T.border}`,
    }}>
      {/* Compteur */}
      <span style={{ fontSize: 12, color: T.text, opacity: 0.6, fontVariantNumeric: "tabular-nums" }}>
        {t("trades.pagination.range")
          .replace("{from}", String(from))
          .replace("{to}", String(to))
          .replace("{total}", String(total))}
      </span>

      {/* Taille de page */}
      <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: T.text, opacity: 0.6 }}>
        {t("trades.pagination.perPage")}
        <select
          value={pageSize}
          onChange={(e) => onPageSize(Number(e.target.value))}
          style={{
            padding: "4px 8px", borderRadius: 8, border: "none",
            background: DA_FIELD_BG, color: T.text, fontSize: 12, fontFamily: "inherit",
            cursor: "pointer", outline: "none",
          }}
        >
          {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </label>

      {/* Navigation */}
      <div style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 2 }}>
        <button
          type="button"
          onClick={() => onPage(Math.max(0, pageIndex - 1))}
          disabled={pageIndex === 0}
          aria-label={t("trades.pagination.prev")}
          title={t("trades.pagination.prev")}
          style={navBtn(pageIndex === 0)}
          onMouseEnter={(e) => { if (pageIndex > 0) e.currentTarget.style.background = T.rowHighlight; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
        >
          <LucideChevronLeft size={16} strokeWidth={1.75} />
        </button>

        {items.map((n, i) => (
          n === null ? (
            <span key={`gap${i}`} style={{ width: 20, textAlign: "center", fontSize: 12, color: T.textMut }}>…</span>
          ) : (
            <button
              key={n}
              type="button"
              onClick={() => onPage(n)}
              aria-current={n === pageIndex ? "page" : undefined}
              style={{
                minWidth: 30, height: 30, padding: "0 8px", borderRadius: 8, border: "none",
                background: n === pageIndex ? T.text : "transparent",
                color: n === pageIndex ? T.textInverted : T.text,
                opacity: n === pageIndex ? 1 : 0.6,
                fontSize: 12, fontWeight: 500, fontFamily: "inherit", cursor: "pointer",
                fontVariantNumeric: "tabular-nums",
              }}
              onMouseEnter={(e) => { if (n !== pageIndex) { e.currentTarget.style.background = T.rowHighlight; e.currentTarget.style.opacity = 1; } }}
              onMouseLeave={(e) => { if (n !== pageIndex) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.opacity = 0.6; } }}
            >
              {n + 1}
            </button>
          )
        ))}

        <button
          type="button"
          onClick={() => onPage(Math.min(pageCount - 1, pageIndex + 1))}
          disabled={pageIndex >= pageCount - 1}
          aria-label={t("trades.pagination.next")}
          title={t("trades.pagination.next")}
          style={navBtn(pageIndex >= pageCount - 1)}
          onMouseEnter={(e) => { if (pageIndex < pageCount - 1) e.currentTarget.style.background = T.rowHighlight; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
        >
          <LucideChevronRight size={16} strokeWidth={1.75} />
        </button>
      </div>
    </div>
  );
}

