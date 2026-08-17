"use client";

/**
 * Budget — le plan qu'on se donne. Le budget TYPE, et rien d'autre.
 *
 * Plusieurs plans nommés de répartition du revenu mensuel, saisis à la main.
 *
 * La page a un temps porté aussi le mois RÉEL, lu sur les relevés : le flux en
 * diagramme, sa répartition en anneau et les trois chiffres du mois. C'est
 * reparti. Le réalisé se lit sur la page Cashflow, qui le dit mieux parce
 * qu'elle le DÉPLIE (opérations d'un poste, enseignes, relevé) là où ce bloc ne
 * pouvait que le résumer ; le tenir aux deux endroits demandait de garder deux
 * mises en page d'accord sur la même matière.
 *
 * Ce qui reste ici ne dépend donc d'AUCUN compte bancaire : la page s'ouvre et
 * s'utilise sans banque connectée, et rien n'y attend de relevé.
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
 * sait quelles catégories correspondent à une dépense réelle. La page le dit
 * dans le tableau lui-même — la colonne du cadenas est nommée, chaque cadenas
 * porte son infobulle, et le champ qui ne fait pas foi s'efface (voir
 * `AmountInput`) ; le paragraphe d'aide qui reprenait tout ça sous le tableau a
 * été retiré.
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
import { Copy, Lock, Plus, RotateCcw, Trash2, Unlock, X } from "lucide-react";
import { T } from "@/lib/ui/tokens";
import { t, useLang } from "@/lib/i18n";
import { AllocationChart, CARD, PeriodPills, SectionTitle } from "@/components/ui/da";
import { fmt } from "@/lib/ui/format";
import { getCurrencySymbol } from "@/lib/userPrefs";
import { useCloudState } from "@/lib/hooks/useCloudState";
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

/* Pas de `setPage` : la page ne renvoie plus nulle part depuis qu'elle ne lit
   plus la banque. Le routeur le passe toujours, et l'ignorer ici est sans
   conséquence — le déclarer pour ne pas s'en servir en aurait une, celle de
   laisser croire qu'il reste un lien à suivre. */
export default function BudgetPage() {
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

  /* Dupliquer : repartir d'un plan existant plutôt que du 50/30/20, pour
     comparer deux variantes du même budget (avec et sans le crédit, revenu
     actuel contre revenu visé) sans ressaisir dix catégories.

     Les catégories sont recopiées une à une, avec un id NEUF chacune : le
     nouveau plan doit pouvoir être modifié sans toucher l'original, et un `map`
     d'objets partagés laisserait les deux plans sur les mêmes références.
     L'id sert de clé React pour la ligne, et le brouillon de saisie de
     `PctInput` / `AmountInput` vit dans le composant : garder l'id d'origine
     ferait suivre à la copie le champ en cours de frappe de l'original.

     Le nom est tronqué à la même longueur que le champ qui le porte, sinon un
     nom déjà long ressortirait plus long que ce que l'utilisateur peut ressaisir. */
  const duplicatePlan = () => {
    const id = newId();
    focusPlanId.current = id;
    setConfirmDelete(false);
    setStore((s) => {
      const src = s.plans.find((p) => p.id === plan.id) || plan;
      const copy = {
        id,
        name: t("budget.copyName").replace("{name}", src.name || "").slice(0, 30),
        income: src.income,
        items: (Array.isArray(src.items) ? src.items : []).map((it) => ({ ...it, id: newId() })),
      };
      /* Juste APRÈS l'original, pas en fin de liste : les deux variantes se
         lisent alors côte à côte dans le sélecteur. */
      const at = s.plans.findIndex((p) => p.id === plan.id);
      const next = [...s.plans];
      next.splice(at < 0 ? next.length : at + 1, 0, copy);
      return { ...s, plans: next, activeId: id };
    });
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
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
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
                <GhostButton
                  icon={<Copy size={14} strokeWidth={1.75} />}
                  onClick={duplicatePlan}
                >
                  {t("budget.duplicate")}
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

            {/* Pas de filet entre deux catégories : chaque ligne porte déjà sa
                gommette de couleur, qui la sépare de la suivante mieux qu'un
                trait — et dix filets sur une carte font une grille là où on ne
                voulait qu'une liste. L'interligne suffit à les tenir distinctes.
                Celui du « Reste », plus bas, reste : ce n'est pas une catégorie
                de plus, c'est le trait d'un total. */}
            {items.map((it) => (
              <div
                key={it.id}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "5px 0",
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

