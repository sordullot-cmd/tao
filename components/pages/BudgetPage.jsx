"use client";

/**
 * Budget — le mois qui vient de passer, puis le plan qu'on se donne.
 *
 * La page tient deux choses, dans cet ordre, et l'ordre est le propos :
 *
 *   1. CE MOIS-CI, lu sur les relevés : le flux réel en diagramme, la
 *      répartition en anneau à côté, et les trois chiffres du mois posés en
 *      onglets sous le dessin — ce sont eux qui choisissent ce que l'anneau
 *      détaille. Un mois calendaire, pas une fenêtre glissante : un loyer tombe
 *      une fois par mois, et « les trente derniers jours » en attrape tantôt un,
 *      tantôt deux. La navigation se fait donc de mois en mois.
 *   2. LE BUDGET TYPE, saisi à la main : plusieurs plans nommés de répartition
 *      du revenu mensuel.
 *
 * Le réalisé AVANT le prévu, séparés par un filet : un plan discuté avant
 * d'avoir regardé le mois est un vœu. Et le mois seul ne dit pas ce qu'on
 * voulait — d'où les deux sur la même page, plutôt qu'un renvoi de l'une à
 * l'autre. La page Cashflow, elle, reste l'endroit où le mois se DÉPLIE
 * (opérations d'un poste, enseignes, relevé) ; ici il se résume.
 *
 * Sans banque connectée, le premier bloc dit qu'il n'a pas de matière et renvoie
 * là où ça se branche — des zéros se liraient comme « tu n'as rien dépensé ».
 * Le plan, lui, ne dépend d'aucun compte et reste utilisable.
 *
 * La persistance du plan n'a pas bougé (même store, mêmes clés) : un plan saisi
 * du temps où cette page vivait sous la page Cashflow se retrouve tel quel.
 *
 * Pour chaque plan : un revenu mensuel, puis des catégories qui ont chacune
 * l'un de DEUX modes (voir `pctOf` / `amountOf`) :
 *   — part en % du revenu (défaut) : le montant suit le revenu ;
 *   — montant figé : la somme ne bouge plus quand le revenu change, et c'est la
 *     part en % qui se recalcule.
 * Ce choix est MANUEL, ligne par ligne (le cadenas) : c'est l'utilisateur qui
 * sait quelles catégories correspondent à une dépense réelle. La page le dit de
 * trois façons, parce que l'effet ne se voit qu'au moment où le revenu change :
 * la colonne du cadenas est nommée, l'aide sous le tableau décrit l'état
 * courant, et le champ qui ne fait pas foi s'efface (voir `AmountInput`).
 * Le « Reste » non alloué se calcule tout seul ; au-delà de 100 %, la barre se
 * normalise sur le total pour rester lisible et le dépassement est annoncé.
 *
 * Persistance : `useCloudState` — localStorage immédiat, Supabase debouncé. Le
 * plan actif fait partie du même store : il suit donc l'utilisateur d'un
 * appareil à l'autre, comme le reste de ses préférences dans cette app.
 *
 * Le revenu du plan se SAISIT, alors même que le bloc du dessus connaît les
 * salaires réels du mois. C'est voulu : un plan se fait sur ce qu'on gagne
 * d'habitude, pas sur ce qui vient de tomber — un mois à treizième mois
 * gonflerait tout le plan sans qu'on l'ait demandé. Le chiffre encaissé est
 * juste au-dessus, à recopier si c'est bien celui qu'on veut.
 */

import React from "react";
import { Landmark, Lock, Plus, RotateCcw, Trash2, Unlock, X } from "lucide-react";
import { T } from "@/lib/ui/tokens";
import { t, useLang } from "@/lib/i18n";
import { AllocationChart, CARD, PeriodPills, SectionTitle, StepperPill } from "@/components/ui/da";
import SankeyGraph from "@/components/ui/SankeyGraph";
import { fmt } from "@/lib/ui/format";
import { getCurrencySymbol } from "@/lib/userPrefs";
import { useBreakpoint } from "@/lib/hooks/useBreakpoint";
import { useCloudState } from "@/lib/hooks/useCloudState";
import { useBankAccounts } from "@/lib/bank/useBankAccounts";
import { useBankTransactionsAll } from "@/lib/bank/useBankTransactions";
import { categoryLabelKey, spendingByCategory, subLabelKey } from "@/lib/bank/categories";
import { incomeBySource } from "@/lib/bank/cashflow";
import { buildCashflowGraph } from "@/lib/bank/cashflowGraph";
import { daysSince, monthWindow, parseDay, withinRange } from "@/lib/bank/transactions";
import { flowLabel } from "@/lib/ui/flowLabel";
import {
  BUDGET_CLOUD_KEY, BUDGET_STORAGE_KEY, amountOf, pctOf,
} from "@/lib/budgetPlans";

const DEFAULT_PLAN_ID = "budget-1";
const DEFAULT_INCOME = 2000;

