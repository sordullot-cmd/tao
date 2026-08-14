"use client";

/**
 * Synthèse du patrimoine.
 *
 * Portée de `app/page.tsx` de l'app patrimoine : courbe d'évolution en tête,
 * bascule patrimoine net / brut quand des passifs existent, puis le tableau
 * « Actif » en accordéon — une carte par classe, qui se déplie sur ses comptes.
 *
 * La bascule net / brut pilote le chiffre héros ET la courbe : en brut, les
 * crédits sont écartés des deux, ce qui permet de lire son patrimoine sans eux.
 *
 * Deux sections de l'original ne sont pas reprises, faute de source :
 *   — « Transactions récentes » lisait les opérations de la banque connectée ;
 *   — le Sankey de budget lisait ces mêmes opérations catégorisées. Le budget de
 *     tr4de est un budget PRÉVISIONNEL saisi à la main (page Budget) : on renvoie
 *     donc vers elle plutôt que d'afficher un flux qu'on n'a pas.
 *
 * La courbe est RECONSTRUITE (cf. `lib/patrimoineHistory`) : les soldes
 * bancaires sont remontés mouvement par mouvement, le capital restant dû des
 * crédits recalculé depuis leur échéancier, et les actifs sans passé connu
 * reportés à plat. Elle montre donc une vraie évolution dès la première visite,
 * là où l'ancien `withTodayPoint` seul ne donnait un point que par jour
 * d'ouverture de la page — deux points, deux jours après l'installation. Ces
 * points relevés sont conservés : ils portent le passé que la reconstruction ne
 * couvre pas. Fenêtre au choix — 1S / 1M / 3M / 6M / 1A / Tout —, et ce que la
 * fenêtre a fait gagner ou perdre s'affiche sous le chiffre héros.
 */

import React from "react";
import { ArrowDownRight, ArrowUpRight, ChevronRight, Plus } from "lucide-react";
import { T } from "@/lib/ui/tokens";
import { t, useLang } from "@/lib/i18n";
import {
  AllocationChart, CARD, SectionTitle, HeroAmount, PeriodPills, PnlChart, TH,
  PERIODS, PERIOD_ALL, windowSeries,
} from "@/components/ui/da";
import AssetAvatar from "@/components/ui/AssetAvatar";
import { AssetFormModal, BankFormModal } from "@/components/modals/PatrimoineModals";
import { fmt } from "@/lib/ui/format";
import {
  assetGain,
  assetTypeKey,
  assetValue,
  historyChange,
  netWorth,
  sectionsByClass,
  shareOf,
  toChartPoints,
  usePatrimoine,
  withTodayPoint,
} from "@/lib/patrimoine";
import { bankAccountToAsset, useBankAccounts } from "@/lib/bank/useBankAccounts";
import { useBankTransactionsAll } from "@/lib/bank/useBankTransactions";
import { depthOf, withinDays, ALL_DAYS } from "@/lib/bank/transactions";
import { categoryLabelKey, spendingByCategory, spendingPalette } from "@/lib/bank/categories";
import { reconstructHistory } from "@/lib/patrimoineHistory";
import { useCloudState } from "@/lib/hooks/useCloudState";
import {
  BUDGET_CLOUD_KEY, BUDGET_STORAGE_KEY, planTotals, primaryPlan,
} from "@/lib/budgetPlans";

/* Fenêtres de la courbe : celles de la DA, plus « Tout » — l'historique d'un
   patrimoine se lit aussi en entier, c'est même sa vue la plus parlante tant
   qu'il ne compte que quelques semaines de points. */
const HISTORY_PERIODS = [...PERIODS, { id: PERIOD_ALL }];
const daysOfPeriod = (id) => PERIODS.find((p) => p.id === id)?.days ?? null;

