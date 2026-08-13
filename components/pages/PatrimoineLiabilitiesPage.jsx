"use client";

/**
 * Crédits & passifs.
 *
 * Page dédiée à ce que l'app patrimoine ne traitait que comme une classe
 * d'actifs parmi d'autres (`classe/passifs`). Un passif se lit différemment d'un
 * actif : ce qui compte n'est pas sa valeur mais ce qu'il reste à rembourser, sa
 * part du patrimoine brut, et le patrimoine net une fois déduit.
 *
 * Les montants sont stockés NÉGATIFS (cf. `lib/patrimoine.ts`) et affichés en
 * positif : « 150 000 € restant dû » se lit mieux que « −150 000 € ». Le signe
 * réapparaît là où il porte du sens — le patrimoine net.
 */

import React from "react";
import { Plus } from "lucide-react";
import { T } from "@/lib/ui/tokens";
import { t, useLang } from "@/lib/i18n";
import { CARD, SectionTitle, HeroAmount } from "@/components/ui/da";
import AssetAvatar from "@/components/ui/AssetAvatar";
import { AssetFormModal } from "@/components/modals/PatrimoineModals";
import { fmt } from "@/lib/ui/format";
import {
  assetTypeKey,
  assetValue,
  classBySlug,
  netWorth,
  usePatrimoine,
} from "@/lib/patrimoine";

export default function PatrimoineLiabilitiesPage({ setPage, setSelectedAssetId }) {
  useLang();
  const [store] = usePatrimoine();
  /* `null` = fermé ; un objet ouvre la modale de saisie, éventuellement avec un
     type pré-choisi (« ajouter un crédit » depuis l'état vide). */
  const [addingAsset, setAddingAsset] = React.useState(null);
  const cls = classBySlug("passifs");
  const assets = store.assets || [];

  const liabilities = assets.filter((a) => assetValue(a) < 0);
  const nw = netWorth(assets);
  // Positif à l'affichage : c'est un montant dû, pas une valeur négative.
  const totalDue = Math.abs(nw.liabilities);

  /* Poids de l'endettement sur le patrimoine brut. Au-delà de 100 %, les dettes
     dépassent ce qui est possédé — le patrimoine net est alors négatif, et la
     barre se remplit entièrement plutôt que de déborder. */
  const ratio = nw.gross > 0 ? (totalDue / nw.gross) * 100 : totalDue > 0 ? 100 : 0;
  const barPct = Math.min(100, ratio);

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
            onClick={() => setAddingAsset({})}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6, minHeight: 36,
              padding: "0 14px", borderRadius: 999, border: "none", flexShrink: 0,
              background: T.text, color: T.textInverted, fontSize: 13, fontWeight: 500,
              cursor: "pointer", fontFamily: "inherit",
            }}
          >
            <Plus size={14} strokeWidth={1.75} /> {t("patrimoine.assets.add")}
          </button>
        </div>

        {liabilities.length === 0 ? (
          <section style={{ ...CARD, padding: "48px 32px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
            <div style={{ fontSize: 14, color: T.textSub }}>{t("patrimoine.liabilities.empty")}</div>
            <button
              type="button"
              /* L'état vide propose directement un CRÉDIT : c'est ce qui manque
                 à cette page, pas un actif quelconque. */
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
            {/* Total dû + poids sur le brut */}
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
                <div
                  role="img"
                  aria-label={t("patrimoine.liabilities.ratioAria").replace("{pct}", String(Math.round(ratio)))}
                  style={{ height: 10, width: "100%", borderRadius: 999, overflow: "hidden", background: T.accentBg }}
                >
                  <div style={{
                    width: `${barPct}%`, height: "100%",
                    background: cls?.color || T.pnlNeg,
                    transition: "width 200ms var(--ease-out, ease)",
                  }} />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, borderTop: `1px solid ${T.border}`, paddingTop: 16 }}>
                <Tile label={t("patrimoine.grossAssets")} value={fmt(nw.gross)} />
                <Tile label={t("patrimoine.liabilities.totalDue")} value={fmt(totalDue)} tone="neg" />
                <Tile label={t("patrimoine.netWorth")} value={fmt(nw.total)} tone={nw.total < 0 ? "neg" : null} />
              </div>
            </section>

            {/* Détail par crédit */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <SectionTitle size="sm">{t("patrimoine.liabilities.detail")}</SectionTitle>
              <section style={{ ...CARD, padding: 0 }}>
                <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                  {liabilities.map((a, i) => {
                    const due = Math.abs(assetValue(a));
                    const share = totalDue > 0 ? (due / totalDue) * 100 : 0;
                    return (
                      <li key={a.id} style={{ borderTop: i === 0 ? "none" : `1px solid ${T.border}` }}>
                        <button
                          type="button"
                          onClick={() => { setSelectedAssetId?.(a.id); setPage?.("patrimoine-asset"); }}
                          style={{
                            display: "flex", alignItems: "center", gap: 12, width: "100%",
                            padding: "14px 20px", border: "none", background: "transparent",
                            cursor: "pointer", fontFamily: "inherit", textAlign: "left",
                          }}
                        >
                          <AssetAvatar asset={a} size={32} />
                          <span style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ display: "block", fontSize: 14, fontWeight: 500, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {a.name}
                            </span>
                            <span style={{ display: "block", fontSize: 12, color: T.textSub }}>
                              {a.institution || t(assetTypeKey(a.type))} · {Math.round(share)} %
                              {" "}{t("patrimoine.liabilities.ofDebt")}
                            </span>
                          </span>
                          <span style={{ fontSize: 14, fontWeight: 600, color: T.pnlNeg, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
                            {fmt(due)}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
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
