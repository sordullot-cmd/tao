"use client";

/**
 * Cashflow — le flux d'argent d'une fenêtre : ce qui est RÉELLEMENT entré et
 * sorti, lu sur les relevés.
 *
 * Cette page a un temps porté aussi le prévisionnel (l'ancienne page « Budget »),
 * pour que le prévu et le réalisé soient sous les yeux en même temps. En pratique
 * c'était une page entière posée sous une autre : le plan est reparti dans sa
 * page, et il n'en reste ici qu'un renvoi, en bas, là où la question « et par
 * rapport à ce que je m'étais fixé ? » se pose.
 *
 * L'ordre de lecture est celui d'une réponse, du plus général au plus précis :
 *
 *   1. LE FLUX. Un diagramme de Sankey : les sources à gauche, ce qui a été
 *      encaissé au centre, les postes à droite, et le reste (ou le découvert)
 *      comme dernière branche. C'est la seule figure qui dise d'un coup d'où
 *      vient l'argent ET où il va — un anneau ne sait faire que la seconde
 *      moitié. Les proportions se lisent dans l'épaisseur des rubans.
 *   2. LE DÉTAIL DE CE QUI SORT, en deux colonnes : les postes à gauche,
 *      dépliables sur leurs opérations ; les enseignes qui pèsent le plus à
 *      droite, logo compris. Les deux répondent à la même question par ses deux
 *      bouts — « dans quoi » et « chez qui » —, et une fuite se voit dans la
 *      seconde là où la première ne montre qu'un poste un peu gros. Les ENTRÉES
 *      n'ont pas de bloc à elles : elles se lisent dans la colonne de gauche du
 *      diagramme, qui les nomme et les chiffre.
 *   3. LES DERNIÈRES OPÉRATIONS réelles — ce qui vient de se passer, sans
 *      quitter la page pour le relevé complet. Cinq d'emblée, la suite se
 *      déplie sur place, par paquets, jusqu'à toute la fenêtre choisie.
 *   4. LE RENVOI VERS LE BUDGET, en dernier : ce qu'on VOUDRAIT, après ce qui
 *      EST. L'ordre inverse ferait discuter le plan avant de regarder les
 *      chiffres.
 *
 * Tout vient des RELEVÉS des comptes agrégés : il n'y a aucune saisie manuelle
 * de dépense dans tr4de, et il n'en est pas prévu. Sans banque connectée, la
 * page le dit et ne montre rien d'autre — des colonnes et des zéros se liraient
 * comme « tu n'as rien dépensé », ce qui est faux. Le renvoi vers le budget
 * reste, lui : le plan ne dépend d'aucun compte.
 *
 * Le classement (postes ET sources) est DEVINÉ d'après le libellé par
 * `lib/bank/categories`, et la page le dit : un classement faux se lit comme un
 * classement vrai.
 *
 * Profondeur demandée à la banque : la même règle que la synthèse Patrimoine
 * (`depthOf(days) <= 90 ? 90 : days`), donc le MÊME cache. Changer de fenêtre
 * ici ne redemande que ce que la banque n'a pas encore donné.
 *
 * La fenêtre choisie est rangée sous les clés de l'ancienne page Dépenses
 * (`tr4de_spending_period`) : c'est le même réglage, sur la même matière, et une
 * clé neuve aurait renvoyé chacun à « 1 mois » le jour de la fusion.
 */

import React from "react";
import { ArrowDownLeft, ArrowUpRight, ChartPie, ChevronDown, ChevronRight, ChevronUp, Landmark } from "lucide-react";
import { T } from "@/lib/ui/tokens";
import { dotRing } from "@/lib/ui/color";
import { t, useLang, getLang } from "@/lib/i18n";
import { CARD, PeriodPills, SectionAction, SectionTitle, StepperPill, TH, PERIODS } from "@/components/ui/da";
import { periodRange } from "@/lib/ui/period";
import DateRangePicker from "@/components/ui/DateRangePicker";
import CashflowSummary from "@/components/ui/CashflowSummary";
import CategoryIcon from "@/components/ui/CategoryIcon";
import MerchantAvatar from "@/components/ui/MerchantAvatar";
import { findMerchant, findTransferBank } from "@/lib/bank/merchants";
import { useBankAccounts } from "@/lib/bank/useBankAccounts";
import { useBankTransactionsAll } from "@/lib/bank/useBankTransactions";
import {
  categorizeTransaction, categoryColor, categoryLabelKey, parentOfSub,
  spendingByCategory, subLabelKey, subcategorizeTransaction,
} from "@/lib/bank/categories";
import { incomeBySource } from "@/lib/bank/cashflow";
import {
  dayKey, daysSince, kindLabelKey, parseDay, sortTransactions, withinRange,
} from "@/lib/bank/transactions";
import { useBreakpoint } from "@/lib/hooks/useBreakpoint";
import { useCloudState } from "@/lib/hooks/useCloudState";
import { fmt } from "@/lib/ui/format";