export default function PatrimoinePage({ setPage, setSelectedAssetId, setSelectedClassSlug }) {
  useLang();
  const [store, setStore] = usePatrimoine();
  const bank = useBankAccounts();
  // Saisie d'un actif : la page « Actifs » n'existe plus, son formulaire est
  // une modale ouverte depuis les pages qui montrent le patrimoine.
  const [addingAsset, setAddingAsset] = React.useState(false);
  const [addingBank, setAddingBank] = React.useState(false);

  /* Le patrimoine, c'est les deux sources réunies : ce qui est saisi à la main
     et ce qui remonte des banques connectées. Les comptes bancaires ne sont PAS
     écrits dans le store — leurs soldes sont relus à chaque visite, et un solde
     périmé affiché comme courant serait pire que pas de solde du tout. */
  const bankAssets = React.useMemo(
    () => bank.accounts.map(bankAccountToAsset),
    [bank.accounts],
  );
  const assets = React.useMemo(
    () => [...(store.assets || []), ...bankAssets],
    [store.assets, bankAssets],
  );

  /* Vue héros : net ou brut. La bascule n'apparaît que s'il y a des passifs —
     sans eux les deux chiffres sont égaux, et le choix n'aurait rien à dire.

     Le choix suit le COMPTE et non l'onglet : quelqu'un qui pilote son
     désendettement lit son patrimoine net, et le retrouvait en brut à chaque
     retour sur la page — y compris depuis un autre appareil. Même mécanique que
     le tri et les colonnes de la page Trades : cache localStorage immédiat,
     Supabase derrière. */
  const [rawView, setView] = useCloudState("tr4de_patrimoine_view", "patrimoine_view", "net");
  // Une valeur venue du cloud n'est pas garantie : tout ce qui n'est pas « brut »
  // retombe sur le net, plutôt que d'afficher un héros vide.
  const view = rawView === "brut" ? "brut" : "net";

  const nw = React.useMemo(() => netWorth(assets), [assets]);
  const sections = React.useMemo(() => sectionsByClass(assets), [assets]);
  const positiveTotal = nw.gross;
  const hasLiabilities = nw.liabilities < 0;
  const heroValue = view === "brut" ? nw.gross : nw.total;

  /* Point du jour, posé à l'ouverture comme le `captureToday()` de l'original.
     `withTodayPoint` renvoie le tableau inchangé si le point est déjà à jour :
     la comparaison par identité évite alors une écriture — sans quoi ce même
     effet se redéclencherait à chaque rendu via le store qu'il vient d'écrire. */
  React.useEffect(() => {
    if (assets.length === 0) return;
    // Le point du jour porte le patrimoine COMPLET, banques comprises. On attend
    // donc la fin de l'agrégation : sinon le premier rendu écrirait un total
    // amputé des comptes bancaires, qui resterait le point de la journée.
    if (bank.loading) return;
    setStore((s) => {
      // Net ET brut sont relevés : la courbe brute ne peut pas déduire les
      // crédits d'un total net déjà figé, il faut donc les avoir gardés.
      const measured = netWorth([...(s.assets || []), ...bankAssets]);
      const next = withTodayPoint(s.history || [], measured.total, measured.gross);
      return next === s.history ? s : { ...s, history: next };
    });
  }, [assets, bankAssets, bank.loading, setStore]);

  /* Fenêtre de la courbe. Elle suit le COMPTE comme la vue net/brut : on ne
     revient pas sur « Tout » à chaque visite quand on suit son année en cours. */
  const [rawPeriod, setPeriod] = useCloudState("tr4de_patrimoine_period", "patrimoine_period", PERIOD_ALL);
  const period = HISTORY_PERIODS.some((p) => p.id === rawPeriod) ? rawPeriod : PERIOD_ALL;

  /* Relevés de TOUS les comptes agrégés : c'est la matière de la courbe.

     Ce chargement remplace le préchargement des fiches (`prefetchBankTransactions`)
     que faisait cette page : il remplit le MÊME cache, en allant au moins aussi
     loin, donc ouvrir la fiche d'un compte reste instantané — sans redemander à
     la banque deux fois le même relevé à deux profondeurs différentes.

     La profondeur demandée suit la fenêtre choisie : en dessous de 90 jours il
     n'y a rien à demander de plus, c'est le minimum que l'API rend de toute
     façon, et redescendre ne doit jamais coûter une requête. */
  const depth = React.useMemo(() => {
    const d = daysOfPeriod(period);
    if (d == null) return ALL_DAYS;             // « Tout » : tout ce que la banque rend
    return depthOf(d) <= 90 ? 90 : d;
  }, [period]);
  const bankUids = React.useMemo(() => bank.accounts.map((a) => a.uid), [bank.accounts]);
  const { byUid: txByUid } = useBankTransactionsAll(bankUids, depth);
  // Les relevés sont indexés par uid, la reconstruction raisonne par actif.
  const txByAssetId = React.useMemo(() => {
    const map = {};
    for (const a of bank.accounts) {
      const txs = txByUid[a.uid];
      if (txs && txs.length > 0) map[a.id] = txs;
    }
    return map;
  }, [bank.accounts, txByUid]);

  /* Historique RECONSTRUIT : les soldes bancaires remontés mouvement par
     mouvement, le capital restant dû des crédits recalculé depuis leur
     échéancier, et les autres actifs reportés à plat (cf. lib/patrimoineHistory).
     Les points relevés à l'ouverture de la page ne servent plus que pour le
     passé que cette reconstruction ne couvre pas.

     La courbe suit la vue : en brut, les crédits sont écartés du calcul, comme
     ils le sont du chiffre héros. Un seul contrôle pour les deux — un graphique
     net sous un héros brut ferait lire la même page de deux façons. */
  const allPoints = React.useMemo(
    () => toChartPoints(reconstructHistory(assets, {
      txByAssetId,
      measured: store.history,
      days: daysOfPeriod(period),
      gross: view === "brut",
    })),
    [assets, txByAssetId, store.history, period, view],
  );
  /* `windowSeries` mesure la fenêtre depuis le DERNIER point, pas depuis
     aujourd'hui : après quelques jours sans ouvrir la page, « 1S » montre la
     dernière semaine de mesures au lieu d'un graphique vide. */
  const points = React.useMemo(() => windowSeries(allPoints, period), [allPoints, period]);
  // Variation sur la fenêtre affichée, lue sur les points eux-mêmes.
  const change = React.useMemo(
    () => historyChange(points, daysOfPeriod(period)),
    [points, period],
  );

  if (assets.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 24, paddingTop: 14, fontFamily: "var(--font-sans)" }} className="anim-1">
        <SectionTitle>{t("patrimoine.title")}</SectionTitle>
        <section style={{ ...CARD, padding: "48px 32px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
          <div style={{ fontSize: 14, color: T.textSub, maxWidth: 420 }}>
            {bank.loading ? t("patrimoine.loading") : t("patrimoine.emptyHint")}
          </div>
          {/* Les deux entrées possibles, à égalité : saisir un actif, ou laisser
              la banque le remplir. */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
            <button
              type="button"
              onClick={() => setAddingAsset(true)}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6, minHeight: 40,
                padding: "0 16px", borderRadius: 999, border: "none",
                background: T.accentBg, color: T.text, fontSize: 14, fontWeight: 500,
                cursor: "pointer", fontFamily: "inherit",
              }}
            >
              <Plus size={15} strokeWidth={1.75} /> {t("patrimoine.assets.add")}
            </button>
            <button
              type="button"
              onClick={() => setPage?.("patrimoine-bank")}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6, minHeight: 40,
                padding: "0 16px", borderRadius: 999, border: "none",
                background: "transparent", color: T.textSub, fontSize: 14, fontWeight: 500,
                cursor: "pointer", fontFamily: "inherit",
              }}
            >
              {t("patrimoine.bank.connect")}
            </button>
          </div>
        </section>

        {addingAsset && <AssetFormModal onClose={() => setAddingAsset(false)} />}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 48, fontFamily: "var(--font-sans)" }} className="anim-1">
      {/* Chiffre héros + courbe, posés à même le fond comme sur le tableau de
          bord de trading : la courbe reprend la réserve gauche et file sous la
          barre latérale (`bleedLeft` par défaut). */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingTop: 14 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {hasLiabilities ? (
              <button
                type="button"
                onClick={() => setView(view === "net" ? "brut" : "net")}
                aria-label={t(view === "net" ? "patrimoine.showGross" : "patrimoine.showNet")}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 4, alignSelf: "flex-start",
                  border: "none", background: "transparent", padding: 0, cursor: "pointer",
                  fontFamily: "inherit", fontSize: 14, fontWeight: 500, color: T.textSub,
                }}
              >
                {t(view === "net" ? "patrimoine.netWorth" : "patrimoine.grossWorth")}
                <ChevronRight size={14} strokeWidth={1.75} style={{ transform: "rotate(90deg)" }} />
              </button>
            ) : (
              <span style={{ fontSize: 14, fontWeight: 500, color: T.textSub }}>
                {t("patrimoine.netWorth")}
              </span>
            )}
            <HeroAmount value={heroValue} />

            {/* Ce qui a été gagné ou perdu sur la fenêtre choisie, collé au
                chiffre héros — comme le delta d'un compte. Les mini-KPI brut /
                passifs / net occupaient cette place : ils répétaient trois fois
                le patrimoine du JOUR, quand la seule mesure qui ajoute quelque
                chose au chiffre héros est son MOUVEMENT. Le brut se lit
                maintenant par la bascule au-dessus, et le détail des passifs
                dans leur classe plus bas. */}
            {change && (
              <div style={{ marginTop: 2 }}>
                <PeriodChange change={change} period={period} />
              </div>
            )}
          </div>

          {/* Les DEUX façons de garnir cette page, côte à côte à la hauteur du
              chiffre héros : brancher une banque, qui la remplit toute seule, et
              saisir un actif à la main pour ce qu'aucune banque ne connaît.
              La banque d'abord : elle est masquée quand le déploiement n'a pas
              d'identifiants Enable Banking — la modale n'aurait aucun
              établissement à proposer, et la page Banque, elle, dit ce qui
              manque. La saisie manuelle, elle, marche toujours. */}
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, flexShrink: 0, flexWrap: "wrap" }}>
            {bank.configured && (
              <button
                type="button"
                onClick={() => setAddingBank(true)}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6, minHeight: 36,
                  padding: "0 14px", borderRadius: 999, border: "none", flexShrink: 0,
                  background: T.text, color: T.textInverted, fontSize: 13, fontWeight: 500,
                  cursor: "pointer", fontFamily: "inherit",
                }}
              >
                <Plus size={14} strokeWidth={1.75} /> {t("patrimoine.bank.addBank")}
              </button>
            )}
            <button
              type="button"
              onClick={() => setAddingAsset(true)}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6, minHeight: 36,
                padding: "0 14px", borderRadius: 999, border: "none", flexShrink: 0,
                background: T.accentBg, color: T.text, fontSize: 13, fontWeight: 500,
                cursor: "pointer", fontFamily: "inherit",
              }}
            >
              <Plus size={14} strokeWidth={1.75} /> {t("patrimoine.assets.add")}
            </button>
          </div>
        </div>

        {/* Fenêtre de la courbe, seule sur sa ligne maintenant que la variation
            est remontée sous le chiffre héros : elle s'aligne à droite, au-dessus
            du graphique qu'elle règle.
            Tant qu'il n'y a pas de courbe, pas de barre : des pastilles de
            fenêtre sur un point unique seraient un contrôle sans effet. */}
        {allPoints.length > 1 && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 16, flexWrap: "wrap", minHeight: 34 }}>
            <PeriodPills
              value={period}
              onChange={setPeriod}
              options={HISTORY_PERIODS.map((p) =>
                p.id === PERIOD_ALL ? { ...p, label: t("patrimoine.periodAll") } : p,
              )}
            />
          </div>
        )}

        <PnlChart points={points} />
        {points.length < 2 && (
          <div style={{ fontSize: 13, color: T.textMut }}>{t("patrimoine.historyHint")}</div>
        )}
      </div>

      {/* Tableau des actifs, groupés par classe */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {/* Le bouton « Ajouter un actif » n'est plus ici mais en tête de page, à
            côté de « Ajouter une banque » : les deux façons de garnir cette page
            sont le même geste, elles se choisissent au même endroit. Le titre de
            section n'a donc plus d'action propre. */}
        <SectionTitle>{t("patrimoine.assetsSection")}</SectionTitle>

        <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "0 20px", opacity: 0.4 }}>
          <span style={{ ...TH, flex: 2, minWidth: 0 }}>{t("patrimoine.colName")}</span>
          <span style={{ ...TH, width: 110, flexShrink: 0 }}>{t("patrimoine.colShare")}</span>
          <span style={{ ...TH, width: 130, flexShrink: 0 }}>{t("patrimoine.colValue")}</span>
          <span style={{ ...TH, width: 120, flexShrink: 0, textAlign: "right" }}>{t("patrimoine.colGain")}</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {sections.map(({ cls, assets: list, total }) => (
            <ClassSection
              key={cls.slug}
              cls={cls}
              assets={list}
              total={total}
              positiveTotal={positiveTotal}
              /* Les passifs ouvrent leur page dédiée et non la page de classe :
                 elle porte l'échéancier, la charge mensuelle et le simulateur,
                 là où une page de classe ne sait qu'aligner des valeurs. Depuis
                 que « Crédits » n'est plus dans la navigation, c'est aussi le
                 chemin qui y mène. */
              onOpenClass={() => {
                if (cls.slug === "passifs") return setPage?.("patrimoine-liabilities");
                setSelectedClassSlug?.(cls.slug);
                setPage?.("patrimoine-class");
              }}
              onOpenAsset={(id) => { setSelectedAssetId?.(id); setPage?.("patrimoine-asset"); }}
            />
          ))}
        </div>
      </div>

      {/* Où part l'argent, POUR DE VRAI — juste avant le budget prévisionnel :
          les deux se lisent l'un contre l'autre, avec le même vocabulaire de
          postes et les mêmes teintes. */}
      <SpendingByCategory accounts={bank.accounts} />

      {/* Le budget prévisionnel, MONTRÉ — cette section ne portait qu'un renvoi
          vers la page Budget : on venait chercher un chiffre et on repartait
          avec un lien. L'original posait ici un Sankey des flux réels du mois,
          qui n'a pas de source dans tr4de ; la répartition prévue, elle, existe
          bel et bien. */}
      <BudgetSummary onOpen={() => setPage?.("budget")} />

      {addingAsset && <AssetFormModal onClose={() => setAddingAsset(false)} />}
      {addingBank && <BankFormModal onClose={() => setAddingBank(false)} />}
    </div>
  );
}

