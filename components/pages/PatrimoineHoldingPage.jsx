"use client";

/**
 * Détail d'une ligne de titres.
 *
 * Portée de `app/titres/[isin]/page.tsx`. L'original identifiait la position par
 * son ISIN et retrouvait son compte porteur via `?compte=…` ; ici les deux
 * arrivent ensemble en prop (`{ assetId, holdingId }`), ce qui évite le cas
 * « compte porteur manquant » que l'original devait gérer.
 *
 * Sans source de marché ni avis d'opéré, trois blocs de l'original tombent :
 * la variation du jour, le repère « cours du jour » (tout cours saisi est par
 * nature le dernier connu), et l'historique des mouvements.
 */

import React from "react";
import { T } from "@/lib/ui/tokens";
import { t, useLang } from "@/lib/i18n";
import { BackLink, CARD, SectionTitle } from "@/components/ui/da";
import { fmt } from "@/lib/ui/format";
import {
  assetValue,
  holdingCost,
  holdingGain,
  holdingGainPct,
  holdingValue,
  usePatrimoine,
  PATRIMOINE_LOCAL_KEY,
} from "@/lib/patrimoine";
import { useFirstLoad } from "@/lib/hooks/useFirstLoad";
import { PageSkeleton } from "@/components/ui/Skeleton";

export default function PatrimoineHoldingPage({ selection, setPage, setSelectedAssetId }) {
  useLang();
  const [store, , storeReady] = usePatrimoine();

  const asset = (store.assets || []).find((a) => a.id === selection?.assetId) || null;
  const holding = asset
    ? (asset.holdings || []).find((h) => h.id === selection?.holdingId) || null
    : null;

  const back = (
    <div style={{ marginLeft: -8 }}>
      <BackLink
        label={asset ? asset.name : t("patrimoine.title")}
        onClick={() => {
          if (asset) {
            setSelectedAssetId?.(asset.id);
            setPage?.("patrimoine-asset");
          } else {
            setPage?.("patrimoine");
          }
        }}
      />
    </div>
  );

  /* Le store est lu depuis le cloud : « introuvable » avant sa réponse est
     une erreur affichée à tort, sur une page ouverte par un lien direct. */
  if (useFirstLoad(storeReady, PATRIMOINE_LOCAL_KEY)) {
    return <PageSkeleton variant="detail" gap={28} stats={3} />;
  }

  if (!asset || !holding) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16, fontFamily: "var(--font-sans)" }} className="anim-1">
        {back}
        <section style={{ ...CARD, padding: "40px 24px", textAlign: "center", fontSize: 14, color: T.textSub }}>
          {t("patrimoine.holding.notFound")}
        </section>
      </div>
    );
  }

  const value = holdingValue(holding);
  const cost = holdingCost(holding);
  const gain = holdingGain(holding);
  const gainPct = holdingGainPct(holding);

  // Poids de la ligne dans la valorisation du compte porteur.
  const portfolioTotal = assetValue(asset);
  const weight = portfolioTotal > 0 ? (value / portfolioTotal) * 100 : null;

  const tiles = [
    { label: t("patrimoine.holding.valuation"), value: fmt(value), emphasis: true },
    {
      label: t("patrimoine.holding.unrealized"),
      value: gain === null
        ? "—"
        : `${fmt(gain, true)}${gainPct !== null ? ` (${gainPct >= 0 ? "+" : ""}${gainPct.toFixed(2)} %)` : ""}`,
      tone: gain === null ? null : gain >= 0 ? "pos" : "neg",
    },
    { label: t("patrimoine.holding.weight"), value: weight === null ? "—" : `${weight.toFixed(1)} %` },
    { label: t("patrimoine.asset.lineQuantity"), value: String(holding.quantity) },
    { label: t("patrimoine.asset.lastPrice"), value: holding.price === null ? "—" : fmt(holding.price) },
    { label: t("patrimoine.asset.pru"), value: holding.avgPrice === null ? "—" : fmt(holding.avgPrice) },
    { label: t("patrimoine.holding.cost"), value: cost === null ? "—" : fmt(cost) },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, fontFamily: "var(--font-sans)" }} className="anim-1">
      {back}

      <header style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 500, color: T.text }}>{holding.name}</h1>
        <div style={{ fontSize: 13, color: T.textSub, fontVariantNumeric: "tabular-nums" }}>
          {holding.isin || t("patrimoine.holding.noIsin")}
        </div>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
        {tiles.map((tile) => (
          <div key={tile.label} style={{ ...CARD, padding: 16 }}>
            <div style={{ fontSize: 12, color: T.textSub }}>{tile.label}</div>
            <div style={{
              marginTop: 4,
              fontSize: tile.emphasis ? 18 : 15,
              fontWeight: 600,
              fontVariantNumeric: "tabular-nums",
              color: tile.tone === "pos" ? T.pnlPos : tile.tone === "neg" ? T.pnlNeg : T.text,
            }}>
              {tile.value}
            </div>
          </div>
        ))}
      </div>

      {/* L'original listait ici les mouvements (avis d'opéré) de la ligne. Ils
          venaient des relevés de courtier : rien à afficher sans eux, et une
          section vide vaut mieux dite qu'affichée en creux. */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <SectionTitle size="sm">{t("patrimoine.holding.movements")}</SectionTitle>
        <section style={{ ...CARD, padding: "28px 24px", textAlign: "center", fontSize: 14, color: T.textSub }}>
          {t("patrimoine.holding.noMovements")}
        </section>
      </div>
    </div>
  );
}
