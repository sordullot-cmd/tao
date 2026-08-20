"use client";

import React, { useState, useEffect, useRef } from "react";
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
import DailyPlannerPage from "@/components/pages/DailyPlannerPage";
import SportPage from "@/components/pages/SportPage";
import ReadingListPage from "@/components/pages/ReadingListPage";
import NotesPage from "@/components/pages/NotesPage";
import RevisionsPage from "@/components/pages/RevisionsPage";
import DrivePage from "@/components/pages/DrivePage";
import LifeRpgPage from "@/components/pages/LifeRpgPage";
import EloquencePage from "@/components/pages/EloquencePage";
import CashflowPage from "@/components/pages/CashflowPage";
import BudgetPage from "@/components/pages/BudgetPage";
import PatrimoinePage from "@/components/pages/PatrimoinePage";
import PatrimoineAssetPage from "@/components/pages/PatrimoineAssetPage";
import PatrimoineClassPage from "@/components/pages/PatrimoineClassPage";
import PatrimoineHoldingPage from "@/components/pages/PatrimoineHoldingPage";
import PatrimoineBankPage from "@/components/pages/PatrimoineBankPage";
import PatrimoineLiabilitiesPage from "@/components/pages/PatrimoineLiabilitiesPage";
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
  CalendarDays as LucideCalendarDays,
  CalendarClock as LucideCalendarClock,
  Flame as LucideFlame,
  BookOpen as LucideBookOpen,
  Menu as LucideMenu,
  Wallet as LucideWallet,
  Dumbbell as LucideDumbbell,
  FolderOpen as LucideFolderOpen,
  Mic as LucideMic,
  ArrowRightLeft as LucideArrowRightLeft,
  Landmark as LucideLandmark,
  ChartPie as LucideChartPie,
  Brain as LucideBrain,
} from "lucide-react";

/* ─── TOKENS ───────────────────────────────────────────────────────────
   Source unique et dark-aware : lib/ui/tokens.ts (les valeurs sont des
   var(--color-*), donc le thème sombre bascule nativement). */

const css = `
  body { background: ${T.bg}; color: ${T.text}; font-family: var(--font-sans); min-height: 100vh; font-size: 14px; }
  button { font-family: inherit; cursor: pointer; }
  select { font-family: inherit; }
  /* Pas d'animation d'entrée de page : anim-1 / anim-2 sont neutralisés
     globalement (globals.css). */
  .nav-item:hover { background: ${T.accentBg} !important; }
  .card-hover:hover { border-color: ${T.border2} !important; box-shadow: 0 4px 12px rgba(0,0,0,.06) !important; }
`;

const fmt = (n, sign=false) => `${sign && n>0?"+":""}${n<0?"-":""}${getCurrencySymbol()}${Math.abs(n).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}`;

/* Pages portées à la nouvelle DA : le conteneur de contenu les laisse posées à
   même le fond gris du shell, sans cadre blanc pleine page — elles posent leurs
   propres cartes, gèrent leur gouttière et peuvent la reprendre en marge négative
   (cf. --page-gutter). En desktop, la barre du haut n'y garde aucune hauteur :
   elle est vide, et le contenu doit pouvoir monter jusqu'au bord.
   Une page rejoint cette liste quand ses blocs sont devenus des cartes `CARD` —
   sinon elle flotterait sur le gris sans rien pour porter son contenu. */
const DA_PAGES = ["dashboard", "trades", "calendar", "accounts", "account-detail", "firm-detail", "life-rpg", "strategies", "journal", "discipline", "add-trade", "cashflow", "budget", "sport", "notes", "agenda", "eloquence", "strategy-detail", "daily-planner", "goals", "patrimoine", "patrimoine-asset", "patrimoine-class", "patrimoine-holding", "patrimoine-bank", "patrimoine-liabilities", "spending", "revisions"];