/* Teintes des catégories ─────────────────────────────────────────────────────
   Ce sont des couleurs d'IDENTITÉ, comme les vignettes d'instruments de da.jsx :
   elles ne passent pas par les tokens et ne bougent pas en thème sombre — deux
   catégories voisines doivent rester distinguables, ce qu'une palette recalculée
   par thème ne garantit pas.

   Chacune reprend la TEINTE d'une couleur du site (bleu, ambre, cyan et violet
   des tokens sémantiques, vert de l'accent de marque, rouge, teal des tags
   « long », brun des tags « short », gris du texte secondaire) ; seule leur
   clarté est ajustée, pour trois raisons mesurées :

   • rester lisible sur les DEUX fonds : la clarté OKLCH tient dans [0.48, 0.67],
     l'intersection des bandes admises en thème clair et en thème sombre, et le
     contraste reste ≥ 3:1 (seuil des éléments graphiques) sur les deux surfaces.
     Trop clair, la couleur disparaît sur blanc ; trop sombre, elle s'éteint en
     thème sombre — la fenêtre est étroite ;
   • garder assez de CHROMA (≥ 0.1) pour ne pas « lire gris » ;
   • séparer les VOISINES : la palette alterne une teinte sombre et une claire,
     si bien que deux catégories côte à côte dans le graphique tranchent toujours
     par la clarté, et pas seulement par la teinte. C'est ce qui les tient en
     vision deutéranope, où rouge, vert et teal convergent (pire paire adjacente :
     ΔE 8.6 en deutan, 18.7 en vision normale).

   Ces valeurs ne sont pas estimées à l'œil : elles passent les six contrôles du
   validateur de palette catégorielle (bande de clarté, plancher de chroma,
   séparation CVD des paires adjacentes, plancher vision normale, contraste), en
   clair ET en sombre. Toute retouche doit être repassée au validateur.

   L'ordre compte : il est repris tel quel par `defaultItems`, et une catégorie
   ajoutée prend la suivante. Toute retouche doit donc conserver l'alternance
   clair/sombre.

   « Autres » est à part : c'est le slot fourre-tout, et la convention réserve le
   gris au non-catégorisé. Il est donc volontairement sous le plancher de chroma
   et ne compte pas dans la palette catégorielle. */
const PALETTE = [
  "#2C72C3", // logement     — bleu du site, sombre
  "#DF6C10", // alimentation — ambre, clair
  "#0F8FAD", // transport    — cyan, sombre
  "#9D7AEF", // abonnements  — violet, clair
  "#B92E74", // loisirs      — magenta, sombre
  "#3EA817", // épargne      — vert de l'accent de marque, clair
  "#C83131", // shopping     — rouge, sombre
  "#0E9A8A", // santé        — teal des tags « long », clair
  "#96590E", // frais        — brun des tags « short », sombre
  "#8B96A2", // autres       — gris neutre : le slot « non catégorisé »
];

/* Point de départ : la règle 50/30/20 adaptée. L'utilisateur ajuste ensuite —
   ces valeurs ne sont qu'une amorce, pas une recommandation. */
const defaultItems = () => [
  { id: "logement", label: t("budget.cat.housing"), pct: 30, color: PALETTE[0] },
  { id: "alimentation", label: t("budget.cat.food"), pct: 15, color: PALETTE[1] },
  { id: "transport", label: t("budget.cat.transport"), pct: 8, color: PALETTE[2] },
  { id: "abonnements", label: t("budget.cat.subscriptions"), pct: 5, color: PALETTE[3] },
  { id: "loisirs", label: t("budget.cat.leisure"), pct: 10, color: PALETTE[4] },
  { id: "epargne", label: t("budget.cat.savings"), pct: 20, color: PALETTE[5] },
];

/* Identifiant FIXE pour le plan initial : l'état de départ doit être le même
   d'un rendu à l'autre, sinon le premier plan changerait d'id à chaque montage
   et la persistance en créerait un nouveau. */
const defaultStore = () => ({
  plans: [{ id: DEFAULT_PLAN_ID, name: t("budget.defaultName"), income: DEFAULT_INCOME, items: defaultItems() }],
  activeId: DEFAULT_PLAN_ID,
});

/* `pctOf` / `amountOf` viennent de lib/budgetPlans.ts : la synthèse Patrimoine
   lit le même budget et doit le calculer exactement pareil.

   Rappel de leur règle — les deux lectures d'une catégorie, selon son mode.
   `fixed` ⇒ `amount` (en devise) est la source de vérité : la somme est liée à
   une dépense réelle, elle ne doit pas suivre les variations du revenu — c'est
   la part en % qui se recalcule. Sinon `pct` fait foi, comme au départ.
   Le pourcentage dérivé n'est PAS borné à 100 : un montant figé plus grand que
   le revenu doit apparaître comme un dépassement, pas être silencieusement
   ramené à la limite. */

const newId = () =>
  (typeof crypto !== "undefined" && crypto.randomUUID)
    ? crypto.randomUUID()
    : `plan-${Math.random().toString(36).slice(2)}`;

const FIELD = {
  height: 40,
  borderRadius: "var(--radius-field)",
  border: `1px solid ${T.border}`,
  background: T.white,
  color: T.text,
  fontSize: 14,
  fontFamily: "inherit",
  padding: "0 10px",
  minWidth: 0,
};

/* Largeurs des colonnes chiffrées : les lignes de catégorie, la ligne « Reste »
   et l'en-tête les partagent, sinon les trois se décalent les unes des autres. */
const COL_PCT = 80;     // champ « part » + son signe %
const COL_AMOUNT = 116; // champ « montant » + le symbole de devise
const COL_BTN = 36;     // cadenas, puis suppression

/** Bordure et fond d'un champ chiffré : effacés quand la valeur est dérivée. */
const fieldSkin = (solid) => ({
  border: `1px solid ${solid ? T.border : "transparent"}`,
  background: solid ? T.white : "transparent",
});

