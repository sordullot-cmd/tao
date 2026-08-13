"use client";

/**
 * Crédits & passifs.
 *
 * Page dédiée à ce que l'app patrimoine ne traitait que comme une classe
 * d'actifs parmi d'autres (`classe/passifs`). Un passif se lit différemment d'un
 * actif : ce qui compte n'est pas sa valeur mais ce qu'il reste à rembourser, ce
 * qu'il coûte chaque mois, jusqu'à quand, et ce que ça pèse sur le patrimoine.
 *
 * La page ne savait afficher qu'un total : un crédit n'était qu'un nom et un
 * montant, donc rien n'était calculable. Les conditions du prêt vivent désormais
 * sur l'actif (`Asset.loan`) et tout ce qui s'en déduit sort de `lib/loans` —
 * échéancier, date de fin, intérêts restants, effet d'un remboursement anticipé.
 * La page ne fait que mettre ces chiffres en page et proposer les deux gestes qui
 * les entretiennent : passer une échéance, et recaler le restant dû.
 *
 * Les montants sont stockés NÉGATIFS (cf. `lib/patrimoine.ts`) et affichés en
 * positif : « 150 000 € restant dû » se lit mieux que « −150 000 € ». Le signe
 * réapparaît là où il porte du sens — le patrimoine net.
 */

import React from "react";
import { Check, ChevronRight, Pencil, Plus, RefreshCw, X } from "lucide-react";
import { T } from "@/lib/ui/tokens";
import { t, useLang } from "@/lib/i18n";
import { CARD, SectionTitle, HeroAmount, TH } from "@/components/ui/da";
import AssetAvatar from "@/components/ui/AssetAvatar";
import { LoanBar, durationLabel, loanGapsSentence } from "@/components/ui/loanUi";
import { AssetFormModal } from "@/components/modals/PatrimoineModals";
import { fmt, fmtDay, fmtMonthYear } from "@/lib/ui/format";
import { getCurrencySymbol } from "@/lib/userPrefs";
import { debtTotals, loanStats, simulatePrepayment } from "@/lib/loans";
import { bankAccountToAsset, isBankAsset, useBankAccounts } from "@/lib/bank/useBankAccounts";
import {
  assetTypeKey,
  assetValue,
  classBySlug,
  netWorth,
  usePatrimoine,
} from "@/lib/patrimoine";

