"use client";

/**
 * PropFirmDetailPage — détail ET « paramètres » d'une firme de prop trading.
 *
 * Portée depuis la maquette Figma du détail d'un COMPTE
 * (fichier mqFgieIhnaljGeybhJRY0V, node 369:3984), adaptée à une FIRME : tous
 * les chiffres sont l'agrégat de ses comptes. Ordre des sections :
 *   1. barre d'actions seule, calée à droite (ajouter / modifier / supprimer) ;
 *   2. identité : logo + nom + « plateforme · N comptes » ;
 *   3. bloc valeur (369:3999) : chiffre héros + 4 mini-KPI, pastilles de
 *      période à droite ;
 *   4. graphique agrégé (courbe de la firme au premier plan, une ligne fine
 *      par compte derrière) ;
 *   5. calendrier du mois, tous comptes confondus ;
 *   6. statistiques (369:4167) : titre + « Voir plus » + 3 cartes ;
 *   7. liste des trades de la firme, tous comptes confondus — même brique que
 *      le détail d'un compte (components/ui/tradesList.jsx).
 *
 * Les comptes de la firme ne forment plus une section : ils vivent dans le menu
 * du sous-titre de l'en-tête (AccountsMenu) — ouvrir, modifier, supprimer, et
 * ajouter. La création de la firme elle-même se fait depuis la page Comptes
 * (PropFirmModal), qui porte aussi l'ajout d'UN compte rattaché à la firme.
 *
 * Règle du projet : aucune couleur en dur, tout passe par les tokens `T`
 * (ce sont des var(--color-*), c'est ce qui fait suivre le thème sombre).
 */

import React from "react";
import { Plus, Pencil, Trash2, Settings2, ChevronDown } from "lucide-react";
import { T } from "@/lib/ui/tokens";
import { fmt } from "@/lib/ui/format";
import { getCurrencySymbol } from "@/lib/userPrefs";
import { calculateFees } from "@/lib/tradeFees";
import { t, useLang } from "@/lib/i18n";
import { firmLogo } from "@/lib/accountBrand";
import {
  createFirmAccounts,
  deleteFirm,
  deleteTradingAccount,
  parseAccountSize,
  readFirmHeroMode,
  readFundedMeta,
} from "@/lib/propFirms";
import { RoundLogo } from "@/components/ui/accountRows";
import {
  CARD, SectionTitle, SectionAction, HeroAmount,
  PeriodPills, windowSeries, AGGREGATE_CURVE_COLOR, PnlChart, msOf, BackLink,
} from "@/components/ui/da";
import { assignSeriesColors, firmBrandColor } from "@/lib/ui/brandColors";
import { refreshTradesCache } from "@/lib/tradesCache";
import TradesList from "@/components/ui/tradesList";
import MonthCalendar from "@/components/ui/monthCalendar";
import {
  AccountModal,
  ConfirmModal,
  Field,
  ModalShell,
  PillGroup,
  PrimaryBtn,
  PropFirmModal,
  SizePicker,
  TextInput,
  firmErrorLabel,
} from "@/components/modals/AccountModals";

const fmtNoCents = (n) => {
  const sym = getCurrencySymbol();
  const v = Math.round(Number(n) || 0);
  return `${v < 0 ? "-" : ""}${sym}${Math.abs(v).toLocaleString("en-US")}`;
};

const typeLabel = (type, size) => {
  const base =
    type === "eval" ? t("addTrade.eval")
      : type === "funded" ? t("addTrade.funded")
        : type === "demo" ? t("accountsPage.demo")
          : t("accountsPage.live");
  return size ? `${base} · ${size}` : base;
};

/* Les dérivations des colonnes de trades (durée, session, jour, lots, clés
   de stratégie) et la liste elle-même vivent dans components/ui/tradesList.jsx :
   une seule source pour le détail d'un compte, le dashboard et cette page. */

/** Frais : brut − net quand le brut est connu, sinon le barème centralisé. */
const feesOf = (tr) => {
  if (tr == null) return 0;
  if (tr.pnlGross != null && Number.isFinite(Number(tr.pnlGross))) {
    return Number(tr.pnlGross) - (Number(tr.pnl) || 0);
  }
  return calculateFees(tr);
};

