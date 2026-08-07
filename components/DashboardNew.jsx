"use client";

import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom";
import { parseCSV, calculateStats } from "@/lib/csvParsers";
import { createClient } from "@/lib/supabase/client";
import { getLocalDateString } from "@/lib/dateUtils";
import { useAuth } from "@/lib/auth/supabaseAuthProvider";
import { useTrades } from "@/lib/hooks/useTradeData";
import { useStrategies, useUserPreferences } from "@/lib/hooks/useUserData";
import { useCloudState } from "@/lib/hooks/useCloudState";
import { useKeyboardShortcuts } from "@/lib/hooks/useKeyboardShortcuts";
import { useTradeAlerts } from "@/lib/hooks/useTradeAlerts";
import { useAgendaReminders } from "@/lib/hooks/useAgendaReminders";
import { useApp } from "@/lib/contexts/AppContext";
import { useUndo } from "@/lib/contexts/UndoContext";
import { getPlaceholderAccountId, isPlaceholderAccount } from "@/lib/utils/placeholderAccount";
import { readArchivedMeta, writeArchivedMeta, isArchivedAccount } from "@/lib/utils/archivedAccounts";
import StrategyPage from "@/components/StrategyPage";
import StrategyDetailPage from "@/components/StrategyDetailPage";
import GoalsPage from "@/components/pages/GoalsPage";
import DailyPlannerPage from "@/components/pages/DailyPlannerPage";
import SportPage from "@/components/pages/SportPage";
import ReadingListPage from "@/components/pages/ReadingListPage";
import NotesPage from "@/components/pages/NotesPage";
import DrivePage from "@/components/pages/DrivePage";
import LifeRpgPage from "@/components/pages/LifeRpgPage";
import EloquencePage from "@/components/pages/EloquencePage";
import AgendaPage from "@/components/pages/AgendaPage";
import CalendarPage from "@/components/pages/CalendarPage";
import JournalPage from "@/components/pages/JournalPage";
import DashboardPage from "@/components/pages/DashboardPage";
import DisciplinePage from "@/components/pages/DisciplinePage";
import TradesPage from "@/components/pages/TradesPage";
import TradeChartPage from "@/components/pages/TradeChartPage";
import AddTradePage from "@/components/pages/AddTradePage";
import BacktestPage from "@/components/pages/BacktestPage";
import BrokersPage from "@/components/pages/BrokersPage";
import AccountsPage from "@/components/pages/AccountsPage";
import AccountDetailPage from "@/components/pages/AccountDetailPage";
import PropFirmDetailPage from "@/components/pages/PropFirmDetailPage";
import { usePropFirms } from "@/lib/hooks/usePropFirms";
import LoadingScreen from "@/components/ui/LoadingScreen";
import QuickAccountSelector from "@/components/QuickAccountSelector";
import MultiAccountSelector from "@/components/MultiAccountSelector";
import AlertToast from "@/components/AlertToast";
import CommandPalette from "@/components/CommandPalette";
import SettingsPage from "@/components/pages/SettingsPage";
import Sidebar from "@/components/ui/Sidebar";
import SearchableSelect from "@/components/ui/SearchableSelect";
import { getCurrencySymbol, getUserTimezone } from "@/lib/userPrefs";
import { T } from "@/lib/ui/tokens";
import { t, useLang } from "@/lib/i18n";
import {
  LayoutDashboard,
  Calendar as LucideCalendar,
  ListChecks,
  NotebookPen,
  ShieldCheck,
  Target as LucideTarget,
  Upload as LucideUpload,
  FileText as LucideFileText,
  X as LucideX,
  ChevronDown as LucideChevronDown,
  MoreHorizontal as LucideMoreHorizontal,
  Trash2 as LucideTrash2,
  TrendingUp as LucideTrendingUp,
  ArrowDown as LucideArrowDown,
  SlidersHorizontal as LucideSlidersHorizontal,
  Check as LucideCheck,
  Mountain,
  Pencil,
  Plus,
  GripVertical,
  ListTodo as LucideListTodo,
  Zap as LucideZap,
  CalendarDays as LucideCalendarDays,
  CalendarClock as LucideCalendarClock,
  Flame as LucideFlame,
  BookOpen as LucideBookOpen,
  Menu as LucideMenu,
  Wallet as LucideWallet,
  Dumbbell as LucideDumbbell,
  FolderOpen as LucideFolderOpen,
  Mic as LucideMic,
} from "lucide-react";

/* ─── TOKENS ───────────────────────────────────────────────────────────
   Source unique et dark-aware : lib/ui/tokens.ts (les valeurs sont des
   var(--color-*), donc le thème sombre bascule nativement). */