/** Nombre saisi, `null` si vide ou illisible (virgule décimale acceptée). */
const num = (v) => {
  const s = String(v ?? "").trim().replace(",", ".");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

const FIELD = {
  height: 36,
  borderRadius: "var(--radius-field)",
  border: `1px solid ${T.border}`,
  background: T.white,
  color: T.text,
  fontSize: 14,
  fontFamily: "inherit",
  padding: "0 10px",
  minWidth: 0,
  width: "100%",
};

export default function PatrimoineLiabilitiesPage({ setPage, setSelectedAssetId }) {
  useLang();
  const [store, setStore] = usePatrimoine();
  /* `null` = fermé ; un objet ouvre la modale de saisie, éventuellement avec un
     type pré-choisi (« ajouter un crédit » depuis l'état vide). */
  const [addingAsset, setAddingAsset] = React.useState(null);
  const [editingAsset, setEditingAsset] = React.useState(null);
  const cls = classBySlug("passifs");

  /* Les comptes agrégés comptent, eux aussi : sans eux le patrimoine brut est
     amputé et le poids de la dette sort surévalué — c'est le même patrimoine que
     celui de la page de synthèse, il doit donner le même ratio. Un compte
     bancaire à solde négatif (découvert) rejoint d'ailleurs les passifs. */
  const bank = useBankAccounts();
  const bankAssets = React.useMemo(() => bank.accounts.map(bankAccountToAsset), [bank.accounts]);
  const assets = React.useMemo(
    () => [...(store.assets || []), ...bankAssets],
    [store.assets, bankAssets],
  );

  // Du plus lourd au plus léger : `assetValue` est négatif, donc ordre croissant.
  const liabilities = React.useMemo(
    () => assets.filter((a) => assetValue(a) < 0).sort((x, y) => assetValue(x) - assetValue(y)),
    [assets],
  );

  const nw = React.useMemo(() => netWorth(assets), [assets]);
  // Positif à l'affichage : c'est un montant dû, pas une valeur négative.
  const totalDue = Math.abs(nw.liabilities);

  const rows = React.useMemo(
    () => liabilities.map((a) => ({ asset: a, stats: loanStats(Math.abs(assetValue(a)), a.loan) })),
    [liabilities],
  );
  const totals = React.useMemo(() => debtTotals(rows.map((r) => r.stats)), [rows]);

  /* Poids de l'endettement sur le patrimoine brut. Au-delà de 100 %, les dettes
     dépassent ce qui est possédé — le patrimoine net est alors négatif, et la
     barre se remplit entièrement plutôt que de déborder. */
  const ratio = nw.gross > 0 ? (totalDue / nw.gross) * 100 : totalDue > 0 ? 100 : 0;

  const patch = (id, fn) =>
    setStore((s) => ({
      ...s,
      assets: (s.assets || []).map((a) => (a.id === id ? fn(a) : a)),
    }));

  /* Passer une échéance : le restant dû descend de la PART CAPITAL, pas de la
     mensualité — la part d'intérêts est payée, elle ne rembourse rien. C'est
     précisément le calcul que personne ne fait de tête, et sans lui un suivi à la
     main dérive de plusieurs milliers d'euros sur la durée d'un prêt. */
  const payInstallment = (asset, row) =>
    patch(asset.id, (a) => ({ ...a, balance: -row.balance, updatedAt: new Date().toISOString() }));

  /** Recale le restant dû sur le théorique du contrat. */
  const syncOutstanding = (asset, value) =>
    patch(asset.id, (a) => ({
      ...a,
      balance: -Math.max(0, value),
      updatedAt: new Date().toISOString(),
    }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, paddingTop: 14, fontFamily: "var(--font-sans)" }} className="anim-1">
      <div style={{ display: "flex", flexDirection: "column", gap: 36 }}>
        {/* L'action de saisie est en haut à droite du titre : c'est ici qu'on
            ajoute un crédit — et, plus largement, n'importe quel actif, la page
            « Actifs » n'existant plus. */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0, flex: 1 }}>
            <SectionTitle>{t("patrimoine.liabilities.title")}</SectionTitle>
            <div style={{ fontSize: 14, lineHeight: "18.6px", color: T.textSub, maxWidth: 620 }}>
              {t("patrimoine.liabilities.subtitle")}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setAddingAsset({ type: "loan" })}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6, minHeight: 36,
              padding: "0 14px", borderRadius: 999, border: "none", flexShrink: 0,
              background: T.text, color: T.textInverted, fontSize: 13, fontWeight: 500,
              cursor: "pointer", fontFamily: "inherit",
            }}
          >
            <Plus size={14} strokeWidth={1.75} /> {t("patrimoine.liabilities.addLoan")}
          </button>
        </div>

        {liabilities.length === 0 ? (
          <section style={{ ...CARD, padding: "48px 32px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
            <div style={{ fontSize: 14, color: T.textSub }}>{t("patrimoine.liabilities.empty")}</div>
            <button
              type="button"
              onClick={() => setAddingAsset({ type: "loan" })}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6, minHeight: 40,
                padding: "0 16px", borderRadius: 999, border: "none",
                background: T.accentBg, color: T.text, fontSize: 14, fontWeight: 500,
                cursor: "pointer", fontFamily: "inherit",
              }}
            >
              <Plus size={15} strokeWidth={1.75} /> {t("patrimoine.liabilities.addLoan")}
            </button>
          </section>
        ) : (
          <>
            {/* Synthèse : ce qui reste dû, ce que ça coûte, jusqu'à quand. */}
            <section style={{ ...CARD, padding: 24, display: "flex", flexDirection: "column", gap: 18 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 13, color: T.textSub }}>{t("patrimoine.liabilities.totalDue")}</span>
                <HeroAmount value={totalDue} size={32} />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, fontSize: 13, color: T.textSub }}>
                  <span>{t("patrimoine.liabilities.debtRatio")}</span>
                  <span style={{ fontWeight: 600, color: T.text, fontVariantNumeric: "tabular-nums" }}>
                    {Math.round(ratio)} %
                  </span>
                </div>
                <LoanBar
                  pct={ratio}
                  height={10}
                  color={cls?.color || T.pnlNeg}
                  ariaLabel={t("patrimoine.liabilities.ratioAria").replace("{pct}", String(Math.round(ratio)))}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, borderTop: `1px solid ${T.border}`, paddingTop: 16 }}>
                <Tile
                  label={t("patrimoine.liabilities.monthlyCharge")}
                  value={totals.monthlyCharge > 0 ? fmt(totals.monthlyCharge) : "—"}
                  tone="neg"
                />
                <Tile
                  label={t("patrimoine.liabilities.interestLeft")}
                  value={totals.interestLeft === null ? "—" : fmt(totals.interestLeft)}
                />
                <Tile
                  label={t("patrimoine.liabilities.lastPayment")}
                  value={totals.lastEndDate ? fmtMonthYear(totals.lastEndDate) : "—"}
                />
                <Tile label={t("patrimoine.netWorth")} value={fmt(nw.total)} tone={nw.total < 0 ? "neg" : null} />
              </div>

              {/* Un total d'intérêts partiel doit se dire : sinon il se lit comme
                  le coût de TOUTE la dette, et il est plus bas que la réalité. */}
              {totals.incomplete > 0 && (
                <div style={{ fontSize: 12, color: T.textMut, lineHeight: 1.5 }}>
                  {t("patrimoine.liabilities.partialTotals").replace("{n}", String(totals.incomplete))}
                </div>
              )}
            </section>

            {/* Détail par crédit */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <SectionTitle size="sm">{t("patrimoine.liabilities.detail")}</SectionTitle>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {rows.map(({ asset, stats }) => (
                  <LoanCard
                    key={asset.id}
                    asset={asset}
                    stats={stats}
                    color={cls?.color || T.pnlNeg}
                    aggregated={isBankAsset(asset)}
                    onEdit={() => setEditingAsset(asset)}
                    onOpen={() => { setSelectedAssetId?.(asset.id); setPage?.("patrimoine-asset"); }}
                    onPay={(row) => payInstallment(asset, row)}
                    onSync={(value) => syncOutstanding(asset, value)}
                  />
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {addingAsset && (
        <AssetFormModal
          defaultType={addingAsset.type}
          onClose={() => setAddingAsset(null)}
          onSaved={(id) => { setSelectedAssetId?.(id); }}
        />
      )}

      {editingAsset && (
        <AssetFormModal asset={editingAsset} onClose={() => setEditingAsset(null)} />
      )}
    </div>
  );
}

/**
 * Carte d'un crédit : l'essentiel visible, le pilotage en dessous.
 *
 * Dépliée par défaut — replié, il ne restait qu'un montant, c'est-à-dire l'état
 * dont on cherche justement à sortir. Le chevron sert donc à ranger un crédit
 * dont on ne s'occupe pas. Le tableau d'amortissement, lui, garde son propre
 * dépliage : c'est une pièce de référence, pas une chose qu'on lit chaque fois.
 */
function LoanCard({ asset, stats, color, aggregated, onEdit, onOpen, onPay, onSync }) {
  const [open, setOpen] = React.useState(true);
  // Un clic accidentel sur « échéance payée » modifierait le patrimoine : le
  // geste se confirme, comme la suppression d'une ligne de titres.
  const [confirmingPay, setConfirmingPay] = React.useState(false);
  const panelId = `credit-${asset.id}`;
  const next = stats.schedule[0] || null;

  /* Un écart de plus d'un euro entre le restant dû saisi et celui du contrat
     signale une saisie qui n'a pas suivi les prélèvements. En dessous, c'est un
     arrondi : le signaler serait du bruit. */
  const drifted = stats.drift !== null && Math.abs(stats.drift) >= 1;

  return (
    <section data-card style={{ ...CARD, padding: 0 }}>
      {/* En-tête : chevron, identité, montant. Trois boutons FRÈRES et non
          imbriqués — une zone cliquable dans une autre avale le clic. */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px" }}>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={t(open ? "patrimoine.loan.collapse" : "patrimoine.loan.expand").replace("{name}", asset.name || "")}
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

        <AssetAvatar asset={asset} size={32} />

        <button
          type="button"
          onClick={onOpen}
          style={{
            flex: 1, minWidth: 0, textAlign: "left", border: "none", background: "transparent",
            padding: 0, cursor: "pointer", fontFamily: "inherit",
          }}
        >
          <span style={{ display: "block", fontSize: 14, fontWeight: 500, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {asset.name}
          </span>
          <span style={{ display: "block", fontSize: 12, color: T.textSub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {asset.institution || t(assetTypeKey(asset.type))}
            {stats.rate !== null ? ` · ${stats.rate.toLocaleString(undefined, { maximumFractionDigits: 2 })} %` : ""}
            {stats.monthsLeft !== null ? ` · ${durationLabel(stats.monthsLeft)}` : ""}
          </span>
        </button>

        <span style={{ flexShrink: 0, textAlign: "right" }}>
          <span style={{ display: "block", fontSize: 15, fontWeight: 600, color: T.pnlNeg, fontVariantNumeric: "tabular-nums" }}>
            {fmt(stats.outstanding)}
          </span>
          {stats.monthlyCharge !== null && (
            <span style={{ display: "block", fontSize: 12, color: T.textSub, fontVariantNumeric: "tabular-nums" }}>
              {fmt(stats.monthlyCharge)} / {t("patrimoine.loan.perMonth")}
            </span>
          )}
        </span>
      </div>

      {/* Progression du remboursement — seulement quand le capital emprunté est
          connu : sans lui, il n'y a pas de « déjà remboursé » à montrer. */}
      {stats.progress !== null && (
        <div style={{ padding: "0 16px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
          <LoanBar
            pct={stats.progress}
            color={T.green}
            ariaLabel={t("patrimoine.loan.progressAria").replace("{pct}", String(Math.round(stats.progress)))}
          />
          <div style={{ fontSize: 12, color: T.textSub, fontVariantNumeric: "tabular-nums" }}>
            {t("patrimoine.loan.repaidOf")
              .replace("{repaid}", fmt(stats.repaid ?? 0))
              .replace("{borrowed}", fmt(stats.borrowed ?? 0))
              .replace("{pct}", String(Math.round(stats.progress)))}
          </div>
        </div>
      )}

      <div
        id={panelId}
        style={{
          display: "grid",
          gridTemplateRows: open ? "1fr" : "0fr",
          transition: "grid-template-rows 200ms var(--ease-out, ease)",
        }}
      >
        <div style={{ overflow: "hidden" }}>
          <div style={{ borderTop: `1px solid ${T.border}`, padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>
            {stats.complete ? (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 12 }}>
                  <Tile label={t("patrimoine.loan.nextDue")} value={next?.date ? fmtDay(next.date) : "—"} />
                  <Tile label={t("patrimoine.loan.remaining")} value={durationLabel(stats.monthsLeft)} />
                  <Tile label={t("patrimoine.loan.end")} value={fmtMonthYear(stats.endDate)} />
                  <Tile label={t("patrimoine.loan.interestLeft")} value={fmt(stats.interestLeft ?? 0)} tone="neg" />
                  <Tile label={t("patrimoine.loan.totalLeft")} value={stats.totalLeft === null ? "—" : fmt(stats.totalLeft)} />
                </div>

                {/* Ce que la prochaine échéance rembourse vraiment, et le geste
                    qui l'enregistre. */}
                {next && !aggregated && (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", background: T.bg, borderRadius: 10, padding: "10px 12px" }}>
                    <span style={{ fontSize: 13, color: T.textSub, flex: 1, minWidth: 220 }}>
                      {t("patrimoine.loan.nextBreakdown")
                        .replace("{payment}", fmt(next.payment))
                        .replace("{principal}", fmt(next.principal))
                        .replace("{interest}", fmt(next.interest))}
                    </span>
                    {confirmingPay ? (
                      <span style={{ display: "inline-flex", gap: 6, flexShrink: 0 }}>
                        <SmallBtn
                          tone="solid"
                          onClick={() => { setConfirmingPay(false); onPay(next); }}
                          icon={<Check size={14} strokeWidth={2} />}
                        >
                          {t("patrimoine.loan.confirmPay").replace("{amount}", fmt(next.principal))}
                        </SmallBtn>
                        <SmallBtn onClick={() => setConfirmingPay(false)} icon={<X size={14} strokeWidth={2} />}>
                          {t("common.cancel")}
                        </SmallBtn>
                      </span>
                    ) : (
                      <SmallBtn onClick={() => setConfirmingPay(true)} icon={<Check size={14} strokeWidth={1.75} />}>
                        {t("patrimoine.loan.markPaid")}
                      </SmallBtn>
                    )}
                  </div>
                )}

                {/* Recalage sur le contrat : proposé, jamais appliqué d'office —
                    un remboursement anticipé rend le théorique faux, et c'est
                    l'emprunteur qui sait lequel des deux chiffres dit vrai. */}
                {drifted && !aggregated && (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", background: T.amberBg, border: `1px solid ${T.amberBd}`, borderRadius: 10, padding: "10px 12px" }}>
                    <span style={{ fontSize: 13, color: T.text, flex: 1, minWidth: 220 }}>
                      {t(stats.drift > 0 ? "patrimoine.loan.driftAhead" : "patrimoine.loan.driftBehind")
                        .replace("{theoretical}", fmt(stats.theoretical ?? 0))
                        .replace("{gap}", fmt(Math.abs(stats.drift)))}
                    </span>
                    <SmallBtn onClick={() => onSync(stats.theoretical)} icon={<RefreshCw size={14} strokeWidth={1.75} />}>
                      {t("patrimoine.loan.syncOutstanding")}
                    </SmallBtn>
                  </div>
                )}

                <PrepaySimulator outstanding={stats.outstanding} terms={asset.loan} stats={stats} color={color} />

                <AmortTable rows={stats.schedule} insurance={stats.insurance} />
              </>
            ) : (
              /* Crédit sans conditions : la page dit ce qui manque et ouvre le
                 formulaire là où ça se saisit, plutôt qu'un tableau de tirets. */
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <span style={{ fontSize: 13, color: T.textSub, flex: 1, minWidth: 240, lineHeight: 1.5 }}>
                  {aggregated
                    ? t("patrimoine.loan.aggregatedNotice")
                    : loanGapsSentence(stats.gaps) || t("patrimoine.loan.noTerms")}
                </span>
                {!aggregated && (
                  <SmallBtn tone="solid" onClick={onEdit} icon={<Pencil size={14} strokeWidth={1.75} />}>
                    {t("patrimoine.loan.completeTerms")}
                  </SmallBtn>
                )}
              </div>
            )}

            {!aggregated && stats.complete && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <SmallBtn onClick={onEdit} icon={<Pencil size={14} strokeWidth={1.75} />}>
                  {t("patrimoine.loan.editTerms")}
                </SmallBtn>
                <SmallBtn onClick={onOpen}>{t("patrimoine.loan.openAsset")}</SmallBtn>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * Simulateur de remboursement anticipé.
 *
 * Deux leviers, les deux seuls qui existent : un versement ponctuel, et une
 * mensualité renforcée. La mensualité est conservée après un versement — c'est
 * la durée qui tombe (cf. `simulatePrepayment`), et c'est ce qui fait gagner des
 * intérêts. La courbe montre le capital des deux scénarios : l'écart entre les
 * deux traits est exactement ce qu'on cherche à voir.
 */
function PrepaySimulator({ outstanding, terms, stats, color }) {
  const [lump, setLump] = React.useState("");
  const [extra, setExtra] = React.useState("");
  const sym = getCurrencySymbol();

  const res = React.useMemo(
    () => simulatePrepayment(outstanding, terms, { lump: num(lump), extraMonthly: num(extra) }),
    [outstanding, terms, lump, extra],
  );

  /* Échéancier du scénario simulé, pour le second tracé. Recalculé ici plutôt
     que renvoyé par `simulatePrepayment` : celle-ci répond une comparaison, pas
     un jeu de points, et la majorité des appels n'a pas de courbe à dessiner. */
  const simRows = React.useMemo(() => {
    if (!res || res.clears) return [];
    return loanStats(res.newOutstanding, { ...terms, payment: (stats.payment ?? 0) + (num(extra) ?? 0) }).schedule;
  }, [res, terms, stats.payment, extra]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{t("patrimoine.loan.simTitle")}</div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>
        <SimField label={`${t("patrimoine.loan.simLump")} (${sym})`} id={`lump-${stats.nextDueDate || "x"}`}>
          <input
            id={`lump-${stats.nextDueDate || "x"}`}
            type="number" inputMode="decimal" min={0} step="any"
            value={lump} onChange={(e) => setLump(e.target.value)} placeholder="10000" style={FIELD}
          />
        </SimField>
        <SimField label={`${t("patrimoine.loan.simExtra")} (${sym})`} id={`extra-${stats.nextDueDate || "x"}`}>
          <input
            id={`extra-${stats.nextDueDate || "x"}`}
            type="number" inputMode="decimal" min={0} step="any"
            value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="150" style={FIELD}
          />
        </SimField>
      </div>

      {res === null ? (
        <div style={{ fontSize: 12, color: T.textMut, lineHeight: 1.5 }}>{t("patrimoine.loan.simHint")}</div>
      ) : (
        <div style={{ background: T.bg, borderRadius: 10, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
          {res.clears ? (
            <div style={{ fontSize: 13, color: T.text, lineHeight: 1.5 }}>
              {t("patrimoine.loan.simClears").replace("{interest}", fmt(res.interestSaved))}
            </div>
          ) : (
            <>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 18px" }}>
                <SimResult
                  label={t("patrimoine.loan.simInterestSaved")}
                  value={fmt(res.interestSaved)}
                  tone={res.interestSaved > 0 ? "pos" : null}
                />
                <SimResult
                  label={t("patrimoine.loan.simTimeSaved")}
                  value={res.monthsSaved > 0 ? durationLabel(res.monthsSaved) : "—"}
                  tone={res.monthsSaved > 0 ? "pos" : null}
                />
                <SimResult label={t("patrimoine.loan.simNewEnd")} value={fmtMonthYear(res.newEndDate)} />
              </div>
              <div style={{ fontSize: 12, color: T.textSub, lineHeight: 1.5 }}>
                {t("patrimoine.loan.simSummary")
                  .replace("{before}", fmtMonthYear(stats.endDate))
                  .replace("{after}", fmtMonthYear(res.newEndDate))
                  .replace("{interest}", fmt(res.newInterest))}
              </div>
              <DebtCurve rows={stats.schedule} simRows={simRows} color={color} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Capital restant dû dans le temps, scénario actuel et scénario simulé.
 *
 * Un tracé SVG maison plutôt que le graphique de P&L du site : celui-ci porte
 * une trame, un survol et une réserve de largeur faits pour une pleine largeur,
 * là où il s'agit ici d'une pente dans une carte. Le libellé porte l'information
 * en mots — la courbe l'illustre, elle ne la détient pas.
 */
function DebtCurve({ rows, simRows, color }) {
  const W = 560;
  const H = 64;
  if (!rows || rows.length < 2) return null;

  const maxMonths = Math.max(rows.length, simRows.length || 0);
  const maxBalance = Math.max(rows[0].balance, simRows[0]?.balance || 0, 1);
  const path = (list) =>
    list
      .map((r, i) => {
        const x = (i / Math.max(1, maxMonths - 1)) * W;
        const y = H - (r.balance / maxBalance) * (H - 2) - 1;
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={t("patrimoine.loan.curveAria")}
      style={{ width: "100%", height: H, display: "block", overflow: "visible" }}
    >
      <path d={path(rows)} fill="none" stroke={T.border2} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      {simRows.length > 1 && (
        <path
          d={path(simRows)}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeDasharray="4 3"
          vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
  );
}

/**
 * Tableau d'amortissement.
 *
 * Replié sur un an : c'est l'horizon qu'on vérifie (« combien de capital cette
 * année »), et les 240 lignes d'un prêt immobilier repousseraient tout le reste
 * de la page hors de l'écran. Le tableau défile dans sa propre boîte — cinq
 * colonnes chiffrées ne tiennent pas sur un téléphone, et c'est la page entière
 * qui partirait de travers.
 */
function AmortTable({ rows, insurance }) {
  const [all, setAll] = React.useState(false);
  if (!rows || rows.length === 0) return null;
  const shown = all ? rows : rows.slice(0, 12);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{t("patrimoine.loan.tableTitle")}</span>
        {rows.length > 12 && (
          <button
            type="button"
            onClick={() => setAll(!all)}
            style={{
              border: "none", background: "transparent", padding: 0, cursor: "pointer",
              fontFamily: "inherit", fontSize: 13, color: T.textSub,
            }}
          >
            {all
              ? t("patrimoine.loan.tableLess")
              : t("patrimoine.loan.tableAll").replace("{n}", String(rows.length))}
          </button>
        )}
      </div>

      <div style={{ overflowX: "auto", border: `1px solid ${T.border}`, borderRadius: 10 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 460 }}>
          <thead>
            <tr>
              <th style={{ ...TH, textAlign: "left", padding: "8px 12px" }}>{t("patrimoine.loan.colDue")}</th>
              <th style={{ ...TH, textAlign: "right", padding: "8px 12px" }}>{t("patrimoine.loan.colPayment")}</th>
              <th style={{ ...TH, textAlign: "right", padding: "8px 12px" }}>{t("patrimoine.loan.colPrincipal")}</th>
              <th style={{ ...TH, textAlign: "right", padding: "8px 12px" }}>{t("patrimoine.loan.colInterest")}</th>
              <th style={{ ...TH, textAlign: "right", padding: "8px 12px" }}>{t("patrimoine.loan.colBalance")}</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.index} style={{ borderTop: `1px solid ${T.border}` }}>
                <td style={{ padding: "8px 12px", fontSize: 13, color: T.textSub, whiteSpace: "nowrap" }}>
                  {r.date ? fmtDay(r.date) : `#${r.index}`}
                </td>
                <td style={{ padding: "8px 12px", fontSize: 13, color: T.text, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                  {fmt(r.payment)}
                </td>
                <td style={{ padding: "8px 12px", fontSize: 13, color: T.text, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                  {fmt(r.principal)}
                </td>
                <td style={{ padding: "8px 12px", fontSize: 13, color: T.pnlNeg, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                  {fmt(r.interest)}
                </td>
                <td style={{ padding: "8px 12px", fontSize: 13, color: T.textSub, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                  {fmt(r.balance)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {insurance > 0 && (
        <div style={{ fontSize: 11, color: T.textMut }}>
          {t("patrimoine.loan.tableInsuranceNote").replace("{amount}", fmt(insurance))}
        </div>
      )}
    </div>
  );
}

function Tile({ label, value, tone }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: T.textSub }}>{label}</div>
      <div style={{
        marginTop: 2, fontSize: 16, fontWeight: 600,
        fontVariantNumeric: "tabular-nums",
        color: tone === "neg" ? T.pnlNeg : T.text,
      }}>
        {value}
      </div>
    </div>
  );
}

function SimField({ label, id, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5, minWidth: 0 }}>
      <label htmlFor={id} style={{ fontSize: 12, color: T.textSub }}>{label}</label>
      {children}
    </div>
  );
}

function SimResult({ label, value, tone }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: T.textSub }}>{label}</div>
      <div style={{
        fontSize: 15, fontWeight: 600, fontVariantNumeric: "tabular-nums",
        color: tone === "pos" ? T.pnlPos : T.text,
      }}>
        {value}
      </div>
    </div>
  );
}

/** Bouton d'action d'une carte : discret par défaut, plein quand il porte le
 *  geste principal (confirmer un paiement, compléter les conditions). */
function SmallBtn({ children, onClick, icon, tone }) {
  const solid = tone === "solid";
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6, minHeight: 34,
        padding: "0 12px", borderRadius: 999, flexShrink: 0,
        border: solid ? "none" : `1px solid ${T.border}`,
        background: solid ? T.text : T.white,
        color: solid ? T.textInverted : T.text,
        fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit",
      }}
    >
      {icon}
      {children}
    </button>
  );
}