export default function PropFirmDetailPage({
  firmId,
  firms = [],
  accounts = [],
  trades = [],
  strategies = [],
  userId,
  setPage,
  setAccounts,
  setFirms,
  setSelectedAccountDetailId,
}) {
  useLang();
  const firm = firms.find((f) => f.id === firmId) || null;

  const [editingFirm, setEditingFirm] = React.useState(false);
  const [editingAccount, setEditingAccount] = React.useState(null);
  const [confirmAccount, setConfirmAccount] = React.useState(null);
  const [confirmFirm, setConfirmFirm] = React.useState(false);
  const [deleteFirmAccounts, setDeleteFirmAccounts] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");

  /* Formulaire d'ajout en lot — dans une fenêtre volante ouverte par le bouton
     posé sous la liste des comptes. */
  const [addOpen, setAddOpen] = React.useState(false);
  const [addType, setAddType] = React.useState("eval");
  // Taille normalisée pour eval/funded ; solde initial libre pour live/démo.
  const [addSize, setAddSize] = React.useState("50k");
  const [addBalance, setAddBalance] = React.useState("");
  const [addCount, setAddCount] = React.useState("1");
  const [addPrefix, setAddPrefix] = React.useState("");
  const [adding, setAdding] = React.useState(false);

  const [period, setPeriod] = React.useState("1A");
  const [statsExpanded, setStatsExpanded] = React.useState(false);
  const [allTradesShown, setAllTradesShown] = React.useState(false);
  /* Ce que montre le chiffre héros : valeur des comptes (capital + P&L) ou P&L
     seul. Réglé dans la modale « Paramètres de la firme », mémorisé par firme.
     Lu après le montage : la préférence vit en localStorage, la lire au premier
     rendu ferait diverger le HTML du serveur et celui du client. */
  const [heroMode, setHeroMode] = React.useState("value");
  React.useEffect(() => {
    if (firmId) setHeroMode(readFirmHeroMode(firmId));
  }, [firmId]);

  const isSizedType = addType === "eval" || addType === "funded";
  const addSizeValue = isSizedType ? addSize : (addBalance || null);

  const firmAccounts = React.useMemo(
    () => accounts.filter((a) => a.firm_id === firmId),
    [accounts, firmId]
  );

  /* Stratégies : la page n'en reçoit pas toujours en props (l'écran parent ne
     les lui passe pas systématiquement). On fusionne le cache local que la page
     Trades alimente avec les props — définitions complètes d'un côté (nom ET
     couleur, la liste affiche les deux), affectation trade → stratégies de
     l'autre. Aucune stratégie n'est inventée : sans affectation, « — ». */
  const [strategyDefs, setStrategyDefs] = React.useState([]);
  const [tradeStrategyMap, setTradeStrategyMap] = React.useState({});
  React.useEffect(() => {
    const byId = new Map();
    try {
      const raw = localStorage.getItem("tr4de_strategies") || localStorage.getItem("apex_strategies");
      const list = raw ? JSON.parse(raw) : [];
      (Array.isArray(list) ? list : []).forEach((s) => { if (s?.id) byId.set(s.id, s); });
    } catch {}
    (strategies || []).forEach((s) => { if (s?.id) byId.set(s.id, s); });
    setStrategyDefs(Array.from(byId.values()));
    try {
      const raw = localStorage.getItem("tr4de_trade_strategies");
      setTradeStrategyMap(raw ? JSON.parse(raw) : {});
    } catch {}
  }, [strategies]);

  // Agrégats par compte (trades, P&L, win rate)
  const statsByAccount = React.useMemo(() => {
    const map = new Map();
    firmAccounts.forEach((a) => map.set(a.id, { trades: 0, wins: 0, losses: 0, pnl: 0 }));
    (trades || []).forEach((tr) => {
      const s = map.get(tr.account_id);
      if (!s) return;
      const p = Number(tr.pnl) || 0;
      s.trades += 1;
      s.pnl += p;
      if (p > 0) s.wins += 1;
      else if (p < 0) s.losses += 1;
    });
    return map;
  }, [firmAccounts, trades]);

  /* Vue « compte » alignée sur celle de la page Comptes, pour que les mêmes
     colonnes affichent les mêmes chiffres des deux côtés. */
  const fundedMeta = React.useMemo(() => readFundedMeta(), []);
  const viewOf = React.useCallback((acc) => {
    const s = statsByAccount.get(acc.id) || { trades: 0, wins: 0, pnl: 0 };
    const capital = parseAccountSize(acc.eval_account_size);
    const isFunded = (acc.account_type || "live") === "funded";
    return {
      trades: s.trades,
      pnl: s.pnl,
      capital,
      value: capital != null ? capital + s.pnl : s.pnl,
      winRate: s.trades > 0 ? (s.wins / s.trades) * 100 : null,
      payout: isFunded ? Math.max(0, s.pnl - (fundedMeta[acc.id]?.funded_payout_min || 0)) : 0,
    };
  }, [statsByAccount, fundedMeta]);

  const totals = React.useMemo(() => {
    let count = 0, tradeCount = 0, wins = 0, pnl = 0, capital = 0;
    firmAccounts.forEach((a) => {
      count += 1;
      capital += parseAccountSize(a.eval_account_size) || 0;
      const s = statsByAccount.get(a.id);
      if (s) { tradeCount += s.trades; wins += s.wins; pnl += s.pnl; }
    });
    return { count, tradeCount, wins, pnl, capital, winRate: tradeCount > 0 ? (wins / tradeCount) * 100 : 0 };
  }, [firmAccounts, statsByAccount]);

  /** Tous les trades de la firme, du plus ancien au plus récent. */
  const firmTrades = React.useMemo(() => {
    const ids = new Set(firmAccounts.map((a) => a.id));
    return (trades || [])
      .filter((tr) => ids.has(tr.account_id))
      .sort((a, b) => msOf(a.date) - msOf(b.date));
  }, [firmAccounts, trades]);

  /** Courbe cumulée, un point par jour. */
  const firmCurve = React.useMemo(() => {
    const byDay = new Map();
    firmTrades.forEach((tr) => {
      const d = String(tr.date || "").slice(0, 10);
      if (!d) return;
      byDay.set(d, (byDay.get(d) || 0) + (Number(tr.pnl) || 0));
    });
    const days = [...byDay.keys()].sort();
    if (days.length === 0) return [];
    const out = [];
    // Point de départ à zéro, la veille du premier trade.
    const first = new Date(days[0]);
    first.setDate(first.getDate() - 1);
    out.push({ date: first.toISOString().slice(0, 10), cum: 0 });
    let cum = 0;
    days.forEach((d) => { cum += byDay.get(d); out.push({ date: d, cum }); });
    return out;
  }, [firmTrades]);

  const visibleCurve = React.useMemo(
    () => windowSeries(firmCurve, period),
    [firmCurve, period]
  );

  /** Une série par compte, tracée en arrière-plan du graphique. */
  /* Couleur de marque de la firme : elle porte la courbe agrégée de la page.
     Repli sur l'accent des agrégats si la firme n'est pas au catalogue. */
  const firmColor = React.useMemo(
    () => firmBrandColor(firm) || AGGREGATE_CURVE_COLOR,
    [firm]
  );

  /* Tous les comptes de cette page appartiennent à la MÊME firme : leur donner
     à tous sa couleur les rendrait indistinguables — et la courbe agrégée qui
     passe devant porte déjà cette teinte. Ils prennent donc les secondaires de
     la firme, puis des variantes (cf. assignSeriesColors). La liste sous le
     graphique lit la même map, pour que pastille et courbe concordent. */
  const colorByAccount = React.useMemo(
    () => assignSeriesColors(
      (firmAccounts || []).map((acc) => ({ id: acc.id, account: acc, firm })),
      { skipPrimary: true }
    ),
    [firmAccounts, firm]
  );

  const accountSeries = React.useMemo(() => {
    return firmAccounts.map((acc) => {
      const byDay = new Map();
      (trades || [])
        .filter((tr) => tr.account_id === acc.id)
        .forEach((tr) => {
          const d = String(tr.date || "").slice(0, 10);
          if (!d) return;
          byDay.set(d, (byDay.get(d) || 0) + (Number(tr.pnl) || 0));
        });
      const days = [...byDay.keys()].sort();
      let cum = 0;
      const points = days.map((d) => { cum += byDay.get(d); return { date: d, cum }; });
      return { id: acc.id, name: acc.name, color: colorByAccount.get(acc.id), points };
    }).filter((s) => s.points.length > 1);
  }, [firmAccounts, trades, colorByAccount]);

  /** KPI de performance, calculés comme sur la page d'un compte. */
  const perf = React.useMemo(() => {
    const wins = firmTrades.filter((tr) => (Number(tr.pnl) || 0) > 0);
    const losses = firmTrades.filter((tr) => (Number(tr.pnl) || 0) < 0);
    const sum = (arr) => arr.reduce((s, tr) => s + (Number(tr.pnl) || 0), 0);
    const grossWin = sum(wins);
    const grossLoss = Math.abs(sum(losses));
    const total = firmTrades.length;
    // Drawdown maximal sur la courbe cumulée.
    let peak = 0, maxDD = 0;
    firmCurve.forEach((p) => {
      if (p.cum > peak) peak = p.cum;
      const dd = p.cum - peak;
      if (dd < maxDD) maxDD = dd;
    });
    const totalFees = firmTrades.reduce((s, tr) => s + feesOf(tr), 0);
    const days = new Set(firmTrades.map((tr) => String(tr.date || "").slice(0, 10)).filter(Boolean));
    const longCount = firmTrades.filter((tr) => !String(tr.direction || "long").toLowerCase().startsWith("s")).length;
    return {
      total,
      wins: wins.length,
      losses: losses.length,
      scratch: total - wins.length - losses.length,
      longCount,
      shortCount: total - longCount,
      winRate: total > 0 ? (wins.length / total) * 100 : 0,
      profitFactor: grossLoss > 0 ? grossWin / grossLoss : (grossWin > 0 ? Infinity : 0),
      expectancy: total > 0 ? sum(firmTrades) / total : 0,
      maxDD,
      avgWin: wins.length ? grossWin / wins.length : 0,
      avgLoss: losses.length ? -grossLoss / losses.length : 0,
      bestTrade: total ? Math.max(...firmTrades.map((tr) => Number(tr.pnl) || 0)) : 0,
      worstTrade: total ? Math.min(...firmTrades.map((tr) => Number(tr.pnl) || 0)) : 0,
      totalFees,
      tradingDays: days.size,
      pnl: sum(firmTrades),
    };
  }, [firmTrades, firmCurve]);

  /** Valeur de la firme = capital géré + P&L agrégé (chiffre héros). */
  const firmValue = totals.capital + perf.pnl;

  /** Trades affichés, du plus récent au plus ancien. */
  const shownTrades = React.useMemo(() => {
    const list = [...firmTrades].reverse();
    return allTradesShown ? list : list.slice(0, 12);
  }, [firmTrades, allTradesShown]);

  if (!firm) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 24, paddingTop: 14 }} className="anim-1">
        <div style={{ display: "flex", alignItems: "center", margin: "-7px -8px" }}>
          <BackLink label={t("nav.accounts")} onClick={() => setPage?.("accounts")} />
        </div>
        <div style={{ ...CARD, padding: 40, textAlign: "center", color: T.textMut, fontSize: 13 }}>
          {t("firms.notFound")}
        </div>
      </div>
    );
  }

  /* Logo de la firme, résolu sur son NOM. Sa plateforme d'exécution
     (Tradovate, Rithmic…) ne sert qu'à l'import : la firme reste identifiée
     par sa propre marque. */
  const logo = firmLogo(firm);

  /* ─── Actions ─── */

  const nextIndexPreview = () => {
    const base = (addPrefix || firm.name || "Compte").trim();
    const sizeLabel = isSizedType ? addSize : null;
    const taken = new Set(accounts.map((a) => String(a.name || "").toLowerCase()));
    const names = [];
    const n = Math.max(1, Math.min(50, parseInt(addCount, 10) || 1));
    let i = 1;
    while (names.length < n) {
      const name = `${[base, sizeLabel].filter(Boolean).join(" ")} #${i}`;
      if (!taken.has(name.toLowerCase())) { names.push(name); taken.add(name.toLowerCase()); }
      i += 1;
      if (i > 200) break;
    }
    return names;
  };

  const onAddAccounts = async () => {
    setAdding(true);
    setError("");
    try {
      const created = await createFirmAccounts(userId, firm, {
        count: parseInt(addCount, 10) || 1,
        accountType: addType,
        size: addSizeValue,
        namePrefix: addPrefix || null,
      });
      setAccounts?.((prev) => [...created, ...(prev || [])]);
      setAddCount("1");
      setAddOpen(false);
    } catch (e) {
      setError(firmErrorLabel(e));
    } finally {
      setAdding(false);
    }
  };

  const onDeleteAccount = async () => {
    if (!confirmAccount) return;
    setBusy(true);
    setError("");
    try {
      await deleteTradingAccount(confirmAccount.id, userId);
      setAccounts?.((prev) => (prev || []).filter((a) => a.id !== confirmAccount.id));
      // Les trades du compte sont supprimés avec lui : le cache local doit
      // suivre, sinon useTrades() les ressert jusqu'au prochain rechargement.
      await refreshTradesCache(userId);
      setConfirmAccount(null);
      setEditingAccount(null);
    } catch (e) {
      setError(firmErrorLabel(e));
    } finally {
      setBusy(false);
    }
  };

  const onDeleteFirm = async () => {
    setBusy(true);
    setError("");
    try {
      await deleteFirm(firm.id, userId, { deleteAccounts: deleteFirmAccounts });
      setFirms?.((prev) => (prev || []).filter((f) => f.id !== firm.id));
      setAccounts?.((prev) =>
        deleteFirmAccounts
          ? (prev || []).filter((a) => a.firm_id !== firm.id)
          : (prev || []).map((a) => (a.firm_id === firm.id ? { ...a, firm_id: null } : a))
      );
      // « Supprimer aussi les comptes » emporte leurs trades : même re-synchro.
      if (deleteFirmAccounts) await refreshTradesCache(userId);
      setConfirmFirm(false);
      setPage?.("accounts");
    } catch (e) {
      setError(firmErrorLabel(e));
      setBusy(false);
    }
  };

  const previewNames = nextIndexPreview();

  return (
    <div
      style={{ display: "flex", flexDirection: "column", gap: 24, paddingTop: 8, fontFamily: "var(--font-sans)" }}
      className="anim-1"
    >
      {/* ═══ 1. BARRE D'ACTIONS ═══
          Une ligne à elle seule : le retour vers la liste des comptes à gauche
          — il n'existait jusqu'ici que sur l'écran « firme introuvable », donc
          nulle part en usage normal —, les actions de la firme à droite. */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", minWidth: 0, margin: "-7px -8px" }}>
          <BackLink label={t("nav.accounts")} onClick={() => setPage?.("accounts")} />
        </div>
        {/* Actions de la firme, par importance décroissante : l'ajout de comptes
            est l'action première de la page (c'est ici qu'on règle le nombre de
            comptes), donc pleine ; le destructif reste à l'extrémité. */}
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 14px",
              minHeight: 32, borderRadius: 999, border: "none", background: T.text,
              color: T.textInverted, fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit",
            }}
          >
            <Plus size={13} strokeWidth={1.75} /> {t("firms.addAccount")}
          </button>
          <button
            type="button"
            onClick={() => setEditingFirm(true)}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px",
              borderRadius: 999, border: `1px solid ${T.border}`, background: T.white,
              color: T.text, fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit",
            }}
          >
            <Settings2 size={13} strokeWidth={1.75} /> {t("firms.editFirm")}
          </button>
          <button
            type="button"
            onClick={() => { setDeleteFirmAccounts(false); setConfirmFirm(true); }}
            aria-label={t("firms.deleteFirm")}
            title={t("firms.deleteFirm")}
            style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              width: 32, height: 32, borderRadius: 999,
              border: `1px solid ${T.border}`, background: T.white, color: T.textMut, cursor: "pointer",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = T.red; e.currentTarget.style.borderColor = T.redBd; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = T.textMut; e.currentTarget.style.borderColor = T.border; }}
          >
            <Trash2 size={14} strokeWidth={1.75} />
          </button>
        </div>
      </div>

      {/* ═══ 2. IDENTITÉ (node 369:3989) ═══
          Vignette ronde 44 px, nom 16 px Medium et plateforme 14 px à 40 % en
          sous-titre. */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          <RoundLogo src={logo} size={44} name={firm.name} />
          <div style={{ display: "flex", flexDirection: "column", gap: 4, justifyContent: "center", minWidth: 0 }}>
            <h1 style={{
              margin: 0, fontSize: 16, fontWeight: 500, lineHeight: 1.25, color: T.text,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {firm.name}
            </h1>
            {/* « N comptes » : le sous-titre nomme les comptes, il sert donc
                aussi de raccourci vers eux. Cliquable en entier (texte +
                chevron), il ouvre la liste des comptes de la firme. La
                plateforme d'exécution n'y figure plus : elle ne sert qu'à
                l'import et se règle dans « Paramètres de la firme ». */}
            <AccountsMenu
              label={
                totals.count === 1
                  ? t("firms.oneAccount")
                  : t("firms.nAccounts").replace("{n}", String(totals.count))
              }
              accounts={firmAccounts}
              colorByAccount={colorByAccount}
              viewOf={viewOf}
              onOpenAccount={(id) => {
                setSelectedAccountDetailId?.(id);
                setPage?.("account-detail");
              }}
              onEditAccount={(acc) => setEditingAccount(acc)}
              onDeleteAccount={(acc) => setConfirmAccount(acc)}
              onAddAccount={() => setAddOpen(true)}
            />
          </div>
        </div>

      </div>

      {error && (
        <div style={{
          fontSize: 12, color: T.red, background: T.redBg, border: `1px solid ${T.redBd}`,
          borderRadius: 8, padding: "9px 12px",
        }}>
          {error}
        </div>
      )}

      {/* ═══ 3. BLOC VALEUR (node 369:3999) + 4. GRAPHIQUE ═══
          Chiffre héros = capital géré + P&L agrégé, ou P&L seul selon le
          réglage de la firme (voir « Paramètres de la firme »). Sous le chiffre
          héros, les 4 mini-KPI de la maquette (écart 38 px). Pastilles de
          période à droite. */}
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {/* 28 px et non les 40 de la maquette : à l'usage le bloc
                  écrasait tout le haut de page. Les mini-KPI suivent. */}
              <HeroAmount value={heroMode === "pnl" ? perf.pnl : firmValue} size={28} />
              <div style={{ display: "flex", alignItems: "center", gap: 28, flexWrap: "wrap" }}>
                <MiniKpi
                  label="P&L"
                  value={fmt(perf.pnl, true)}
                  tone={perf.pnl > 0 ? "pos" : perf.pnl < 0 ? "neg" : undefined}
                />
                <MiniKpi
                  label="Win rate"
                  value={perf.total > 0 ? `${perf.winRate.toFixed(1)}%` : "—"}
                  tone={perf.total === 0 ? undefined : perf.winRate >= 50 ? "pos" : "neg"}
                />
                <MiniKpi
                  label="Profit factor"
                  value={perf.profitFactor === Infinity ? "∞" : perf.total > 0 ? perf.profitFactor.toFixed(2) : "—"}
                />
                <MiniKpi label="Trades" value={String(perf.total)} />
              </div>
            </div>
          </div>
          <PeriodPills value={period} onChange={setPeriod} />
        </div>

        {/* Courbe agrégée de la firme au premier plan, dans SA couleur de
            marque, une ligne fine par compte derrière (déclinaisons de cette
            même couleur). L'accent générique des agrégats ne sert plus que si
            la firme n'est pas au catalogue. */}
        <PnlChart points={visibleCurve} others={accountSeries} color={firmColor} />
      </div>

      {/* La liste des comptes n'occupe plus une section entière : elle vit
         dans le menu du sous-titre de l'en-tête (AccountsMenu), qui porte
         aussi l'ouverture, la modification et la suppression d'un compte. */}

      {/* Calendrier du mois, tous comptes de la firme confondus — posé avant
          les statistiques : il dit « quand », elles disent « combien ». */}
      <MonthCalendar trades={firmTrades} title="Calendrier du mois" onDayClick={() => setPage?.("trades")} />

      {/* ═══ 6. STATISTIQUES (node 369:4167) ═══
          Titre + « Voir plus » + 3 cartes de récapitulatif. Repliées, elles
          montrent 4 lignes comme la maquette ; dépliées, toutes les mesures
          déjà calculées par la page (aucune donnée perdue). */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <SectionTitle
          action={
            <SectionAction onClick={() => setStatsExpanded((v) => !v)}>
              {statsExpanded ? "Voir moins" : "Voir plus"}
            </SectionAction>
          }
        >
          Statistiques
        </SectionTitle>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12, alignItems: "stretch" }}>
          <StatsCard title="Trades" expanded={statsExpanded} rows={[
            ["Total trades", String(perf.total)],
            ["Gagnants", String(perf.wins)],
            ["Perdants", String(perf.losses)],
            ["Neutres", String(perf.scratch)],
            ["Long", String(perf.longCount)],
            ["Short", String(perf.shortCount)],
            ["Win rate", perf.total > 0 ? `${perf.winRate.toFixed(1)}%` : "—"],
            ["Profit factor", perf.profitFactor === Infinity ? "∞" : perf.total > 0 ? perf.profitFactor.toFixed(2) : "—"],
          ]} />
          <StatsCard title="P&L" expanded={statsExpanded} rows={[
            ["P&L cumulé", fmt(perf.pnl, true)],
            ["Gain moyen", perf.wins ? fmt(perf.avgWin, true) : "—"],
            ["Perte moyenne", perf.losses ? fmt(perf.avgLoss, true) : "—"],
            ["Drawdown max", perf.maxDD < 0 ? fmt(perf.maxDD, false) : "—"],
            ["Meilleur trade", perf.total ? fmt(perf.bestTrade, true) : "—"],
            ["Pire trade", perf.total ? fmt(perf.worstTrade, true) : "—"],
            ["Espérance / trade", perf.total > 0 ? fmt(perf.expectancy, true) : "—"],
            ["Frais cumulés", perf.total > 0 ? fmt(perf.totalFees, false) : "—"],
          ]} />
          <StatsCard title="Comptes" expanded={statsExpanded} rows={[
            ["Comptes", String(totals.count)],
            ["Capital géré", totals.capital > 0 ? fmtNoCents(totals.capital) : "—"],
            ["Valeur actuelle", totals.capital > 0 ? fmtNoCents(firmValue) : fmt(perf.pnl, true)],
            ["Payout dispo", fmtNoCents(firmAccounts.reduce((s, a) => s + viewOf(a).payout, 0))],
            ["Jours tradés", String(perf.tradingDays)],
            ["Trades / compte", totals.count > 0 ? (perf.total / totals.count).toFixed(1) : "—"],
          ]} />
        </div>
      </div>

      {/* ═══ 7. LISTE DES TRADES DE LA FIRME ═══
          Tous comptes confondus, d'où la colonne « Compte » en plus du jeu de
          colonnes commun. Même brique que le détail d'un compte : colonnes de
          largeur égale, détail dépliable, aucun défilement horizontal. */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <SectionTitle
          action={
            firmTrades.length > 12 ? (
              <SectionAction onClick={() => setAllTradesShown((v) => !v)}>
                {allTradesShown ? "Voir moins" : "Voir plus"}
              </SectionAction>
            ) : null
          }
        >
          <span style={{ display: "inline-flex", alignItems: "baseline", gap: 8 }}>
            <span>Trades</span>
            <span style={{ fontSize: 20, fontWeight: 400, color: T.text, opacity: 0.4 }}>{perf.total}</span>
          </span>
        </SectionTitle>

        <TradesList
          trades={shownTrades}
          strategies={strategyDefs}
          tradeStrategies={tradeStrategyMap}
          accounts={firmAccounts}
          columns={["symbol", "account", "direction", "strategy", "date", "duration", "lots", "fees", "r", "pnl"]}
          empty="Aucun trade sur les comptes de cette firme."
        />
      </div>

      {/* ─── Modales ─── */}
      {/* Formulaire d'ajout en lot (type + taille + nombre + préfixe). */}
      {addOpen && (
        <ModalShell
          title={t("firms.addTitle")}
          subtitle={t("firms.addSub")}
          width={520}
          onClose={() => setAddOpen(false)}
          footer={
            <PrimaryBtn onClick={onAddAccounts} disabled={adding}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <Plus size={13} strokeWidth={2} />
                {adding
                  ? t("common.saving")
                  : previewNames.length === 1
                    ? t("firms.addOneCta")
                    : t("firms.addNCta").replace("{n}", String(previewNames.length))}
              </span>
            </PrimaryBtn>
          }
        >
          <Field label={t("accountModal.type")}>
            <PillGroup
              ariaLabel={t("accountModal.type")}
              value={addType}
              onChange={setAddType}
              options={[
                { id: "eval", label: t("addTrade.eval") },
                { id: "funded", label: t("addTrade.funded") },
                { id: "live", label: t("addTrade.live") },
                { id: "demo", label: t("addTrade.demo") },
              ]}
            />
          </Field>

          {isSizedType ? (
            <Field label={t("accountModal.size")}>
              <SizePicker value={addSize} onChange={setAddSize} />
            </Field>
          ) : (
            <Field label={t("accountModal.balance")}>
              <div style={{ maxWidth: 200 }}>
                <TextInput
                  type="number"
                  value={addBalance}
                  onChange={setAddBalance}
                  placeholder="10000"
                  min="0"
                  step="any"
                />
              </div>
            </Field>
          )}

          <Field label={t("firms.count")}>
            <div style={{ maxWidth: 140 }}>
              <TextInput type="number" value={addCount} onChange={setAddCount} min="1" max="50" step="1" />
            </div>
          </Field>

          <Field label={t("firms.namePrefix")} hint={t("firms.namePrefixHint")}>
            <TextInput value={addPrefix} onChange={setAddPrefix} placeholder={firm.name} />
          </Field>

          {previewNames.length > 0 && (
            <div style={{ fontSize: 11, color: T.textMut, lineHeight: 1.6 }}>
              {t("firms.preview")}{" "}
              {previewNames.slice(0, 4).map((n) => (
                <span
                  key={n}
                  style={{
                    display: "inline-block", padding: "2px 8px", marginRight: 6, marginTop: 4,
                    borderRadius: 999, border: `1px solid ${T.border}`, background: T.bg,
                    color: T.textSub, fontSize: 11,
                  }}
                >
                  {n}
                </span>
              ))}
              {previewNames.length > 4 && <span>+{previewNames.length - 4}</span>}
            </div>
          )}

          {/* L'échec garde la fenêtre ouverte : le bandeau d'erreur de la page
              serait caché derrière, on le répète donc ici. */}
          {error && (
            <div style={{
              fontSize: 12, color: T.red, background: T.redBg, border: `1px solid ${T.redBd}`,
              borderRadius: 8, padding: "9px 12px",
            }}>
              {error}
            </div>
          )}
        </ModalShell>
      )}

      {editingFirm && (
        <PropFirmModal
          firm={firm}
          accounts={firmAccounts}
          userId={userId}
          onClose={() => setEditingFirm(false)}
          onSaved={(next) => setFirms?.((prev) => (prev || []).map((f) => (f.id === next.id ? next : f)))}
          /* La modale gère aussi les comptes de la firme : on répercute ses
             retraits et ses ajouts dans l'état de l'application. */
          onHeroModeChanged={setHeroMode}
          onAccountsChanged={({ removedIds, created }) => {
            setAccounts?.((prev) => {
              const kept = (prev || []).filter((a) => !removedIds.includes(a.id));
              return [...kept, ...(created || [])];
            });
          }}
        />
      )}

      {editingAccount && (
        <AccountModal
          account={editingAccount}
          firms={firms}
          userId={userId}
          onClose={() => setEditingAccount(null)}
          onDelete={(acc) => { setEditingAccount(null); setConfirmAccount(acc); }}
          onSaved={(next) =>
            setAccounts?.((prev) => (prev || []).map((a) => (a.id === next.id ? { ...a, ...next } : a)))
          }
        />
      )}

      {confirmAccount && (
        <ConfirmModal
          title={t("firms.deleteAccountTitle")}
          message={t("firms.deleteAccountMsg").replace("{name}", confirmAccount.name || "")}
          confirmLabel={t("common.delete")}
          busy={busy}
          onConfirm={onDeleteAccount}
          onClose={() => setConfirmAccount(null)}
        />
      )}

      {confirmFirm && (
        <ConfirmModal
          title={t("firms.deleteFirmTitle").replace("{name}", firm.name)}
          message={
            firmAccounts.length === 0
              ? t("firms.deleteFirmMsgEmpty")
              : t("firms.deleteFirmMsg").replace("{n}", String(firmAccounts.length))
          }
          confirmLabel={t("firms.deleteFirm")}
          busy={busy}
          onConfirm={onDeleteFirm}
          onClose={() => setConfirmFirm(false)}
          extra={
            firmAccounts.length > 0 ? (
              <label style={{
                display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12,
                color: T.textSub, cursor: "pointer", lineHeight: 1.5,
              }}>
                <input
                  type="checkbox"
                  checked={deleteFirmAccounts}
                  onChange={(e) => setDeleteFirmAccounts(e.target.checked)}
                  style={{ marginTop: 2, accentColor: T.red }}
                />
                <span>{t("firms.deleteFirmAlsoAccounts").replace("{n}", String(firmAccounts.length))}</span>
              </label>
            ) : null
          }
        />
      )}
    </div>
  );
}

/* ─────────────────────────── Sous-composants ─────────────────────────── */

/**
 * Mini-KPI du bloc valeur (node 369:4349) : libellé 14 px atténué au-dessus,
 * valeur 16 px Medium en dessous. Les 4 tuiles sont espacées de 38 px.
 */
function MiniKpi({ label, value, tone }) {
  const color = tone === "pos" ? T.pnlPos : tone === "neg" ? T.pnlNeg : T.text;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2 }}>
      <span style={{ fontSize: 11, lineHeight: 1, color: T.textSub, whiteSpace: "nowrap" }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 600, lineHeight: 1, color, whiteSpace: "nowrap" }}>
        {value}
      </span>
    </div>
  );
}

