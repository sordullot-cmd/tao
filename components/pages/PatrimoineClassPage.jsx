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
import { t, useLang } from "@/lib/i18n";
import { BackLink, CARD, HeroAmount, TH } from "@/components/ui/da";
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
} from "@/lib/patrimoine";

export default function PatrimoineClassPage({ classSlug, setPage, setSelectedAssetId }) {
  useLang();
  const [store] = usePatrimoine();
  const cls = classBySlug(classSlug || "");

  const back = (
    <div style={{ marginLeft: -8 }}>
      <BackLink label={t("patrimoine.title")} onClick={() => setPage?.("patrimoine")} />
    </div>
  );

  if (!cls) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16, paddingTop: 14, fontFamily: "var(--font-sans)" }} className="anim-1">
        {back}
        <section style={{ ...CARD, padding: "40px 24px", textAlign: "center", fontSize: 14, color: T.textSub }}>
          {t("patrimoine.class.notFound")}
        </section>
      </div>
    );
  }

  const assets = assetsOfClass(store.assets || [], cls);
  const total = assets.reduce((s, a) => s + assetValue(a), 0);
  const gains = assets.map(assetGain).filter((g) => g !== null);
  const classGain = gains.length > 0 ? gains.reduce((s, g) => s + g, 0) : null;

  /* La part se lit sur le patrimoine ENTIER, pas sur le total de la classe :
     dans une page de classe, « 40 % » doit répondre à « quelle place cette
     ligne tient-elle dans mon patrimoine », sinon les parts d'une classe
     feraient toujours 100 % à elles seules. */
  const positiveTotal = netWorth(store.assets || []).gross;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28, paddingTop: 14, fontFamily: "var(--font-sans)" }} className="anim-1">
      {back}

      <header style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 500, color: T.textSub }}>
          <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: "50%", background: cls.color, flexShrink: 0 }} />
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
      </header>

      {assets.length === 0 ? (
        <section style={{ ...CARD, padding: "48px 32px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
          <div style={{ fontSize: 14, color: T.textSub }}>
            {t("patrimoine.class.empty").replace("{name}", t(cls.labelKey))}
          </div>
          <button
            type="button"
            onClick={() => setPage?.("patrimoine-assets")}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6, minHeight: 40,
              padding: "0 16px", borderRadius: 999, border: "none",
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
    </div>
  );
}
