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
import { ChevronRight, Plus } from "lucide-react";
import { T } from "@/lib/ui/tokens";
import { t, useLang } from "@/lib/i18n";
import {
  CARD, SectionTitle, HeroAmount, PnlChart, TH,
} from "@/components/ui/da";
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

export default function PatrimoinePage({ setPage, setSelectedAssetId, setSelectedClassSlug }) {
  useLang();
  const [store, setStore] = usePatrimoine();
  const bank = useBankAccounts();

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

      {/* Renvoi vers le budget prévisionnel — l'original posait ici un Sankey
          des flux réels du mois, qui n'a pas de source dans tr4de. */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <SectionTitle size="sm">{t("nav.budget")}</SectionTitle>
        <section style={{ ...CARD, padding: 24, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div style={{ fontSize: 14, color: T.textSub, maxWidth: 520 }}>
            {t("patrimoine.budgetHint")}
          </div>
          <button
            type="button"
            onClick={() => setPage?.("budget")}
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
          <ul style={{ listStyle: "none", margin: 0, padding: "0 20px 12px" }}>
            {assets.map((a) => {
              const value = assetValue(a);
              const gain = assetGain(a);
              const aShare = shareOf(value, positiveTotal);
              return (
                <li key={a.id} style={{ borderTop: `1px solid ${T.border}` }}>
                  <button
                    type="button"
                    onClick={() => onOpenAsset(a.id)}
                    style={{
                      display: "flex", alignItems: "center", gap: 16, width: "100%",
                      padding: "10px 0", border: "none", background: "transparent",
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