/* Trois fenêtres, et une saisie libre. La semaine et le semestre sont partis :
   un budget se lit au mois, au trimestre ou à l'année, et six pastilles où trois
   suffisent font hésiter à chaque visite. Ce qui tombe entre les trois se
   demande en clair — d'où « Personnalisé », qui ouvre un sélecteur de dates et
   remplace le « Tout » d'avant : une fenêtre sans bornes ne se compare à rien.

   Un mois par défaut : c'est le pas auquel un budget se pense. */
const PERIOD_CUSTOM = "CUSTOM";
const CASHFLOW_PERIODS = [
  ...PERIODS.filter((p) => ["1M", "3M", "1A"].includes(p.id)),
  { id: PERIOD_CUSTOM },
];

/** Fenêtre libre de départ : les trente derniers jours, soit celle qu'on quitte
 *  en cliquant « Personnalisé ». Ouvrir sur autre chose ferait sauter les
 *  chiffres au moment même où l'on demande à choisir. */
const defaultCustom = () => {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29);
  return { start: dayKey(start), end: dayKey(today) };
};

/* Dix-huit postes et huit sources au diagramme. Le regroupement sous « + N
   autres postes » n'apprend RIEN — c'est un ruban qui ne désigne personne — et
   il tombait dès le sixième poste, alors qu'un relevé ordinaire en remplit une
   quinzaine : un mois entier de dépenses partait dans une branche muette. On
   monte donc l'écrêtage jusqu'à ce que le dessin sait porter, pour qu'il ne reste
   à regrouper que la queue — les postes à une opération et deux euros.

   Dix-huit est un PLAFOND DE DESSIN, pas un choix de goût : le dessin s'allonge
   pour donner à chaque nom la place de tenir en face de sa branche (cf.
   `heightNeeded` dans lib/ui/sankeyGraph), mais c'est l'ÉPAISSEUR des rubans qui
   cède — à dix-neuf branches, les jours entre elles mangent déjà 190 px et les
   plus petites tombent sur leur plancher de 3 px. Au-delà, on dessinerait des
   traits en prétendant montrer un flux.

   Le RANG n'est d'ailleurs plus le seul motif de regroupement : `MIN_BRANCH`
   ci-dessous écarte les branches trop petites pour se voir, quel que soit leur
   rang — c'est ce qui limite vraiment le nombre de rubans en pratique.

   Huit sources pour la même raison, et elles servent : le classement des entrées
   est plus fin qu'avant (salaire, freelance, aides, retraite, intérêts,
   dividendes, ventes, remboursements), et à cinq on regroupait des sources qui
   ont chacune leur teinte et leur nom.

   Ce qui reste écrêté dit COMBIEN de postes il porte, et le détail complet est
   dans les listes juste en dessous : rien n'est caché, seulement rassemblé.

   Pas de `topSubs` : le diagramme s'arrête aux POSTES. Les déplier sur leurs
   sous-postes doublait le nombre de branches pour un détail que le tableau juste
   en dessous donne mieux — chiffré, trié, et dépliable sur les opérations
   elles-mêmes. Posée au niveau du module et non en littéral dans le rendu : un
   objet neuf à chaque passage ferait reconstruire le graphe pour rien. */
const GRAPH_CLIP = { topOutflows: 18, topInflows: 8 };

/* Montant en dessous duquel une branche rejoint le « + N autres », par fenêtre.
   Un même montant ne pèse pas pareil selon la profondeur regardée : 20 € de
   frais bancaires sur un mois, c'est une ligne du budget ; sur un an, c'est un
   trait de trois pixels qui traîne un nom en face de lui et repousse d'autant les
   branches voisines. Le seuil suit donc la fenêtre — cinq euros au mois,
   vingt-cinq au trimestre et à l'année.

   La fenêtre LIBRE prend le seuil de la profondeur qu'elle couvre : au-delà de
   six semaines, elle se lit comme un trimestre. */
const MIN_BRANCH = { "1M": 5, "3M": 25, "1A": 25 };
const MIN_BRANCH_LONG = 25;
const CUSTOM_SHORT_DAYS = 45;

/** Marchands montrés dans le classement. Au-delà, ce n'est plus un « top ». */
const TOP_MERCHANTS = 8;

/** Opérations montrées par poste avant dépliage complet. */
const TX_FOLDED = 6;

