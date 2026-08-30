"use client";

/**
 * Détail d'une classe d'actifs (Investissements, Crypto, Immobilier…).
 *
 * Portée de `app/classe/[slug]/page.tsx`. Le slug arrive en prop plutôt que par
 * l'URL. L'original traçait ici une courbe d'évolution propre à la classe,
 * reconstruite depuis les relevés quotidiens de ses comptes : sans cet
 * historique par compte, la page s'en tient au total et à la liste. Seul le
 * patrimoine global porte une courbe (un point par jour d'ouverture).
 */

import React from "react";
import { Plus } from "lucide-react";
import { T } from "@/lib/ui/tokens";
import { dotRing } from "@/lib/ui/color";
import { t, useLang } from "@/lib/i18n";
import { BackLink, CARD, HeroAmount, TH } from "@/components/ui/da";
import { AssetFormModal, BankFormModal } from "@/components/modals/PatrimoineModals";
import AssetAvatar from "@/components/ui/AssetAvatar";
import {
  bankAccountToAsset, useBankAccounts, useBankTxByAssetId, withPendingBalances,
} from "@/lib/bank/useBankAccounts";
import { fmt } from "@/lib/ui/format";
import {
  assetGain,
  assetTypeKey,
  assetValue,
  assetsOfClass,
  classBySlug,
  netWorth,
  shareOf,
  usePatrimoine,
  PATRIMOINE_LOCAL_KEY,
} from "@/lib/patrimoine";
import { useFirstLoad } from "@/lib/hooks/useFirstLoad";
import { PageSkeleton } from "@/components/ui/Skeleton";