/** Pastille d'action discrète (Réinitialiser, Supprimer, Nouveau). */
function GhostButton({ icon, children, onClick, onBlur, danger, tone = "mute" }) {
  const base = danger ? T.red : tone === "ink" ? T.text : T.textSub;
  return (
    <button
      type="button"
      onClick={onClick}
      onBlur={onBlur}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6, minHeight: 36,
        padding: "0 12px", borderRadius: 999, border: "none",
        background: danger ? T.redBg : "transparent", color: base,
        fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit",
        whiteSpace: "nowrap", transition: "background 120ms ease, color 120ms ease",
      }}
      onMouseEnter={(e) => { if (!danger) { e.currentTarget.style.background = T.accentBg; e.currentTarget.style.color = T.text; } }}
      onMouseLeave={(e) => { if (!danger) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = base; } }}
    >
      {icon}
      {children}
    </button>
  );
}

export default function BudgetPage({ setPage }) {
  useLang();
  const [store, setStore] = useCloudState(BUDGET_STORAGE_KEY, BUDGET_CLOUD_KEY, defaultStore());
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  /* Id de l'élément qui vient d'être créé : son champ prend le focus au montage,
     texte sélectionné — on tape directement le nom voulu. */
  const focusItemId = React.useRef(null);
  const focusPlanId = React.useRef(null);

  /* Le store vient de localStorage ou du cloud : il peut être d'une version
     antérieure, ou tronqué. On repart du plan par défaut plutôt que de laisser
     un `undefined` traverser tout le rendu. */
  const plans = Array.isArray(store?.plans) && store.plans.length > 0 ? store.plans : defaultStore().plans;
  const plan = plans.find((p) => p.id === store?.activeId) || plans[0];
  const items = Array.isArray(plan.items) ? plan.items : [];

  const updateActive = (fn) =>
    setStore((s) => ({ ...s, plans: s.plans.map((p) => (p.id === plan.id ? fn(p) : p)) }));

  const selectPlan = (id) => {
    setConfirmDelete(false);
    setStore((s) => ({ ...s, activeId: id }));
  };

  const addPlan = () => {
    const id = newId();
    focusPlanId.current = id;
    setConfirmDelete(false);
    setStore((s) => ({
      plans: [...s.plans, { id, name: t("budget.newPlanName"), income: DEFAULT_INCOME, items: defaultItems() }],
      activeId: id,
    }));
  };

  const deletePlan = () => {
    setConfirmDelete(false);
    setStore((s) => {
      if (s.plans.length <= 1) return s;
      const next = s.plans.filter((p) => p.id !== plan.id);
      return { plans: next, activeId: next[0].id };
    });
  };

  const updateItem = (id, patch) =>
    updateActive((p) => ({ ...p, items: p.items.map((it) => (it.id === id ? { ...it, ...patch } : it)) }));

  /* Les deux champs chiffrés désignent le mode, en plus de la valeur : saisir un
     MONTANT, c'est dire « cette catégorie coûte cette somme » — elle se fige
     donc et ne suivra plus le revenu. Saisir une PART, c'est dire « cette
     catégorie prend cette fraction du revenu » — elle redevient
     proportionnelle. Le cadenas permet de basculer sans retaper la valeur. */
  const setItemAmount = (id, amount) =>
    updateItem(id, { fixed: true, amount: Math.max(0, amount) });

  const setItemPct = (id, pct) =>
    updateItem(id, { fixed: false, amount: null, pct: Math.min(100, Math.max(0, pct)) });

  const toggleFixed = (it) =>
    updateItem(it.id, it.fixed
      ? { fixed: false, amount: null, pct: Math.round(pctOf(it, plan.income) * 10) / 10 }
      : { fixed: true, amount: Math.round(amountOf(it, plan.income)) });

  const removeItem = (id) =>
    updateActive((p) => ({ ...p, items: p.items.filter((it) => it.id !== id) }));

  const addItem = () => {
    const id = newId();
    focusItemId.current = id;
    updateActive((p) => ({
      ...p,
      items: [...p.items, { id, label: t("budget.newCategory"), pct: 5, color: PALETTE[p.items.length % PALETTE.length] }],
    }));
  };

  /* Forme du graphique de répartition — « ring » par défaut. Rangée dans le
     store du budget, à côté du plan actif : c'est une préférence d'affichage de
     CETTE donnée, et la synthèse Patrimoine, qui lit le même store, reprend donc
     la forme choisie ici sans réglage de son côté. */
  const chartKind = store?.chartKind === "bar" ? "bar" : "ring";
  const setChartKind = (kind) => setStore((s) => ({ ...(s || {}), chartKind: kind }));

  const totalPct = items.reduce((s, it) => s + pctOf(it, plan.income), 0);
  const rest = plan.income * (1 - totalPct / 100);
  const over = totalPct > 100;
  const hasFixed = items.some((it) => it.fixed);
  // Au-delà de 100 %, la barre se normalise sur le total : elle reste pleine et
  // les proportions restent comparables entre elles.
  const barScale = Math.max(totalPct, 100);

  /* Parts du graphique : les catégories qui pèsent quelque chose, dans l'ordre
     de la liste — la couleur suit la catégorie, jamais son rang. */
  const chartParts = items.map((it) => ({
    id: it.id,
    label: it.label,
    color: it.color,
    pct: pctOf(it, plan.income),
    amount: amountOf(it, plan.income),
  }));
  const allocated = chartParts.reduce((s, p) => s + p.amount, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28, paddingTop: 14, fontFamily: "var(--font-sans)" }} className="anim-1">
      {/* ── 1. Le mois qui vient de passer ───────────────────────────────── */}
      <MonthlyFlow setPage={setPage} />

      {/* ── 2. Le plan ────────────────────────────────────────────────────────
          Séparé par un filet : ce qui suit ne vient plus de la banque, il se
          SAISIT. Sans cette rupture, un plan à 2 000 € se lirait comme un
          chiffre relevé sur le compte. */}
      <div style={{ display: "flex", flexDirection: "column", gap: 24, borderTop: `1px solid ${T.border}`, paddingTop: 28 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <SectionTitle
            action={
              <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                <GhostButton
                  icon={<RotateCcw size={14} strokeWidth={1.75} />}
                  onClick={() => updateActive((p) => ({ ...p, income: DEFAULT_INCOME, items: defaultItems() }))}
                >
                  {t("budget.reset")}
                </GhostButton>
                {/* La suppression demande confirmation SUR PLACE : un plan
                    entier disparaît, et il n'y a pas d'annulation. Le bouton
                    reprend sa forme dès qu'il perd le focus. */}
                {plans.length > 1 && (
                  confirmDelete ? (
                    <GhostButton
                      danger
                      icon={<Trash2 size={14} strokeWidth={1.75} />}
                      onClick={deletePlan}
                      onBlur={() => setConfirmDelete(false)}
                    >
                      {t("budget.confirmDelete")}
                    </GhostButton>
                  ) : (
                    <GhostButton icon={<Trash2 size={14} strokeWidth={1.75} />} onClick={() => setConfirmDelete(true)}>
                      {t("common.delete")}
                    </GhostButton>
                  )
                )}
              </div>
            }
          >
            {t("budget.title")}
          </SectionTitle>
          <div style={{ fontSize: 14, lineHeight: "18.6px", color: T.textSub, maxWidth: 620 }}>
            {t("budget.subtitle")}
          </div>
        </div>

        {/* Sélecteur de plans : le plan actif porte son nom en champ éditable
            plutôt qu'un bouton « renommer » — le nom se corrige là où il se lit.

            Le PREMIER plan est celui que reprend la synthèse Patrimoine. Rien ne
            le marque ici : la synthèse écrit le nom du plan qu'elle affiche, ce
            qui répond à la question au moment où elle se pose. */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          {plans.map((p) =>
            p.id === plan.id ? (
              <span
                key={p.id}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6, height: 36, padding: "0 14px",
                  borderRadius: 999, background: T.white, boxShadow: T.elevPill,
                }}
              >
                <input
                  ref={(el) => {
                    if (el && p.id === focusPlanId.current) {
                      focusPlanId.current = null;
                      el.focus();
                      el.select();
                    }
                  }}
                  value={p.name}
                  maxLength={30}
                  onChange={(e) => updateActive((pl) => ({ ...pl, name: e.target.value }))}
                  aria-label={t("budget.planNameAria")}
                  style={{
                    width: `${Math.max((p.name || "").length, 4) + 1}ch`,
                    border: "none", background: "transparent", padding: 0,
                    fontSize: 13, fontWeight: 500, color: T.text, fontFamily: "inherit",
                  }}
                />
              </span>
            ) : (
              <button
                key={p.id}
                type="button"
                onClick={() => selectPlan(p.id)}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  height: 36, padding: "0 14px", borderRadius: 999, border: "none",
                  background: "transparent", color: T.textSub, fontSize: 13, fontWeight: 500,
                  cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
                  transition: "background 120ms ease, color 120ms ease",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = T.accentBg; e.currentTarget.style.color = T.text; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = T.textSub; }}
              >
                {p.name}
              </button>
            )
          )}
          <GhostButton icon={<Plus size={14} strokeWidth={1.75} />} onClick={addPlan}>
            {t("budget.newPlan")}
          </GhostButton>
        </div>

        <section style={{ ...CARD, padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Revenu mensuel, et à sa droite le choix de la forme du graphique —
              anneau ou barre. Le sélecteur règle l'affichage, il ne fait pas
              partie du graphique : il est donc posé sur la ligne du libellé,
              pas au-dessus de la figure. Le choix vit dans le store du budget,
              donc il suit l'utilisateur d'un appareil à l'autre et la synthèse
              Patrimoine affiche la même forme. */}
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                {/* La hauteur du libellé est calée sur celle des pastilles pour
                    que les deux se lisent sur la même ligne. */}
                <span style={{ display: "flex", alignItems: "center", minHeight: 34, fontSize: 13, color: T.textSub }}>
                  {t("budget.income")}
                </span>
                {/* Sans cadre : c'est le chiffre de tête de la page, pas un champ
                    de formulaire parmi d'autres. */}
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  value={plan.income === 0 ? "" : plan.income}
                  placeholder="2000"
                  onChange={(e) => updateActive((p) => ({ ...p, income: Math.max(0, Number(e.target.value) || 0) }))}
                  style={{
                    ...FIELD, height: 40, width: 150, padding: 0,
                    fontSize: 26, fontWeight: 600, letterSpacing: -0.4,
                    border: "none", background: "transparent",
                  }}
                />
              </label>
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
              parts={chartParts}
              scale={barScale}
              ariaLabel={t("budget.barAria").replace("{pct}", String(Math.round(totalPct * 10) / 10))}
              centreLabel={t("budget.allocated")}
              centreValue={allocated}
              centreTone={over ? T.pnlNeg : undefined}
              formatValue={(v) => fmt(v)}
            />
          </div>

          {/* Catégories : nom, part en %, montant. Les deux champs chiffrés sont
              liés — modifier l'un recalcule l'autre. Celui qui fait foi dépend du
              mode de la ligne, indiqué par le cadenas. */}
          <div style={{ display: "flex", flexDirection: "column" }}>
            {/* En-tête : c'est ici que la colonne du cadenas prend un nom. Seule,
                l'icône ne dit pas ce qu'elle fige — et l'utilisateur ne va pas la
                chercher tant qu'il ne sait pas qu'elle existe. */}
            <div
              style={{
                display: "flex", alignItems: "center", gap: 10, paddingBottom: 6,
                fontSize: 12, color: T.textMut,
              }}
            >
              <span aria-hidden="true" style={{ width: 10, flexShrink: 0 }} />
              <span style={{ flex: 1 }}>{t("budget.colCategory")}</span>
              <span style={{ width: COL_PCT, textAlign: "right", flexShrink: 0 }}>{t("budget.colShare")}</span>
              <span style={{ width: COL_AMOUNT, textAlign: "right", flexShrink: 0 }}>{t("budget.colAmount")}</span>
              <span style={{ width: COL_BTN, textAlign: "center", flexShrink: 0 }}>{t("budget.colLock")}</span>
              <span aria-hidden="true" style={{ width: COL_BTN, flexShrink: 0 }} />
            </div>

            {items.map((it) => (
              <div
                key={it.id}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "6px 0", borderTop: `1px solid ${T.border}`,
                }}
              >
                <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: "50%", background: it.color, flexShrink: 0 }} />
                <input
                  ref={(el) => {
                    if (el && it.id === focusItemId.current) {
                      focusItemId.current = null;
                      el.focus();
                      el.select();
                    }
                  }}
                  value={it.label}
                  onChange={(e) => updateItem(it.id, { label: e.target.value })}
                  aria-label={t("budget.categoryNameAria")}
                  style={{
                    ...FIELD, flex: 1, border: "1px solid transparent", background: "transparent",
                    marginLeft: -10,
                  }}
                  onFocus={(e) => { e.currentTarget.style.background = T.bg; }}
                  onBlur={(e) => { e.currentTarget.style.background = "transparent"; }}
                />
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4, width: COL_PCT, flexShrink: 0 }}>
                  <PctInput
                    value={pctOf(it, plan.income)}
                    derived={it.fixed}
                    onValue={(v) => setItemPct(it.id, v)}
                    ariaLabel={t("budget.sharePctAria").replace("{name}", it.label)}
                  />
                  <span style={{ fontSize: 13, color: T.textSub }}>%</span>
                </span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4, width: COL_AMOUNT, flexShrink: 0 }}>
                  <AmountInput
                    value={amountOf(it, plan.income)}
                    exact={it.fixed}
                    disabled={!it.fixed && plan.income <= 0}
                    onValue={(v) => setItemAmount(it.id, v)}
                    ariaLabel={t("budget.shareAmountAria").replace("{name}", it.label)}
                  />
                  <span style={{ fontSize: 13, color: T.textSub }}>{getCurrencySymbol()}</span>
                </span>
                {/* Cadenas : bascule le mode sans retaper la valeur. Fermé = la
                    somme est figée et ne suivra pas le revenu. */}
                <button
                  type="button"
                  onClick={() => toggleFixed(it)}
                  aria-pressed={!!it.fixed}
                  title={t(it.fixed ? "budget.unfixAmount" : "budget.fixAmount").replace("{name}", it.label)}
                  aria-label={t(it.fixed ? "budget.unfixAmount" : "budget.fixAmount").replace("{name}", it.label)}
                  style={{
                    width: COL_BTN, height: 36, borderRadius: 999, flexShrink: 0, border: "none",
                    background: it.fixed ? T.accentBg : "transparent",
                    color: it.fixed ? T.text : T.textMut, cursor: "pointer",
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    transition: "background 120ms ease, color 120ms ease",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = T.accentBg; e.currentTarget.style.color = T.text; }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = it.fixed ? T.accentBg : "transparent";
                    e.currentTarget.style.color = it.fixed ? T.text : T.textMut;
                  }}
                >
                  {it.fixed
                    ? <Lock size={14} strokeWidth={1.75} />
                    : <Unlock size={14} strokeWidth={1.75} />}
                </button>
                <button
                  type="button"
                  onClick={() => removeItem(it.id)}
                  aria-label={t("budget.removeCategory").replace("{name}", it.label)}
                  style={{
                    width: COL_BTN, height: 36, borderRadius: 999, flexShrink: 0, border: "none",
                    background: "transparent", color: T.textMut, cursor: "pointer",
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    transition: "background 120ms ease, color 120ms ease",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = T.redBg; e.currentTarget.style.color = T.red; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = T.textMut; }}
                >
                  <X size={16} strokeWidth={2} />
                </button>
              </div>
            ))}

            {/* Reste non alloué — ou dépassement. La même ligne porte les deux
                cas : c'est le même chiffre, de l'autre côté de zéro. */}
            <div style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "12px 0 2px", borderTop: `1px solid ${T.border}`,
              color: over ? T.pnlNeg : T.textSub,
            }}>
              <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: "50%", background: T.border2, flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 14 }}>{over ? t("budget.over") : t("budget.rest")}</span>
              <span style={{ fontSize: 14, width: COL_PCT, textAlign: "right", flexShrink: 0 }}>
                {Math.round((100 - totalPct) * 10) / 10} %
              </span>
              <span style={{ fontSize: 14, fontWeight: 500, width: COL_AMOUNT, textAlign: "right", flexShrink: 0 }}>
                {fmt(rest)}
              </span>
              <span style={{ width: COL_BTN, flexShrink: 0 }} aria-hidden="true" />
              <span style={{ width: COL_BTN, flexShrink: 0 }} aria-hidden="true" />
            </div>
          </div>

          {/* Le cadenas est la seule commande de la page dont l'effet est différé :
              il ne se voit qu'au moment où le revenu change. On l'explique donc
              toujours — avant, pour dire qu'il existe ; après, pour dire ce qu'il
              fait maintenant que des sommes sont figées. */}
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13, lineHeight: 1.5, color: T.textSub }}>
            {hasFixed
              ? <Lock size={13} strokeWidth={1.75} style={{ flexShrink: 0, marginTop: 3 }} aria-hidden="true" />
              : <Unlock size={13} strokeWidth={1.75} style={{ flexShrink: 0, marginTop: 3 }} aria-hidden="true" />}
            <span>{t(hasFixed ? "budget.fixedHint" : "budget.lockHint")}</span>
          </div>

          {over && (
            <div role="alert" style={{ fontSize: 14, lineHeight: 1.5, color: T.pnlNeg }}>
              {t("budget.overHint").replace("{pct}", String(Math.round(totalPct * 10) / 10))}
            </div>
          )}

          <div>
            <button
              type="button"
              onClick={addItem}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6, minHeight: 40,
                padding: "0 16px", borderRadius: 999, border: "none",
                background: T.accentBg, color: T.text, fontSize: 14, fontWeight: 500,
                cursor: "pointer", fontFamily: "inherit",
              }}
            >
              <Plus size={15} strokeWidth={1.75} /> {t("budget.addCategory")}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

