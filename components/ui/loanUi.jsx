"use client";

/**
 * Bribes d'affichage d'un crédit, partagées par le formulaire de saisie, la page
 * « Crédits & passifs » et la fiche d'un crédit.
 *
 * Elles vivent à part parce que ces surfaces doivent dire la MÊME chose : la
 * modale annonce ce qui manque pour projeter, la page le redemande au même
 * endroit et dans les mêmes termes. Deux formulations divergentes pour la même
 * condition absente, et l'utilisateur cherche un champ qui ne s'appelle pas
 * pareil selon l'écran.
 *
 * Depuis que le crédit a sa fiche, ce module porte aussi les blocs de fond —
 * échéancier, simulateur, tuiles — que la liste et la fiche se partagent : ils
 * étaient écrits dans la page « Crédits & passifs », la fiche les aurait
 * recopiés, et deux échéanciers indépendants finissent toujours par ne plus
 * calculer pareil.
 *
 * Le calcul, lui, reste dans `lib/loans` : ici il n'y a que de la mise en mots.
 */

import React from "react";
import { Check, Pencil, RefreshCw, X } from "lucide-react";
import { T } from "@/lib/ui/tokens";
import { FIELD } from "@/components/ui/form";
import { FIELD_BG } from "@/lib/ui/tokens";
import { dotRing } from "@/lib/ui/color";
import { t } from "@/lib/i18n";
import { TH } from "@/components/ui/da";
import { fmt, fmtDay, fmtMonthYear } from "@/lib/ui/format";
import { getCurrencySymbol } from "@/lib/userPrefs";
import { loanStats, simulatePrepayment } from "@/lib/loans";
import { assetTypeKey, classBySlug } from "@/lib/patrimoine";

/** Libellé du champ qui manque — les mêmes mots que l'étiquette du formulaire. */
const GAP_KEYS = {
  rate: "patrimoine.loan.fieldRate",
  payment: "patrimoine.loan.fieldPayment",
  startDate: "patrimoine.loan.fieldStart",
  principal: "patrimoine.loan.fieldPrincipal",
};

/** « le taux annuel, la mensualité et la 1ʳᵉ échéance » — énumération lisible,
 *  la conjonction venant de la langue active et non d'un « , » à la fin. */
function joinFields(gaps) {
  const labels = (gaps || []).filter((g) => GAP_KEYS[g]).map((g) => t(GAP_KEYS[g]).toLowerCase());
  if (labels.length === 0) return "";
  if (labels.length === 1) return labels[0];
  return `${labels.slice(0, -1).join(", ")} ${t("patrimoine.loan.and")} ${labels[labels.length - 1]}`;
}

/** Phrase d'invite : ce qu'il faut saisir pour débloquer l'échéancier. */
export function loanGapsSentence(gaps) {
  const fields = joinFields(gaps);
  if (!fields) return "";
  return t("patrimoine.loan.gapsSentence").replace("{fields}", fields);
}

/** Durée en clair : « 19 ans et 8 mois » plutôt que « 236 mois ». */
export function durationLabel(months) {
  if (!Number.isFinite(months) || months <= 0) return "—";
  const y = Math.floor(months / 12);
  const m = Math.round(months % 12);
  if (y === 0) return t("patrimoine.loan.nMonths").replace("{n}", String(m));
  if (m === 0) return t("patrimoine.loan.nYears").replace("{n}", String(y));
  return t("patrimoine.loan.nYearsMonths").replace("{y}", String(y)).replace("{m}", String(m));
}

/**
 * Barre de progression d'un remboursement.
 *
 * `role="img"` avec son libellé : la barre porte une information (la part déjà
 * remboursée) qu'aucun texte voisin ne répète, elle ne peut donc pas être
 * décorative. Bornée à [0, 100] — un restant dû saisi au-dessus du capital
 * emprunté ferait sinon déborder le remplissage hors de la piste.
 */
export function LoanBar({ pct, color, ariaLabel, height = 8 }) {
  const safe = Number.isFinite(pct) ? Math.min(100, Math.max(0, pct)) : 0;
  return (
    <div
      role="img"
      aria-label={ariaLabel}
      style={{ height, width: "100%", borderRadius: 999, overflow: "hidden", background: T.accentBg }}
    >
      <div
        style={{
          width: `${safe}%`,
          height: "100%",
          background: color || T.text,
          boxShadow: color ? dotRing(color) : "none",
          borderRadius: 999,
          transition: "width 240ms var(--ease-out, ease)",
        }}
      />
    </div>
  );
}

