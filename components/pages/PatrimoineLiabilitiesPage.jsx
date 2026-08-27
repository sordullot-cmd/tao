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
 * Le corps d'un crédit — échéances, simulateur de remboursement anticipé,
 * échéancier — est `LoanBody` dans `components/ui/loanUi`, partagé avec la fiche
 * du crédit (`PatrimoineAssetPage`). Les deux surfaces montrent la même chose du
 * même crédit : tenir chacune son échéancier, c'est deux calculs qui divergent et
 * deux endroits à corriger. Ici il vit sous un pli, une carte par crédit ; sur la
 * fiche, à plat, sur un seul.
 *
 * Les montants sont stockés NÉGATIFS (cf. `lib/patrimoine.ts`) et affichés en
 * positif : « 150 000 € restant dû » se lit mieux que « −150 000 € ». Le signe
 * réapparaît là où il porte du sens — le patrimoine net.
 */

import React from "react";
import { ArrowUpRight, ChevronRight, Pencil, Plus } from "lucide-react";
import { T } from "@/lib/ui/tokens";
import { t, useLang } from "@/lib/i18n";
import { CARD, SectionTitle, HeroAmount } from "@/components/ui/da";
import AssetAvatar from "@/components/ui/AssetAvatar";
import {
  AmortTable, LoanAmount, LoanBar, LoanBody, LoanBtn, LoanIdentity, LoanProgress, LoanTile,
} from "@/components/ui/loanUi";
import { AssetFormModal } from "@/components/modals/PatrimoineModals";
import { fmt, fmtMonthYear } from "@/lib/ui/format";
import { debtTotals, loanStats } from "@/lib/loans";
import { bankAccountToAsset, isBankAsset, useBankAccounts } from "@/lib/bank/useBankAccounts";
import { assetValue, classBySlug, netWorth, usePatrimoine, PATRIMOINE_LOCAL_KEY } from "@/lib/patrimoine";
import { useFirstLoad } from "@/lib/hooks/useFirstLoad";
import { PageSkeleton } from "@/components/ui/Skeleton";

export default function PatrimoineLiabilitiesPage({ setPage, setSelectedAssetId }) {
  useLang();
  const [store, setStore, storeReady] = usePatrimoine();
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

  if (useFirstLoad(storeReady, PATRIMOINE_LOCAL_KEY)) {
    return <PageSkeleton variant="list" />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, fontFamily: "var(--font-sans)" }} className="anim-1">
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
              display: "inline-flex", alignItems: "center", gap: 6, minHeight: 34,
              padding: "8px 16px", borderRadius: 999, border: "none", flexShrink: 0,
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
                display: "inline-flex", alignItems: "center", gap: 6, minHeight: 34,
                padding: "8px 16px", borderRadius: 999, border: "none",
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
                <LoanTile
                  label={t("patrimoine.liabilities.monthlyCharge")}
                  value={totals.monthlyCharge > 0 ? fmt(totals.monthlyCharge) : "—"}
                  tone="neg"
                />
                <LoanTile
                  label={t("patrimoine.liabilities.interestLeft")}
                  value={totals.interestLeft === null ? "—" : fmt(totals.interestLeft)}
                />
                <LoanTile
                  label={t("patrimoine.liabilities.lastPayment")}
                  value={totals.lastEndDate ? fmtMonthYear(totals.lastEndDate) : "—"}
                />
                <LoanTile label={t("patrimoine.netWorth")} value={fmt(nw.total)} tone={nw.total < 0 ? "neg" : null} />
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
 * Carte d'un crédit : l'essentiel visible, tout le reste en dessous.
 *
 * Dépliée par défaut — replié, il ne restait qu'un montant, c'est-à-dire l'état
 * dont on cherche justement à sortir. Le chevron sert donc à ranger un crédit
 * dont on ne s'occupe pas.
 *
 * Le contenu déplié est `LoanBody`, partagé avec la fiche du crédit : la carte
 * n'ajoute que son en-tête, sa progression et le renvoi vers la fiche.
 */
function LoanCard({ asset, stats, aggregated, onEdit, onOpen, onPay, onSync }) {
  const [open, setOpen] = React.useState(true);
  const panelId = `credit-${asset.id}`;

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
            width: 34, height: 34, flexShrink: 0, borderRadius: 999, border: "none",
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
          <LoanIdentity asset={asset} stats={stats} />
        </button>

        <LoanAmount stats={stats} />
      </div>

      {/* La progression reste au-dessus du pli : c'est elle qui dit où on en est
          d'un crédit qu'on a rangé. */}
      {stats.progress !== null && (
        <div style={{ padding: "0 16px 14px" }}>
          <LoanProgress stats={stats} />
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
            <LoanBody
              terms={asset.loan}
              stats={stats}
              aggregated={aggregated}
              onEdit={onEdit}
              onPay={onPay}
              onSync={onSync}
            />

            {/* L'échéancier reste dans la carte du crédit : ici, une carte par
                crédit, et le sortir en donnerait deux par ligne de liste. Sur la
                fiche, où il n'y a qu'un crédit, il a son propre bloc. */}
            <AmortTable rows={stats.schedule} insurance={stats.insurance} />

            {!aggregated && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <LoanBtn onClick={onOpen} icon={<ArrowUpRight size={14} strokeWidth={1.75} />}>
                  {t("patrimoine.loan.openAsset")}
                </LoanBtn>
                {stats.complete && (
                  <LoanBtn onClick={onEdit} icon={<Pencil size={14} strokeWidth={1.75} />}>
                    {t("patrimoine.loan.editTerms")}
                  </LoanBtn>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