/**
 * Variation du patrimoine sur la fenêtre affichée : le montant d'abord, son
 * pourcentage ensuite, puis l'horizon en toutes lettres — même lecture que le
 * delta du chiffre héros d'un compte (la somme gagnée avant le ratio).
 *
 * Quand l'historique est plus court que la fenêtre demandée (« 1A » sur trois
 * semaines de points), l'horizon annoncé serait faux : on dit alors « sur tout
 * l'historique connu » plutôt que « sur 1 an ».
 */
function PeriodChange({ change, period }) {
  // Moins de deux points : rien à comparer. Le hint sous la courbe dit déjà
  // pourquoi elle est vide, inutile d'ajouter un tiret ici.
  if (!change) return <span />;

  const { abs, pct, partial } = change;
  const color = abs > 0 ? T.pnlPos : abs < 0 ? T.pnlNeg : T.textSub;
  const Icon = abs >= 0 ? ArrowUpRight : ArrowDownRight;
  const horizon = partial
    ? t("patrimoine.changeShort")
    : period === PERIOD_ALL
      ? t("patrimoine.changeAll")
      : t("patrimoine.changeOver").replace("{period}", t(`patrimoine.period.${period}`));

  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap",
      fontSize: 13, fontWeight: 500, lineHeight: 1, whiteSpace: "nowrap",
      fontVariantNumeric: "tabular-nums", color,
    }}>
      <span>{fmt(abs, true)}</span>
      {/* Sans base de calcul (patrimoine parti de zéro), la flèche seule : des
          parenthèses vides se liraient comme une valeur manquante. */}
      {pct != null ? (
        <span style={{ display: "inline-flex", alignItems: "center" }}>
          <span>(</span>
          <Icon size={15} strokeWidth={1.75} style={{ margin: "0 1px" }} />
          <span>{Math.abs(pct).toFixed(2)}%</span>
          <span>&nbsp;)</span>
        </span>
      ) : (
        <Icon size={15} strokeWidth={1.75} />
      )}
      <span style={{ color: T.textMut, fontWeight: 400 }}>{horizon}</span>
    </span>
  );
}