export default function PatrimoineClassPage({ classSlug, setPage, setSelectedAssetId }) {
  useLang();
  const [store, , storeReady] = usePatrimoine();
  const cls = classBySlug(classSlug || "");
  const [addingAsset, setAddingAsset] = React.useState(false);
  const [addingBank, setAddingBank] = React.useState(false);
  const bank = useBankAccounts();
  const isChecking = cls?.slug === "comptes";

  /* Relevés des comptes agrégés, à la profondeur minimale : cette page n'en tire
     que les opérations en attente, pour additionner les mêmes soldes ATTENDUS
     que la synthèse d'où l'on vient. Sans cela, un compte porterait deux
     montants différents à un clic d'écart. */
  const { txByAssetId } = useBankTxByAssetId(bank.accounts);

  const back = (
    <div style={{ marginLeft: -8 }}>
      <BackLink label={t("patrimoine.title")} onClick={() => setPage?.("patrimoine")} />
    </div>
  );

  /* Le store est lu depuis le cloud : « introuvable » avant sa réponse est
     une erreur affichée à tort, sur une page ouverte par un lien direct. */
  if (useFirstLoad(storeReady, PATRIMOINE_LOCAL_KEY)) {
    return <PageSkeleton variant="detail" gap={28} stats={3} />;
  }

  if (!cls) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16, fontFamily: "var(--font-sans)" }} className="anim-1">
        {back}
        <section style={{ ...CARD, padding: "40px 24px", textAlign: "center", fontSize: 14, color: T.textSub }}>
          {t("patrimoine.class.notFound")}
        </section>
      </div>
    );
  }

  /* Les deux sources réunies, comme dans la synthèse : les comptes bancaires ne
     sont PAS écrits dans le store, et cette page ne lisait que lui — la classe
     « Comptes courants » s'ouvrait donc vide alors que la synthèse d'où l'on
     vient y montrait des comptes. */
  const allAssets = withPendingBalances(
    [...(store.assets || []), ...bank.accounts.map(bankAccountToAsset)],
    txByAssetId,
  );
  const assets = assetsOfClass(allAssets, cls);
  const total = assets.reduce((s, a) => s + assetValue(a), 0);
  const gains = assets.map(assetGain).filter((g) => g !== null);
  const classGain = gains.length > 0 ? gains.reduce((s, g) => s + g, 0) : null;

  /* La part se lit sur le patrimoine ENTIER, pas sur le total de la classe :
     dans une page de classe, « 40 % » doit répondre à « quelle place cette
     ligne tient-elle dans mon patrimoine », sinon les parts d'une classe
     feraient toujours 100 % à elles seules. */
  const positiveTotal = netWorth(allAssets).gross;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28, fontFamily: "var(--font-sans)" }} className="anim-1">
      {back}

      <header style={{ display: "flex", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 500, color: T.textSub }}>
            <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: "50%", background: cls.color, boxShadow: dotRing(cls.color), flexShrink: 0 }} />
            {t(cls.labelKey)}
          </div>
          <HeroAmount value={total} size={32} />
          {classGain !== null && classGain !== 0 && (
            <div style={{ display: "flex", alignItems: "baseline", gap: 6, fontSize: 14 }}>
              <span style={{ fontWeight: 600, color: classGain >= 0 ? T.pnlPos : T.pnlNeg, fontVariantNumeric: "tabular-nums" }}>
                {fmt(classGain, true)}
              </span>
              <span style={{ fontSize: 12, color: T.textSub }}>{t("patrimoine.asset.unrealized")}</span>
            </div>
          )}
        </div>

        {/* Comptes courants : ils viennent des banques connectées, l'ajout d'une
            banque est donc l'action de cette classe — les autres classes se
            saisissent à la main et n'ont rien à y gagner. Masqué sans
            identifiants Enable Banking, comme ailleurs. */}
        {isChecking && bank.configured && (
          <button
            type="button"
            onClick={() => setAddingBank(true)}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6, minHeight: 34,
              padding: "8px 16px", borderRadius: 999, border: "none", flexShrink: 0,
              background: T.text, color: T.textInverted, fontSize: 13, fontWeight: 500,
              cursor: "pointer", fontFamily: "inherit",
            }}
          >
            <Plus size={14} strokeWidth={1.75} /> {t("patrimoine.bank.addBank")}
          </button>
        )}
      </header>

      {assets.length === 0 ? (
        <section style={{ ...CARD, padding: "48px 32px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
          <div style={{ fontSize: 14, color: T.textSub }}>
            {t("patrimoine.class.empty").replace("{name}", t(cls.labelKey))}
          </div>
          <button
            type="button"
            onClick={() => setAddingAsset(true)}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6, minHeight: 34,
              padding: "8px 16px", borderRadius: 999, border: "none",
              background: T.accentBg, color: T.text, fontSize: 14, fontWeight: 500,
              cursor: "pointer", fontFamily: "inherit",
            }}
          >
            <Plus size={15} strokeWidth={1.75} /> {t("patrimoine.assets.add")}
          </button>
        </section>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "0 20px", opacity: 0.4 }}>
            <span style={{ ...TH, flex: 2, minWidth: 0 }}>{t("patrimoine.colName")}</span>
            <span style={{ ...TH, width: 110, flexShrink: 0 }}>{t("patrimoine.colShare")}</span>
            <span style={{ ...TH, width: 130, flexShrink: 0 }}>{t("patrimoine.colValue")}</span>
            <span style={{ ...TH, width: 120, flexShrink: 0, textAlign: "right" }}>{t("patrimoine.colGain")}</span>
          </div>

          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 12 }}>
            {assets.map((a) => {
              const value = assetValue(a);
              const gain = assetGain(a);
              const share = shareOf(value, positiveTotal);
              return (
                <li key={a.id}>
                  <button
                    data-card
                    type="button"
                    onClick={() => { setSelectedAssetId?.(a.id); setPage?.("patrimoine-asset"); }}
                    style={{
                      ...CARD, padding: "16px 20px", width: "100%", border: "none",
                      display: "flex", alignItems: "center", gap: 16,
                      cursor: "pointer", fontFamily: "inherit", textAlign: "left",
                    }}
                  >
                    <span style={{ display: "flex", alignItems: "center", gap: 10, flex: 2, minWidth: 0 }}>
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
                      {share === null ? "—" : `${Math.round(share)} %`}
                    </span>
                    <span style={{
                      width: 130, flexShrink: 0, fontSize: 14, fontWeight: 500,
                      fontVariantNumeric: "tabular-nums",
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
      )}

      {/* Saisie pré-réglée sur la classe affichée quand elle n'a qu'un type :
          on arrive ici pour ajouter DANS cette classe. */}
      {addingAsset && (
        <AssetFormModal
          defaultType={cls?.types?.length === 1 ? cls.types[0] : undefined}
          onClose={() => setAddingAsset(false)}
        />
      )}
      {addingBank && <BankFormModal onClose={() => setAddingBank(false)} />}
    </div>
  );
}