const css = `
  body { background: ${T.bg}; color: ${T.text}; font-family: var(--font-sans); min-height: 100vh; font-size: 14px; }
  button { font-family: inherit; cursor: pointer; }
  select { font-family: inherit; }
  /* anim-1 / anim-2 sont désormais définis globalement (globals.css) sur le
     token --ease-out. On garde le keyframe local par sécurité mais on route
     l'animation vers la courbe partagée. */
  @keyframes fadeUp { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }
  .anim-1 { animation: fadeUp .25s var(--ease-out) both; }
  .anim-2 { animation: fadeUp .25s .05s var(--ease-out) both; }
  .nav-item:hover { background: ${T.accentBg} !important; }
  .card-hover:hover { border-color: ${T.border2} !important; box-shadow: 0 4px 12px rgba(0,0,0,.06) !important; }
`;

const fmt = (n, sign=false) => `${sign && n>0?"+":""}${n<0?"-":""}${getCurrencySymbol()}${Math.abs(n).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}`;

// Bouton compte utilisateur dans la barre du haut (à droite du gris)

// Portal: rend ses enfants dans le slot d'en-tête de page (id="tr4de-page-header-slot")
// si présent. Permet aux pages d'inclure des éléments contrôlés depuis le layout.
function HeaderSlotPortal({ children }) {
  const [target, setTarget] = useState(null);
  useEffect(() => {
    const find = () => setTarget(document.getElementById("tr4de-page-header-slot"));
    find();
    const observer = new MutationObserver(find);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
  if (!target) return null;
  return ReactDOM.createPortal(children, target);
}

function Pill({ children, color="gray", small }) {
  const map = {
    green: { bg:T.greenBg, bd:T.greenBd, txt:T.green },
    red:   { bg:T.redBg,   bd:T.redBd,   txt:T.red   },
    blue:  { bg:T.blueBg,  bd:"#DCFCE7",  txt:T.blue  },
    gray:  { bg:T.bg,      bd:T.border,   txt:T.textSub },
  };
  const s = map[color] || map.gray;
  return <span style={{display:"inline-flex", alignItems:"center", padding: small ? "1px 7px" : "3px 10px", borderRadius: 20, fontSize: small ? 11 : 12, fontWeight: 500, background: s.bg, border: `1px solid ${s.bd}`, color: s.txt,}}>{children}</span>;
}

function TradingViewChart({ trade }) {
  return null; // Removed chart component
}

function NavItem({ icon, label, active, onClick, badge }) {
  return (
    <button className="nav-item" onClick={onClick} style={{width:"100%",display:"flex",alignItems:"center",gap:10,padding:"9px 14px",borderRadius:8,border:"none",background: active ? T.accentBg : "transparent",color: active ? T.accent : T.textSub,fontSize:13,fontWeight: active ? 600 : 400,transition:"all .15s",textAlign:"left",}}>
      <span style={{fontSize:15,opacity: active?1:.7}}>{icon}</span>
      <span>{label}</span>
      {badge && <span style={{marginLeft:"auto",fontSize:10,padding:"1px 6px",borderRadius:20,background:T.redBg,color:T.red,fontWeight:600}}>{badge}</span>}
    </button>
  );
}

export default function App() {
  const supabase = createClient();
  const { user, loading: authLoading } = useAuth();
  useLang(); // re-render app on language change

  // Re-render quand l'utilisateur change la devise / le fuseau horaire dans Settings.
  const [, forcePrefRefresh] = useState(0);
  useEffect(() => {
    const onPrefs = () => forcePrefRefresh(v => v + 1);
    window.addEventListener("tr4de:prefs-changed", onPrefs);
    return () => window.removeEventListener("tr4de:prefs-changed", onPrefs);
  }, []);
  const [accountType, setAccountType] = useState(() => {
    try {
      const saved = localStorage.getItem('accountType');
      return saved ? saved : "live";
    } catch (e) {
      return "live";
    }
  });
  const [selectedEvalAccount, setSelectedEvalAccount] = useState(() => {
    try {
      const saved = localStorage.getItem('selectedEvalAccount');
      return saved ? saved : "25k";
    } catch (e) {
      return "25k";
    }
  });
  const { page, setPage } = useApp();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("sidebarCollapsed") === "1";
  });
  const [selectedStrategyId, setSelectedStrategyId] = useState(null);
  const [selectedAccountDetailId, setSelectedAccountDetailId] = useState(null);
  // Firme dont on affiche les paramètres (page "firm-detail").
  const [selectedFirmId, setSelectedFirmId] = useState(null);
  // ✅ Utiliser les hooks pour Trades et Stratégies (auto-stockés dans Supabase)
  const { trades, addTrade, updateTrade, deleteTrade } = useTrades();
  const { pushUndo } = useUndo();
  // Surveillance des seuils P&L (alertes navigateur + événement interne)
  useTradeAlerts(trades || []);
  // Rappels d'agenda → vraies notifications système, quelle que soit la page.
  useAgendaReminders();
  const { strategies, addStrategy, updateStrategy, deleteStrategy } = useStrategies();
  const [userId, setUserId] = useState(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [accounts, setAccounts] = useState([]);
  // Firmes de prop trading (parents des comptes) — voir lib/propFirms.
  const { firms, setFirms } = usePropFirms(user?.id);
  const [selectedAccountIdHeader, setSelectedAccountIdHeader] = useState(null);
  const [selectedAccountIds, setSelectedAccountIds] = useState(() => {
    try {
      const saved = localStorage.getItem('selectedAccountIds');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });
  const [previousSelectedAccountIds, setPreviousSelectedAccountIds] = useState([]);
  const [showAccountSettings, setShowAccountSettings] = useState(false);
  // Comptes eval « passés funded » et archivés (voir lib/utils/archivedAccounts).
  // Persisté en localStorage, hissé ici pour que la sélection et le sélecteur
  // de comptes les excluent de façon réactive.
  const [archivedMeta, setArchivedMetaState] = useState(() => readArchivedMeta());
  const setArchivedMeta = React.useCallback((updater) => {
    setArchivedMetaState(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      writeArchivedMeta(next);
      return next;
    });
  }, []);

  // Construire l'objet affichage utilisateur à partir de l'utilisateur authentifié
  const displayUser = {
    name: user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email?.split('@')[0] || "Trader",
    email: user?.email || "trader@taotrade.com",
    initials: (user?.email?.split('@')[0] || "TR").substring(0, 2).toUpperCase(),
    avatarUrl: user?.user_metadata?.avatar_url || user?.user_metadata?.picture || null,
  };

  // Sauvegarder la sélection de comptes dans localStorage
  useEffect(() => {
    localStorage.setItem('selectedAccountIds', JSON.stringify(selectedAccountIds));
  }, [selectedAccountIds]);

  // (On ne ré-injecte plus le placeholder : aucune sélection = 0 trades)

  // ✅ Nettoyer le placeholder quand un vrai compte est sélectionné
  useEffect(() => {
    if (user?.id && selectedAccountIds.length > 0) {
      const placeholderId = getPlaceholderAccountId(user.id);
      const hasPlaceholder = selectedAccountIds.includes(placeholderId);
      const hasRealAccounts = selectedAccountIds.some(id => !isPlaceholderAccount(id));
      
      // Si on a à la fois le placeholder et des vrais comptes, retirer le placeholder
      if (hasPlaceholder && hasRealAccounts) {
        const cleaned = selectedAccountIds.filter(id => !isPlaceholderAccount(id));
        setSelectedAccountIds(cleaned);
      }
    }
  }, [selectedAccountIds, user?.id]);

  // Sauvegarder le type de compte dans localStorage
  useEffect(() => {
    localStorage.setItem('accountType', accountType);
  }, [accountType]);

  // Sauvegarder la taille du compte Eval dans localStorage
  useEffect(() => {
    localStorage.setItem('selectedEvalAccount', selectedEvalAccount);
  }, [selectedEvalAccount]);

  // ✅ Les stratégies sont auto-sauvegardées via le hook useStrategies()

  // Mettre à jour accountType et selectedEvalAccount en fonction du compte sélectionné
  useEffect(() => {
    if (selectedAccountIds.length === 1 && accounts.length > 0) {
      const selectedAccountId = selectedAccountIds[0];
      const selectedAccount = accounts.find(acc => acc.id === selectedAccountId);
      if (selectedAccount) {
        // Si le compte a des infos de type, les utiliser
        if (selectedAccount.account_type) {
          setAccountType(selectedAccount.account_type);
        }
        if (selectedAccount.eval_account_size) {
          setSelectedEvalAccount(selectedAccount.eval_account_size);
        } else {
          setSelectedEvalAccount("");
        }
      }
    }
  }, [selectedAccountIds, accounts]);

  // Récupérer l'utilisateur Supabase
  useEffect(() => {
    const getUser = async () => {
      try {
        const { data: { user: authUser }, error } = await supabase.auth.getUser();
        if (error) {
          console.warn("Not authenticated:", error.message);
          setUserId(null);
        } else if (authUser) {
          setUserId(authUser.id);
        } else {
          console.warn("No authenticated user");
          setUserId(null);
        }
      } catch (err) {
        console.error("Error getting user:", err);
        setUserId(null);
      } finally {
        setLoadingUser(false);
      }
    };

    getUser();
  }, [supabase]);

  // Charger les comptes au démarrage
  useEffect(() => {
    const loadAccounts = async () => {
      try {
        const supabase = createClient();
        const userId = user?.id;
        
        const { data, error } = await supabase
          .from("trading_accounts")
          .select("*")
          .eq("user_id", userId)
          .order("created_at", { ascending: false });

        if (error) {
          console.error("Error loading accounts:", error);
          setAccounts([]);
          return;
        }

        const loadedAccounts = data || [];
        setAccounts(loadedAccounts);

        // À chaque chargement de la page : si rien n'est sélectionné (premier visit
        // OU sélection vide sauvegardée), on coche tous les comptes par défaut.
        try {
          const saved = localStorage.getItem("selectedAccountIds");
          let current = [];
          try { current = saved ? JSON.parse(saved) : []; } catch {}
          if ((!Array.isArray(current) || current.length === 0) && loadedAccounts.length > 0) {
            // Ne pas cocher par défaut les comptes eval archivés.
            const archived = readArchivedMeta();
            const allIds = loadedAccounts
              .filter(a => !isArchivedAccount(a.id, archived))
              .map(a => a.id);
            setSelectedAccountIds(allIds);
            localStorage.setItem("selectedAccountIds", JSON.stringify(allIds));
          }
        } catch {}
      } catch (err) {
        console.error("Error loading accounts:", err);
        setAccounts([]);
      }
    };

    if (user?.id) {
      loadAccounts();
    }
    // Resynchronise quand un compte est créé/modifié/supprimé ailleurs
    // (modales de la page Comptes, page détail d'une firme, sélecteurs).
    const onAccountsChanged = () => { if (user?.id) loadAccounts(); };
    window.addEventListener("tr4de:accounts-changed", onAccountsChanged);
    return () => window.removeEventListener("tr4de:accounts-changed", onAccountsChanged);
  }, [user?.id]);

  // Fonction pour se déconnecter
  const handleLogout = async () => {
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      
      // ⏳ Attendre 500ms pour s'assurer que la session est complètement effacée
      // et que les listeners d'auth ont le temps de se mettre à jour
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Nettoyer localStorage
      localStorage.clear();
      
      // 🚀 Rediriger vers la page d'accueil (qui redirigera vers /login)
      window.location.href = '/login';
    } catch (err) {
      console.error("❌ Erreur lors de la déconnexion:", err);
      // En cas d'erreur, forcer la redirection vers login
      window.location.href = '/login';
    }
  };

  // ✅ Vérifier l'authentification et rediriger si nécessaire
  // ATTENDRE que l'authentification soit complètement chargée avant de rediriger
  useEffect(() => {
    if (authLoading) {
      // Authentification en cours de chargement, ne rien faire
      return;
    }

    // Authentification terminée, vérifier si l'utilisateur existe
    if (!user) {
      window.location.href = '/login';
    }
  }, [authLoading, user]);

  // ✅ Filtrer les comptes visibles (exclure le placeholder ET les comptes
  // eval archivés — ces derniers ne doivent plus apparaître dans le sélecteur
  // ni compter dans le P&L du site ; seule la page Comptes les affiche encore
  // dans une section « Comptes eval passés »).
  const visibleAccounts = accounts.filter(acc => !isPlaceholderAccount(acc.id) && !isArchivedAccount(acc.id, archivedMeta));

  // Aucun filtre de dates : toutes les pages affichent l'historique complet,
  // depuis le premier trade déposé. Seule la sélection de comptes filtre.
  const filteredTrades = (() => {
    const realSelected = selectedAccountIds.filter(id => !isPlaceholderAccount(id) && !isArchivedAccount(id, archivedMeta));
    if (realSelected.length === 0) return [];
    return trades.filter(t => realSelected.includes(t.account_id));
  })();

  // Ids des trades des comptes eval passés (comptes supprimés → account_id NULL,
  // on les retrouve via les trade_ids mémorisés dans archivedMeta).
  const archivedTradeIds = React.useMemo(() => {
    const s = new Set();
    Object.values(archivedMeta || {}).forEach(m => (m?.trade_ids || []).forEach(id => s.add(id)));
    return s;
  }, [archivedMeta]);

  // Trades passés à la page Discipline : les trades filtrés (comptes actifs
  // sélectionnés) PLUS les trades des comptes eval passés, pour que l'historique
  // de discipline de ces anciens trades reste conservé. Dédoublonnés par id.
  const disciplineTrades = (() => {
    if (archivedTradeIds.size === 0) return filteredTrades;
    const seen = new Set(filteredTrades.map(t => t.id));
    const extra = trades.filter(t => archivedTradeIds.has(t.id) && !seen.has(t.id));
    return extra.length ? [...filteredTrades, ...extra] : filteredTrades;
  })();

  // ✅ DEBUG: Log when account selection changes
  React.useEffect(() => {
  }, [selectedAccountIds, trades, accounts, filteredTrades]);

  const handleImport = async (data) => {
    const { trades: newTrades } = data;
    for (const newTrade of newTrades) {
      const existing = trades.find(t => t.date === newTrade.date && t.symbol === newTrade.symbol && t.entry === newTrade.entry);
      if (!existing) {
        await addTrade(newTrade);
      } else {
        // Backfill des champs manquants (ex: entry_time / exit_time après ajout du parser)
        const patch = {};
        if (newTrade.entryTime && !existing.entry_time && !existing.entryTime) patch.entry_time = newTrade.entryTime;
        if (newTrade.exitTime && !existing.exit_time && !existing.exitTime) patch.exit_time = newTrade.exitTime;
        if (Object.keys(patch).length > 0) {
          try { await updateTrade(existing.id, patch); } catch (err) { console.error("⚠️ updateTrade failed:", err); }
        }
      }
    }
  };

  const handleClearTrades = async () => {
    try {
      const snapshot = [...filteredTrades];
      for (const trade of snapshot) {
        await deleteTrade(trade.id);
      }
      pushUndo({
        label: `${snapshot.length} trade${snapshot.length>1?"s":""}`,
        undo: async () => { for (const tr of snapshot) { try { await addTrade(tr); } catch {} } },
      });
    } catch (err) {
      console.error("Error deleting trades:", err);
    }
  };

  const handleDeleteTrade = async (trade) => {
    if (!trade || !trade.id) {
      console.warn("❌ Trade invalid ou sans ID:", trade);
      return;
    }
    const snapshot = { ...trade };
    await deleteTrade(trade.id);
    await cleanupTradeRelatedData(trade);
    pushUndo({
      label: "Suppression du trade",
      undo: async () => { try { await addTrade(snapshot); } catch (e) { console.error("undo add trade failed:", e); } },
    });
  };

  // Purge toutes les données liées à un trade : assignations de stratégies,
  // notes, règles cochées (côté Supabase ET localStorage). Empêche les
  // résidus d'apparaître sur la page Stratégies après suppression.
  const cleanupTradeRelatedData = async (trade) => {
    if (!trade) return;
    const tid = trade.id != null ? String(trade.id) : null;

    // --- Supabase ---
    try {
      const sb = createClient();
      const uid = user?.id;
      if (uid && tid) {
        await Promise.all([
          sb.from("trade_strategies").delete().eq("user_id", uid).eq("trade_id", tid),
          sb.from("trade_details").delete().eq("user_id", uid).eq("trade_id", tid),
        ]);
      }
    } catch (err) {
      console.error("⚠️ Erreur nettoyage Supabase trade lié:", err);
    }

    // --- localStorage : tradeStrategies ---
    try {
      const raw = localStorage.getItem("tr4de_trade_strategies");
      if (raw) {
        const map = JSON.parse(raw);
        const keysToDelete = new Set();
        if (tid) keysToDelete.add(`id:${tid}`);
        // ancien format : composite avec date/symbol/entry/...
        const composite = `${trade.date}_${trade.symbol}_${trade.entry}_${trade.exit ?? ''}_${trade.direction ?? ''}_${trade.entryTime || ''}_${trade.exitTime || ''}_${trade.pnl ?? ''}`;
        keysToDelete.add(composite);
        // ancien format DashboardPage : sans underscores entre certains champs
        if (trade.date && trade.symbol && trade.entry != null) {
          keysToDelete.add(`${trade.date}${trade.symbol}${trade.entry}`);
          keysToDelete.add(`${trade.date}${trade.symbol}${parseFloat(trade.entry).toFixed(2)}`);
        }
        let changed = false;
        for (const k of Object.keys(map)) {
          if (keysToDelete.has(k)) { delete map[k]; changed = true; }
        }
        if (changed) localStorage.setItem("tr4de_trade_strategies", JSON.stringify(map));
      }
    } catch (err) {
      console.error("⚠️ Erreur nettoyage local tradeStrategies:", err);
    }

    // --- localStorage : trade_notes ---
    try {
      const raw = localStorage.getItem("tr4de_trade_notes");
      if (raw && tid) {
        const map = JSON.parse(raw);
        if (map[tid] !== undefined) {
          delete map[tid];
          localStorage.setItem("tr4de_trade_notes", JSON.stringify(map));
        }
      }
    } catch (err) {
      console.error("⚠️ Erreur nettoyage local trade_notes:", err);
    }

    // --- localStorage : checked_rules ---
    // Clé = `${date}_${symbol}_${entry}_${exit}_${direction}_${stratId}_${ruleId}`
    // (variantes : exit "none" / direction "long")
    try {
      const raw = localStorage.getItem("tr4de_checked_rules");
      if (raw) {
        const map = JSON.parse(raw);
        const prefixes = [
          `${trade.date}_${trade.symbol}_${trade.entry}_${trade.exit ?? ''}_${trade.direction ?? ''}_`,
          `${trade.date}_${trade.symbol}_${trade.entry}_${trade.exit || 'none'}_${trade.direction || 'long'}_`,
        ];
        let changed = false;
        for (const k of Object.keys(map)) {
          if (prefixes.some(p => k.startsWith(p))) { delete map[k]; changed = true; }
        }
        if (changed) {
          localStorage.setItem("tr4de_checked_rules", JSON.stringify(map));
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("tr4de:checked-rules-changed"));
          }
        }
      }
    } catch (err) {
      console.error("⚠️ Erreur nettoyage local checked_rules:", err);
    }
  };

  const handleDeleteAccount = async (accountId) => {
    if (!accountId) {
      return;
    }

    const accountToDelete = accounts.find(acc => acc.id === accountId);
    if (!accountToDelete) return;

    try {
      const supabase = createClient();
      const userId = user?.id;

      // Supprimer les trades associés au compte
      const { error: tradesError } = await supabase
        .from("apex_trades")
        .delete()
        .eq("account_id", accountId)
        .eq("user_id", userId);

      if (tradesError) {
        console.error("Error deleting trades:", tradesError);
        return;
      }

      // Supprimer le compte
      const { error: accountError } = await supabase
        .from("trading_accounts")
        .delete()
        .eq("id", accountId)
        .eq("user_id", userId);

      if (accountError) {
        console.error("Error deleting account:", accountError);
        return;
      }

      // Retirer le compte de la sélection
      setSelectedAccountIds(prev => prev.filter(id => id !== accountId));

      // Réinitialiser la sélection d'en-tête si c'était celui-ci
      if (selectedAccountIdHeader === accountId) {
        setSelectedAccountIdHeader("");
      }

      // Recharger les comptes
      const { data: updatedAccounts } = await supabase
        .from("trading_accounts")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      setAccounts(updatedAccounts || []);
      // Les trades du compte supprimé pour pouvoir les restaurer
      const snapshotTrades = trades.filter(t => t.account_id === accountId).map(t => ({ ...t }));
      const accountSnap = { ...accountToDelete };
      pushUndo({
        label: `Compte « ${accountToDelete.name || ""} »`,
        undo: async () => {
          try {
            const sb = createClient();
            const { data: created } = await sb.from("trading_accounts").insert([{
              user_id: userId,
              name: accountSnap.name,
              broker: accountSnap.broker,
              account_type: accountSnap.account_type,
              eval_account_size: accountSnap.eval_account_size,
            }]).select();
            const newId = created?.[0]?.id;
            if (newId && snapshotTrades.length) {
              await sb.from("apex_trades").insert(snapshotTrades.map(tr => ({
                user_id: userId,
                account_id: newId,
                date: tr.date, symbol: tr.symbol, direction: tr.direction,
                // On réécrit le P&L BRUT (les frais sont recalculés au chargement).
                entry: tr.entry, exit: tr.exit, pnl: tr.pnlGross != null ? tr.pnlGross : tr.pnl,
                entry_time: tr.entry_time || null, exit_time: tr.exit_time || null,
              })));
            }
            const { data: after } = await sb.from("trading_accounts").select("*").eq("user_id", userId).order("created_at", { ascending: false });
            setAccounts(after || []);
          } catch (e) { console.error("undo delete account failed:", e); }
        },
      });
      // ✅ Les trades seront auto-reloadés via le hook useTrades
    } catch (err) {
      console.error("Error:", err);
    }
  };

  const SIDEBAR_SECTIONS = [
    {
      label: t("nav.trading"),
      items: [
        { id: "add-trade",  icon: LucideUpload,       label: t("nav.addTrade") },
        { id: "dashboard",  icon: LayoutDashboard,    label: t("nav.dashboard") },
        { id: "calendar",   icon: LucideCalendar,     label: t("nav.calendar") },
        { id: "trades",     icon: ListChecks,         label: t("nav.trades"), badge: filteredTrades.length > 0 ? filteredTrades.length : 0 },
        { id: "accounts",   icon: LucideWallet,       label: t("nav.accounts") },
        { id: "strategies", icon: LucideTarget,       label: t("nav.strategies") },
      ],
    },
    {
      label: t("nav.analyse"),
      items: [
        { id: "journal",    icon: NotebookPen,        label: t("nav.journal"), badge: filteredTrades.filter(tr => {try { const d = new Date(tr.date); return getLocalDateString(d) === getLocalDateString(); } catch (e) { return false; }}).length },
        { id: "discipline", icon: ShieldCheck,        label: t("nav.discipline") },
      ],
    },
    {
      label: t("nav.productivity"),
      items: [
        { id: "daily-planner", icon: LucideCalendarDays, label: t("nav.dailyPlanner") },
        { id: "agenda",        icon: LucideCalendarClock, label: t("nav.agenda") },
        { id: "life-rpg",      icon: Mountain,           label: t("nav.lifeRpg") },
        { id: "goals",         icon: LucideZap,          label: t("nav.goals") },
        { id: "sport",         icon: LucideDumbbell,     label: "Sport" },
        { id: "notes",         icon: LucideFileText,     label: t("nav.notes") },
        { id: "eloquence",     icon: LucideMic,          label: t("nav.eloquence") },
      ],
    },
  ];

  // Raccourcis clavier : Alt+1..9 pour naviguer entre les pages de la sidebar
  const flatNavIds = SIDEBAR_SECTIONS.flatMap(s => s.items.map(i => i.id));
  // Ctrl+Tab : page suivante dans la navbar ; Ctrl+Shift+Tab : page précédente.
  const goRelative = (delta) => {
    if (flatNavIds.length === 0) return;
    const idx = flatNavIds.indexOf(page);
    const cur = idx < 0 ? 0 : idx;
    const next = (cur + delta + flatNavIds.length) % flatNavIds.length;
    setPage(flatNavIds[next]);
    setMobileNavOpen(false);
  };
  useKeyboardShortcuts([
    ...flatNavIds.slice(0, 9).map((id, i) => ({
      key: String(i + 1),
      alt: true,
      handler: (e) => { e.preventDefault(); setPage(id); setMobileNavOpen(false); },
    })),
    {
      key: "Tab",
      ctrlOrCmd: true,
      ignoreInInputs: false,
      handler: (e) => { e.preventDefault(); goRelative(1); },
    },
    {
      key: "Tab",
      ctrlOrCmd: true,
      shift: true,
      ignoreInInputs: false,
      handler: (e) => { e.preventDefault(); goRelative(-1); },
    },
  ]);

  const pages = {
    dashboard:  <DashboardPage trades={filteredTrades} allTrades={trades} accounts={accounts} selectedAccountIds={selectedAccountIds} strategies={strategies} setPage={setPage} />,
    "add-trade": <AddTradePage trades={filteredTrades} setPage={setPage} setAccounts={setAccounts} setSelectedAccountIds={setSelectedAccountIds} accounts={accounts} selectedAccountIds={selectedAccountIds} addTrade={addTrade} addStrategy={addStrategy} strategies={strategies} user={user} />,
    trades:     <TradesPage trades={filteredTrades} strategies={strategies} onImportClick={() => setPage("add-trade")} onDeleteTrade={handleDeleteTrade} onClearTrades={handleClearTrades} />,
    "trade-chart": <TradeChartPage trades={filteredTrades} />,
    calendar:   <CalendarPage trades={filteredTrades} accountType={accountType} evalAccountSize={selectedEvalAccount} accounts={accounts} selectedAccountIds={selectedAccountIds} setPage={setPage} />,
    journal: <JournalPage trades={filteredTrades} strategies={strategies} onImportClick={() => setPage("add-trade")} onDeleteTrade={handleDeleteTrade} onClearTrades={handleClearTrades} />,
    discipline: <DisciplinePage trades={disciplineTrades} />,
    strategies: <StrategyPage setPage={setPage} setSelectedStrategyId={setSelectedStrategyId} />,
    "strategy-detail": <StrategyDetailPage setPage={setPage} />,
    backtest: <BacktestPage />,
    brokers: <BrokersPage />,
    accounts: <AccountsPage accounts={accounts} trades={trades} setPage={setPage} selectedAccountIds={selectedAccountIds} setSelectedAccountIds={setSelectedAccountIds} setSelectedAccountDetailId={setSelectedAccountDetailId} setSelectedFirmId={setSelectedFirmId} setAccounts={setAccounts} firms={firms} setFirms={setFirms} userId={user?.id} archivedMeta={archivedMeta} setArchivedMeta={setArchivedMeta} />,
    "account-detail": <AccountDetailPage accountId={selectedAccountDetailId} accounts={accounts} trades={trades} strategies={strategies} setPage={setPage} setSelectedAccountIds={setSelectedAccountIds} archivedMeta={archivedMeta} setArchivedMeta={setArchivedMeta} />,
    "firm-detail": <PropFirmDetailPage firmId={selectedFirmId} firms={firms} accounts={accounts} trades={trades} userId={user?.id} setPage={setPage} setAccounts={setAccounts} setFirms={setFirms} setSelectedAccountDetailId={setSelectedAccountDetailId} setSelectedAccountIds={setSelectedAccountIds} />,
    goals: <GoalsPage />,
    "daily-planner": <DailyPlannerPage />,
    agenda: <AgendaPage />,
    sport: <SportPage />,
    reading: <ReadingListPage />,
    notes: <NotesPage />,
    drive: <DrivePage />,
    "life-rpg": <LifeRpgPage />,
    eloquence: <EloquencePage />,
    settings: <SettingsPage user={user} onBack={() => setPage("dashboard")} setPage={setPage} />,
  };

  // ✅ Afficher un écran de chargement pendant que l'authentification se charge
  // Le useEffect redirigera si l'utilisateur n'est pas authentifié
  if (authLoading) {
    return <LoadingScreen />;
  }

  // Si pas d'utilisateur après le chargement, le useEffect va rediriger vers "/"
  if (!user) {
    return <LoadingScreen />;
  }

  return (
    <>
      <style>{css}</style>
      <AlertToast />
      <CommandPalette />
      <div className="tr4de-root" style={{display:"flex",minHeight:"100vh",background:"var(--color-bg-subtle, #F5F5F5)"}}>
        {/* SIDEBAR (OpenAI-style) */}
        <Sidebar
          mobileOpen={mobileNavOpen}
          onMobileClose={() => setMobileNavOpen(false)}
          collapsed={sidebarCollapsed}
          onToggleCollapsed={() => {
            setSidebarCollapsed(c => {
              const next = !c;
              try { localStorage.setItem("sidebarCollapsed", next ? "1" : "0"); } catch {}
              return next;
            });
          }}
          brand="tao trade"
          user={{ name: displayUser.name, email: displayUser.email, initials: displayUser.initials, avatarUrl: displayUser.avatarUrl }}
          onProfile={() => setPage("settings")}
          onSettings={() => setPage("settings")}
          onDarkMode={() => {
            const cur = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
            const next = cur === "dark" ? "light" : "dark";
            document.documentElement.dataset.theme = next;
            try { localStorage.setItem("tr4de_theme", next); } catch {}
          }}
          onLogout={handleLogout}
          workspace={(() => {
            if (selectedAccountIds.length === 1) {
              const acc = accounts.find(a => a.id === selectedAccountIds[0]);
              if (acc) return { id: acc.id, name: acc.name || "Compte" };
            }
            if (selectedAccountIds.length > 1) return { id: "multi", name: t("accounts.multiple").replace("{n}", String(selectedAccountIds.length)) };
            return null;
          })()}
          workspaces={visibleAccounts.map(a => ({ id: a.id, name: a.name || "Compte" }))}
          onSelectWorkspace={(id) => setSelectedAccountIds([id])}
          onCreateWorkspace={() => setPage("add-trade")}
          sections={SIDEBAR_SECTIONS}
          activeId={page}
          onSelect={(id) => {
            if (page === "add-trade" && id !== "add-trade") {
              setSelectedAccountIds(previousSelectedAccountIds);
              localStorage.setItem('selectedAccountIds', JSON.stringify(previousSelectedAccountIds));
            }
            if (id === "add-trade") {
              setPreviousSelectedAccountIds(selectedAccountIds);
              setSelectedAccountIdHeader("");
              setSelectedAccountIds([]);
            }
            setPage(id);
            setMobileNavOpen(false);
          }}
        />


        {/* MAIN */}
        <div className="tr4de-main" style={{flex:1,minWidth:0,height:"100vh",display:"flex",flexDirection:"column",background:"transparent"}}>
          <div className="tr4de-topbar" style={{flexShrink:0,zIndex:10,background:"var(--color-bg-subtle, #F5F5F5)",padding:"10px 28px",display:"flex",alignItems:"center",gap:12,fontFamily:"var(--font-sans)"}}>
            <button
              type="button"
              className="tr4de-hamburger"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Ouvrir le menu"
              style={{display:"none",width:36,height:36,borderRadius:8,border:"1px solid "+T.border,background:T.white,color:T.text,cursor:"pointer",alignItems:"center",justifyContent:"center",flexShrink:0,fontFamily:"inherit"}}
            >
              <LucideMenu size={18} strokeWidth={1.75} />
            </button>
          </div>
          {/* Le dashboard suit la nouvelle DA : ses sections sont déjà des cartes
              blanches individuelles posées sur le fond de page. Il ne doit donc
              pas être enveloppé dans la carte blanche commune aux autres pages. */}
          {/* Pages déjà passées à la nouvelle DA : leurs sections sont des cartes
              blanches individuelles posées sur le fond de page, elles ne doivent
              donc pas être enveloppées dans la carte blanche commune. */}
          {(() => { const daPage = ["dashboard", "accounts", "account-detail"].includes(page); return (
          <div style={{flex:1,minHeight:0,padding: daPage ? "0 0 8px 0" : "0 8px 8px 0",display:"flex"}}>
            <div className="scroll-thin" style={{
              background: daPage ? "transparent" : "var(--color-card-bg, #FFFFFF)",
              border: daPage ? "none" : "1px solid rgba(0, 0, 0, 0.06)",
              borderRadius: daPage ? 0 : 10,
              boxShadow: "none",
              // 24 px de gouttière de chaque côté, comme sur la maquette.
              padding: (page === "add-trade") ? "0" : daPage ? "0 24px 24px" : "20px 24px",
              display: (page === "add-trade") ? "flex" : "block",
              width: "100%",
              flex: 1,
              overflowY: "auto",
              overflowX: "hidden",
              position: "relative",
            }}>
              {(() => {
                // Pages de productivité : pas de sélecteur de comptes.
                const PRODUCTIVITY_PAGES = ["daily-planner", "agenda", "goals", "reading", "sport", "notes", "drive", "life-rpg"];
                const isProductivity = PRODUCTIVITY_PAGES.includes(page);
                if (page === "add-trade") return null;
                if (isProductivity) return null; // la page gère son propre header
                return (
                  <HeaderSlotPortal>
                    <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",justifyContent:"flex-end",maxWidth:"100%",minWidth:0}}>
                      {page !== "accounts" && page !== "account-detail" && page !== "firm-detail" && (
                        <MultiAccountSelector
                          accounts={visibleAccounts}
                          selectedAccountIds={selectedAccountIds}
                          onSelectionChange={setSelectedAccountIds}
                          onDeleteAccount={handleDeleteAccount}
                          onCreateAccount={() => setPage("accounts")}
                          T={T}
                        />
                      )}
                    </div>
                  </HeaderSlotPortal>
                );
              })()}
              <div
                key={page}
                style={{
                  width: "100%",
                  flex: (page === "add-trade") ? 1 : undefined,
                  minWidth: 0,
                  display: (page === "add-trade") ? "flex" : undefined,
                }}
              >
                {pages[page] || pages.dashboard}
              </div>
            </div>
          </div>
          ); })()}
        </div>
      </div>
    </>
  );
}