/**
 * Sous-titre « Plateforme · N comptes » de l'en-tête, doublé d'un menu vers les
 * comptes de la firme. Toute la ligne est le déclencheur — le chevron seul
 * ferait une cible de 14 px.
 *
 * Le menu se ferme au clic extérieur, à Échap et après une sélection ; le focus
 * revient alors sur le déclencheur pour ne pas perdre la navigation clavier.
 */
function AccountsMenu({ label, accounts = [], colorByAccount, viewOf, onOpenAccount, onEditAccount, onDeleteAccount, onAddAccount }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  const triggerRef = React.useRef(null);

  React.useEffect(() => {
    if (!open) return;
    const onPointer = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const choose = (fn) => { setOpen(false); fn(); };

  return (
    <div ref={ref} style={{ position: "relative", minWidth: 0 }}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        style={{
          display: "inline-flex", alignItems: "center", gap: 4,
          background: "none", border: "none", padding: 0, margin: 0,
          fontFamily: "inherit", fontSize: 14, lineHeight: 1.25,
          color: T.text, opacity: open ? 0.7 : 0.4, whiteSpace: "nowrap", cursor: "pointer",
          transition: "opacity var(--dur-fast) var(--ease-out)",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.7"; }}
        onMouseLeave={(e) => { e.currentTarget.style.opacity = open ? "0.7" : "0.4"; }}
      >
        <span>{label}</span>
        <ChevronDown
          size={14}
          aria-hidden
          style={{
            flexShrink: 0,
            transform: open ? "rotate(180deg)" : "none",
            transition: "transform var(--dur-base) var(--ease-out)",
          }}
        />
      </button>

      {open && (
        // `anim-pop` naît du coin haut-gauche, c'est-à-dire du déclencheur.
        <div
          role="menu"
          className="anim-pop"
          style={{
            position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 60,
            minWidth: 260, maxHeight: 320, overflowY: "auto",
            background: T.white, border: `1px solid ${T.border}`, borderRadius: 10,
            boxShadow: T.elevCard, padding: 4,
          }}
        >
          {accounts.length === 0 ? (
            <div style={{ padding: "10px 10px", fontSize: 13, color: T.textMut }}>
              {t("firms.noAccountYet")}
            </div>
          ) : accounts.map((acc) => {
            const v = viewOf(acc);
            const value = v.capital != null ? fmtNoCents(v.value) : fmt(v.pnl, false);
            /* Ouvrir / modifier / supprimer côte à côte : trois cibles, donc
               trois boutons frères (un bouton ne peut pas en contenir un autre)
               dans une rangée qui se surligne d'un bloc. */
            return (
              <div
                key={acc.id}
                style={{
                  display: "flex", alignItems: "center", gap: 4, borderRadius: 6,
                  transition: "background var(--dur-fast) var(--ease-out)",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = T.rowHighlight; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => choose(() => onOpenAccount?.(acc.id))}
                  style={{
                    flex: "1 1 auto", display: "flex", alignItems: "center", gap: 8, minWidth: 0,
                    textAlign: "left", padding: "8px 10px", minHeight: 40, borderRadius: 6,
                    border: "none", background: "transparent", cursor: "pointer",
                    fontFamily: "inherit", color: T.text,
                  }}
                >
                  {/* Même couleur que la courbe du compte dans le graphique. */}
                  <span aria-hidden style={{
                    width: 8, height: 8, borderRadius: 999, flexShrink: 0,
                    background: colorByAccount?.get(acc.id) || T.textSub,
                  }} />
                  <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0, flex: "1 1 auto" }}>
                    <span style={{
                      fontSize: 13, fontWeight: 500,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {acc.name || acc.eval_account_size || "Compte"}
                    </span>
                    <span style={{ fontSize: 11, color: T.textMut, whiteSpace: "nowrap" }}>
                      {typeLabel(acc.account_type, acc.eval_account_size)}
                    </span>
                  </span>
                  <span style={{
                    fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", flexShrink: 0,
                    fontVariantNumeric: "tabular-nums",
                    color: v.pnl > 0 ? T.pnlPos : v.pnl < 0 ? T.pnlNeg : T.textSub,
                  }}>
                    {value}
                  </span>
                </button>
                {onEditAccount && (
                  <IconBtn label={t("common.edit")} onClick={() => choose(() => onEditAccount(acc))}>
                    <Pencil size={13} strokeWidth={1.75} />
                  </IconBtn>
                )}
                {onDeleteAccount && (
                  <IconBtn label={t("common.delete")} danger onClick={() => choose(() => onDeleteAccount(acc))}>
                    <Trash2 size={13} strokeWidth={1.75} />
                  </IconBtn>
                )}
              </div>
            );
          })}

          {onAddAccount && (
            <>
              <div style={{ height: 1, background: T.border, margin: "4px 0" }} />
              <button
                type="button"
                role="menuitem"
                onClick={() => choose(onAddAccount)}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 8,
                  textAlign: "left", padding: "8px 10px", minHeight: 36, borderRadius: 6,
                  border: "none", background: "transparent", cursor: "pointer",
                  fontFamily: "inherit", fontSize: 13, fontWeight: 500, color: T.textSub,
                  transition: "background var(--dur-fast) var(--ease-out)",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = T.rowHighlight; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                <Plus size={14} strokeWidth={1.75} /> {t("firms.addAccount")}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* Carte de récapitulatif : un titre puis des lignes libellé → valeur.
   Même présentation que les cartes « Statistiques » de la maquette (4 lignes
   visibles ; « Voir plus » déplie tout le reste). */
function StatsCard({ title, rows, expanded }) {
  const VISIBLE = 4;
  const shown = expanded ? rows : rows.slice(0, VISIBLE);
  return (
    <div style={{ ...CARD, display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.2, color: T.text }}>{title}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {shown.map(([label, value]) => (
          <div key={label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <span style={{
              fontSize: 12, color: T.text, opacity: 0.5,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {label}
            </span>
            <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: -0.15, color: T.text, whiteSpace: "nowrap" }}>
              {value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function IconBtn({ children, onClick, label, danger }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 30, height: 30, borderRadius: 8, border: "none",
        background: "transparent", color: T.textMut, cursor: "pointer", flexShrink: 0,
        transition: "background .12s ease, color .12s ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = danger ? T.redBg : T.accentBg;
        e.currentTarget.style.color = danger ? T.red : T.text;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.color = T.textMut;
      }}
    >
      {children}
    </button>
  );
}
