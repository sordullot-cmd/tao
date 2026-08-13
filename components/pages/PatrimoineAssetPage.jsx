"use client";

/**
 * Détail d'un actif.
 *
 * Portée de `app/comptes/[id]/page.tsx`. L'original recevait l'id par l'URL et
 * lisait quatre sources distinctes (patrimoine, historique du compte, positions,
 * avis d'opéré). tr4de navigue par état et non par routeur : l'id arrive en
 * prop, comme pour `AccountDetailPage` et `PropFirmDetailPage`.
 *
 * Ce qui change, faute de source :
 *   — les positions ne viennent plus d'un relevé : elles se saisissent ici, et
 *     ce sont elles qui donnent alors sa valeur au compte (cf. `assetValue`) ;
 *   — la courbe « investi » se traçait sur les avis d'opéré, qui n'existent pas ;
 *   — la plus-value affichée est donc uniquement LATENTE (cours − PRU). La part
 *     réalisée supposait l'historique des ventes.
 *
 * Un compte AGRÉGÉ, lui, a une source : sa banque. Il porte donc en plus la
 * courbe de son solde et son relevé (`BankMovements`), ce qu'un actif saisi à la
 * main ne peut pas avoir.
 */

import React from "react";
import {
  ArrowLeftRight, Banknote, Check, CreditCard, FileText, Landmark, Pencil,
  Percent, Plus, Receipt, Repeat, Trash2, X,
} from "lucide-react";
import { T } from "@/lib/ui/tokens";
import { t, useLang } from "@/lib/i18n";
import {
  BackLink, CARD, HeroAmount, MiniKpi, PeriodPills, PnlChart, SectionAction, SectionTitle,
} from "@/components/ui/da";
import AssetAvatar from "@/components/ui/AssetAvatar";
import {
  bankAccountToAsset, bankAssetUid, isBankAsset, useBankAccounts,
} from "@/lib/bank/useBankAccounts";
import { useBankTransactions } from "@/lib/bank/useBankTransactions";
import {
  balanceSeries, groupByDay, kindLabelKey, parseDay, periodStats, withinDays,
} from "@/lib/bank/transactions";
import { ConfirmModal } from "@/components/modals/AccountModals";
import { AssetFormModal } from "@/components/modals/PatrimoineModals";
import { fmt } from "@/lib/ui/format";
import { getCurrencySymbol } from "@/lib/userPrefs";
import {
  assetGain,
  assetTypeKey,
  assetValue,
  dayKey,
  holdingCost,
  holdingGain,
  holdingGainPct,
  holdingValue,
  isPortfolio,
  newAssetId,
  styleOfType,
  usePatrimoine,
} from "@/lib/patrimoine";