/**
 * Dépenses par poste, tous comptes agrégés confondus.
 *
 * Le pendant RÉALISÉ du budget prévisionnel affiché juste en dessous : mêmes
 * postes, mêmes teintes (cf. `lib/bank/categories`), pour que le prévu et le
 * réalisé se lisent d'un coup d'œil l'un contre l'autre.
 *
 * La fenêtre est libre — 1S à 1A, ou tout l'historique que les banques rendent.
 * Elle est demandée à la MÊME profondeur que la courbe du patrimoine plus haut,
 * et sert donc le même cache : changer de fenêtre ici ne redemande à la banque
 * que ce qu'elle n'a pas encore donné, et jamais deux fois la même chose.
 *
 * Rien ne s'affiche sans compte agrégé : la répartition des dépenses n'a pas de
 * saisie manuelle derrière elle, un état vide serait un contrôle sans matière.
 */
function SpendingByCategory({ accounts }) {
  /* La fenêtre suit le COMPTE, comme celle de la courbe : quelqu'un qui suit
     son mois en cours ne doit pas retrouver « 3 mois » à chaque visite. Un mois
     par défaut — c'est le pas auquel un budget se pense. */
  const [rawPeriod, setPeriod] = useCloudState(
    "tr4de_patrimoine_spend_period", "patrimoine_spend_period", "1M",
  );
  const period = HISTORY_PERIODS.some((p) => p.id === rawPeriod) ? rawPeriod : "1M";
  const days = daysOfPeriod(period) ?? ALL_DAYS;
  // Même règle que la courbe : sous 90 jours il n'y a rien de plus à demander.
  const depth = days === ALL_DAYS ? ALL_DAYS : depthOf(days) <= 90 ? 90 : days;

  const uids = React.useMemo(() => accounts.map((a) => a.uid), [accounts]);
  const { byUid, loading } = useBankTransactionsAll(uids, depth);

  /* Les relevés de tous les comptes mis bout à bout, puis recadrés sur la
     fenêtre : le cache peut contenir plus profond que ce qu'on affiche. */
  const txs = React.useMemo(() => {
    const all = [];
    for (const uid of uids) {
      const list = byUid[uid];
      if (list) all.push(...list);
    }
    return withinDays(all, days);
  }, [byUid, uids, days]);

  const { slices, total } = React.useMemo(() => spendingByCategory(txs), [txs]);

  /* Les teintes viennent du BUDGET de l'utilisateur, et non d'une copie figée de
     ses couleurs par défaut : les deux anneaux sont voisins sur cette page, et
     une catégorie recolorée dans la page Budget doit suivre ici. Chaque poste
     prend la couleur de la catégorie de budget dont il relève, les postes
     secondaires d'une même famille en recevant une variante (cf.
     `spendingPalette`). Sans budget saisi, on retombe sur la palette de
     `lib/bank/categories`. */
  const [budgetStore] = useCloudState(BUDGET_STORAGE_KEY, BUDGET_CLOUD_KEY, null);
  const palette = React.useMemo(() => {
    const plan = primaryPlan(budgetStore);
    const couleurs = {};
    for (const it of plan?.items || []) if (it.color) couleurs[it.id] = it.color;
    return spendingPalette(couleurs);
  }, [budgetStore]);

  if (accounts.length === 0) return null;

  const parts = slices.map((s) => ({
    id: s.id,
    label: t(categoryLabelKey(s.id)),
    color: palette[s.id] || s.color,
    pct: s.pct,
    amount: s.amount,
  }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <SectionTitle
        size="sm"
        action={
          <PeriodPills
            value={period}
            onChange={setPeriod}
            options={HISTORY_PERIODS.map((p) =>
              p.id === PERIOD_ALL ? { ...p, label: t("patrimoine.periodAll") } : p,
            )}
          />
        }
      >
        {t("patrimoine.spending.title")}
      </SectionTitle>

      <section style={{ ...CARD, padding: 24, display: "flex", flexDirection: "column", gap: 18 }}>
        {/* Chargement à vide seulement : dès qu'un relevé est arrivé, on montre
            la répartition et elle se précise compte par compte. */}
        {slices.length === 0 ? (
          <div style={{ fontSize: 14, color: T.textSub, textAlign: "center", padding: "24px 0" }}>
            {loading ? t("patrimoine.spending.loading") : t("patrimoine.spending.empty")}
          </div>
        ) : (
          /* Trois colonnes — une cale, l'anneau, la légende : c'est ce qui laisse
             l'anneau au MILIEU de la carte tout en collant la liste des postes à
             son BORD DROIT. Les deux colonnes latérales portent la même part
             (`minmax(0, 1fr)`), donc la colonne centrale tombe pile au centre,
             quelle que soit la largeur de la légende. Les mettre simplement côte
             à côte aurait collé la liste contre l'anneau et laissé un vide à
             droite.
             Plus de pourcentages : l'anneau EST la proportion, la répéter en
             chiffres à côté de chaque poste faisait lire deux fois la même
             chose. Le montant, lui, ne se lit nulle part ailleurs. */
          <div style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) auto minmax(0, 1fr)",
            alignItems: "center", gap: 24,
          }}>
            <span aria-hidden="true" />
            <AllocationChart
              kind="ring"
              parts={parts}
              scale={100}
              ariaLabel={t("patrimoine.spending.aria")}
              size={190}
              thickness={22}
              centreLabel={t("patrimoine.spending.centre")}
              centreValue={total}
              showPct={false}
              formatValue={(v) => fmt(v)}
            />

            {/* Les postes en COLONNE contre le bord droit de la carte, du plus
                gros au plus petit : c'est l'ordre des parts, l'œil descend la
                liste comme il ferait le tour du cercle. Les pastilles restent
                alignées entre elles à gauche du bloc — une liste alignée à
                droite ferait danser les points de couleur.
                Le poste et son total restent collés l'un à l'autre : les étirer
                d'un bord à l'autre obligeait à traverser la carte pour
                rapprocher un nom d'un chiffre.
                Le détail par sous-poste n'est PAS ici : la synthèse répond à
                « où va mon argent », et une seconde ligne de chiffres sous
                chaque part la faisait lire deux fois. Le sous-poste se lit là
                où il sert — sur la ligne du relevé qui le porte. */}
            <ul style={{
              listStyle: "none", margin: 0, padding: 0, minWidth: 0, maxWidth: 380,
              justifySelf: "end",
              display: "flex", flexDirection: "column", gap: 10,
            }}>
              {slices.map((s) => (
                <li key={s.id} style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13, minWidth: 0 }}>
                  <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: "50%", background: s.color, flexShrink: 0 }} />
                  <span style={{ color: T.textSub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {t(categoryLabelKey(s.id))}
                  </span>
                  <span style={{ fontWeight: 600, color: T.text, fontVariantNumeric: "tabular-nums" }}>
                    {fmt(s.amount)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Ni compte d'opérations ni avertissement sur le classement : la synthèse
            répond d'un coup d'œil à « où va mon argent », et un paragraphe sous
            l'anneau se lisait plus longtemps que l'anneau lui-même. Les deux
            vivent sur la page Dépenses, qui est l'endroit où l'on creuse. */}
      </section>
    </div>
  );
}

/**
 * Aperçu du budget PRINCIPAL (le premier plan de la page Budget, cf.
 * lib/budgetPlans.ts). Le plan actif de la page Budget n'est qu'un état de
 * navigation : la synthèse changerait de budget selon le dernier onglet ouvert.
 */
function BudgetSummary({ onOpen }) {
  const [store, setStore] = useCloudState(BUDGET_STORAGE_KEY, BUDGET_CLOUD_KEY, null);
  const plan = primaryPlan(store);
  const { income, totalPct, rest, over, rows } = planTotals(plan);

  /* Forme du graphique : la MÊME préférence que la page Budget, puisque c'est le
     même store et la même répartition. Régler ici la change là-bas, et
     réciproquement — il n'y a qu'un réglage pour cette donnée. */
  const chartKind = store?.chartKind === "bar" ? "bar" : "ring";
  const setChartKind = (kind) => setStore((s) => ({ ...(s || {}), chartKind: kind }));

  /* Budget jamais ouvert : il n'y a rien à montrer, et un aperçu à zéro
     laisserait croire à un budget vide plutôt qu'à un budget absent. On garde
     alors le renvoi vers la page, qui créera le premier plan. */
  if (!plan) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <SectionTitle size="sm">{t("nav.budget")}</SectionTitle>
        <section style={{ ...CARD, padding: 24, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div style={{ fontSize: 14, color: T.textSub, maxWidth: 520 }}>
            {t("patrimoine.budgetHint")}
          </div>
          <button
            type="button"
            onClick={onOpen}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6, minHeight: 40,
              padding: "0 16px", borderRadius: 999, border: "none",
              background: T.accentBg, color: T.text, fontSize: 14, fontWeight: 500,
              cursor: "pointer", fontFamily: "inherit", flexShrink: 0,
            }}
          >
            {t("patrimoine.openBudget")}
          </button>
        </section>
      </div>
    );
  }

  // Au-delà de 100 %, la barre se normalise sur le total : elle reste pleine et
  // les proportions restent comparables entre elles (même règle que la page).
  const barScale = Math.max(totalPct, 100);
  // Les plus grosses parts d'abord : c'est ce qui structure un budget.
  const top = [...rows].sort((a, b) => b.pct - a.pct);
  const shown = top.slice(0, 4);
  const others = top.length - shown.length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <SectionTitle
        size="sm"
        action={
          <button
            type="button"
            onClick={onOpen}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6, minHeight: 34,
              padding: "0 12px", borderRadius: 999, border: "none",
              background: "transparent", color: T.textSub, fontSize: 13, fontWeight: 500,
              cursor: "pointer", fontFamily: "inherit",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = T.accentBg; e.currentTarget.style.color = T.text; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = T.textSub; }}
          >
            {t("patrimoine.openBudget")}
          </button>
        }
      >
        {/* Le nom du budget affiché : on doit savoir LEQUEL des plans est repris
            ici sans ouvrir la page Budget. */}
        {plan?.name || t("nav.budget")}
      </SectionTitle>

      <section style={{ ...CARD, padding: 24, display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 13, color: T.textSub }}>{t("patrimoine.budgetIncome")}</span>
            <span style={{ fontSize: 24, fontWeight: 600, color: T.text, fontVariantNumeric: "tabular-nums" }}>
              {fmt(income)}
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2, alignItems: "flex-end" }}>
            <span style={{ fontSize: 13, color: T.textSub }}>
              {over ? t("patrimoine.budgetOver") : t("patrimoine.budgetRest")}
            </span>
            <span style={{
              fontSize: 16, fontWeight: 600, fontVariantNumeric: "tabular-nums",
              color: over ? T.pnlNeg : T.text,
            }}>
              {fmt(Math.abs(rest))}
            </span>
          </div>
        </div>

        {rows.length === 0 ? (
          <div style={{ fontSize: 13, color: T.textSub }}>{t("patrimoine.budgetEmpty")}</div>
        ) : (
          <>
            {/* Répartition — anneau ou barre, même brique et même choix que la
                page Budget (components/ui/da.jsx). Les teintes d'identité sont
                portées par les catégories elles-mêmes.
                Le sélecteur est en retrait, aligné à droite : sur cette page la
                répartition est un aperçu, pas le sujet. */}
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <PeriodPills
                value={chartKind}
                onChange={setChartKind}
                options={[
                  { id: "ring", label: t("budget.chartRing") },
                  { id: "bar", label: t("budget.chartBar") },
                ]}
                track
              />
            </div>
            <AllocationChart
              kind={chartKind}
              parts={rows.map((r) => ({
                id: r.id,
                label: r.label,
                color: r.color || T.textMut,
                pct: r.pct,
                amount: r.amount,
              }))}
              scale={barScale}
              ariaLabel={t("budget.barAria").replace("{pct}", String(Math.round(totalPct * 10) / 10))}
              size={150}
              thickness={18}
              barHeight={10}
              centreLabel={t("budget.allocated")}
              centreValue={rows.reduce((s, r) => s + r.amount, 0)}
              centreTone={over ? T.pnlNeg : undefined}
              formatValue={(v) => fmt(v)}
            />

            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexWrap: "wrap", gap: "8px 18px" }}>
              {shown.map((r) => (
                <li key={r.id} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: T.textSub }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: r.color || T.textMut, flexShrink: 0 }} />
                  <span style={{ color: T.text }}>{r.label}</span>
                  <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmt(r.amount)}</span>
                </li>
              ))}
              {others > 0 && (
                <li style={{ fontSize: 13, color: T.textMut }}>
                  {t("patrimoine.budgetOthers").replace("{n}", String(others))}
                </li>
              )}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}