/* ── Briques communes à la liste et à la fiche ─────────────────────────── */

/** Nombre saisi, `null` si vide ou illisible (virgule décimale acceptée). */
export const loanNum = (v) => {
  const s = String(v ?? "").trim().replace(",", ".");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

/* Champ d'un crédit : l'aplat commun (components/ui/form.jsx), en hauteur fixe
   pour s'aligner sur les boutons de la barre de simulation. */
export const LOAN_FIELD = {
  ...FIELD,
  height: 36,
  padding: "0 14px",
  fontSize: 14,
};

/** Mesure d'un crédit : son nom au-dessus, le chiffre en dessous. `tone="neg"`
 *  pour ce qui sort (intérêts, charge mensuelle). */
export function LoanTile({ label, value, tone, hint }) {
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
      {hint && <div style={{ marginTop: 1, fontSize: 11, color: T.textMut }}>{hint}</div>}
    </div>
  );
}

/**
 * Identité d'un crédit : son nom, et dessous ce qui le caractérise en trois mots
 * — établissement, taux, durée restante.
 *
 * Rendue en `<span>` et non en bloc : la liste l'enferme dans un bouton qui ouvre
 * la fiche, et un `<div>` dans un `<button>` n'est pas du HTML valable.
 */
export function LoanIdentity({ asset, stats }) {
  return (
    <span style={{ display: "block", minWidth: 0 }}>
      <span style={{ display: "block", fontSize: 14, fontWeight: 500, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {asset.name}
      </span>
      <span style={{ display: "block", fontSize: 12, color: T.textSub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {asset.institution || t(assetTypeKey(asset.type))}
        {stats.rate !== null ? ` · ${stats.rate.toLocaleString(undefined, { maximumFractionDigits: 2 })} %` : ""}
        {stats.monthsLeft !== null ? ` · ${durationLabel(stats.monthsLeft)}` : ""}
      </span>
    </span>
  );
}

/**
 * Le montant d'un crédit, aligné à droite : le restant dû, et sous lui ce qu'il
 * coûte chaque mois.
 *
 * En POSITIF — « 150 000 € restant dû » se lit mieux que « −150 000 € ». Le rouge
 * porte le signe à sa place, et le signe lui-même réapparaît là où il compte : le
 * patrimoine net.
 */
export function LoanAmount({ stats, size = 15 }) {
  return (
    <span style={{ flexShrink: 0, textAlign: "right" }}>
      <span style={{ display: "block", fontSize: size, fontWeight: 600, color: T.pnlNeg, fontVariantNumeric: "tabular-nums" }}>
        {fmt(stats.outstanding)}
      </span>
      {stats.monthlyCharge !== null && (
        <span style={{ display: "block", fontSize: 12, color: T.textSub, fontVariantNumeric: "tabular-nums" }}>
          {fmt(stats.monthlyCharge)} / {t("patrimoine.loan.perMonth")}
        </span>
      )}
    </span>
  );
}

/**
 * Progression du remboursement.
 *
 * Posée au-dessus du corps sur les deux surfaces : dans la liste elle reste
 * visible carte repliée, sur la fiche elle suit le montant héros. Rendue
 * seulement quand le capital emprunté est connu — sans lui, il n'y a pas de
 * « déjà remboursé » à montrer.
 */
export function LoanProgress({ stats }) {
  if (stats.progress === null) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
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
  );
}

/**
 * Corps d'un crédit : les échéances, les deux gestes qui les entretiennent, le
 * simulateur et l'échéancier.
 *
 * Source UNIQUE de la carte de la liste et de la fiche. Les deux surfaces
 * montrent la même chose du même crédit : les tenir séparément, c'était deux
 * échéanciers qui finissent par ne plus calculer pareil, et deux endroits à
 * corriger pour un chiffre faux. La liste l'enferme dans son panneau dépliant,
 * la fiche dans une carte — la différence s'arrête au cadre.
 *
 * L'échéancier n'en fait PAS partie : c'est une pièce de référence qu'on consulte
 * à côté du reste, pas une mesure qu'on lit dans la foulée. Chaque surface le pose
 * donc où elle veut — la fiche dans son propre bloc, la liste à la suite du corps
 * — avec `AmortTable`.
 *
 * `onPay` et `onSync` MODIFIENT le patrimoine : ils remontent à l'appelant, qui
 * tient le store.
 */
export function LoanBody({ terms, stats, aggregated, onEdit, onPay, onSync }) {
  // Un clic accidentel sur « échéance payée » modifierait le patrimoine : le
  // geste se confirme, comme la suppression d'une ligne de titres.
  const [confirmingPay, setConfirmingPay] = React.useState(false);
  const next = stats.schedule[0] || null;

  /* Un écart de plus d'un euro entre le restant dû saisi et celui du contrat
     signale une saisie qui n'a pas suivi les prélèvements. En dessous, c'est un
     arrondi : le signaler serait du bruit. */
  const drifted = stats.drift !== null && Math.abs(stats.drift) >= 1;

  return (
    <>
      {stats.complete ? (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(130px, 100%), 1fr))", gap: 12 }}>
            <LoanTile label={t("patrimoine.loan.nextDue")} value={next?.date ? fmtDay(next.date) : "—"} />
            <LoanTile label={t("patrimoine.loan.remaining")} value={durationLabel(stats.monthsLeft)} />
            <LoanTile label={t("patrimoine.loan.end")} value={fmtMonthYear(stats.endDate)} />
            <LoanTile label={t("patrimoine.loan.interestLeft")} value={fmt(stats.interestLeft ?? 0)} tone="neg" />
            <LoanTile label={t("patrimoine.loan.totalLeft")} value={stats.totalLeft === null ? "—" : fmt(stats.totalLeft)} />
          </div>

          {/* Ce que la prochaine échéance rembourse vraiment, et le geste qui
              l'enregistre. */}
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
                  <LoanBtn
                    tone="solid"
                    onClick={() => { setConfirmingPay(false); onPay?.(next); }}
                    icon={<Check size={14} strokeWidth={2} />}
                  >
                    {t("patrimoine.loan.confirmPay").replace("{amount}", fmt(next.principal))}
                  </LoanBtn>
                  <LoanBtn onClick={() => setConfirmingPay(false)} icon={<X size={14} strokeWidth={2} />}>
                    {t("common.cancel")}
                  </LoanBtn>
                </span>
              ) : (
                <LoanBtn onClick={() => setConfirmingPay(true)} icon={<Check size={14} strokeWidth={1.75} />}>
                  {t("patrimoine.loan.markPaid")}
                </LoanBtn>
              )}
            </div>
          )}

          {/* Recalage sur le contrat : proposé, jamais appliqué d'office — un
              remboursement anticipé rend le théorique faux, et c'est l'emprunteur
              qui sait lequel des deux chiffres dit vrai. */}
          {drifted && !aggregated && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", background: T.amberBg, border: `1px solid ${T.amberBd}`, borderRadius: 10, padding: "10px 12px" }}>
              <span style={{ fontSize: 13, color: T.text, flex: 1, minWidth: 220 }}>
                {t(stats.drift > 0 ? "patrimoine.loan.driftAhead" : "patrimoine.loan.driftBehind")
                  .replace("{theoretical}", fmt(stats.theoretical ?? 0))
                  .replace("{gap}", fmt(Math.abs(stats.drift)))}
              </span>
              <LoanBtn onClick={() => onSync?.(stats.theoretical)} icon={<RefreshCw size={14} strokeWidth={1.75} />}>
                {t("patrimoine.loan.syncOutstanding")}
              </LoanBtn>
            </div>
          )}

          <PrepaySimulator outstanding={stats.outstanding} terms={terms} stats={stats} />
        </>
      ) : (
        /* Crédit sans conditions : on dit ce qui manque et on ouvre le formulaire
           là où ça se saisit, plutôt qu'un tableau de tirets. */
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, color: T.textSub, flex: 1, minWidth: 240, lineHeight: 1.5 }}>
            {aggregated
              ? t("patrimoine.loan.aggregatedNotice")
              : loanGapsSentence(stats.gaps) || t("patrimoine.loan.noTerms")}
          </span>
          {!aggregated && (
            <LoanBtn tone="solid" onClick={onEdit} icon={<Pencil size={14} strokeWidth={1.75} />}>
              {t("patrimoine.loan.completeTerms")}
            </LoanBtn>
          )}
        </div>
      )}
    </>
  );
}