/** Opérations récentes montrées d'emblée : de quoi reconnaître les derniers
 *  jours, pas de quoi refaire le relevé — la fiche du compte le fait déjà, en
 *  mieux. La suite se déplie sur place, par paquets : cinq lignes suffisent à se
 *  situer, mais « qu'est-ce qui est passé cette semaine » en demande plus, et
 *  aller chercher la réponse dans le relevé fait perdre la période choisie. */
const RECENT = 5;
const RECENT_STEP = 15;

/* Colonnes des tableaux — les mêmes largeurs que le prévisionnel en bas de page :
   le prévu et le réalisé se lisent l'un après l'autre, et deux tableaux qui
   disent la même chose doivent s'aligner pareil. La dernière colonne est celle
   du chevron ; le prévisionnel y met ses deux actions. */
const COL_PCT = 72;
const COL_AMOUNT = 116;
const COL_BTN = 24;

/**
 * Intitulé d'une liste, dans le ton des en-têtes de colonnes du tableau des
 * comptes (`AccountRowsHeader`) : petit, gris, aligné sur le texte des lignes.
 *
 * Et non un `SectionTitle` : les deux listes de ce bloc ne sont pas des sections
 * de la page, ce sont les deux moitiés d'une seule réponse — « dans quoi » et
 * « chez qui ». Deux titres de section les annonçaient comme deux sujets, et
 * pesaient plus lourd que les lignes qu'ils coiffent. Le gris vient d'une
 * OPACITÉ et non d'une couleur de texte : c'est ce que fait le tableau des
 * comptes, et ça tient sur les deux thèmes sans qu'on ait deux teintes à régler.
 */
function ListHeader({ label, share = false, chevron = false }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "0 20px", opacity: 0.4 }}>
      <span style={{ ...TH, flex: 1, minWidth: 0 }}>{label}</span>
      {/* Les enseignes n'ont pas de part : leur classement ne couvre que les
          marchands RECONNUS, dont la somme ne fait pas le total dépensé. Un
          pourcentage y serait faux d'autant qu'il manque d'enseignes. */}
      {share && (
        <span style={{ ...TH, width: COL_PCT, flexShrink: 0, textAlign: "right", paddingRight: 16 }}>
          {t("spending.colShare")}
        </span>
      )}
      <span style={{ ...TH, width: COL_AMOUNT, flexShrink: 0, textAlign: "right" }}>
        {t("spending.colValue")}
      </span>
      {/* La colonne du chevron, vide : sans elle, « Valeur » se poserait 36 px à
          droite des montants qu'elle intitule. */}
      {chevron && <span aria-hidden="true" style={{ width: COL_BTN, flexShrink: 0 }} />}
    </div>
  );
}

/* Les dates suivent la LANGUE DE L'APP, pas la locale du système : sans ça, une
   app réglée en anglais affichait « 1 août » à côté de « Money in » — la machine
   décidait de la langue d'une moitié de la page. */
const dateLocale = () => (getLang() === "fr" ? "fr-FR" : "en-US");

/** « 13 août » — l'année n'apparaît que si le jour n'est pas de cette année. */
function shortDay(iso) {
  if (!iso) return "";
  const [y, m, d] = String(iso).split("-").map(Number);
  const date = new Date(y, (m || 1) - 1, d || 1);
  const sameYear = y === new Date().getFullYear();
  try {
    return new Intl.DateTimeFormat(dateLocale(), {
      day: "numeric", month: "short", ...(sameYear ? null : { year: "numeric" }),
    }).format(date);
  } catch {
    return String(iso);
  }
}

