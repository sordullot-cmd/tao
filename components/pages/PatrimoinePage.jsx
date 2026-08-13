"use client";

/**
 * Synthèse du patrimoine.
 *
 * Portée de `app/page.tsx` de l'app patrimoine : courbe d'évolution en tête,
 * bascule patrimoine net / brut quand des passifs existent, puis le tableau
 * « Actif » en accordéon — une carte par classe, qui se déplie sur ses comptes.
 *
 * Deux sections de l'original ne sont pas reprises, faute de source :
 *   — « Transactions récentes » lisait les opérations de la banque connectée ;
 *   — le Sankey de budget lisait ces mêmes opérations catégorisées. Le budget de
 *     tr4de est un budget PRÉVISIONNEL saisi à la main (page Budget) : on renvoie
 *     donc vers elle plutôt que d'afficher un flux qu'on n'a pas.
 *
 * La courbe, elle, ne se reconstruit plus depuis des relevés quotidiens : elle
 * s'empile un point par jour d'ouverture de la page (`withTodayPoint`).
 */

import React from "react";
import { ChevronRight, Crown, Plus } from "lucide-react";
import { T } from "@/lib/ui/tokens";
import { t, useLang } from "@/lib/i18n";
import {
  AllocationChart, CARD, SectionTitle, HeroAmount, PeriodPills, PnlChart, TH,
} from "@/components/ui/da";
import { RoundLogo } from "@/components/ui/accountRows";
import { AssetFormModal, BankFormModal } from "@/components/modals/PatrimoineModals";
import { fmt } from "@/lib/ui/format";
import {
  assetGain,
  assetTypeKey,
  assetValue,
  netWorth,
  sectionsByClass,
  shareOf,
  toChartPoints,
  usePatrimoine,
  withTodayPoint,
} from "@/lib/patrimoine";
import { bankAccountToAsset, useBankAccounts } from "@/lib/bank/useBankAccounts";
import { useCloudState } from "@/lib/hooks/useCloudState";
import {
  BUDGET_CLOUD_KEY, BUDGET_STORAGE_KEY, planTotals, primaryPlan,
} from "@/lib/budgetPlans";

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
     sans eux les deux chiffres sont égaux, et le choix n'aurait rien à dire. */
  const [view, setView] = React.useState("net");

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
      const total = netWorth([...(s.assets || []), ...bankAssets]).total;
      const next = withTodayPoint(s.history || [], total);
      return next === s.history ? s : { ...s, history: next };
    });
  }, [assets, bankAssets, bank.loading, setStore]);

  const points = React.useMemo(() => toChartPoints(store.history), [store.history]);

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
          </div>

          {/* Connexion d'une banque, à la hauteur du chiffre héros : c'est la
              source qui remplit cette page toute seule. Masquée quand le
              déploiement n'a pas d'identifiants Enable Banking — la modale
              n'aurait aucun établissement à proposer, et la page Banque, elle,
              dit ce qui manque. */}
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
        </div>

        <PnlChart points={points} />
        {points.length < 2 && (
          <div style={{ fontSize: 13, color: T.textMut }}>{t("patrimoine.historyHint")}</div>
        )}
      </div>

      {/* Brut / passifs / net — seulement si des passifs existent, comme
          l'original : sans eux ces trois tuiles répètent le même nombre. */}
      {hasLiabilities && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
          {[
            { label: t("patrimoine.grossAssets"), value: nw.gross, neg: false },
            { label: t("patrimoine.liabilities"), value: nw.liabilities, neg: true },
            { label: t("patrimoine.netWorth"), value: nw.total, neg: nw.total < 0 },
          ].map((tile) => (
            <div key={tile.label} style={{ ...CARD, padding: 16 }}>
              <div style={{ fontSize: 12, color: T.textSub }}>{tile.label}</div>
              <div style={{
                marginTop: 4, fontSize: 18, fontWeight: 600,
                fontVariantNumeric: "tabular-nums",
                color: tile.neg ? T.pnlNeg : T.text,
              }}>
                {fmt(tile.value)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tableau des actifs, groupés par classe */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
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
              onOpenClass={() => { setSelectedClassSlug?.(cls.slug); setPage?.("patrimoine-class"); }}
              onOpenAsset={(id) => { setSelectedAssetId?.(id); setPage?.("patrimoine-asset"); }}
            />
          ))}
        </div>
      </div>

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
        {/* Le nom du budget affiché, avec sa couronne : on doit savoir LEQUEL
            des plans est repris ici sans ouvrir la page Budget. */}
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Crown size={14} strokeWidth={2} style={{ color: T.amber, flexShrink: 0 }} />
          {plan?.name || t("nav.budget")}
        </span>
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
  const [open, setOpen] = React.useState(false);
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
          <ul style={{ listStyle: "none", margin: 0, padding: "4px 12px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
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
                      {/* Logo de l'établissement pour un compte agrégé ; à défaut,
                          les initiales sur la teinte de la classe. */}
                      {a.logo ? (
                        <RoundLogo src={a.logo} size={32} name={a.institution || a.name} />
                      ) : (
                        <span
                          aria-hidden="true"
                          style={{
                            width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
                            background: cls.chip.bg, color: cls.chip.text,
                            display: "inline-flex", alignItems: "center", justifyContent: "center",
                            fontSize: 11, fontWeight: 600,
                          }}
                        >
                          {(a.name || "?").slice(0, 2).toUpperCase()}
                        </span>
                      )}
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