/**
 * Carte-accordéon d'une classe : la rangée agrégée, puis ses comptes.
 *
 * Le dépliage passe par `grid-template-rows: 0fr → 1fr` comme dans l'original :
 * la hauteur s'anime sans qu'on ait à la mesurer, et le geste reste
 * interruptible. Le nom de la classe est un bouton distinct du chevron — il
 * ouvre la page de la classe, là où le chevron ne fait que déplier.
 */
function ClassSection({ cls, assets, total, positiveTotal, onOpenClass, onOpenAsset }) {
  /* Ouvert d'emblée : la page n'a que quelques classes, et replié on n'y voyait
     que des totaux — il fallait un clic par classe pour retrouver ses comptes,
     qui sont ce qu'on vient lire. Le chevron sert donc à masquer une classe dont
     on ne s'occupe pas, pas à révéler la liste. */
  const [open, setOpen] = React.useState(true);
  const panelId = `patrimoine-classe-${cls.slug}`;
  const share = shareOf(total, positiveTotal);

  const classGains = assets.map(assetGain).filter((g) => g !== null);
  const classGain = classGains.length > 0 ? classGains.reduce((s, g) => s + g, 0) : null;

  return (
    <section data-card style={{ ...CARD, padding: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "16px 20px" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8, flex: 2, minWidth: 0 }}>
          <button
            type="button"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            aria-controls={panelId}
            aria-label={t(open ? "patrimoine.collapseClass" : "patrimoine.expandClass").replace("{name}", t(cls.labelKey))}
            style={{
              width: 28, height: 28, flexShrink: 0, borderRadius: 999, border: "none",
              background: "transparent", color: T.textSub, cursor: "pointer",
              display: "inline-flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <ChevronRight
              size={18}
              strokeWidth={1.75}
              style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform 200ms var(--ease-out, ease)" }}
            />
          </button>
          <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: "50%", background: cls.color, flexShrink: 0 }} />
          <button
            type="button"
            onClick={onOpenClass}
            style={{
              minWidth: 0, border: "none", background: "transparent", padding: 0,
              cursor: "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: 500,
              color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}
          >
            {t(cls.labelKey)}
          </button>
        </span>

        <span style={{ width: 110, flexShrink: 0, fontSize: 14, color: T.textSub, fontVariantNumeric: "tabular-nums" }}>
          {share === null ? "—" : `${Math.round(share)} %`}
        </span>
        <span style={{
          width: 130, flexShrink: 0, fontSize: 14, fontVariantNumeric: "tabular-nums",
          color: total < 0 ? T.pnlNeg : T.text,
        }}>
          {fmt(total)}
        </span>
        <span style={{
          width: 120, flexShrink: 0, textAlign: "right", fontSize: 14, fontWeight: 500,
          fontVariantNumeric: "tabular-nums",
          color: classGain === null ? T.textMut : classGain >= 0 ? T.pnlPos : T.pnlNeg,
        }}>
          {classGain === null ? "—" : fmt(classGain, true)}
        </span>
      </div>

      <div
        id={panelId}
        style={{
          display: "grid",
          gridTemplateRows: open ? "1fr" : "0fr",
          transition: "grid-template-rows 200ms var(--ease-out, ease)",
        }}
      >
        <div style={{ overflow: "hidden" }}>
          {/* Une carte par actif, sur le fond de la carte de classe : la liste
              séparée d'un filet les faisait lire comme les lignes d'un relevé,
              alors que chaque compte est une entité qu'on peut ouvrir. */}
          {/* 16 px sous le dernier actif, comme le padding bas de l'en-tête de
              classe : sans ça une catégorie dépliée se terminait 4 px plus haut
              qu'une catégorie repliée, et l'écart d'une catégorie à l'autre
              changeait selon leur état alors que le `gap` est le même. */}
          <ul style={{ listStyle: "none", margin: 0, padding: "4px 12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
            {assets.map((a) => {
              const value = assetValue(a);
              const gain = assetGain(a);
              const aShare = shareOf(value, positiveTotal);
              return (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => onOpenAsset(a.id)}
                    style={{
                      display: "flex", alignItems: "center", gap: 16, width: "100%",
                      padding: "10px 8px", borderRadius: 10, border: "none",
                      background: T.bg,
                      cursor: "pointer", fontFamily: "inherit", textAlign: "left",
                      transition: "background 120ms ease",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = T.accentBg; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = T.bg; }}
                  >
                    <span style={{ display: "flex", alignItems: "center", gap: 10, flex: 2, minWidth: 0 }}>
                      {/* Logo de l'établissement quand on le connaît — un actif
                          saisi à la main y a droit aussi : son établissement
                          suffit à le reconnaître. À défaut, les initiales sur la
                          teinte de la classe. */}
                      <AssetAvatar asset={a} size={32} />
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: "block", fontSize: 14, fontWeight: 500, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {a.name}
                        </span>
                        <span style={{ display: "block", fontSize: 12, color: T.textSub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {a.institution || t(assetTypeKey(a.type))}
                        </span>
                      </span>
                    </span>

                    <span style={{ width: 110, flexShrink: 0, fontSize: 14, color: T.textSub, fontVariantNumeric: "tabular-nums" }}>
                      {aShare === null ? "—" : `${Math.round(aShare)} %`}
                    </span>
                    <span style={{
                      width: 130, flexShrink: 0, fontSize: 14, fontVariantNumeric: "tabular-nums",
                      color: value < 0 ? T.pnlNeg : T.text,
                    }}>
                      {fmt(value)}
                    </span>
                    <span style={{
                      width: 120, flexShrink: 0, textAlign: "right", fontSize: 14, fontWeight: 500,
                      fontVariantNumeric: "tabular-nums",
                      color: gain === null ? T.textMut : gain >= 0 ? T.pnlPos : T.pnlNeg,
                    }}>
                      {gain === null ? "—" : fmt(gain, true)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}