const FIELD = {
  height: 38,
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

const EMPTY_LINE = { name: "", isin: "", quantity: "", avgPrice: "", price: "" };

function formatUpdatedAt(iso) {
  if (!iso) return null;
  try {
    return new Intl.DateTimeFormat(undefined, { day: "2-digit", month: "short", year: "numeric" }).format(new Date(iso));
  } catch {
    return null;
  }
}

const num = (v) => {
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

export default function PatrimoineAssetPage({ assetId, setPage, setSelectedHolding }) {
  useLang();
  const [store, setStore] = usePatrimoine();
  const [line, setLine] = React.useState(EMPTY_LINE);
  const [editingLineId, setEditingLineId] = React.useState(null);
  const [confirmingId, setConfirmingId] = React.useState(null);
  const [error, setError] = React.useState(null);
  // Modification et suppression de l'ACTIF lui-même (les états ci-dessus
  // portent ses LIGNES).
  const [editingAsset, setEditingAsset] = React.useState(false);
  const [confirmingAsset, setConfirmingAsset] = React.useState(false);

  /* L'actif peut venir du store (saisi à la main) ou d'une banque connectée :
     la synthèse mêle les deux et rend les deux cliquables. Ne chercher que dans
     le store affichait « actif introuvable » pour un compte bancaire. */
  const bank = useBankAccounts();
  const asset =
    (store.assets || []).find((a) => a.id === assetId) ||
    // L'horodatage de l'agrégation est porté par l'actif : depuis que les soldes
    // s'affichent d'abord depuis le cache, l'en-tête peut dire « maj … » comme
    // il le fait pour un actif saisi.
    bank.accounts.map((a) => bankAccountToAsset(a, bank.updatedAt)).find((a) => a.id === assetId) ||
    null;
  // Un actif agrégé n'existe pas dans le store : son solde est relu à chaque
  // visite, il n'y a rien à modifier ni à supprimer ici.
  const aggregated = !!asset && isBankAsset(asset);

  const removeAsset = () => {
    setConfirmingAsset(false);
    setStore((s) => ({ ...s, assets: (s.assets || []).filter((a) => a.id !== assetId) }));
    setPage?.("patrimoine");
  };

  const back = (
    <div style={{ marginLeft: -8 }}>
      <BackLink label={t("patrimoine.title")} onClick={() => setPage?.("patrimoine")} />
    </div>
  );

  if (!asset) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16, paddingTop: 14, fontFamily: "var(--font-sans)" }} className="anim-1">
        {back}
        <section style={{ ...CARD, padding: "40px 24px", textAlign: "center", fontSize: 14, color: T.textSub }}>
          {t("patrimoine.asset.notFound")}
        </section>
      </div>
    );
  }

  const holdings = Array.isArray(asset.holdings) ? asset.holdings : [];
  const value = assetValue(asset);
  const gain = assetGain(asset);
  const portfolio = isPortfolio(asset.type);
  const updated = formatUpdatedAt(asset.updatedAt);

  const totalCost = holdings
    .map(holdingCost)
    .filter((c) => c !== null)
    .reduce((s, c) => s + c, 0);
  const gainPct = gain !== null && totalCost > 0 ? (gain / totalCost) * 100 : null;

  const patchAsset = (fn) =>
    setStore((s) => ({
      ...s,
      assets: (s.assets || []).map((a) => (a.id === asset.id ? fn(a) : a)),
    }));

  const resetLine = () => {
    setLine(EMPTY_LINE);
    setEditingLineId(null);
    setError(null);
  };

  const submitLine = (e) => {
    e.preventDefault();
    const name = line.name.trim();
    if (!name) return setError(t("patrimoine.asset.errLineName"));
    const quantity = num(line.quantity);
    if (quantity === null || quantity <= 0) return setError(t("patrimoine.asset.errQuantity"));
    setError(null);

    const next = {
      name,
      isin: line.isin.trim().toUpperCase() || null,
      quantity,
      avgPrice: line.avgPrice === "" ? null : num(line.avgPrice),
      price: line.price === "" ? null : num(line.price),
    };

    patchAsset((a) => {
      const list = Array.isArray(a.holdings) ? a.holdings : [];
      return {
        ...a,
        updatedAt: new Date().toISOString(),
        holdings: editingLineId === null
          ? [...list, { id: newAssetId(), ...next }]
          : list.map((h) => (h.id === editingLineId ? { ...h, ...next } : h)),
      };
    });
    resetLine();
  };

  const startEditLine = (h) => {
    setEditingLineId(h.id);
    setConfirmingId(null);
    setError(null);
    setLine({
      name: h.name,
      isin: h.isin || "",
      quantity: String(h.quantity ?? ""),
      avgPrice: h.avgPrice === null || h.avgPrice === undefined ? "" : String(h.avgPrice),
      price: h.price === null || h.price === undefined ? "" : String(h.price),
    });
  };

  const removeLine = (id) => {
    setConfirmingId(null);
    if (editingLineId === id) resetLine();
    patchAsset((a) => ({
      ...a,
      updatedAt: new Date().toISOString(),
      holdings: (a.holdings || []).filter((h) => h.id !== id),
    }));
  };

  const openHolding = (h) => {
    setSelectedHolding?.({ assetId: asset.id, holdingId: h.id });
    setPage?.("patrimoine-holding");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28, paddingTop: 14, fontFamily: "var(--font-sans)" }} className="anim-1">
      {back}

      {/* En-tête */}
      <header style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {/* Le logo de l'établissement quand on l'a — la fiche s'ouvre alors
                sur ce qu'on reconnaît, pas sur deux lettres. */}
            <AssetAvatar asset={asset} size={36} />
            <div style={{ minWidth: 0 }}>
              <h1 style={{ margin: 0, fontSize: 20, fontWeight: 500, color: T.text }}>{asset.name}</h1>
              <div style={{ fontSize: 13, color: T.textSub }}>
                {t(assetTypeKey(asset.type))}
                {asset.institution ? ` · ${asset.institution}` : ""}
                {updated ? ` · ${t("patrimoine.updatedAt").replace("{date}", updated)}` : ""}
              </div>
            </div>
          </div>

          <HeroAmount value={value} size={32} />

          {gain !== null && gain !== 0 && (
            <div style={{ display: "flex", alignItems: "baseline", gap: 6, fontSize: 14 }}>
              <span style={{ fontWeight: 600, color: gain >= 0 ? T.pnlPos : T.pnlNeg, fontVariantNumeric: "tabular-nums" }}>
                {fmt(gain, true)}
                {gainPct !== null ? ` (${gainPct >= 0 ? "+" : ""}${gainPct.toFixed(2)} %)` : ""}
              </span>
              <span style={{ fontSize: 12, color: T.textSub }}>{t("patrimoine.asset.unrealized")}</span>
            </div>
          )}
        </div>

        {/* Modifier et supprimer l'actif se faisaient depuis la page « Actifs »,
            qui portait la liste et son formulaire. Elle n'existe plus : les deux
            actions vivent ici, sur la fiche de l'actif concerné — sauf pour un
            compte agrégé, qui appartient à la banque. */}
        <div style={{ display: aggregated ? "none" : "inline-flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => setEditingAsset(true)}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6, minHeight: 36,
              padding: "0 14px", borderRadius: 999, border: "none",
              background: T.accentBg, color: T.text, fontSize: 13, fontWeight: 500,
              cursor: "pointer", fontFamily: "inherit",
            }}
          >
            <Pencil size={14} strokeWidth={1.75} /> {t("common.edit")}
          </button>
          <button
            type="button"
            onClick={() => setConfirmingAsset(true)}
            aria-label={t("patrimoine.assets.deleteAria").replace("{name}", asset.name || "")}
            title={t("common.delete")}
            style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              width: 36, height: 36, borderRadius: 999, border: "none",
              background: "transparent", color: T.textMut, cursor: "pointer", fontFamily: "inherit",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = T.redBg; e.currentTarget.style.color = T.red; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = T.textMut; }}
          >
            <Trash2 size={15} strokeWidth={1.75} />
          </button>
        </div>
      </header>

      {/* Relevé du compte — seulement pour un compte agrégé : c'est la banque
          qui le fournit, un actif saisi à la main n'a aucun mouvement à montrer. */}
      {aggregated && <BankMovements asset={asset} />}

      {/* Positions — seulement pour les types qui en portent. Un livret ou un
          bien immobilier n'a pas de lignes : y proposer un formulaire de titres
          n'aurait aucun sens. */}
      {portfolio && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <SectionTitle size="sm">{t("patrimoine.asset.positions")}</SectionTitle>

          <div style={{ fontSize: 13, color: T.textSub, maxWidth: 620 }}>
            {t("patrimoine.asset.positionsHint")}
          </div>

          <section style={{ ...CARD, padding: 0 }}>
            {holdings.length === 0 ? (
              <div style={{ padding: "32px 24px", textAlign: "center", fontSize: 14, color: T.textSub }}>
                {t("patrimoine.asset.noPositions")}
              </div>
            ) : (
              <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {holdings.map((h, i) => {
                  const hGain = holdingGain(h);
                  const hPct = holdingGainPct(h);
                  const confirming = confirmingId === h.id;
                  return (
                    <li
                      key={h.id}
                      style={{
                        display: "flex", alignItems: "center", gap: 12,
                        padding: "12px 20px",
                        borderTop: i === 0 ? "none" : `1px solid ${T.border}`,
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => openHolding(h)}
                        style={{
                          flex: 1, minWidth: 0, textAlign: "left", border: "none",
                          background: "transparent", cursor: "pointer", fontFamily: "inherit", padding: 0,
                        }}
                      >
                        <span style={{ display: "block", fontSize: 14, fontWeight: 500, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {h.name}
                        </span>
                        <span style={{ display: "block", fontSize: 12, color: T.textSub, fontVariantNumeric: "tabular-nums" }}>
                          {h.quantity} × {h.price === null ? "—" : fmt(h.price)}
                          {h.avgPrice !== null && h.avgPrice !== undefined
                            ? ` · ${t("patrimoine.asset.pru")} ${fmt(h.avgPrice)}`
                            : ""}
                        </span>
                      </button>

                      <span style={{ flexShrink: 0, textAlign: "right" }}>
                        <span style={{ display: "block", fontSize: 14, fontWeight: 600, color: T.text, fontVariantNumeric: "tabular-nums" }}>
                          {fmt(holdingValue(h))}
                        </span>
                        {hGain !== null && (
                          <span style={{
                            display: "block", fontSize: 12, fontWeight: 500,
                            fontVariantNumeric: "tabular-nums",
                            color: hGain >= 0 ? T.pnlPos : T.pnlNeg,
                          }}>
                            {fmt(hGain, true)}
                            {hPct !== null ? ` (${hPct >= 0 ? "+" : ""}${hPct.toFixed(2)} %)` : ""}
                          </span>
                        )}
                      </span>

                      {confirming ? (
                        <span style={{ display: "inline-flex", gap: 2, flexShrink: 0 }}>
                          <IconButton danger label={t("patrimoine.asset.confirmDeleteLine")} onClick={() => removeLine(h.id)} onBlur={() => setConfirmingId(null)}>
                            <Check size={15} strokeWidth={2} />
                          </IconButton>
                          <IconButton label={t("common.cancel")} onClick={() => setConfirmingId(null)}>
                            <X size={15} strokeWidth={2} />
                          </IconButton>
                        </span>
                      ) : (
                        <span style={{ display: "inline-flex", gap: 2, flexShrink: 0 }}>
                          <IconButton label={t("patrimoine.asset.editLine").replace("{name}", h.name)} onClick={() => startEditLine(h)}>
                            <Pencil size={15} strokeWidth={1.75} />
                          </IconButton>
                          <IconButton danger label={t("patrimoine.asset.deleteLine").replace("{name}", h.name)} onClick={() => setConfirmingId(h.id)}>
                            <Trash2 size={15} strokeWidth={1.75} />
                          </IconButton>
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Ajout / édition d'une ligne */}
          <form onSubmit={submitLine} style={{ ...CARD, padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
              <LineField label={t("patrimoine.asset.lineName")} id="ph-name">
                <input id="ph-name" type="text" value={line.name} onChange={(e) => setLine({ ...line, name: e.target.value })} placeholder="Amundi MSCI World" style={FIELD} />
              </LineField>
              <LineField label="ISIN" id="ph-isin">
                <input id="ph-isin" type="text" value={line.isin} onChange={(e) => setLine({ ...line, isin: e.target.value })} placeholder="LU1681043599" style={{ ...FIELD, textTransform: "uppercase" }} />
              </LineField>
              <LineField label={t("patrimoine.asset.lineQuantity")} id="ph-qty">
                <input id="ph-qty" type="number" inputMode="decimal" min={0} step="any" value={line.quantity} onChange={(e) => setLine({ ...line, quantity: e.target.value })} placeholder="12" style={FIELD} />
              </LineField>
              <LineField label={`${t("patrimoine.asset.pru")} (${getCurrencySymbol()})`} id="ph-avg">
                <input id="ph-avg" type="number" inputMode="decimal" min={0} step="any" value={line.avgPrice} onChange={(e) => setLine({ ...line, avgPrice: e.target.value })} placeholder="380" style={FIELD} />
              </LineField>
              <LineField label={`${t("patrimoine.asset.lastPrice")} (${getCurrencySymbol()})`} id="ph-price">
                <input id="ph-price" type="number" inputMode="decimal" min={0} step="any" value={line.price} onChange={(e) => setLine({ ...line, price: e.target.value })} placeholder="412" style={FIELD} />
              </LineField>
            </div>

            {error && <div role="alert" style={{ fontSize: 13, color: T.pnlNeg }}>{error}</div>}

            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button
                type="submit"
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6, minHeight: 38,
                  padding: "0 14px", borderRadius: 999, border: "none",
                  background: T.accentBg, color: T.text, fontSize: 14, fontWeight: 500,
                  cursor: "pointer", fontFamily: "inherit",
                }}
              >
                {editingLineId ? <Check size={15} strokeWidth={1.75} /> : <Plus size={15} strokeWidth={1.75} />}
                {editingLineId ? t("common.save") : t("patrimoine.asset.addLine")}
              </button>
              {editingLineId && (
                <button
                  type="button"
                  onClick={resetLine}
                  style={{
                    minHeight: 38, padding: "0 12px", borderRadius: 999, border: "none",
                    background: "transparent", color: T.textSub, fontSize: 14, fontWeight: 500,
                    cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  {t("common.cancel")}
                </button>
              )}
            </div>
          </form>
        </div>
      )}

      {editingAsset && (
        <AssetFormModal asset={asset} onClose={() => setEditingAsset(false)} />
      )}

      {confirmingAsset && (
        <ConfirmModal
          title={t("patrimoine.assets.deleteTitle")}
          message={t("patrimoine.assets.deleteSub")}
          confirmLabel={t("common.delete")}
          onConfirm={removeAsset}
          onClose={() => setConfirmingAsset(false)}
        />
      )}
    </div>
  );
}

/* ── Relevé d'un compte agrégé ─────────────────────────────────────────────
   Fenêtres proposées. Elles ne redemandent RIEN à la banque : la requête
   couvre déjà 90 jours (`TRANSACTIONS_WINDOW_DAYS`), les pastilles ne font que
   recadrer ce qui est là — changer de période reste donc instantané.
   ------------------------------------------------------------------------ */
const MOVEMENT_PERIODS = [
  { id: "1S", days: 7 },
  { id: "1M", days: 30 },
  { id: "3M", days: 90 },
];

/** Une icône par nature de mouvement : à l'œil, un relevé se parcourt par
 *  colonne d'icônes bien avant de se lire ligne à ligne. */
const KIND_ICONS = {
  card: CreditCard,
  transfer: ArrowLeftRight,
  direct_debit: Repeat,
  withdrawal: Banknote,
  check: FileText,
  fee: Receipt,
  interest: Percent,
  other: Landmark,
};

/** « mer. 13 août » — l'année n'apparaît que si le jour n'est pas de cette année. */
function formatDay(iso) {
  if (!iso) return "";
  const d = parseDay(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  try {
    return new Intl.DateTimeFormat(undefined, {
      weekday: "short",
      day: "numeric",
      month: "short",
      ...(sameYear ? null : { year: "numeric" }),
    }).format(d);
  } catch {
    return iso;
  }
}

/** Nombre de mouvements montrés avant dépliage. */
const MOVEMENTS_FOLDED = 12;

/**
 * Courbe du solde et relevé d'un compte bancaire agrégé.
 *
 * La courbe est RECONSTRUITE à rebours depuis le solde courant (cf.
 * `balanceSeries`) : la banque ne rend pas l'historique de ses soldes, seulement
 * le solde du jour et les opérations. Elle est donc exacte aux opérations
 * récupérées près — ce qui est le cas sur la fenêtre demandée.
 */
function BankMovements({ asset }) {
  const uid = bankAssetUid(asset);
  const { transactions, windowDays, loading, error } = useBankTransactions(uid);
  const [period, setPeriod] = React.useState("3M");
  const [expanded, setExpanded] = React.useState(false);

  const days = MOVEMENT_PERIODS.find((p) => p.id === period)?.days ?? 90;
  const balance = assetValue(asset);

  const shown = React.useMemo(() => withinDays(transactions, days), [transactions, days]);
  const points = React.useMemo(
    () => balanceSeries(shown, balance, dayKey()),
    [shown, balance],
  );
  const stats = React.useMemo(() => periodStats(shown), [shown]);
  const groups = React.useMemo(
    () => groupByDay(expanded ? shown : shown.slice(0, MOVEMENTS_FOLDED)),
    [shown, expanded],
  );

  const color = styleOfType(asset.type).color;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <SectionTitle
        size="sm"
        action={<PeriodPills value={period} onChange={setPeriod} options={MOVEMENT_PERIODS} />}
      >
        {t("patrimoine.asset.movements")}
      </SectionTitle>

      {/* Un compte agrégé sans relevé n'est pas une anomalie : toutes les
          banques n'ouvrent pas l'accès aux opérations, et un consentement expiré
          se manifeste d'abord ici. On le dit, plutôt que de laisser un vide. */}
      {error && (
        <div role="alert" style={{ ...CARD, padding: 16, fontSize: 13, color: T.pnlNeg }}>
          {t("patrimoine.asset.movementsError")} {error}
        </div>
      )}

      {loading ? (
        <div style={{ ...CARD, padding: "32px 24px", textAlign: "center", fontSize: 14, color: T.textSub }}>
          {t("patrimoine.asset.movementsLoading")}
        </div>
      ) : shown.length === 0 ? (
        !error && (
          <div style={{ ...CARD, padding: "32px 24px", textAlign: "center", fontSize: 14, color: T.textSub }}>
            {t("patrimoine.asset.movementsEmpty")}
          </div>
        )
      ) : (
        <>
          {/* Entrées, sorties, solde de la période : les trois chiffres que la
              courbe ne donne pas d'un coup d'œil. */}
          <div style={{ display: "flex", alignItems: "center", gap: 28, flexWrap: "wrap" }}>
            <MiniKpi label={t("patrimoine.asset.movementsIn")} value={fmt(stats.in, false)} tone={stats.in > 0 ? "pos" : undefined} />
            <MiniKpi label={t("patrimoine.asset.movementsOut")} value={fmt(stats.out, false)} tone={stats.out < 0 ? "neg" : undefined} />
            <MiniKpi
              label={t("patrimoine.asset.movementsNet")}
              value={fmt(stats.net, true)}
              tone={stats.net > 0 ? "pos" : stats.net < 0 ? "neg" : undefined}
            />
            <MiniKpi label={t("patrimoine.asset.movementsCount")} value={String(shown.length)} />
          </div>

          <PnlChart points={points} color={color} />

          <div style={{ fontSize: 12, color: T.textMut }}>
            {t("patrimoine.asset.curveHint").replace("{days}", String(windowDays))}
          </div>

          {/* Le relevé, groupé par jour comme celui de la banque : la date est
              portée une fois par groupe, pas répétée sur chaque ligne. */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {groups.map((g) => (
              <section key={g.date} data-card style={{ ...CARD, padding: 0 }}>
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  gap: 12, padding: "10px 20px", borderBottom: `1px solid ${T.border}`,
                }}>
                  <span style={{ fontSize: 12, fontWeight: 500, color: T.textSub }}>{formatDay(g.date)}</span>
                  <span style={{ fontSize: 12, color: T.textMut, fontVariantNumeric: "tabular-nums" }}>
                    {fmt(periodStats(g.items).net, true)}
                  </span>
                </div>
                <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                  {g.items.map((tx, i) => (
                    <MovementRow key={tx.id} tx={tx} first={i === 0} />
                  ))}
                </ul>
              </section>
            ))}
          </div>

          {shown.length > MOVEMENTS_FOLDED && (
            <div style={{ display: "flex", justifyContent: "center" }}>
              <SectionAction onClick={() => setExpanded((v) => !v)}>
                {expanded
                  ? t("patrimoine.asset.movementsLess")
                  : t("patrimoine.asset.movementsMore").replace("{n}", String(shown.length - MOVEMENTS_FOLDED))}
              </SectionAction>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Une ligne de relevé : nature, libellé, et le montant signé à droite. */
function MovementRow({ tx, first }) {
  const Icon = KIND_ICONS[tx.kind] || KIND_ICONS.other;
  const credit = tx.amount >= 0;
  // La nature reste en sous-ligne avec le complément : deux informations de même
  // rang, sous le libellé qui les porte.
  const sub = [t(kindLabelKey(tx.kind)), tx.detail].filter(Boolean).join(" · ");

  return (
    <li style={{
      display: "flex", alignItems: "center", gap: 12, padding: "12px 20px",
      borderTop: first ? "none" : `1px solid ${T.border}`,
    }}>
      <span aria-hidden="true" style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 32, height: 32, flexShrink: 0, borderRadius: 999,
        background: T.accentBg, color: T.textSub,
      }}>
        <Icon size={15} strokeWidth={1.75} />
      </span>

      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 14, fontWeight: 500, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {tx.label || t(kindLabelKey(tx.kind))}
        </span>
        <span style={{ display: "block", fontSize: 12, color: T.textSub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {sub}
        </span>
      </span>

      {/* Une opération en attente n'est pas encore dans le solde de la banque —
          et n'est donc pas non plus dans la courbe. Le dire ici évite de
          chercher pourquoi les deux ne se répondent pas. */}
      {tx.pending && (
        <span style={{
          flexShrink: 0, fontSize: 11, fontWeight: 500, color: T.amber,
          background: T.amberBg, borderRadius: 999, padding: "2px 8px",
        }}>
          {t("patrimoine.asset.movementPending")}
        </span>
      )}

      <span style={{
        flexShrink: 0, fontSize: 14, fontWeight: 600, fontVariantNumeric: "tabular-nums",
        color: credit ? T.pnlPos : T.text,
      }}>
        {fmt(tx.amount, true)}
      </span>
    </li>
  );
}

function LineField({ label, id, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5, minWidth: 0 }}>
      <label htmlFor={id} style={{ fontSize: 12, color: T.textSub }}>{label}</label>
      {children}
    </div>
  );
}

function IconButton({ children, label, onClick, onBlur, danger }) {
  const rest = danger ? T.textMut : T.textSub;
  return (
    <button
      type="button"
      onClick={onClick}
      onBlur={onBlur}
      aria-label={label}
      title={label}
      style={{
        width: 36, height: 36, borderRadius: 999, border: "none",
        background: "transparent", color: rest, cursor: "pointer",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        transition: "background 120ms ease, color 120ms ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = danger ? T.redBg : T.accentBg;
        e.currentTarget.style.color = danger ? T.red : T.text;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.color = rest;
      }}
    >
      {children}
    </button>
  );
}