export default function CashflowPage({ setPage }) {
  useLang();
  const bank = useBankAccounts();
  const bp = useBreakpoint();

  /* La fenêtre suit le COMPTE et non l'onglet : quelqu'un qui suit son mois en
     cours ne doit pas retrouver « Tout » à chaque visite. Même mécanique que la
     synthèse Patrimoine. */
  const [rawPeriod, setPeriod] = useCloudState("tr4de_spending_period", "spending_period", "1M");
  const period = CASHFLOW_PERIODS.some((p) => p.id === rawPeriod) ? rawPeriod : "1M";


  /* La fenêtre libre, gardée avec la période : revenir sur « Personnalisé » doit
     rouvrir les dates qu'on y avait posées, pas trente jours par défaut. */
  const [rawCustom, setCustom] = useCloudState("tr4de_spending_custom", "spending_custom", defaultCustom());
  const custom = rawCustom?.start && rawCustom?.end ? rawCustom : defaultCustom();

  /* La fenêtre a une LONGUEUR (les pastilles, ou les dates saisies) et une
     POSITION (les flèches) : on recule d'autant de jours qu'elle en couvre, si
     bien que deux fenêtres voisines se suivent sans se chevaucher ni laisser de
     trou. La position est remise à zéro quand la longueur change — un décalage
     de trois crans en « 1 mois » n'a pas de sens une fois passé en « 1 an ». */
  const [offset, setOffset] = React.useState(0);
  React.useEffect(() => { setOffset(0); }, [period, custom.start, custom.end]);

  /* La fenêtre d'une pastille est CALÉE SUR LE CALENDRIER (cf. `lib/ui/period`) :
     « 1 mois » va du 1er à aujourd'hui, et reculer d'un cran donne le mois
     précédent en entier — pas trente jours de plus en arrière. Deux fenêtres
     voisines se suivent donc sans se chevaucher ni laisser de trou, ce qu'un
     décalage en jours ne pouvait pas tenir dès que les mois n'ont pas la même
     longueur.

     La fenêtre LIBRE garde l'ancienne règle : elle n'a pas de bord de mois sur
     lequel se caler, on la recule donc de sa propre longueur. */
  const range = React.useMemo(() => {
    const cadre = periodRange(period, offset);
    if (cadre) return { from: dayKey(cadre.start), to: dayKey(cadre.end) };
    const length = daysSince(custom.start, parseDay(custom.end));
    const anchor = parseDay(custom.end);
    const end = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() - offset * length);
    const start = new Date(end.getFullYear(), end.getMonth(), end.getDate() - length + 1);
    return { from: dayKey(start), to: dayKey(end) };
  }, [period, custom, offset]);

  const depth = Math.max(daysSince(range.from), 90);

  /* L'écrêtage du diagramme, seuil compris. Mémoïsé : un objet neuf à chaque
     rendu ferait reconstruire le graphe pour rien (cf. `GRAPH_CLIP`). */
  const graphClip = React.useMemo(() => {
    const span = daysSince(range.from, parseDay(range.to)); // bornes incluses
    const minAmount = MIN_BRANCH[period]
      ?? (span <= CUSTOM_SHORT_DAYS ? MIN_BRANCH["1M"] : MIN_BRANCH_LONG);
    return { ...GRAPH_CLIP, minAmount };
  }, [period, range]);

  const uids = React.useMemo(() => bank.accounts.map((a) => a.uid), [bank.accounts]);
  const { byUid, loading } = useBankTransactionsAll(uids, depth);

  /* Les relevés de tous les comptes mis bout à bout. Le cache peut contenir plus
     profond que ce qu'on affiche : le recadrage se fait ici, pas à la requête. */
  const all = React.useMemo(() => {
    const list = [];
    for (const uid of uids) {
      const rows = byUid[uid];
      if (rows) list.push(...rows);
    }
    return list;
  }, [byUid, uids]);

  const txs = React.useMemo(() => withinRange(all, range.from, range.to), [all, range]);

  /* « 16 juil. – 14 août ». L'année n'apparaît que si la fenêtre sort de l'année
     en cours : sur douze mois de relevé elle serait vraie partout, donc muette. */
  const rangeLabel = React.useMemo(() => {
    const year = String(new Date().getFullYear());
    const sameYear = range.from.slice(0, 4) === year && range.to.slice(0, 4) === year;
    const opts = { day: "numeric", month: "short", ...(sameYear ? null : { year: "numeric" }) };
    try {
      const f = new Intl.DateTimeFormat(dateLocale(), opts);
      return `${f.format(parseDay(range.from))} – ${f.format(parseDay(range.to))}`;
    } catch {
      return `${range.from} – ${range.to}`;
    }
  }, [range]);

  const { slices, total: spent } = React.useMemo(() => spendingByCategory(txs), [txs]);
  const incomes = React.useMemo(() => incomeBySource(txs), [txs]);

  /* Rien de compté sur la fenêtre : on le DIT, plutôt que d'aligner un
     diagramme vide et des zéros, qui se liraient comme « tu n'as rien
     dépensé ». Le test porte sur les deux côtés — une fenêtre où il n'est rien
     entré mais où l'on a dépensé a bien quelque chose à montrer. */
  const empty = spent <= 0 && incomes.total <= 0;

  /* Opérations de chaque poste, la plus grosse d'abord — c'est la question qu'on
     pose en dépliant un poste (« qu'est-ce qui l'a fait monter »), pas l'ordre
     chronologique d'un relevé. Seuls les DÉBITS : un remboursement vient en
     déduction du total du poste (cf. `spendingByCategory`) mais n'a rien à faire
     dans une liste de dépenses. */
  const byCategory = React.useMemo(() => {
    const map = new Map();
    for (const tx of txs) {
      if (tx.amount >= 0) continue;
      const id = categorizeTransaction(tx);
      if (id === "income") continue;
      const list = map.get(id);
      if (list) list.push(tx);
      else map.set(id, [tx]);
    }
    for (const list of map.values()) list.sort((a, b) => a.amount - b.amount);
    return map;
  }, [txs]);

  /* Les dernières opérations, tous comptes confondus — entrées comprises : ce
     bloc répond à « qu'est-ce qui vient de passer », question qui ne trie pas
     par signe. La liste entière est triée ici ; c'est l'affichage qui coupe. */
  const recentAll = React.useMemo(() => sortTransactions(txs), [txs]);

  /* Combien de lignes on montre. Se remet à cinq quand la fenêtre change : un
     compteur gardé à 50 d'une période à l'autre déplierait « 1 semaine » en
     entier sans qu'on l'ait demandé, et le bouton n'aurait plus rien à dire. */
  const [recentShown, setRecentShown] = React.useState(RECENT);
  React.useEffect(() => { setRecentShown(RECENT); }, [period]);

  const recent = React.useMemo(
    () => recentAll.slice(0, recentShown),
    [recentAll, recentShown],
  );
  const recentRest = recentAll.length - recent.length;

  /* Classement des enseignes. Seuls les marchands RECONNUS y figurent : le
     libellé brut d'une carte porte la date et le numéro de terminal, deux
     passages chez le même commerçant n'y ont donc pas la même chaîne et un
     regroupement dessus ne compterait rien. La note sous la liste le dit. */
  const merchants = React.useMemo(() => {
    const map = new Map();
    for (const tx of txs) {
      if (tx.amount >= 0) continue;
      const m = findMerchant(tx);
      if (!m) continue;
      const row = map.get(m.slug) || { merchant: m, amount: 0, count: 0 };
      row.amount -= tx.amount;
      row.count += 1;
      map.set(m.slug, row);
    }
    return [...map.values()].sort((a, b) => b.amount - a.amount).slice(0, TOP_MERCHANTS);
  }, [txs]);

  /* Deux colonnes sur grand écran, empilées en dessous : le tableau des postes
     porte quatre colonnes chiffrées, il ne tient pas dans une demi-largeur de
     tablette. La colonne des postes est la plus large — elle en a plus à dire. */
  const twoCols = bp === "desktop";

  /* En-tête : la fenêtre, et rien d'autre. Pas de titre — la navigation dit
     déjà où l'on est, et la carte du dessous porte le nom du diagramme ; deux
     fois « Cashflow » sur trois centimètres de haut n'apprenaient rien.

     À gauche la POSITION (les flèches, ou les dates quand elle est libre), à
     droite la LONGUEUR : on lit ce qu'on regarde avant de lire le réglage. */
  const header = bank.accounts.length === 0 ? null : (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
      {period === PERIOD_CUSTOM ? (
        <DateRangePicker value={custom} onChange={setCustom} />
      ) : (
        <StepperPill
          label={rangeLabel}
          onPrev={() => setOffset((o) => o + 1)}
          onNext={() => setOffset((o) => Math.max(0, o - 1))}
          nextDisabled={offset <= 0}
          prevLabel={t("cashflow.prevRange")}
          nextLabel={t("cashflow.nextRange")}
        />
      )}
      <PeriodPills
        value={period}
        onChange={setPeriod}
        options={CASHFLOW_PERIODS.map((p) =>
          p.id === PERIOD_CUSTOM ? { ...p, label: t("cashflow.custom") } : p,
        )}
      />
    </div>
  );

  /* Aucun compte agrégé : le réalisé n'a pas de matière, et il n'y a pas de
     saisie manuelle à proposer à la place. On renvoie là où ça se branche — et
     le prévisionnel, qui ne dépend d'aucune banque, reste en dessous. */
  const noBank = bank.accounts.length === 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28, paddingTop: 14, fontFamily: "var(--font-sans)" }} className="anim-1">
      {header}

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
        <>
          {/* ── 1. Le flux ─────────────────────────────────────────────────
              Le diagramme à gauche, l'anneau et ses quatre chiffres à droite :
              le même bloc que la page Budget, qui pose la question sur un mois
              calendaire là où celle-ci la pose sur la fenêtre choisie. */}
          <CashflowSummary txs={txs} history={all} clip={graphClip} />

          {/* ── 2. Le détail : les postes, puis les entrées ─────────────────── */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: twoCols ? "minmax(0, 1.45fr) minmax(0, 1fr)" : "minmax(0, 1fr)",
              gap: 20,
              alignItems: "start",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
              <ListHeader label={t("cashflow.spending")} share chevron />
              {/* Sans en-tête de colonnes : les deux listes de ce bloc se lisent
                  l'une à côté de l'autre, et trois intitulés d'un seul côté
                  décalaient la première ligne des postes d'une hauteur de texte
                  par rapport à la première enseigne. Ce que disent les colonnes
                  se lit dans les valeurs elles-mêmes — un « % » et un montant. */}
              <section style={{ ...CARD, padding: slices.length === 0 ? "16px 20px" : "8px 0", display: "flex", flexDirection: "column" }}>
                {slices.length === 0 ? (
                  <div style={{ fontSize: 14, lineHeight: 1.5, color: T.textSub }}>
                    {t("patrimoine.spending.empty")}
                  </div>
                ) : (
                  slices.map((s) => (
                    <CategoryRow key={s.id} slice={s} txs={byCategory.get(s.id) || []} />
                  ))
                )}
              </section>
            </div>

            {/* Les enseignes en face des postes, et non plus les entrées d'argent.
                Les deux colonnes répondent maintenant à la même question par ses
                deux bouts — « dans quoi » à gauche, « chez qui » à droite —, alors
                qu'une liste de revenus posée là parlait de l'autre côté du flux.
                Les sources, elles, se lisent dans la colonne de gauche du
                diagramme, qui les nomme et les chiffre. */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
              <ListHeader label={t("spending.merchants")} />
              <section style={{ ...CARD, padding: merchants.length === 0 ? "16px 20px" : "8px 0" }}>
                {merchants.length === 0 ? (
                  <div style={{ fontSize: 14, lineHeight: 1.5, color: T.textSub }}>
                    {t("spending.merchantsEmpty")}
                  </div>
                ) : (
                  <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                    {merchants.map((m) => (
                      <li
                        key={m.merchant.slug}
                        style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 20px" }}
                      >
                        <MerchantAvatar merchant={m.merchant} size={32} />
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: "block", fontSize: 14, fontWeight: 500, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {m.merchant.name}
                          </span>
                          <span style={{ display: "block", fontSize: 12, color: T.textSub }}>
                            {t("spending.nTxns").replace("{n}", String(m.count))}
                          </span>
                        </span>
                        {/* Même largeur que la colonne des montants des postes,
                            et alignée à droite : c'est ce qui met le chiffre
                            sous le « Valeur » qui l'intitule, et les deux listes
                            d'accord d'une colonne à l'autre. */}
                        <span style={{ width: COL_AMOUNT, flexShrink: 0, textAlign: "right", fontSize: 14, fontWeight: 600, color: T.text, fontVariantNumeric: "tabular-nums" }}>
                          {fmt(m.amount)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </div>

          {/* ── 3. Les dernières opérations ─────────────────────────────────── */}
          {recent.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <SectionTitle
                size="sm"
                action={<SectionAction onClick={() => setPage?.("patrimoine-bank")}>{t("cashflow.recentAll")}</SectionAction>}
              >
                {t("cashflow.recent")}
              </SectionTitle>
              <section style={{ ...CARD, padding: "8px 0 0" }}>
                <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                  {recent.map((tx) => (
                    <RecentRow key={tx.id} tx={tx} />
                  ))}
                </ul>

                {/* La suite, sur place. Le bouton dit COMBIEN il reste : « voir
                    plus » sur trois lignes restantes et sur deux cents, ce n'est
                    pas la même décision. Une fois tout déplié, il rend la liste
                    à sa taille de départ plutôt que de disparaître — sinon on
                    reste avec deux cents lignes sous les yeux jusqu'au
                    rechargement. */}
                {(recentRest > 0 || recentShown > RECENT) && (
                  <div style={{ borderTop: `1px solid ${T.border}`, display: "flex" }}>
                    <button
                      type="button"
                      onClick={() =>
                        setRecentShown(recentRest > 0 ? recentShown + RECENT_STEP : RECENT)
                      }
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                        width: "100%", minHeight: 44, padding: "0 20px",
                        border: "none", background: "transparent", cursor: "pointer",
                        fontFamily: "inherit", fontSize: 13, fontWeight: 500, color: T.textSub,
                      }}
                    >
                      {recentRest > 0 ? (
                        <>
                          {t("cashflow.recentMore").replace(
                            "{n}",
                            String(Math.min(RECENT_STEP, recentRest)),
                          )}
                          <ChevronDown size={15} strokeWidth={1.75} />
                        </>
                      ) : (
                        <>
                          {t("spending.txLess")}
                          <ChevronUp size={15} strokeWidth={1.75} />
                        </>
                      )}
                    </button>
                  </div>
                )}
              </section>

            </div>
          )}

        </>
      )}

      {/* ── 5. Le prévisionnel, ailleurs ─────────────────────────────────────
          Le plan se SAISIT et ne vient d'aucun relevé : il a sa page. Il en
          reste ce renvoi, parce que la question « et par rapport à ce que je
          m'étais fixé ? » se pose ici, une fois le réalisé lu. */}
      <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 20 }}>
        <button
          type="button"
          onClick={() => setPage?.("budget")}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6, minHeight: 40,
            padding: "0 16px", borderRadius: 999, border: "none",
            background: T.accentBg, color: T.text, fontSize: 14, fontWeight: 500,
            cursor: "pointer", fontFamily: "inherit",
          }}
        >
          {/* L'icône du BUDGET, celle de son entrée de navigation : un bouton
              qui mène ailleurs doit porter le signe de là où il mène. */}
          <ChartPie size={15} strokeWidth={1.75} /> {t("cashflow.openBudget")}
        </button>
      </div>
    </div>
  );
}

