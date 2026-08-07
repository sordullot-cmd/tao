"use client";

import React, { useState, useEffect, useRef } from "react";
import ReactDOM from "react-dom";
import {
  Check as LucideCheck,
  Upload as LucideUpload,
  X as LucideX,
  Star,
} from "lucide-react";
import { T } from "@/lib/ui/tokens";
import { t, useLang, getLang } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/client";
import { parseCSV } from "@/lib/csvParsers";
import SearchableSelect from "@/components/ui/SearchableSelect";
import QuickAccountSelector from "@/components/QuickAccountSelector";
import { PLATFORMS } from "@/lib/brokers/platforms";

export default function AddTradePage({ trades, setPage, setAccounts, setSelectedAccountIds, accounts = [], selectedAccountIds = [], addTrade, addStrategy, strategies = [], user }) {
  useLang();
  const [accountNames, setAccountNames] = useState([]);
  const accountName = accountNames.length === 1 ? accountNames[0] : "";
  // Comptes réellement sélectionnés (résolus par nom) — sert au récapitulatif
  // en lecture seule du type / de la taille.
  const selectedAccountObjects = React.useMemo(
    () => accountNames.map((n) => (accounts || []).find((a) => a.name === n)).filter(Boolean),
    [accountNames, accounts]
  );
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
  const [strategyFormData, setStrategyFormData] = useState({ name: "", description: "", color: "#5F7FB4", groups: [{ id: Date.now(), name: "", rules: [{ id: Date.now() + 1, text: "" }] }] });
  const fileInputRef = useRef(null);

  const colors = ["#9B7D94", "#997B5D", "#A5956B", "#6B9B6F", "#4A9D6F", "#6B9D68", "#5F8BA0", "#5F7FB4", "#6B8BB4", "#8B7BA4", "#A07B94", "#7F7F7F"];

  // ✅ Les stratégies viennent maintenant du hook passé en props

  const getDefaultStrategyFormData = () => ({
    name: "",
    description: "",
    color: "#5F7FB4",
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
    if (accountNames.length === 0) {
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

      // Résoudre chaque compte sélectionné. L'import ne CRÉE plus de compte :
      // un nom inconnu est une erreur explicite qui renvoie vers la page Comptes.
      const targetAccountIds = [];
      const missing = [];
      for (const rawName of accountNames) {
        const name = String(rawName).trim();
        if (!name) continue;

        const { data: existingAccount } = await supabase
          .from("trading_accounts")
          .select("id")
          .eq("user_id", userId)
          .eq("name", name)
          .maybeSingle();

        if (existingAccount?.id) targetAccountIds.push(existingAccount.id);
        else missing.push(name);
      }

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
        setAccounts(updatedAccounts || []);

        // Ajoute tous les comptes cibles aux comptes sélectionnés
        const newSelectedIds = Array.from(new Set([...selectedAccountIds, ...targetAccountIds]));
        setSelectedAccountIds(newSelectedIds);
        localStorage.setItem('selectedAccountIds', JSON.stringify(newSelectedIds));
      }

      setAccountNames([]);
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
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "20px 24px", width: "100%", flex: 1, alignSelf: "flex-start", fontFamily: "var(--font-sans)" }} className="anim-1">
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <h1 style={{ fontSize: 17, fontWeight: 600, color: "#0D0D0D", margin: 0, letterSpacing: -0.1, fontFamily: "var(--font-sans)" }}>{t("addTrade.title")}</h1>
        <div id="tr4de-page-header-slot" style={{ marginLeft: "auto" }} />
      </div>
      <div style={{ display: "flex", flexDirection: "row", width: "100%", background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, overflow: "hidden", marginBottom: 24 }}>
      {/* LEFT: QUESTIONNAIRE FORM */}
      <div style={{ display: "flex", flexDirection: "column", padding: 0, background: "#fff", flex: 1, minWidth: 0 }}>
          <div style={{ padding: 24 }}>
          
          {/* ACCOUNT SELECTOR — sélection seule : cette page n'ajoute pas de
              compte, elle rattache les trades importés à des comptes existants. */}
          <div style={{ paddingBottom: 20, marginBottom: 20, borderBottom: `1px solid ${T.border}` }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
              <label style={{ fontSize: 12, fontWeight: 500, color: "#5C5C5C" }}>
                {t("addTrade.account")}
              </label>
              <button
                type="button"
                onClick={() => setPage?.("accounts")}
                style={{
                  marginLeft: "auto", padding: 0, border: "none", background: "transparent",
                  color: T.text, fontSize: 11, fontWeight: 500, cursor: "pointer",
                  fontFamily: "inherit", textDecoration: "underline",
                }}
              >
                {t("addTrade.manageAccounts")}
              </button>
            </div>
            <QuickAccountSelector
              multi
              selectedAccountNames={accountNames}
              onAccountNamesChange={setAccountNames}
              accounts={accounts}
              selectionOnly
              onRequestCreate={() => setPage?.("accounts")}
              T={T}
            />
            {accounts.length === 0 && (
              <div style={{ fontSize: 11, color: T.textMut, marginTop: 8, lineHeight: 1.5 }}>
                {t("addTrade.noAccountHint")}
              </div>
            )}
          </div>
          {/* BROKER — sert uniquement à choisir le parseur du fichier */}
          <div style={{ marginTop: "14px", paddingBottom: 20, marginBottom: 20, borderBottom: `1px solid ${T.border}` }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 500, marginBottom: 8, color: "#5C5C5C" }}>
              {t("addTrade.broker")}
            </label>
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
                      onMouseEnter={(e) => { e.currentTarget.style.background = "#F0F0F0"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                    >
                      <Star
                        size={13}
                        strokeWidth={1.75}
                        color={isFav(b.id) ? "#F59E0B" : "#8E8E8E"}
                        fill={isFav(b.id) ? "#F59E0B" : "none"}
                      />
                    </span>
                  ),
                }));
              })()}
              searchPlaceholder={t("addTrade.searchBroker")}
              emptyLabel={t("addTrade.noBroker")}
            />
          </div>
          {/* RÉCAPITULATIF — type et taille des comptes visés, en lecture seule.
              Ces réglages se modifient depuis la page Comptes / la firme. */}
          {selectedAccountObjects.length > 0 && (
            <div style={{ paddingBottom: 20, marginBottom: 20, borderBottom: `1px solid ${T.border}` }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 500, marginBottom: 8, color: "#5C5C5C" }}>
                {t("addTrade.accountType")}
              </label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {selectedAccountObjects.map((acc) => {
                  const type = acc.account_type || "live";
                  const label = type === "eval" ? t("addTrade.eval")
                    : type === "funded" ? t("addTrade.funded")
                    : type === "demo" ? t("addTrade.demo")
                    : t("addTrade.live");
                  const dot = type === "eval" ? T.amber
                    : type === "funded" ? T.blue
                    : type === "demo" ? T.purple
                    : T.green;
                  return (
                    <span key={acc.id} style={{
                      display: "inline-flex", alignItems: "center", gap: 6,
                      padding: "5px 10px", borderRadius: 999,
                      border: `1px solid ${T.border}`, background: T.white,
                      fontSize: 12, color: T.textSub, fontWeight: 500, maxWidth: "100%",
                    }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: dot, flexShrink: 0 }} />
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {acc.name}
                      </span>
                      <span style={{ color: T.textMut }}>
                        · {label}{acc.eval_account_size ? ` ${acc.eval_account_size}` : ""}
                      </span>
                    </span>
                  );
                })}
              </div>
              <div style={{ fontSize: 11, color: T.textMut, marginTop: 8, lineHeight: 1.5 }}>
                {t("addTrade.typeReadOnly")}
              </div>
            </div>
          )}
          {/* FILE */}
          <div style={{ paddingBottom: 20, marginBottom: 20 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 500, marginBottom: 8, color: "#5C5C5C" }}>
              {t("addTrade.file")}
            </label>
            <div
              style={{
                padding: "36px 20px",
                border: `1px dashed ${files.length > 0 ? "#16A34A" : T.border}`,
                borderRadius: 12,
                textAlign: "center",
                cursor: "pointer",
                background: files.length > 0 ? "rgba(16, 163, 127, 0.04)" : "#FAFAFA",
                transition: "border-color 160ms ease, background 160ms ease",
              }}
              onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = "#0D0D0D"; e.currentTarget.style.background = "#F5F5F5"; }}
              onDragLeave={(e) => { e.currentTarget.style.borderColor = files.length > 0 ? "#16A34A" : T.border; e.currentTarget.style.background = files.length > 0 ? "rgba(16, 163, 127, 0.04)" : "#FAFAFA"; }}
              onDrop={(e) => {
                e.preventDefault();
                e.currentTarget.style.borderColor = files.length > 0 ? "#16A34A" : T.border;
                e.currentTarget.style.background = files.length > 0 ? "rgba(16, 163, 127, 0.04)" : "#FAFAFA";
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
                  background: files.length > 0 ? "rgba(16, 163, 127, 0.12)" : "#F0F0F0",
                  color: files.length > 0 ? "#16A34A" : "#5C5C5C",
                  transition: "background 160ms ease, color 160ms ease",
                }}>
                  {files.length > 0
                    ? <LucideCheck size={20} strokeWidth={2} />
                    : <LucideUpload size={20} strokeWidth={1.75} />}
                </span>
                <div>
                  <div style={{ fontSize: 13, color: "#0D0D0D", fontWeight: 600, marginBottom: 4 }}>
                    {files.length === 1
                      ? files[0].name
                      : files.length > 1
                        ? t("addTrade.filesReady").replace("{n}", String(files.length))
                        : t("addTrade.dropFiles")}
                  </div>
                  <div style={{ fontSize: 11, color: "#8E8E8E", fontWeight: 400 }}>
                    {files.length > 0 ? t("addTrade.fileReady") : <>{t("addTrade.orBrowse2")} <span style={{ color: "#0D0D0D", fontWeight: 500, textDecoration: "underline", textUnderlineOffset: 2 }}>{t("addTrade.browse")}</span> · {t("addTrade.fileTypes")}</>}
                  </div>
                </div>
              </button>
            </div>
            {/* Liste des fichiers sélectionnés (retrait individuel) */}
            {files.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 12 }}>
                {files.map((f) => (
                  <div
                    key={f.name}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
                      padding: "8px 12px", background: "#FAFAFA", border: `1px solid ${T.border}`, borderRadius: 8,
                    }}
                  >
                    <span style={{ fontSize: 12, color: "#0D0D0D", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {f.name}
                    </span>
                    <button
                      type="button"
                      aria-label={t("addTrade.removeFile")}
                      title={t("addTrade.removeFile")}
                      onClick={() => removeFile(f.name)}
                      style={{ flexShrink: 0, background: "none", border: "none", cursor: "pointer", color: "#8E8E8E", display: "inline-flex", alignItems: "center", fontFamily: "var(--font-sans)" }}
                    >
                      <LucideX size={16} strokeWidth={2} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          {/* PREVIEW */}
          {preview.length > 0 && (
            <div style={{ paddingBottom: 20, marginBottom: 20, borderBottom: `1px solid ${T.border}` }}>
              <label style={{ display: "block", fontSize: "10px", fontWeight: "700", color: T.textMut, marginBottom: "12px", textTransform: "uppercase" }}>
                {t("addTrade.preview")} ({preview.length} {t("addTrade.previewTrades")})
              </label>
              <div style={{ overflowX: "auto", background: T.bg, borderRadius: "6px", padding: "12px" }}>
                <table style={{ width: "100%", fontSize: "10px" }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                      <th style={{ padding: "8px", textAlign: "left", fontWeight: "600", color: T.textSub }}>Date</th>
                      <th style={{ padding: "8px", textAlign: "left", fontWeight: "600", color: T.textSub }}>Symbol</th>
                      <th style={{ padding: "8px", textAlign: "right", fontWeight: "600", color: T.textSub }}>Entry</th>
                      <th style={{ padding: "8px", textAlign: "right", fontWeight: "600", color: T.textSub }}>Exit</th>
                      <th style={{ padding: "8px", textAlign: "right", fontWeight: "600", color: T.textSub }}>P&L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((trade, idx) => (
                      <tr key={idx} style={{ borderBottom: `1px solid ${T.border}` }}>
                        <td style={{ padding: "8px", color: T.textSub, fontSize: "10px" }}>{trade.date}</td>
                        <td style={{ padding: "8px", color: T.textSub, fontWeight: "600" }}>{trade.symbol}</td>
                        <td style={{ padding: "8px", textAlign: "right", color: T.textSub }}>{trade.entry?.toFixed(2)}</td>
                        <td style={{ padding: "8px", textAlign: "right", color: T.textSub }}>{trade.exit?.toFixed(2)}</td>
                        <td style={{ padding: "8px", textAlign: "right", color: trade.pnl >= 0 ? T.green : T.red, fontWeight: "600" }}>
                          {trade.pnl >= 0 ? "+" : ""}{trade.pnl?.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {error && <div role="alert" style={{ padding: "12px", background: T.redBg, border: `1px solid ${T.redBd}`, borderRadius: "6px", fontSize: "12px", color: T.red, marginBottom: "16px" }}>{error}</div>}
          {successMsg && <div role="status" style={{ padding: "12px", background: T.greenBg, border: `1px solid ${T.greenBd}`, borderRadius: "6px", fontSize: "12px", color: T.green, marginBottom: "16px" }}>{successMsg}</div>}

          <button
            onClick={handleImport}
            disabled={files.length === 0 || accountNames.length === 0 || loading}
            style={{
              width: "100%",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              padding: "10px 18px",
              borderRadius: 999,
              background: files.length > 0 && accountNames.length > 0 && !loading ? T.text : "#FFFFFF",
              color: files.length > 0 && accountNames.length > 0 && !loading ? "#FFFFFF" : T.textMut,
              border: `1px solid ${files.length > 0 && accountNames.length > 0 && !loading ? T.text : T.border}`,
              cursor: files.length > 0 && accountNames.length > 0 && !loading ? "pointer" : "not-allowed",
              fontSize: 13,
              fontWeight: 500,
              opacity: files.length > 0 && accountNames.length > 0 && !loading ? 1 : 0.6,
              transition: "background 140ms ease, border-color 140ms ease, color 140ms ease",
              fontFamily: "var(--font-sans)",
            }}
          >
            {loading ? t("addTrade.processing") : t("addTrade.importTrades")}
          </button>

          {/* STRATEGY FORM MODAL */}
          {showStrategyForm && ReactDOM.createPortal(
            <div onClick={() => { setShowStrategyForm(false); setStrategyFormData(getDefaultStrategyFormData()); }} style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center"}}>
              <div onClick={(e)=>e.stopPropagation()} style={{background:T.white,borderRadius:12,padding:40,maxWidth:600,width:"90%",maxHeight:"90vh",overflowY:"auto"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
                  <h2 style={{fontSize:17,fontWeight:600,color:"#0D0D0D",margin:0,letterSpacing:-0.1,fontFamily:"var(--font-sans)"}}>{t("addTrade.createStrategy")}</h2>
                  <button aria-label={t("addTrade.closeAria")} onClick={() => { setShowStrategyForm(false); setStrategyFormData(getDefaultStrategyFormData()); }} style={{background:"transparent",border:"none",fontSize:24,cursor:"pointer",color:T.textMut}}>✕</button>
                </div>

                <div style={{marginBottom:16}}>
                  <label style={{display:"block",fontSize:12,fontWeight:600,marginBottom:6,color:T.textMut}}>{t("addTrade.strategyName")}</label>
                  <input type="text" value={strategyFormData.name} onChange={(e)=>setStrategyFormData({...strategyFormData,name:e.target.value})} placeholder={t("addTrade.strategyNamePh")} style={{width:"100%",padding:"10px 12px",border:`1px solid ${T.border}`,borderRadius:8,fontSize:14,outline:"none"}}/>
                </div>

                <div style={{marginBottom:16}}>
                  <label style={{display:"block",fontSize:12,fontWeight:600,marginBottom:6,color:T.textMut}}>{t("addTrade.strategyDesc")}</label>
                  <textarea value={strategyFormData.description} onChange={(e)=>setStrategyFormData({...strategyFormData,description:e.target.value})} placeholder={t("addTrade.strategyDescPh")} style={{width:"100%",padding:"10px 12px",border:`1px solid ${T.border}`,borderRadius:8,fontSize:14,outline:"none",resize:"vertical",minHeight:60}}/>
                </div>

                <div style={{marginBottom:20}}>
                  <label style={{display:"block",fontSize:12,fontWeight:600,marginBottom:8,color:T.textMut}}>{t("addTrade.strategyColor")}</label>
                  <div style={{display:"flex",gap:8}}>
                    {colors.map(color=>(
                      <button key={color} aria-label={t("addTrade.colorAria").replace("{c}", color)} aria-pressed={strategyFormData.color===color} onClick={()=>setStrategyFormData({...strategyFormData,color})} style={{width:32,height:32,borderRadius:8,background:color,border:strategyFormData.color===color?`3px solid ${T.text}`:"2px solid #ddd",cursor:"pointer"}}/>
                    ))}
                  </div>
                </div>

                <div style={{marginBottom:20}}>
                  <label style={{display:"block",fontSize:12,fontWeight:600,marginBottom:8,color:T.textMut}}>{t("addTrade.ruleGroups")}</label>
                  {strategyFormData.groups && strategyFormData.groups.map((group,gIdx)=>(
                    <div key={group.id} style={{marginBottom:16,padding:12,border:`1px solid ${T.border}`,borderRadius:8,background:T.bg}}>
                      <div style={{display:"flex",gap:8,marginBottom:12}}>
                        <input type="text" placeholder={t("addTrade.groupName")} value={group.name} onChange={(e)=>updateGroup(group.id,"name",e.target.value)} style={{flex:1,padding:"8px 10px",border:`1px solid ${T.border}`,borderRadius:6,fontSize:12,outline:"none"}}/>
                        {strategyFormData.groups.length > 1 && <button aria-label={t("addTrade.removeGroup")} onClick={()=>removeGroup(group.id)} style={{background:"transparent",border:"none",cursor:"pointer",fontSize:16,color:T.red}}>✕</button>}
                      </div>

                      <div style={{display:"flex",flexDirection:"column",gap:6,paddingLeft:20}}>
                        {group.rules && group.rules.map((rule,rIdx)=>(
                          <div key={rule.id} style={{display:"flex",alignItems:"center",gap:6}}>
                            <span style={{fontSize:10,color:T.textMut}}>•</span>
                            <input type="text" placeholder={t("addTrade.rulePh")} value={rule.text} onChange={(e)=>updateRule(group.id,rule.id,e.target.value)} style={{flex:1,padding:"6px 10px",borderRadius:4,border:`1px solid ${T.border}`,fontSize:11,outline:"none"}}/>
                            {group.rules.length > 1 && <button aria-label={t("addTrade.removeRule")} onClick={()=>removeRule(group.id,rule.id)} style={{background:"transparent",border:"none",cursor:"pointer",fontSize:12,color:T.red}}>✕</button>}
                          </div>
                        ))}
                        <button onClick={()=>addRule(group.id)} style={{marginTop:4,fontSize:11,color:T.accent,background:"transparent",border:"none",cursor:"pointer",textAlign:"left",padding:0}}>{t("addTrade.addRule")}</button>
                      </div>
                    </div>
                  ))}
                  <button onClick={addGroup} style={{marginTop:12,fontSize:12,color:T.accent,background:"transparent",border:`1px dashed ${T.accent}`,cursor:"pointer",padding:"8px 12px",borderRadius:6,width:"100%"}}>{t("addTrade.addGroup")}</button>
                </div>

                <div style={{display:"flex",gap:12,justifyContent:"flex-end",paddingTop:12,borderTop:`1px solid ${T.border}`}}>
                  <button onClick={() => { setShowStrategyForm(false); setStrategyFormData(getDefaultStrategyFormData()); }} style={{padding:"10px 20px",borderRadius:6,border:`1px solid ${T.border}`,background:T.white,fontSize:12,fontWeight:600,cursor:"pointer"}}>{t("common.cancel")}</button>
                  <button onClick={handleCreateStrategyFromForm} style={{padding:"10px 20px",borderRadius:6,border:`1px solid ${T.text}`,background:T.white,color:T.text,fontSize:12,fontWeight:600,cursor:"pointer"}}>{t("addTrade.createStrategyBtn")}</button>
                </div>
              </div>
            </div>,
            document.body
          )}
          </div>
        </div>

        {/* RIGHT: INSTRUCTIONS */}
        <div style={{ display: "flex", flexDirection: "column", padding: "24px 28px 28px 32px", background: T.bg, borderLeft: `1px solid ${T.border}`, flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
            <img src={brokerInfo.iconPath} alt={brokerInfo.name} style={{ width: "32px", height: "32px", objectFit: "contain" }} />
            <h3 style={{ fontSize: "14px", fontWeight: "700", color: T.text }}>{brokerInfo.name}</h3>
          </div>
          <div style={{ marginBottom: "16px" }}>
            <p style={{ fontSize: "11px", color: T.textMut, marginBottom: "8px", fontWeight: "600" }}>{t("addTrade.supportedAssets")}</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {brokerInfo.subtext.replace("Types d'actifs supportés: ", "").split(", ").map((asset, idx) => (
                <div key={idx} style={{ display: "inline-block", padding: "4px 10px", background: T.white, borderRadius: "6px", fontSize: "10px", color: T.textSub, fontWeight: "600", border: `1px solid ${T.border}` }}>
                  {asset}
                </div>
              ))}
            </div>
          </div>
          <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: "16px" }}>
            <p style={{ fontSize: "10px", fontWeight: "700", color: T.textMut, marginBottom: "12px", textTransform: "uppercase" }}>{t("addTrade.howToExport")}</p>
            <ol style={{ padding: "0 0 0 16px", margin: 0, listStyleType: "decimal" }}>
              {brokerInfo.steps.map((step, idx) => (
                <li key={idx} style={{ fontSize: "11px", color: T.textSub, marginBottom: "8px", lineHeight: "1.3" }}>
                  {step.replace(/^\d+\. /, "")}
                </li>
              ))}
            </ol>
          </div>

        </div>
      </div>
      </div>
  );
}