// Bouton compte utilisateur dans la barre du haut (à droite du gris)

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
    <button className="nav-item" onClick={onClick} style={{width:"100%",display:"flex",alignItems:"center",gap:10,padding: "9px 14px",borderRadius:8,border:"none",background: active ? T.accentBg : "transparent",color: active ? T.accent : T.textSub,fontSize:13,fontWeight: 500,transition:"all .15s",textAlign:"left",}}>
      <span style={{fontSize:14,opacity: active?1:.7}}>{icon}</span>
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
  /* Largeur réelle de la barre latérale, remontée par Sidebar : elle suit son
     libellé le plus long, on ne peut donc plus la déduire d'une constante.
     Valeur initiale = l'ancienne largeur fixe, pour que le premier rendu (avant
     la première mesure) ne décale pas le contenu. */
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    if (typeof window === "undefined") return 220;
    return localStorage.getItem("sidebarCollapsed") === "1" ? 56 : 220;
  });
  const [selectedStrategyId, setSelectedStrategyId] = useState(null);
  const [selectedAccountDetailId, setSelectedAccountDetailId] = useState(null);
  // Firme dont on affiche les paramètres (page "firm-detail").
  const [selectedFirmId, setSelectedFirmId] = useState(null);
  /* Section Finance — patrimoine. L'app d'origine passait ces identifiants par
     l'URL ([id], [slug], [isin]) ; tr4de navigue par état, comme pour les
     comptes de trading et les prop firms. */
  const [selectedAssetId, setSelectedAssetId] = useState(null);
  const [selectedClassSlug, setSelectedClassSlug] = useState(null);
  // Ligne de titres : { assetId, holdingId } — le couple, car l'ISIN seul ne
  // suffit pas à retrouver la ligne quand deux comptes portent le même titre.
  const [selectedHolding, setSelectedHolding] = useState(null);
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

  /* La sélection de comptes a été supprimée : le site travaille en permanence
     sur TOUS les comptes actifs. Il n'y a donc plus ni état, ni persistance
     localStorage, ni menu déroulant — `selectedAccountIds` n'est plus qu'une
     valeur dérivée, conservée comme prop pour les pages qui l'attendent. */

  // Sauvegarder le type de compte dans localStorage
  useEffect(() => {
    localStorage.setItem('accountType', accountType);
  }, [accountType]);

  // Sauvegarder la taille du compte Eval dans localStorage
  useEffect(() => {
    localStorage.setItem('selectedEvalAccount', selectedEvalAccount);
  }, [selectedEvalAccount]);

  // ✅ Les stratégies sont auto-sauvegardées via le hook useStrategies()

  /* accountType / selectedEvalAccount se calaient sur le compte sélectionné
     quand il n'y en avait qu'un. Sans sélection, il n'y a plus de « compte
     courant » : ces réglages gardent leur valeur propre. */

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

        // Plus de sélection à initialiser : tous les comptes actifs comptent.
        // On purge la clé devenue orpheline pour ne pas laisser traîner un
        // état qui ne pilote plus rien.
        try { localStorage.removeItem("selectedAccountIds"); } catch {}
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

  /* Tous les comptes actifs, en permanence : c'est ce que « selectedAccountIds »
     vaut désormais partout. Dérivé de `visibleAccounts`, donc les comptes
     placeholder et les eval archivés en restent exclus, comme avant. */
  const selectedAccountIds = React.useMemo(
    () => visibleAccounts.map(a => a.id),
    [visibleAccounts]
  );

  // Aucun filtre : toutes les pages affichent l'historique complet de tous les
  // comptes actifs, depuis le premier trade déposé.
  const filteredTrades = React.useMemo(() => {
    const active = new Set(selectedAccountIds);
    return trades.filter(t => active.has(t.account_id));
  }, [trades, selectedAccountIds]);

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

      // Plus de sélection à mettre à jour : `selectedAccountIds` se recalcule
      // depuis la liste des comptes, qui est rechargée juste après.

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
    /* Trading — tout ce qui touche aux trades, de la saisie au bilan. Le journal
       et la discipline ont rejoint la section : ils LISENT les mêmes trades, les
       isoler sous « Analyse » coupait le parcours en deux pour deux entrées. */
    {
      label: t("nav.trading"),
      items: [
        { id: "add-trade",  icon: LucideUpload,       label: t("nav.addTrade") },
        { id: "dashboard",  icon: LayoutDashboard,    label: t("nav.dashboard") },
        { id: "calendar",   icon: LucideCalendar,     label: t("nav.calendar") },
        { id: "trades",     icon: ListChecks,         label: t("nav.trades") },
        { id: "accounts",   icon: LucideWallet,       label: t("nav.accounts") },
        { id: "strategies", icon: LucideTarget,       label: t("nav.strategies") },
        { id: "journal",    icon: NotebookPen,        label: t("nav.journal") },
        { id: "discipline", icon: ShieldCheck,        label: t("nav.discipline") },
      ],
    },
    /* Vie perso — tout le hors-trading : le quotidien, le corps, les idées et
       l'argent personnel (à distinguer du capital de trading, qui vit dans
       « Comptes »). « Productivité » ne couvrait plus ni le sport, ni
       l'éloquence, ni le budget. */
    {
      label: t("nav.personal"),
      items: [
        { id: "daily-planner", icon: LucideCalendarDays, label: t("nav.dailyPlanner") },
        { id: "agenda",        icon: LucideCalendarClock, label: t("nav.agenda") },
        /* « Objectifs » a fusionné dans « Quête de soi » : une seule entrée,
           la page porte les catégories PUIS la liste des objectifs. */
        { id: "life-rpg",      icon: Mountain,           label: t("nav.lifeRpg") },
        { id: "sport",         icon: LucideDumbbell,     label: "Sport" },
        { id: "notes",         icon: LucideFileText,     label: t("nav.notes") },
        /* « Révisions » suit « Notes » : c'est là qu'on écrit ce qu'on veut
           retenir, et l'atelier des révisions part précisément de ces notes. */
        { id: "revisions",     icon: LucideBrain,        label: t("nav.revisions") },
        { id: "eloquence",     icon: LucideMic,          label: t("nav.eloquence") },
      ],
    },
    /* Finance — l'argent personnel, à distinguer du capital de trading qui vit
       dans « Comptes ». Les pages viennent de l'app patrimoine (cf.
       lib/patrimoine.ts).
       Ordre : ce qu'on possède (Patrimoine), ce qui circule (Cashflow), puis ce
       qu'on se fixe (Budget) — du constat vers l'intention. L'ancienne page
       « Dépenses » a bien fondu dans Cashflow ; le Budget, lui, est ressorti :
       c'est une saisie, on y va exprès, pas en faisant défiler un relevé. */
    {
      label: t("nav.finance"),
      items: [
        { id: "patrimoine", icon: LucideLandmark,  label: t("nav.patrimoine") },
        /* Deux flèches opposées, et non la tirelire d'avant : la page ne parle
           pas d'épargne mais de ce qui ENTRE et de ce qui SORT sur la fenêtre
           qu'on regarde. La tirelire disait la même chose que le poste
           « épargne » sans mener au même endroit ; le réseau de branches qui l'a
           remplacée un temps décrivait la FIGURE de la page (le Sankey) plutôt
           que son propos, et ne se lisait plus à 18 px. */
        { id: "cashflow",   icon: LucideArrowRightLeft, label: t("nav.cashflow") },
        { id: "budget",     icon: LucideChartPie,  label: t("nav.budget") },
        /* « Compte courant » (patrimoine-bank) et « Crédits » (
           patrimoine-liabilities) ne sont plus dans la navigation. Les deux pages
           restent routées et joignables depuis la synthèse Patrimoine — masquées
           ici seulement, pas retirées : « Crédits » s'ouvre en cliquant la classe
           Passifs. */
      ],
    },
  ];

  // Raccourcis clavier : Alt+1..9 pour naviguer entre les pages de la sidebar
  const flatNavIds = SIDEBAR_SECTIONS.flatMap(s => s.items.map(i => i.id));

  /* Pages visitées, de la plus récente à la plus ancienne — la page courante
     en tête. C'est un ordre d'USAGE, pas l'ordre de la sidebar : Ctrl+Tab
     faisait défiler la navigation cran par cran, ce qui obligeait à traverser
     huit pages pour revenir à celle qu'on quittait. Il ramène maintenant sur
     la dernière page visitée, comme Alt+Tab entre deux fenêtres.
     Les pages de détail (compte, firme, stratégie…) comptent aussi : c'est
     souvent d'elles qu'on part et vers elles qu'on veut revenir.
     Un `ref` et non un `state` : cet historique ne se dessine pas, et le
     remonter dans un état déclencherait un rendu de plus à chaque
     navigation. */
  const pageHistory = useRef([page]);
  useEffect(() => {
    const seen = pageHistory.current;
    if (seen[0] === page) return;
    // La page revisitée remonte en tête au lieu de s'empiler deux fois : sinon
    // un aller-retour saturerait l'historique de la même paire.
    pageHistory.current = [page, ...seen.filter(id => id !== page)].slice(0, 12);
  }, [page]);

  /* Ctrl+Tab : la page la plus récente (donc aller-retour, puisque la page
     qu'on quitte passe aussitôt en tête). Ctrl+Shift+Tab : un cran plus loin
     dans l'historique — sans quoi le raccourci ferait exactement la même chose
     que sans Shift. Au démarrage, l'historique n'a qu'une entrée : il n'y a
     alors nulle part où revenir et le raccourci ne fait rien, plutôt que de
     sauter sur une page qu'on n'a jamais ouverte. */
  const goRecent = (rank) => {
    const target = pageHistory.current[rank] ?? pageHistory.current[1];
    if (!target || target === page) return;
    setPage(target);
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
      handler: (e) => { e.preventDefault(); goRecent(1); },
    },
    {
      key: "Tab",
      ctrlOrCmd: true,
      shift: true,
      ignoreInInputs: false,
      handler: (e) => { e.preventDefault(); goRecent(2); },
    },
  ]);

  const pages = {
    dashboard:  <DashboardPage trades={filteredTrades} allTrades={trades} accounts={accounts} selectedAccountIds={selectedAccountIds} strategies={strategies} setPage={setPage} />,
    "add-trade": <AddTradePage trades={filteredTrades} setPage={setPage} setAccounts={setAccounts} accounts={accounts} firms={firms} selectedAccountIds={selectedAccountIds} addTrade={addTrade} addStrategy={addStrategy} strategies={strategies} user={user} />,
    trades:     <TradesPage trades={filteredTrades} strategies={strategies} accounts={visibleAccounts} onImportClick={() => setPage("add-trade")} onDeleteTrade={handleDeleteTrade} onClearTrades={handleClearTrades} />,
    "trade-chart": <TradeChartPage trades={filteredTrades} />,
    calendar:   <CalendarPage trades={filteredTrades} accountType={accountType} evalAccountSize={selectedEvalAccount} accounts={accounts} selectedAccountIds={selectedAccountIds} setPage={setPage} />,
    journal: <JournalPage trades={filteredTrades} strategies={strategies} onImportClick={() => setPage("add-trade")} onDeleteTrade={handleDeleteTrade} onClearTrades={handleClearTrades} />,
    discipline: <DisciplinePage trades={disciplineTrades} />,
    strategies: <StrategyPage setPage={setPage} setSelectedStrategyId={setSelectedStrategyId} />,
    "strategy-detail": <StrategyDetailPage setPage={setPage} />,
    backtest: <BacktestPage firms={firms} />,
    brokers: <BrokersPage />,
    accounts: <AccountsPage accounts={accounts} trades={trades} setPage={setPage} selectedAccountIds={selectedAccountIds} setSelectedAccountDetailId={setSelectedAccountDetailId} setSelectedFirmId={setSelectedFirmId} setAccounts={setAccounts} firms={firms} setFirms={setFirms} userId={user?.id} archivedMeta={archivedMeta} setArchivedMeta={setArchivedMeta} />,
    "account-detail": <AccountDetailPage accountId={selectedAccountDetailId} accounts={accounts} firms={firms} trades={trades} strategies={strategies} setPage={setPage} setSelectedFirmId={setSelectedFirmId} setAccounts={setAccounts} archivedMeta={archivedMeta} setArchivedMeta={setArchivedMeta} />,
    // `strategies` alimente la colonne « Stratégie » du tableau de trades :
    // sans elle, la page retombe sur le cache localStorage de TradesPage.
    "firm-detail": <PropFirmDetailPage firmId={selectedFirmId} firms={firms} accounts={accounts} trades={trades} strategies={strategies} userId={user?.id} setPage={setPage} setAccounts={setAccounts} setFirms={setFirms} setSelectedAccountDetailId={setSelectedAccountDetailId} />,
    /* Ancienne route « Objectifs » : elle mène désormais à la page fusionnée,
       pour que les liens existants (palette de commandes, renvois d'autres
       pages) tombent au bon endroit plutôt que sur un doublon. */
    goals: <LifeRpgPage />,
    "daily-planner": <DailyPlannerPage />,
    agenda: <AgendaPage />,
    sport: <SportPage />,
    reading: <ReadingListPage />,
    notes: <NotesPage />,
    revisions: <RevisionsPage />,
    drive: <DrivePage />,
    "life-rpg": <LifeRpgPage />,
    eloquence: <EloquencePage />,
    cashflow: <CashflowPage setPage={setPage} />,
    budget: <BudgetPage setPage={setPage} />,
    /* Ancienne route « Dépenses » : le réalisé vit dans Cashflow, et les liens
       existants (palette de commandes, renvois d'autres pages) doivent tomber
       là plutôt que dans le vide. */
    spending: <CashflowPage setPage={setPage} />,
    patrimoine: <PatrimoinePage setPage={setPage} setSelectedAssetId={setSelectedAssetId} setSelectedClassSlug={setSelectedClassSlug} />,
    "patrimoine-asset": <PatrimoineAssetPage assetId={selectedAssetId} setPage={setPage} setSelectedHolding={setSelectedHolding} />,
    "patrimoine-class": <PatrimoineClassPage classSlug={selectedClassSlug} setPage={setPage} setSelectedAssetId={setSelectedAssetId} />,
    "patrimoine-holding": <PatrimoineHoldingPage selection={selectedHolding} setPage={setPage} setSelectedAssetId={setSelectedAssetId} />,
    "patrimoine-bank": <PatrimoineBankPage setPage={setPage} />,
    "patrimoine-liabilities": <PatrimoineLiabilitiesPage setPage={setPage} setSelectedAssetId={setSelectedAssetId} />,
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
      {/* `--shell-left` : la place tenue par la barre latérale (sa largeur + sa
          gouttière de 12 px). Elle n'est plus dans le flux — c'est ce padding
          qui la remplace, appliqué au conteneur SCROLLABLE et non au cadre :
          le contenu part ainsi du bord de la fenêtre, et un bloc pleine largeur
          peut reprendre cette réserve pour passer derrière la barre. Remise à 0
          en mobile, où la barre est un tiroir (cf. globals.css). */}
      <div className="tr4de-root" style={{display:"flex",minHeight:"100vh",background:"var(--color-bg-subtle, #F5F5F5)","--shell-left":`${sidebarWidth + 12}px`}}>
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
          user={{ name: displayUser.name, initials: displayUser.initials, avatarUrl: displayUser.avatarUrl }}
          onProfile={() => setPage("settings")}
          onSettings={() => setPage("settings")}
          onDarkMode={() => {
            const cur = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
            const next = cur === "dark" ? "light" : "dark";
            document.documentElement.dataset.theme = next;
            try { localStorage.setItem("tr4de_theme", next); } catch {}
          }}
          onLogout={handleLogout}
          /* La barre se dimensionne sur son libellé le plus long : on lit sa
             largeur réelle plutôt que de la deviner. */
          onWidthChange={setSidebarWidth}
          workspace={null /* plus de « compte courant » : il n'y a plus de sélection */}
          workspaces={visibleAccounts.map(a => ({ id: a.id, name: a.name || "Compte" }))}
          onCreateWorkspace={() => setPage("add-trade")}
          sections={SIDEBAR_SECTIONS}
          activeId={page}
          onSelect={(id) => {
            // Plus de sélection à mettre de côté / restaurer en entrant et en
            // sortant d'« Ajouter un trade » : tous les comptes restent actifs.
            setPage(id);
            setMobileNavOpen(false);
          }}
        />


        {/* MAIN */}
        <div className="tr4de-main" style={{flex:1,minWidth:0,height:"100vh",display:"flex",flexDirection:"column",background:"transparent"}}>
          {/* Barre du haut. En desktop elle est VIDE (le hamburger est masqué) :
              sur le tableau de bord seul, elle ne prend alors AUCUNE hauteur,
              pour que la courbe pleine largeur monte jusqu'au bord supérieur.
              Les autres pages gardent leur respiration de 20 px, et les media
              queries mobiles rendent à la barre son padding vertical, où le
              hamburger doit tenir. */}
          <div className="tr4de-topbar" style={{flexShrink:0,zIndex:10,background:"var(--color-bg-subtle, #F5F5F5)",padding:page === "dashboard" ? "0 28px 0 calc(var(--shell-left, 0px) + 28px)" : "10px 28px 10px calc(var(--shell-left, 0px) + 28px)",display:"flex",alignItems:"center",gap:12,fontFamily:"var(--font-sans)"}}>
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
          {/* Pages déjà passées à la nouvelle DA : leurs sections sont des cartes
              blanches individuelles posées sur le FOND GRIS de la page. Les
              envelopper dans la carte blanche commune ferait disparaître ce fond
              et, avec lui, le détachement des cartes. */}
          {(() => { const daPage = DA_PAGES.includes(page); return (
          /* Sur les pages de la DA, ce cadre ne réserve RIEN à gauche : c'est le
             conteneur scrollable qui compense la barre latérale, pour que son
             bord (et son clip) parte du premier pixel. Les autres pages posent
             une carte blanche pleine page : elle, doit s'arrêter à la barre,
             sinon son fond s'étendrait derrière — d'où la réserve rendue ici. */
          <div style={{flex:1,minHeight:0,padding: daPage ? "0 0 8px 0" : "0 8px 8px 0",paddingLeft: daPage ? 0 : "var(--shell-left, 0px)",display:"flex"}}>
            <div className="scroll-thin" style={{
              background: daPage ? "transparent" : "var(--color-card-bg, #FFFFFF)",
              border: daPage ? "none" : "1px solid rgba(0, 0, 0, 0.06)",
              borderRadius: daPage ? 0 : 10,
              boxShadow: "none",
              /* Gouttière du site — UNE seule valeur, la même à gauche et à
                 droite (40 px, la marge de la page Patrimoine prise pour base).
                 La droite était à 24 px : un contenu qui part à 40 et s'arrête à
                 24 n'est pas centré dans sa colonne, et l'écart se voyait d'une
                 page à l'autre. Les deux restent exposées en variables : une
                 page peut reprendre la gauche en marge négative pour un bloc
                 pleine largeur (la courbe du tableau de bord), sans la
                 redéclarer en dur. */
              "--page-gutter-left": "40px",
              "--page-gutter": "var(--page-gutter-left)",
              /* Respiration verticale, elle aussi commune à TOUTES les pages :
                 les pages n'ont plus de `paddingTop` à elles (elles allaient de
                 8 à 20 px selon l'endroit), c'est le conteneur qui défile qui la
                 porte, une fois. */
              "--page-pad-top": "14px",
              "--page-pad-bottom": "24px",
              /* La réserve de la barre latérale est portée ICI, par le
                 conteneur scrollable lui-même, et pas par le cadre au-dessus :
                 c'est ce qui place son bord (donc son clip) au premier pixel de
                 la fenêtre. Un bloc pleine largeur reprend `--shell-left` +
                 `--page-gutter-left` en marge négative et file jusqu'au bord,
                 en passant derrière la barre. */
              "--content-left": "calc(var(--shell-left, 0px) + var(--page-gutter-left))",
              padding: daPage
                ? "var(--page-pad-top) var(--page-gutter) var(--page-pad-bottom) var(--content-left)"
                // Hors DA, la réserve de la barre est déjà prise par le cadre
                // au-dessus : seule la gouttière reste à poser.
                : "var(--page-pad-top) var(--page-gutter) var(--page-pad-bottom) var(--page-gutter-left)",
              display: "block",
              width: "100%",
              flex: 1,
              overflowY: "auto",
              overflowX: "hidden",
              position: "relative",
            }}>
              <div key={page} style={{ width: "100%", minWidth: 0 }}>
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