/**
 * Une des dernières opérations : d'où elle vient, ce qu'elle est, son montant.
 *
 * Le logo de l'enseigne quand on la reconnaît — le tableau des enseignes est
 * juste en dessous, la même vignette y répond. Sur un VIREMENT, où il n'y a pas
 * d'enseigne, c'est le logo de la banque d'en face : la question de cette page
 * est « d'où vient l'argent », et un virement y répond par un nom
 * d'établissement. À défaut, une flèche qui dit le SENS : dans une liste où
 * entrées et sorties se mêlent, le signe du montant seul se rate.
 */
function RecentRow({ tx }) {
  const credit = tx.amount >= 0;
  /* Les deux recherches portent sur des natures d'opération disjointes
     (cf. lib/bank/merchants) : l'enseigne sur les achats, la banque sur les
     virements. L'enseigne passe d'abord — un prélèvement vers une banque est un
     achat comme un autre, et c'est son nom canonique qu'on veut en titre. */
  const merchant = findMerchant(tx);
  const transferBank = merchant ? null : findTransferBank(tx);
  const brand = merchant || transferBank;
  const sub = subcategorizeTransaction(tx);
  const category = parentOfSub(sub);
  /* Le nom canonique ne remplace le libellé que pour une ENSEIGNE : sur un
     virement, le libellé nomme la PERSONNE, et sa banque ne doit pas prendre sa
     place — elle a déjà la vignette. */
  const title = merchant?.name || tx.label || t(kindLabelKey(tx.kind));

  return (
    <li style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 20px" }}>
      {brand ? (
        <MerchantAvatar merchant={brand} size={32} />
      ) : (
        <span aria-hidden="true" style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: 32, height: 32, flexShrink: 0, borderRadius: 999,
          background: T.accentBg, color: credit ? T.pnlPos : T.textSub,
        }}>
          {credit
            ? <ArrowDownLeft size={15} strokeWidth={1.75} />
            : <ArrowUpRight size={15} strokeWidth={1.75} />}
        </span>
      )}

      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 14, fontWeight: 500, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {title}
        </span>
        {/* Le jour, et le sous-poste quand on a su le nommer. « Autres » ne se
            dit pas : l'absence de classement n'apprend rien. */}
        <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, fontSize: 12, color: T.textSub }}>
          {category !== "other" && (
            <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: "50%", background: categoryColor(category), boxShadow: dotRing(categoryColor(category)), flexShrink: 0 }} />
          )}
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {[shortDay(tx.date), category === "other" ? null : t(subLabelKey(sub))].filter(Boolean).join(" · ")}
          </span>
        </span>
      </span>

      <span style={{
        flexShrink: 0, fontSize: 14, fontWeight: 600, fontVariantNumeric: "tabular-nums",
        color: credit ? T.pnlPos : T.text,
      }}>
        {fmt(tx.amount, true)}
      </span>
    </li>
  );
}