/** Bouton d'action d'un crédit : discret par défaut, plein quand il porte le
 *  geste principal (confirmer un paiement, compléter les conditions). */
export function LoanBtn({ children, onClick, icon, tone }) {
  const solid = tone === "solid";
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6, minHeight: 34,
        padding: "0 12px", borderRadius: 999, flexShrink: 0,
        /* Jamais de contour : le secondaire est un aplat, comme les champs
           qu'il accompagne. */
        border: "none",
        background: solid ? T.text : FIELD_BG,
        color: solid ? T.textInverted : T.text,
        fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit",
      }}
    >
      {icon}
      {children}
    </button>
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
export function PrepaySimulator({ outstanding, terms, stats }) {
  const [lump, setLump] = React.useState("");
  const [extra, setExtra] = React.useState("");
  const sym = getCurrencySymbol();
  // La couleur d'identité des passifs, celle des pastilles de la synthèse : le
  // scénario simulé se reconnaît comme « de la dette » sans légende.
  const color = classBySlug("passifs")?.color || T.pnlNeg;
  /* Les identifiants venaient de la date d'échéance : deux crédits prélevés le
     même jour partageaient alors les mêmes `id`, et cliquer une étiquette
     donnait le focus au champ de l'autre. */
  const uid = React.useId();

  const res = React.useMemo(
    () => simulatePrepayment(outstanding, terms, { lump: loanNum(lump), extraMonthly: loanNum(extra) }),
    [outstanding, terms, lump, extra],
  );

  /* Échéancier du scénario simulé, pour le second tracé. Recalculé ici plutôt
     que renvoyé par `simulatePrepayment` : celle-ci répond une comparaison, pas
     un jeu de points, et la majorité des appels n'a pas de courbe à dessiner. */
  const simRows = React.useMemo(() => {
    if (!res || res.clears) return [];
    return loanStats(res.newOutstanding, { ...terms, payment: (stats.payment ?? 0) + (loanNum(extra) ?? 0) }).schedule;
  }, [res, terms, stats.payment, extra]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{t("patrimoine.loan.simTitle")}</div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(170px, 100%), 1fr))", gap: 10 }}>
        <SimField label={`${t("patrimoine.loan.simLump")} (${sym})`} id={`${uid}-lump`}>
          <input
            id={`${uid}-lump`}
            type="number" inputMode="decimal" min={0} step="any"
            value={lump} onChange={(e) => setLump(e.target.value)} placeholder="10000" style={LOAN_FIELD}
          />
        </SimField>
        <SimField label={`${t("patrimoine.loan.simExtra")} (${sym})`} id={`${uid}-extra`}>
          <input
            id={`${uid}-extra`}
            type="number" inputMode="decimal" min={0} step="any"
            value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="150" style={LOAN_FIELD}
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
 *
 * Aucun filet, ni entre les lignes ni sous l'en-tête : douze rangées de chiffres
 * alignés sur la même grille se suivent déjà à l'œil, et un trait par échéance
 * faisait un damier là où on ne cherche qu'une colonne.
 *
 * `framed` porte le cadre autour du tableau. Il est là quand le tableau est posé
 * DANS un bloc qui porte déjà autre chose (la carte d'un crédit en liste), et
 * retiré quand le tableau EST le bloc — deux traits concentriques à 12 px d'écart
 * ne délimitent rien de plus qu'un seul.
 */
export function AmortTable({ rows, insurance, folded = 12, framed = true }) {
  const [all, setAll] = React.useState(false);
  if (!rows || rows.length === 0) return null;
  const shown = all ? rows : rows.slice(0, folded);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{t("patrimoine.loan.tableTitle")}</span>
        {rows.length > folded && (
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

      <div style={framed ? { overflowX: "auto", border: `1px solid ${T.border}`, borderRadius: 10 } : { overflowX: "auto" }}>
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
              <tr key={r.index}>
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
        fontSize: 14, fontWeight: 600, fontVariantNumeric: "tabular-nums",
        color: tone === "pos" ? T.pnlPos : T.text,
      }}>
        {value}
      </div>
    </div>
  );
}