/**
 * Champ « montant » d'une catégorie.
 *
 * Pendant la frappe on affiche TEL QUEL ce qui est tapé (brouillon local) : la
 * valeur affichée passe par un arrondi, et sans ce brouillon le champ sauterait
 * sous les doigts (« 12. » redeviendrait « 12 »). Au blur, il se recale sur la
 * valeur calculée. `exact` = cette catégorie est figée, le montant est donc la
 * source de vérité — l'autre champ, lui, est une lecture.
 *
 * Une valeur dérivée perd sa bordure et son fond : sur une ligne figée, seul le
 * montant a l'air d'un champ, et l'état du cadenas se lit sans regarder l'icône.
 * Le cadre revient au survol et au focus — la valeur reste modifiable, la saisir
 * étant justement la façon de faire basculer la ligne dans l'autre mode.
 */
function AmountInput({ value, exact, disabled, onValue, ariaLabel }) {
  const [draft, setDraft] = React.useState(null);
  const [hover, setHover] = React.useState(false);
  const [focused, setFocused] = React.useState(false);
  const rounded = Math.round(value);
  return (
    <input
      type="number"
      inputMode="decimal"
      min={0}
      value={draft ?? (rounded === 0 ? "" : rounded)}
      placeholder="0"
      disabled={disabled}
      onFocus={(e) => { setFocused(true); setDraft(e.target.value); }}
      onChange={(e) => {
        setDraft(e.target.value);
        onValue(Math.max(0, Number(e.target.value) || 0));
      }}
      onBlur={() => { setFocused(false); setDraft(null); }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      aria-label={ariaLabel}
      style={{
        ...FIELD, flex: 1, textAlign: "right", fontWeight: 500,
        ...fieldSkin(exact || hover || focused),
        color: exact ? T.text : T.textSub,
        opacity: disabled ? 0.5 : 1,
      }}
    />
  );
}

/**
 * Champ « part en % » d'une catégorie. Même brouillon que le montant : sur une
 * catégorie figée, la part affichée est dérivée puis arrondie au dixième.
 * Y saisir une valeur rend la catégorie proportionnelle au revenu — c'est
 * l'action inverse du cadenas, exprimée par le champ qu'on choisit de remplir.
 */
function PctInput({ value, derived, onValue, ariaLabel }) {
  const [draft, setDraft] = React.useState(null);
  const [hover, setHover] = React.useState(false);
  const [focused, setFocused] = React.useState(false);
  const rounded = Math.round(value * 10) / 10;
  return (
    <input
      type="number"
      inputMode="decimal"
      min={0}
      max={100}
      value={draft ?? (rounded === 0 ? "" : rounded)}
      placeholder="0"
      onFocus={(e) => { setFocused(true); setDraft(e.target.value); }}
      onChange={(e) => {
        setDraft(e.target.value);
        onValue(Number(e.target.value) || 0);
      }}
      onBlur={() => { setFocused(false); setDraft(null); }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      aria-label={ariaLabel}
      style={{
        ...FIELD, flex: 1, textAlign: "right",
        ...fieldSkin(!derived || hover || focused),
        color: derived ? T.textSub : T.text,
      }}
    />
  );
}

/* ── Le mois qui vient de passer ────────────────────────────────────────────
   Le bloc « réel » de la page : le flux du mois, sa répartition, et les trois
   chiffres qui le résument. Composant à part et non un bout du corps de la
   page : il porte ses propres hooks (banque, relevés, mois montré), et la page
   du plan n'a aucune raison de se re-rendre quand un relevé arrive.
   ------------------------------------------------------------------------- */

/** Teintes des deux parts de l'onglet « Reste ». Elles ne sortent pas de la
 *  palette des postes : ces parts n'en SONT pas, et une couleur de poste leur
 *  donnerait l'air d'en être un. Bleu du nœud central pour ce qui est couvert,
 *  gris pour ce qui n'a pas été dépensé, terre cuite pour le découvert — la
 *  seule des trois qui mérite d'être vue. */
const COVERED_COLOR = "#2C72C3";
const LEFT_COLOR = "#B9C2CB";
const DRAW_COLOR = "#C05A46";

/** Six postes, cinq sources et trois sous-postes au diagramme : les mêmes
 *  écrêtages que la page Cashflow, qui dessine le même graphe. */
const GRAPH_CLIP = { topOutflows: 6, topInflows: 5 };

function MonthlyFlow({ setPage }) {
  // La langue sert de dépendance aux libellés du diagramme : sans elle, changer
  // de langue laisserait les pastilles dans l'ancienne, le graphe n'ayant pas bougé.
  const lang = useLang();
  const bank = useBankAccounts();
  const bp = useBreakpoint();

  /* Le mois montré, en nombre de mois avant celui-ci. État LOCAL et non rangé
     dans le store : c'est une position de lecture, pas un réglage — revenir sur
     la page doit rouvrir le mois en cours, pas celui qu'on regardait la
     semaine dernière. */
  const [offset, setOffset] = React.useState(0);
  const { from, to } = React.useMemo(() => monthWindow(offset), [offset]);

  /* Profondeur demandée à la banque : de quoi couvrir le mois montré, jamais
     moins de 90 jours — c'est le minimum que l'API rend de toute façon, et
     c'est ce que demandent déjà la synthèse Patrimoine et la page Cashflow,
     donc le MÊME cache. Reculer d'un mois ne redemande que ce qui manque. */
  const depth = React.useMemo(() => Math.max(daysSince(from), 90), [from]);

  const uids = React.useMemo(() => bank.accounts.map((a) => a.uid), [bank.accounts]);
  const { byUid, loading } = useBankTransactionsAll(uids, depth);

  /* Les relevés de tous les comptes mis bout à bout, recadrés sur le mois. Le
     cache peut contenir plus profond que ce qu'on affiche : le recadrage se
     fait ici, pas à la requête. */
  const txs = React.useMemo(() => {
    const list = [];
    for (const uid of uids) {
      const rows = byUid[uid];
      if (rows) list.push(...rows);
    }
    return withinRange(list, from, to);
  }, [byUid, uids, from, to]);

  const flow = React.useMemo(() => buildCashflowGraph(txs, GRAPH_CLIP), [txs]);
  const spending = React.useMemo(() => spendingByCategory(txs), [txs]);
  const incomes = React.useMemo(() => incomeBySource(txs), [txs]);

  /* L'onglet choisi sous le diagramme décide ce que l'anneau détaille. « Sorti »
     par défaut : c'est la question qu'on se pose devant un budget, et les deux
     autres onglets portent déjà leur chiffre en clair. */
  const [tab, setTab] = React.useState("out");

  const flowNodes = React.useMemo(
    () => flow.nodes.map((n) => ({ id: n.id, color: n.color, label: flowLabel(n) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [flow, lang],
  );

  /* « août 2026 ». Le format vient du système : c'est la langue de l'appareil
     qui décide de l'ordre et de la casse, pas nous. */
  const monthLabel = React.useMemo(() => {
    try {
      return new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(parseDay(from));
    } catch {
      return from.slice(0, 7);
    }
  }, [from]);

  const ring = React.useMemo(() => {
    if (tab === "in") {
      return {
        parts: incomes.slices.map((s) => ({
          id: s.id, label: s.source || t(subLabelKey(s.sub)),
          color: s.color, pct: s.pct, amount: s.amount,
        })),
        label: t("cashflow.in"),
        value: flow.income,
      };
    }

    /* « Reste » n'a pas de répartition à montrer : ce qu'on veut voir, c'est sa
       place dans le mois. L'anneau porte donc DEUX parts, et le sens des deux
       change avec le signe — ce qui reste sur ce qui est entré, ou ce qu'il a
       fallu prendre en plus de ce qui est entré. */
    if (tab === "left") {
      const drawn = flow.net < 0;
      const total = drawn ? flow.spent : flow.income;
      const covered = drawn ? flow.income : flow.spent;
      const edge = Math.abs(flow.net);
      const share = (v) => (total > 0 ? (v / total) * 100 : 0);
      return {
        parts: [
          {
            id: "covered", label: t(drawn ? "cashflow.in" : "cashflow.out"),
            color: COVERED_COLOR, pct: share(covered), amount: covered,
          },
          {
            id: "edge", label: t(drawn ? "cashflow.drawn" : "cashflow.left"),
            color: drawn ? DRAW_COLOR : LEFT_COLOR, pct: share(edge), amount: edge,
          },
        ],
        label: t(drawn ? "cashflow.drawn" : "cashflow.left"),
        value: edge,
        tone: drawn ? T.pnlNeg : undefined,
      };
    }

    return {
      parts: spending.slices.map((s) => ({
        id: s.id, label: t(categoryLabelKey(s.id)),
        color: s.color, pct: s.pct, amount: s.amount,
      })),
      label: t("cashflow.out"),
      value: flow.spent,
    };
    // `lang` : les libellés des parts passent par `t()` (cf. `flowNodes`).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, incomes, spending, flow, lang]);

  /* Deux colonnes sur grand écran : l'anneau demande sa place et le diagramme
     ne se lit plus en dessous de 640 px de large. Empilés en dessous. */
  const twoCols = bp === "desktop";
  const noBank = bank.accounts.length === 0;
  const empty = flow.total <= 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <SectionTitle>{t("budget.thisMonth")}</SectionTitle>
        {/* Le mois suivant n'existe pas encore quand on est sur le mois en
            cours : la flèche s'éteint plutôt que de ne rien faire. */}
        <StepperPill
          label={monthLabel}
          onPrev={() => setOffset((o) => o - 1)}
          onNext={() => setOffset((o) => Math.min(0, o + 1))}
          nextDisabled={offset >= 0}
          prevLabel={t("budget.prevMonth")}
          nextLabel={t("budget.nextMonth")}
        />
      </div>

      {noBank ? (
        <section style={{ ...CARD, padding: "48px 32px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
          <div style={{ fontSize: 14, color: T.textSub, maxWidth: 420 }}>
            {bank.loading ? t("patrimoine.spending.loading") : t("patrimoine.spending.noAccount")}
          </div>
          <button
            type="button"
            onClick={() => setPage?.("patrimoine-bank")}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6, minHeight: 40,
              padding: "0 16px", borderRadius: 999, border: "none",
              background: T.accentBg, color: T.text, fontSize: 14, fontWeight: 500,
              cursor: "pointer", fontFamily: "inherit",
            }}
          >
            <Landmark size={15} strokeWidth={1.75} /> {t("patrimoine.bank.connect")}
          </button>
        </section>
      ) : empty ? (
        <section style={{ ...CARD, padding: "48px 32px", textAlign: "center", fontSize: 14, color: T.textSub }}>
          {loading ? t("patrimoine.spending.loading") : t("patrimoine.spending.empty")}
        </section>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: twoCols ? "minmax(0, 2.1fr) minmax(260px, 1fr)" : "minmax(0, 1fr)",
            gap: 20,
            alignItems: "start",
          }}
        >
          <section style={{ ...CARD, padding: "20px 24px 0", display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 500, color: T.text }}>{t("cashflow.title")}</div>

            <SankeyGraph
              nodes={flowNodes}
              links={flow.links}
              formatValue={(v) => fmt(v)}
              ariaLabel={t("cashflow.flowAria")
                .replace("{in}", fmt(flow.income))
                .replace("{out}", fmt(flow.spent))}
              emptyLabel={t("cashflow.flowEmpty")}
            />

            {/* Les trois chiffres du mois, en onglets : ils résument ET ils
                commandent. Sans le second rôle, ce serait une rangée de chiffres
                de plus, et l'anneau d'à côté n'aurait aucun moyen de dire autre
                chose que les dépenses. */}
            <div
              role="tablist"
              aria-label={t("budget.tabsAria")}
              style={{ display: "flex", gap: 4, flexWrap: "wrap", borderTop: `1px solid ${T.border}`, margin: "0 -24px", padding: "0 12px" }}
            >
              <FlowTab
                active={tab === "in"} onClick={() => setTab("in")}
                label={t("cashflow.in")} value={flow.income} tone={T.pnlPos}
              />
              <FlowTab
                active={tab === "out"} onClick={() => setTab("out")}
                label={t("cashflow.out")} value={flow.spent}
              />
              <FlowTab
                active={tab === "left"} onClick={() => setTab("left")}
                label={t(flow.net < 0 ? "cashflow.drawn" : "cashflow.left")}
                value={Math.abs(flow.net)}
                tone={flow.net < 0 ? T.pnlNeg : undefined}
              />
            </div>
          </section>

          <section style={{ ...CARD, padding: 24, display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 500, color: T.text }}>{t("budget.distribution")}</div>
            <AllocationChart
              parts={ring.parts}
              ariaLabel={`${ring.label} : ${fmt(ring.value)}`}
              size={196}
              thickness={24}
              centreLabel={ring.label}
              centreValue={ring.value}
              centreTone={ring.tone}
              showPct={false}
              formatValue={(v) => fmt(v)}
            />
            {/* Le classement est deviné, pas déclaré : le dire évite de prendre
                pour argent comptant un « Autres » qui n'est qu'un libellé
                illisible. */}
            <div style={{ fontSize: 12, lineHeight: 1.6, color: T.textMut }}>
              {t("patrimoine.spending.hint")}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

/**
 * Un des trois chiffres du mois, en onglet.
 *
 * Le trait sous l'onglet actif prend la TEINTE du chiffre (vert pour l'encaissé,
 * rouge pour un découvert) : c'est le même signal que la couleur du montant, et
 * il tient quand l'œil ne regarde que le bas de la carte.
 */
function FlowTab({ active, onClick, label, value, tone }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      style={{
        display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2,
        minWidth: 0, padding: "12px 14px 10px", border: "none", background: "transparent",
        borderBottom: `2px solid ${active ? (tone || T.text) : "transparent"}`,
        opacity: active ? 1 : 0.55, cursor: "pointer", fontFamily: "inherit",
        transition: "opacity 140ms var(--ease-out, ease), border-color 140ms var(--ease-out, ease)",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.opacity = 1; }}
      onMouseLeave={(e) => { e.currentTarget.style.opacity = active ? 1 : 0.55; }}
    >
      <span style={{ fontSize: 13, color: T.textSub, whiteSpace: "nowrap" }}>{label}</span>
      <span style={{
        fontSize: 22, fontWeight: 600, letterSpacing: -0.3,
        color: tone || T.text, fontVariantNumeric: "tabular-nums",
      }}>
        {fmt(value)}
      </span>
    </button>
  );
}