/**
 * Un poste : sa part et son montant, dépliable sur ses opérations.
 *
 * La ligne est celle des catégories du prévisionnel — pastille, nom, part,
 * montant, séparée par un filet — à ceci près que le plan se SAISIT et qu'ici le
 * poste se CONSTATE : la dernière colonne porte donc un chevron là où le plan met
 * le cadenas et la suppression, et la ligne entière est le bouton qui déplie.
 *
 * Replié par défaut : il y a une quinzaine de postes et on n'en ouvre qu'un —
 * tout déplier ferait de la page un relevé complet, ce que la fiche d'un compte
 * fait déjà mieux.
 */
function CategoryRow({ slice, txs }) {
  const [open, setOpen] = React.useState(false);
  const [all, setAll] = React.useState(false);
  const panelId = `poste-${slice.id}`;
  const label = t(categoryLabelKey(slice.id));
  const shown = all ? txs : txs.slice(0, TX_FOLDED);

  /* Pas de filet entre deux postes : les lignes portent déjà une vignette de
     couleur en tête, qui les sépare mieux qu'un trait — et quinze filets sur une
     carte font une grille là où on ne voulait qu'une liste. L'espacement des
     lignes suffit à les tenir distinctes. */
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls={panelId}
        style={{
          display: "flex", alignItems: "center", gap: 12, width: "100%",
          padding: "10px 20px", border: "none", background: "transparent",
          cursor: "pointer", fontFamily: "inherit", textAlign: "left",
        }}
      >
        <CategoryIcon category={slice.id} />
        {/* Exactement la ligne d'une enseigne : le nom, puis son nombre
            d'opérations en dessous. Les deux listes se lisent côte à côte, et
            deux mises en page différentes pour la même forme de donnée se
            remarquent tout de suite. */}
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "block", fontSize: 14, fontWeight: 500, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {label}
          </span>
          <span style={{ display: "block", fontSize: 12, color: T.textSub }}>
            {t("spending.nTxns").replace("{n}", String(slice.count))}
          </span>
        </span>
        {/* La part et le montant sont deux chiffres de nature différente : sans
            un vrai jour entre eux, ils se lisent comme une seule colonne. */}
        <span style={{ width: COL_PCT, flexShrink: 0, textAlign: "right", paddingRight: 16, fontSize: 14, color: T.textSub, fontVariantNumeric: "tabular-nums" }}>
          {Math.round(slice.pct)} %
        </span>
        <span style={{ width: COL_AMOUNT, flexShrink: 0, textAlign: "right", fontSize: 14, fontWeight: 600, color: T.text, fontVariantNumeric: "tabular-nums" }}>
          {fmt(slice.amount)}
        </span>
        <span
          aria-hidden="true"
          style={{
            width: COL_BTN, flexShrink: 0, display: "inline-flex",
            alignItems: "center", justifyContent: "flex-end", color: T.textMut,
          }}
        >
          <ChevronRight
            size={16}
            strokeWidth={1.75}
            style={{
              transform: open ? "rotate(90deg)" : "none",
              transition: "transform 200ms var(--ease-out, ease)",
            }}
          />
        </span>
      </button>

      {/* Monté seulement quand le poste est ouvert, et non replié par le CSS :
          quinze postes fermés qui gardent chacun leurs opérations dans le
          document, c'est une page entière lue à voix haute par un lecteur
          d'écran, et cent nœuds pour rien. Le prix est l'animation de hauteur,
          qu'on perd — le chevron, lui, tourne toujours. */}
      {open && (
        <div id={panelId}>
          {/* 64 px d'indentation : le bord de la carte (20), la vignette (32) et
              son espace (12), soit exactement là où commence le nom du poste. */}
          <ul style={{ listStyle: "none", margin: 0, padding: "0 20px 10px 64px", display: "flex", flexDirection: "column", gap: 8 }} className="anim-1">
            {shown.map((tx) => {
              const merchant = findMerchant(tx);
              return (
                <li key={tx.id} style={{ display: "flex", alignItems: "baseline", gap: 10, fontSize: 13 }}>
                  <span style={{ flexShrink: 0, width: 62, color: T.textMut, fontVariantNumeric: "tabular-nums" }}>
                    {shortDay(tx.date)}
                  </span>
                  <span style={{ flex: 1, minWidth: 0, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {/* Le nom canonique du marchand quand on le reconnaît :
                        « Carrefour » plutôt que « CARTE 12/08 CARREFOURCITY4979 ». */}
                    {merchant?.name || tx.label || t(kindLabelKey(tx.kind))}
                  </span>
                  <span style={{ flexShrink: 0, width: COL_AMOUNT, textAlign: "right", color: T.text, fontVariantNumeric: "tabular-nums" }}>
                    {fmt(-tx.amount)}
                  </span>
                  <span aria-hidden="true" style={{ width: COL_BTN, flexShrink: 0 }} />
                </li>
              );
            })}

            {txs.length > TX_FOLDED && (
              <li>
                <button
                  type="button"
                  onClick={() => setAll(!all)}
                  style={{
                    border: "none", background: "transparent", padding: 0, cursor: "pointer",
                    fontFamily: "inherit", fontSize: 13, color: T.textSub,
                  }}
                >
                  {all
                    ? t("spending.txLess")
                    : t("spending.txMore").replace("{n}", String(txs.length - TX_FOLDED))}
                </button>
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
