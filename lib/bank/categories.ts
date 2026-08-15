/**
 * Catégories de dépense — classement d'une opération bancaire par POSTE, puis
 * par SOUS-POSTE.
 *
 * `transactions.ts` classe déjà les opérations par NATURE (carte, virement,
 * prélèvement…). C'est le moyen de paiement, pas la destination de l'argent :
 * « carte » ne dit pas si l'on a fait des courses ou le plein. Ce module répond
 * à l'autre question — où part l'argent — et c'est celle-là qui alimente le
 * graphique des dépenses de la synthèse.
 *
 * DEUX NIVEAUX, parce que les deux questions ne sont pas la même :
 *   — le POSTE répond à « quelle part de mon argent va à me nourrir ? » ;
 *   — le SOUS-POSTE répond à « et là-dedans, qu'est-ce qui est du supermarché,
 *     du restaurant, du fast-food, de la livraison ? ».
 * L'anneau montre les postes — une quinzaine de parts se lit, cent ne se lit
 * pas. Les sous-postes se lisent sous chaque part, et sur chaque ligne du
 * relevé, là où la précision sert vraiment.
 *
 * Chaque règle vise un SOUS-POSTE ; le poste s'en déduit. Quand seule une règle
 * large a parlé, le sous-poste vaut le poste lui-même : c'est le « divers » de
 * ce poste, et il n'a pas besoin d'un identifiant à lui.
 *
 * Le classement se fait en TROIS passes, de la plus sûre à la plus lâche :
 *   1. les mots du libellé, nettoyé (ponctuation, chiffres soudés au nom) ;
 *   2. le MARCHAND reconnu par `lib/bank/merchants` — la table y est déjà tenue
 *      pour les logos, chaque enseigne y porte donc aussi son sous-poste ;
 *   3. la nature de l'opération, qui suffit pour un retrait ou des frais.
 * Ce qu'aucune des trois ne tranche reste « Autres », et doit le rester : un
 * classement faux se lit comme un classement vrai.
 *
 * Module PUR : pas d'import React, pas de dépendance serveur, et rien n'est
 * écrit nulle part. Le classement est RECALCULÉ à chaque lecture — il ne se
 * corrige donc pas à la main pour l'instant, ce qui suppose que les règles
 * ci-dessous restent lisibles et modifiables sans migration de données.
 */

import { findMerchant, type Merchant } from "@/lib/bank/merchants";
import { PALETTE, PALETTE_DARK, PALETTE_LIGHT, GREY } from "@/lib/ui/palette";
import type { BankTransaction } from "@/lib/bank/transactions";

export type SpendingCategory =
  | "housing"
  | "utilities"
  | "telecom"
  | "insurance"
  | "food"
  | "transport"
  | "fuel"
  | "car"
  | "travel"
  | "shopping"
  | "tech"
  | "beauty"
  | "health"
  | "sport"
  | "pets"
  | "leisure"
  | "subscriptions"
  | "education"
  | "kids"
  | "trading"
  | "savings"
  | "credit"
  | "taxes"
  | "fees"
  | "cash"
  | "transfer"
  | "income"
  | "other";

/** Un sous-poste, ou le poste lui-même quand la règle large a seule parlé. */
export type SpendingSubcategory = string;

/**
 * Les postes, dans l'ordre où on veut les lire, avec leur teinte.
 *
 * L'ordre suit des FAMILLES — le toit, la table, la route, les achats, le
 * corps, le temps libre, l'argent —, et les teintes les suivent : une famille
 * partage une gamme, ses postes s'y distinguent par la valeur (clair / sombre).
 * C'est ce qui permet de lire un anneau de vingt parts sans le déchiffrer part
 * par part : on voit d'abord où va la masse, on précise ensuite.
 *
 * Les teintes de l'alimentation, du transport, des abonnements, des loisirs et
 * de l'épargne sont exactement celles de la page Budget : un même poste doit
 * porter la même couleur des deux côtés, sinon les deux graphiques se
 * contredisent à l'œil.
 *
 * Les teintes viennent de la planche des graphiques (cf. lib/ui/palette), qui
 * donne huit couleurs principales pour vingt-huit postes. L'ordre de service
 * est celui du module : les huit principales d'abord, puis les huit sombres,
 * puis les huit claires, et les gris pour ce qui n'est pas un poste de vie
 * (assurance, frais, retraits, non-catégorisé). Vingt-huit valeurs, toutes
 * distinctes — c'est ce que vérifie tests/bankCategories.
 *
 * Une seule teinte est RÉSERVÉE : le bleu plein va aux revenus (`INCOME_COLORS`
 * plus bas), et aucun poste de dépense ne le prend — sans quoi le salaire et le
 * logement, qui sortent tous deux au palmarès presque tous les mois, arriveraient
 * de la même couleur de part et d'autre de la barre centrale. Le logement garde
 * la famille bleue, en version sombre.
 *
 * Un seul partage subsiste : « frais » et la barre centrale sont tous deux au
 * gris foncé. La planche n'a que quatre gris exploitables pour vingt-huit
 * postes, et « frais » est celui qui atteint le moins souvent le palmarès.
 *
 * Le rendu du Sankey délave déjà les rubans (`RIBBON_TINT` dans
 * components/ui/SankeyGraph.jsx). C'est là qu'on compense, pas ici : la valeur
 * y est passée de 0.58 à 0.25 pour que ces teintes arrivent à l'écran avec la
 * densité qu'avait l'ancienne palette.
 *
 * « Autres » garde le gris, réservé par convention au non-catégorisé : ce n'est
 * pas un poste de dépense, c'est l'aveu que la règle n'a pas tranché.
 */
export const SPENDING_CATEGORIES: { id: SpendingCategory; color: string }[] = [
  // Le toit — bleu, mais pas le bleu PLEIN : celui-là est aux revenus
  { id: "housing", color: PALETTE_DARK.blue },           // bleu sombre — page Budget
  { id: "utilities", color: PALETTE_LIGHT.blue },        // bleu clair
  { id: "telecom", color: PALETTE_LIGHT.orange },        // orange clair
  { id: "insurance", color: GREY.grey300 },              // gris clair : idem
  // La table — orange
  { id: "food", color: PALETTE.orange },                 // orange — page Budget
  // La route — brun, et le jaune pour ce qui n'est pas un trajet
  { id: "transport", color: PALETTE.brown },             // brun — page Budget
  { id: "fuel", color: PALETTE_DARK.brown },             // brun sombre
  { id: "car", color: PALETTE_DARK.orange },             // orange sombre
  { id: "travel", color: PALETTE.yellow },               // jaune — le voyage n'est pas un trajet
  // Les achats — rouge
  { id: "shopping", color: PALETTE.red },                // rouge
  { id: "tech", color: PALETTE_DARK.red },               // rouge sombre
  { id: "beauty", color: PALETTE_DARK.pink },            // rose sombre
  // Le corps — rose et vert
  { id: "health", color: PALETTE.pink },                 // rose
  { id: "sport", color: PALETTE_DARK.green },            // vert sombre
  { id: "pets", color: PALETTE_DARK.yellow },            // jaune sombre
  // Le temps libre — violet
  { id: "leisure", color: PALETTE_DARK.purple },         // violet sombre — page Budget
  { id: "subscriptions", color: PALETTE.purple },        // violet — page Budget
  { id: "education", color: PALETTE_LIGHT.purple },      // violet clair
  { id: "kids", color: PALETTE_LIGHT.pink },             // rose clair
  // L'argent
  { id: "trading", color: PALETTE_LIGHT.green },         // vert clair : le poste propre à tr4de
  { id: "savings", color: PALETTE.green },               // vert — page Budget
  { id: "credit", color: PALETTE_LIGHT.red },            // rouge clair
  { id: "taxes", color: PALETTE_LIGHT.brown },           // brun clair
  { id: "fees", color: GREY.grey900 },                   // gris foncé
  { id: "cash", color: PALETTE_LIGHT.yellow },           // jaune clair — les billets
  { id: "transfer", color: GREY.grey500 },               // gris clair : un virement interne
                                                         // ne dépense rien, il déplace
  { id: "income", color: PALETTE.blue },                 // le bleu des revenus : ce poste ne paraît
                                                         // jamais dans l'anneau des dépenses
  { id: "other", color: GREY.grey700 },                  // gris : le non-catégorisé
];

/**
 * Les sous-postes, groupés par poste et dans l'ordre où on veut les lire.
 *
 * Ils n'ont PAS de teinte propre : la couleur porte le poste, et vingt-huit
 * teintes tiennent déjà à peine dans un anneau — en distinguer quatre-vingts
 * ne distinguerait plus rien. Un sous-poste se lit par son nom, à côté de son
 * montant.
 *
 * Un poste sans sous-poste (assurances, frais, retraits, virements) n'en a pas
 * parce que le libellé ne permet pas d'y voir plus fin : inventer une division
 * qu'on ne sait pas remplir donnerait un « divers » à 100 %.
 */
export const SUBCATEGORIES: { id: SpendingSubcategory; category: SpendingCategory }[] = [
  { id: "housing.rent", category: "housing" },
  { id: "housing.charges", category: "housing" },
  { id: "housing.services", category: "housing" },

  { id: "utilities.power", category: "utilities" },
  { id: "utilities.water", category: "utilities" },

  { id: "telecom.mobile", category: "telecom" },
  { id: "telecom.internet", category: "telecom" },

  { id: "food.groceries", category: "food" },
  { id: "food.organic", category: "food" },
  { id: "food.market", category: "food" },
  { id: "food.restaurant", category: "food" },
  { id: "food.fastfood", category: "food" },
  { id: "food.delivery", category: "food" },
  { id: "food.cafe", category: "food" },

  { id: "transport.train", category: "transport" },
  { id: "transport.transit", category: "transport" },
  { id: "transport.ride", category: "transport" },
  { id: "transport.micro", category: "transport" },

  { id: "fuel.station", category: "fuel" },
  { id: "fuel.toll", category: "fuel" },

  { id: "car.maintenance", category: "car" },
  { id: "car.parking", category: "car" },
  { id: "car.rental", category: "car" },
  { id: "car.admin", category: "car" },

  { id: "travel.stay", category: "travel" },
  { id: "travel.flight", category: "travel" },
  { id: "travel.agency", category: "travel" },

  { id: "shopping.fashion", category: "shopping" },
  { id: "shopping.home", category: "shopping" },
  { id: "shopping.marketplace", category: "shopping" },
  { id: "shopping.discount", category: "shopping" },
  { id: "shopping.garden", category: "shopping" },

  { id: "tech.electronics", category: "tech" },
  { id: "tech.games", category: "tech" },

  { id: "beauty.hair", category: "beauty" },
  { id: "beauty.care", category: "beauty" },
  { id: "beauty.cosmetics", category: "beauty" },

  { id: "health.pharmacy", category: "health" },
  { id: "health.doctor", category: "health" },
  { id: "health.dental", category: "health" },
  { id: "health.optical", category: "health" },
  { id: "health.lab", category: "health" },
  { id: "health.cover", category: "health" },

  { id: "sport.gym", category: "sport" },
  { id: "sport.gear", category: "sport" },

  { id: "pets.vet", category: "pets" },
  { id: "pets.supplies", category: "pets" },

  { id: "leisure.cinema", category: "leisure" },
  { id: "leisure.live", category: "leisure" },
  { id: "leisure.culture", category: "leisure" },
  { id: "leisure.outing", category: "leisure" },
  { id: "leisure.betting", category: "leisure" },

  { id: "subscriptions.streaming", category: "subscriptions" },
  { id: "subscriptions.software", category: "subscriptions" },
  { id: "subscriptions.press", category: "subscriptions" },

  { id: "education.school", category: "education" },
  { id: "education.training", category: "education" },
  { id: "education.driving", category: "education" },

  { id: "kids.childcare", category: "kids" },
  { id: "kids.toys", category: "kids" },

  { id: "trading.propfirm", category: "trading" },
  { id: "trading.tools", category: "trading" },
  { id: "trading.broker", category: "trading" },

  { id: "savings.bank", category: "savings" },
  { id: "savings.invest", category: "savings" },
  { id: "savings.crypto", category: "savings" },

  { id: "credit.loan", category: "credit" },
  { id: "credit.consumer", category: "credit" },

  { id: "taxes.income", category: "taxes" },
  { id: "taxes.local", category: "taxes" },
  { id: "taxes.social", category: "taxes" },
  { id: "taxes.fine", category: "taxes" },

  /* Les ENTRÉES d'argent. Elles ne pèsent rien dans un anneau de dépenses — le
     poste « revenus » en est exclu — mais le flux du cashflow part d'elles : une
     seule source « Revenus » ferait un Sankey qui n'apprend rien, là où « salaire,
     aides, remboursements » dit d'où vient le mois. Leurs règles sont à part
     (`INCOME_RULES`) et ne s'appliquent qu'aux CRÉDITS. */
  { id: "income.salary", category: "income" },
  { id: "income.benefits", category: "income" },
  { id: "income.pension", category: "income" },
  { id: "income.refund", category: "income" },
  { id: "income.interest", category: "income" },
  { id: "income.sale", category: "income" },
];

const COLORS: Record<string, string> = Object.fromEntries(
  SPENDING_CATEGORIES.map((c) => [c.id, c.color]),
);

const SUB_PARENT: Record<string, SpendingCategory> = Object.fromEntries(
  SUBCATEGORIES.map((s) => [s.id, s.category]),
);

/** Teinte d'un poste. Le gris du non-catégorisé sert de repli. */
export const categoryColor = (id: SpendingCategory): string => COLORS[id] ?? COLORS.other;

/* Teintes des SOURCES de revenus. Le poste « revenus » n'a qu'une couleur — il
   ne paraît jamais dans un anneau de dépenses —, mais le flux du cashflow part
   de ses sources et il faut les distinguer les unes des autres.
   Le salaire prend le bleu plein, que les postes de dépense n'utilisent pas :
   c'est LA teinte réservée aux revenus, et elle doit rester reconnaissable d'un
   coup d'œil. Les autres sources s'en écartent sur les couleurs principales
   restantes, aucune en version sombre — de ce côté du diagramme, tout doit
   rester clair. Elles vivent à GAUCHE, les postes de dépense à droite :
   partager une teinte avec l'un d'eux ne prête pas à confusion.

   Le « divers » est le seul à ne pas nommer sa source. Il était gris, ce qui le
   faisait passer pour une erreur d'affichage plutôt que pour une entrée : il
   prend l'orange, la dernière principale libre du groupe. */
const INCOME_COLORS: Record<string, string> = {
  "income.salary": PALETTE.blue,           // bleu — la source principale
  "income.benefits": PALETTE_LIGHT.blue,   // bleu clair
  "income.pension": PALETTE.purple,        // violet
  "income.refund": PALETTE.pink,           // rose
  "income.interest": PALETTE.green,        // vert
  "income.sale": PALETTE.yellow,           // jaune
  income: PALETTE.orange,                  // orange — le crédit qu'on n'a pas su nommer
};

/** Teinte d'une source de revenus. Un sous-poste inconnu prend le vert du poste. */
export const incomeColor = (sub: SpendingSubcategory): string =>
  INCOME_COLORS[sub] ?? COLORS.income;

/* ── Accord avec la page Budget ────────────────────────────────────────────
   Les deux anneaux de la synthèse — le budget PRÉVU et les dépenses RÉELLES —
   se lisent l'un à côté de l'autre. Les teintes ci-dessus reprenaient celles du
   budget par DÉFAUT, mais l'utilisateur peut changer la couleur de chacune de
   ses catégories : son budget passait alors au vert quand les dépenses restaient
   au bleu, et les deux graphiques se contredisaient à l'œil.

   D'où cette dérivation : chaque poste de dépense déclare de quelle catégorie de
   budget il relève, et prend SA couleur. Les postes secondaires d'une même
   famille (électricité et télécom sous le logement, carburant sous le transport)
   n'en prennent pas la teinte exacte — trois parts identiques dans un anneau ne
   se distinguent plus — mais une variante calculée, plus claire ou plus sombre.
   La famille reste reconnaissable, les parts restent séparables.
   ------------------------------------------------------------------------ */

/** Catégorie de budget dont relève chaque poste. Les ids sont ceux de
 *  `defaultItems()` de la page Budget — ils ne changent pas quand l'utilisateur
 *  renomme une catégorie, seul le libellé le fait. */
export const BUDGET_FAMILY: Partial<Record<SpendingCategory, string>> = {
  housing: "logement", utilities: "logement", telecom: "logement", insurance: "logement",
  food: "alimentation",
  transport: "transport", fuel: "transport", car: "transport", travel: "transport",
  subscriptions: "abonnements",
  leisure: "loisirs", sport: "loisirs", education: "loisirs", kids: "loisirs",
  savings: "epargne", trading: "epargne",
};

/** Mélange vers le blanc (`t > 0`) ou vers le noir (`t < 0`), en sRGB. Suffisant
 *  ici : on cherche une variante reconnaissable, pas une rampe perceptuelle. */
function shade(hex: string, t: number): string {
  // Décalage nul : on rend la couleur du budget TELLE QUELLE, sans la
  // recomposer. Un recalcul renverrait la même teinte en minuscules, et une
  // comparaison de chaînes ailleurs y verrait deux couleurs différentes.
  if (t === 0) return String(hex);
  const h = String(hex).replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const to = t > 0 ? 255 : 0;
  const k = Math.abs(t);
  const out = [0, 2, 4].map((i) => {
    const v = parseInt(full.slice(i, i + 2), 16);
    return Math.round(v + (to - v) * k).toString(16).padStart(2, "0");
  });
  return `#${out.join("")}`;
}

/**
 * Poste qui porte la teinte EXACTE de sa catégorie de budget.
 *
 * À désigner explicitement, sans quoi c'est le premier déclaré dans
 * `SPENDING_CATEGORIES` qui l'emporte — et l'ordre de ce tableau suit les
 * familles de SENS, pas les catégories du budget : « sport » y précède
 * « loisirs » et récupérait donc le magenta des loisirs, laissant une variante
 * au poste qui donne son nom à la catégorie.
 */
const BUDGET_MAIN: Record<string, SpendingCategory> = {
  logement: "housing",
  alimentation: "food",
  transport: "transport",
  abonnements: "subscriptions",
  loisirs: "leisure",
  epargne: "savings",
};

/** Décalages successifs dans une famille : la teinte du budget, puis clair,
 *  sombre, très clair. Quatre suffisent — aucune famille n'a plus de postes. */
const FAMILY_STEPS = [0, 0.34, -0.26, 0.58];

/**
 * Teintes des postes, accordées au budget de l'utilisateur.
 *
 * `budgetColors` associe l'id d'une catégorie de budget à sa couleur. Un poste
 * dont la famille n'y figure pas — ou dont la couleur est absente — garde la
 * teinte de `SPENDING_CATEGORIES` : le repli est toujours une couleur valide.
 */
export function spendingPalette(
  budgetColors: Record<string, string | undefined> = {},
): Record<string, string> {
  const out: Record<string, string> = { ...COLORS };
  // Le poste principal d'abord, les autres ensuite : c'est ce qui garantit à la
  // catégorie du budget sa teinte exacte, quel que soit l'ordre de déclaration.
  const ordre = [...SPENDING_CATEGORIES].sort((a, b) => {
    const pa = BUDGET_MAIN[BUDGET_FAMILY[a.id] ?? ""] === a.id ? 0 : 1;
    const pb = BUDGET_MAIN[BUDGET_FAMILY[b.id] ?? ""] === b.id ? 0 : 1;
    return pa - pb;
  });

  const rang: Record<string, number> = {};
  for (const { id } of ordre) {
    const famille = BUDGET_FAMILY[id];
    const base = famille ? budgetColors[famille] : undefined;
    if (!famille || !base) continue;
    const n = rang[famille] ?? 0;
    rang[famille] = n + 1;
    out[id] = shade(base, FAMILY_STEPS[n] ?? FAMILY_STEPS[FAMILY_STEPS.length - 1]);
  }
  return out;
}

/** Clé i18n du libellé d'un poste. */
export const categoryLabelKey = (id: SpendingCategory): string => `patrimoine.cat.${id}`;

/** Poste d'un sous-poste. Un identifiant inconnu retombe sur « autres ». */
export const parentOfSub = (sub: SpendingSubcategory): SpendingCategory =>
  SUB_PARENT[sub] ?? (COLORS[sub] ? (sub as SpendingCategory) : "other");

/**
 * Clé i18n du libellé d'un sous-poste.
 *
 * Le catch-all d'un poste (sous-poste égal au poste) n'a pas de libellé à lui :
 * il se dit « Divers » sous sa part, et porte le nom du poste partout ailleurs.
 * C'est l'appelant qui choisit, selon qu'il affiche le sous-poste À CÔTÉ de son
 * poste ou tout seul.
 */
export const subLabelKey = (sub: SpendingSubcategory): string =>
  SUB_PARENT[sub] ? `patrimoine.sub.${sub}` : `patrimoine.cat.${sub}`;

/** Vrai quand le sous-poste n'est que le « divers » de son poste. */
export const isCatchAllSub = (sub: SpendingSubcategory): boolean => !SUB_PARENT[sub];

/* ── Le texte où l'on cherche ──────────────────────────────────────────────
   Un relevé n'est pas une phrase : c'est un code d'opération, une date, un
   numéro de carte, parfois un pays, et le nom du commerçant coincé au milieu —
   « CARTE 12/08 CARREFOURCITY4979 FR ». Chercher tel quel échoue deux fois sur
   trois : la ponctuation colle les mots, et les chiffres soudés au nom
   empêchent toute frontière de mot de tomber au bon endroit.
   ------------------------------------------------------------------------ */

/**
 * Texte comparable : minuscules, sans accents, sans ponctuation.
 *
 * Deux nettoyages, et deux seulement :
 *   — tout ce qui n'est ni lettre ni chiffre devient une espace, ce qui décolle
 *     « AMAZON*MKTP » et « SNCF-CONNECT » ;
 *   — les chiffres SOUDÉS à un mot sont détachés, sans quoi aucune frontière ne
 *     tombe entre « carrefour » et « 4979 » dans « CARREFOURCITY4979 » — c'est
 *     ce qui faisait tomber la moitié d'un relevé dans « Autres ».
 *
 * Les mots de service des banques (« CARTE », « PRLV SEPA ») sont VOLONTAIREMENT
 * conservés, contrairement à ce que fait la reconnaissance de marchand : ses
 * motifs sont courts et pourraient s'y accrocher, là où les règles ci-dessous
 * cherchent des expressions entières (« salle de sport », « échéance prêt ») que
 * ce ménage couperait en deux.
 */
function searchKey(...parts: (string | null | undefined)[]): string {
  return parts
    .filter(Boolean)
    .join(" ")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/([a-z])(\d)/g, "$1 $2")
    .replace(/(\d)([a-z])/g, "$1 $2")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/* ── Les règles ────────────────────────────────────────────────────────────
   Chaque SOUS-POSTE est une liste de termes, compilée en une seule expression.
   Un terme accroche dès le début d'un mot et n'exige pas de frontière à la
   fin : « carrefour » attrape « carrefourmarket », « boulanger » attrape
   « boulangerie ». Les termes trop courts ou trop communs portent alors un `\b`
   final explicite, sans quoi « bar » attraperait « barbier ».

   L'ORDRE FAIT LA RÈGLE : la première liste qui accroche gagne. Les cas
   ambigus sont donc rassemblés EN TÊTE, avant l'expression large qui les
   avalerait — « UBER EATS » est un repas et non un trajet, « TOTALENERGIES »
   une facture et non un plein, « AMAZON PRIME » un abonnement et non un achat.
   À l'intérieur d'un poste, ses sous-postes précis passent avant sa règle
   large, qui sert de « divers ».
   ------------------------------------------------------------------------ */

/** Une liste de termes en une expression : début de mot obligatoire, fin libre. */
const rule = (terms: string[]): RegExp => new RegExp(`\\b(?:${terms.join("|")})`);

const RULES: [sub: SpendingSubcategory, re: RegExp][] = [
  /* Les pièges d'abord : enseignes qui contiennent le nom d'une autre catégorie,
     ou qui appartiennent à un poste différent de celui que leur mot suggère. */
  ["food.delivery", rule([
    "uber ?eats", "ubereats", "deliveroo", "just ?eat", "frichti", "nestor", "foodora",
    "glovo", "getir", "gorillas", "flink", "cajoo", "too ?good ?to ?go", "hello ?fresh",
    "quitoque", "la ?belle ?vie", "potager ?city", "livraison ?repas",
  ])],
  ["utilities.power", rule(["total ?energies", "totalenergies"])],
  ["subscriptions.streaming", rule(["amazon ?prime", "prime ?video", "fnac ?plus", "darty ?max"])],
  ["food.market", rule(["boulangerie", "patisserie", "viennoiserie"])],

  /* Prop firms, courtiers et outils de trading — le poste propre à cette
     application. Un compte d'évaluation, son abonnement mensuel et les outils
     qui vont avec sont une dépense d'activité, pas des « Autres ». */
  ["trading.propfirm", rule([
    "ftmo", "the ?5 ?ers", "the5ers", "5 ?percenters", "my ?forex ?funds", "myforexfunds",
    "funded ?next", "fundednext", "funding ?pips", "fundingpips", "e8 ?funding", "e8 ?markets",
    "alpha ?capital", "the ?funded ?trader", "blue ?guardian", "goat ?funded", "maven ?trading",
    "ftuk", "city ?traders", "earn2trade", "leeloo", "bulenox", "trade ?day", "tradeday",
    "elite ?trader ?funding", "apex ?trader", "apextrader", "topstep", "take ?profit ?trader",
    "my ?funded ?futures", "myfundedfutures", "instant ?funding", "hola ?prime", "alpha ?futures",
    "tradeify", "funded ?trading", "prop ?firm", "propfirm",
  ])],
  ["trading.tools", rule([
    "ninja ?trader", "ninjatrader", "tradovate", "trading ?view", "tradingview", "rithmic",
    "metaquotes", "metatrader", "quantower", "sierra ?chart", "bookmap", "exocharts",
    "atas ?trading", "jigsaw ?trading", "edgeful",
  ])],
  ["trading.broker", rule([
    "ic ?markets", "pepperstone", "darwinex", "fusion ?markets", "vantage ?markets",
  ])],

  /* Prélèvements publics et crédits : jamais ambigus, et on ne veut pas les
     voir tomber dans « prélèvement » faute de mieux. */
  ["taxes.fine", rule(["amende", "antai", "contravention", "\\bfps\\b"])],
  ["taxes.social", rule(["urssaf", "cotisation ?fonciere", "\\brsi\\b", "cipav"])],
  ["taxes.local", rule([
    "taxe ?fonciere", "taxe ?habitation", "taxe ?dhabitation", "taxe ?sejour",
    "taxe ?ordures", "redevance",
  ])],
  ["taxes.income", rule([
    "impot", "dgfip", "dgfp", "tresor ?public", "finances ?publiques", "prelevement ?source",
    "\\btaxe", "douane", "greffe", "notaire",
  ])],
  ["credit.loan", rule([
    "echeance ?pret", "echeance ?credit", "remboursement ?pret", "remboursement ?credit",
    "mensualite", "pret ?immobilier", "pret ?auto", "capital ?restant",
  ])],
  ["credit.consumer", rule([
    "pret ?conso", "pret ?personnel", "credit ?conso", "credit ?renouvelable", "cofidis",
    "cetelem", "sofinco", "younited", "franfinance", "cofinoga", "floa", "oney",
  ])],

  /* Le corps. Les animaux AVANT la santé : « clinique vétérinaire » porte les
     deux mots, et c'est le vétérinaire qui tranche. La santé avant les
     assurances : une mutuelle est un frais de santé, pas une assurance de
     biens. */
  ["pets.vet", rule(["veterinaire", "\\bveto\\b", "\\bspa ?animaux"])],
  ["pets.supplies", rule([
    "animalerie", "animalis", "maxi ?zoo", "tom ?co", "wanimo", "zooplus", "croquettes",
    "toilettage",
  ])],
  ["health.pharmacy", rule(["pharmac", "parapharmac"])],
  ["health.dental", rule(["dentiste", "dentaire", "orthodont", "\\bmutuelle ?dentaire"])],
  ["health.optical", rule(["opticien", "optique", "krys", "afflelou", "grandoptical", "ophtalmo"])],
  ["health.lab", rule([
    "laboratoire", "biogroup", "cerballiance", "synlab", "radiologie", "imagerie",
    "analyses ?medicales", "\\bbiologie\\b",
  ])],
  ["health.cover", rule([
    "mutuelle", "mgen", "harmonie ?mutuelle", "malakoff", "ag2r", "cpam", "ameli",
    "assurance ?maladie", "\\bmsa\\b",
  ])],
  ["health.doctor", rule([
    "medecin", "docteur", "\\bdr\\b", "doctolib", "hopital", "hopitaux", "\\bchu\\b",
    "clinique", "kine", "osteopathe", "podologue", "dermato", "infirmier", "infirmiere",
    "psycholog", "orthophon", "vaccin", "ehpad", "\\bsante\\b", "medical",
  ])],
  ["beauty.hair", rule(["coiffeur", "coiffure", "barbier", "\\bsalon ?de ?coiffure"])],
  ["beauty.care", rule([
    "salon ?de ?beaute", "institut ?de ?beaute", "onglerie", "manucure", "esthetique",
    "estheticienne", "epilation", "\\bspa\\b", "hammam", "\\bnails\\b",
  ])],
  ["beauty.cosmetics", rule([
    "sephora", "nocibe", "marionnaud", "yves ?rocher", "kiko ?milano", "body ?shop",
    "\\blush\\b", "douglas ?parfum", "beauty ?success", "parfumerie",
  ])],

  /* Le toit. Télécom et assurances AVANT le logement : « Orange » et « AXA » ne
     sont pas des loyers, et la règle du logement est plus large qu'elles. */
  ["telecom.internet", rule([
    "freebox", "\\bbbox\\b", "livebox", "\\bfibre\\b", "abonnement ?internet", "\\badsl\\b",
  ])],
  ["telecom.mobile", rule([
    // Pas d'« internet » ici : sur une ligne de carte, le mot dit « achat en
    // ligne » et non « fournisseur d'accès » — « AIR FRANCE INTERNET » est un
    // billet d'avion.
    "\\bsfr\\b", "\\borange\\b", "bouygues", "\\bfree\\b", "\\bsosh\\b", "red ?by ?sfr",
    "prixtel", "nrj ?mobile", "lebara", "lycamobile", "syma", "forfait ?mobile", "telecom",
    "\\bmobile\\b",
  ])],
  ["insurance", rule([
    "assurance", "\\bassur", "\\bmaaf\\b", "\\bmacif\\b", "matmut", "\\bmaif\\b", "\\baxa\\b",
    "allianz", "\\bgmf\\b", "groupama", "generali", "\\bmma\\b", "swisslife", "april",
    "\\bluko\\b", "lemonade", "lolivier", "leocare", "acheel", "pacifica", "smacl",
    "prevoyance",
  ])],
  ["utilities.water", rule([
    "veolia", "\\bsuez\\b", "\\bsaur\\b", "\\beau\\b", "\\beaux\\b", "sedif", "assainissement",
  ])],
  ["utilities.power", rule([
    "\\bedf\\b", "engie", "\\beni\\b", "vattenfall", "mint ?energie", "ohm ?energie",
    "planete ?oui", "ekwateur", "octopus ?energy", "electricite", "\\bgaz\\b", "energie",
    "chauffage", "\\bfioul\\b",
  ])],
  ["housing.rent", rule(["loyer", "quittance", "\\bbail\\b", "bailleur", "\\bhlm\\b", "\\bopac\\b"])],
  ["housing.charges", rule([
    "syndic", "copropriete", "charges ?locatives", "foncia", "nexity", "citya", "oralia",
    "square ?habitat", "\\bsci\\b",
  ])],
  ["housing.services", rule([
    "demenagement", "garde ?meuble", "\\bstockage\\b", "menage", "serrurier", "plombier",
    "electricien", "\\bramonage\\b",
  ])],
  ["housing", rule([
    "immobilier", "agence ?immo", "logement", "residence", "caution", "habitat",
  ])],

  /* La route. Le voyage avant le transport : une compagnie aérienne réservée
     pour des vacances relève du voyage, pas du trajet quotidien. */
  ["travel.stay", rule([
    "booking ?com", "airbnb", "abritel", "hotels ?com", "\\bhotel", "\\bibis\\b", "novotel",
    "mercure", "\\baccor", "campanile", "kyriad", "premiere ?classe", "\\bgite\\b", "camping",
    "auberge", "hostelworld", "center ?parcs", "pierre ?et ?vacances", "belambra",
  ])],
  ["travel.flight", rule([
    "air ?france", "transavia", "easyjet", "ryanair", "vueling", "lufthansa", "\\bklm\\b",
    "volotea", "corsair", "skyscanner", "\\bkayak\\b", "aeroport", "\\bbagage",
  ])],
  ["travel.agency", rule([
    "expedia", "club ?med", "\\btui\\b", "\\bfram\\b", "nouvelles ?frontieres", "voyage",
    "sejour", "croisiere",
  ])],
  ["fuel.toll", rule([
    "peage", "autoroute", "sanef", "\\baprr\\b", "\\basf\\b", "vinci", "\\bulys\\b", "cofiroute",
  ])],
  ["fuel.station", rule([
    "essence", "carburant", "gazole", "gasoil", "\\bsp95\\b", "\\bsp98\\b", "station ?service",
    "\\besso\\b", "\\bshell\\b", "\\bbp\\b", "\\bavia\\b", "\\belan\\b", "\\bagip\\b",
    "\\btotal\\b", "\\bstation\\b",
  ])],
  ["car.parking", rule([
    "parking", "indigo", "\\beffia\\b", "onepark", "zenpark", "saemes", "\\bpark\\b",
    "stationnement", "horodateur",
  ])],
  ["car.rental", rule([
    "location ?voiture", "\\bhertz\\b", "avis ?location", "europcar", "\\bsixt\\b",
    "getaround", "rent ?a ?car", "ucar\\b",
  ])],
  ["car.admin", rule(["carte ?grise", "\\bants\\b", "controle ?technique", "dekra", "autosur", "securitest"])],
  ["car.maintenance", rule([
    "garage", "norauto", "feu ?vert", "midas", "speedy", "euromaster", "vulco", "first ?stop",
    "carrosserie", "\\bpneu", "pieces ?auto", "oscaro", "mister ?auto", "\\bpeugeot\\b",
    "\\brenault\\b", "citroen", "concession",
  ])],
  ["transport.train", rule([
    "sncf", "ouigo", "inoui", "\\btgv\\b", "trainline", "thalys", "eurostar", "flixbus",
    "blablacar", "\\btrain\\b", "billet ?de ?train",
  ])],
  ["transport.transit", rule([
    "\\bratp\\b", "navigo", "imagine ?r", "tisseo", "\\btcl\\b", "\\btan\\b", "\\btam\\b",
    "keolis", "transdev", "\\bmetro\\b", "\\bbus\\b", "\\btram\\b", "carte ?de ?transport",
  ])],
  ["transport.ride", rule(["\\buber\\b", "\\bbolt\\b", "\\btaxi", "\\bg7\\b", "heetch", "freenow", "\\bvtc\\b"])],
  ["transport.micro", rule(["velib", "\\blime\\b", "\\btier\\b", "\\bdott\\b", "cityscoot", "trottinette"])],
  ["transport", rule(["transport", "\\bpeage ?urbain"])],

  /* La table. Restaurants, fast-foods et cafés AVANT les supermarchés : « bar à
     salades » n'est pas une épicerie, et un traiteur n'est pas un hypermarché. */
  ["food.fastfood", rule([
    "mc ?do", "burger", "\\bkfc\\b", "subway", "\\bquick\\b", "five ?guys", "\\btacos",
    "\\bbchef\\b", "\\bkebab", "\\bpizza", "pizzeria", "\\bsnack", "food ?truck",
    "\\bwok\\b", "sandwich", "class ?croute", "brioche ?doree",
  ])],
  ["food.cafe", rule([
    "starbucks", "columbus ?cafe", "\\bcafe\\b", "\\bbar\\b", "\\bpub\\b", "brasserie",
    "salon ?de ?the", "brunch", "glacier", "\\bbistro",
  ])],
  ["food.restaurant", rule([
    "restaurant", "\\bresto", "traiteur", "creperie", "sushi", "\\bgrill\\b", "\\bthai\\b",
    "\\bsteak", "\\bcantine\\b", "\\btable\\b",
  ])],
  ["food.organic", rule(["biocoop", "naturalia", "vie ?claire", "\\bbio\\b", "\\bvrac\\b", "day ?by ?day"])],
  ["food.groceries", rule([
    "carrefour", "\\bcrf\\b", "leclerc", "intermarche", "\\bitm\\b", "super ?u", "hyper ?u",
    "\\bu ?express", "magasins ?u", "auchan", "\\blidl\\b", "\\baldi\\b", "\\bnetto\\b",
    "\\bdia\\b", "casino", "monoprix", "\\bmonop", "franprix", "grand ?frais", "picard",
    "thiriet", "\\bcora\\b", "colruyt", "\\bspar\\b", "\\bproxi\\b", "\\bvival\\b", "\\bg20\\b",
    "supermarche", "hypermarche", "superette", "epicerie", "alimentation",
  ])],
  ["food.market", rule([
    // Pas de « halles » : c'est un quartier avant d'être un marché, et « UGC
    // Ciné Cité Les Halles » est un cinéma.
    "boucherie", "charcuterie", "poissonnerie", "fromagerie", "primeur", "caviste",
    "\\bmarche\\b",
  ])],

  /* Les achats. Le sport avant le shopping — Décathlon n'est pas un magasin de
     mode —, et la high-tech avant le généraliste. */
  ["sport.gym", rule([
    "basic ?fit", "neoness", "keep ?cool", "on ?air", "fitness", "orange ?bleue",
    "salle ?de ?sport", "crossfit", "\\bgym\\b", "piscine", "patinoire", "\\btennis\\b",
    "escalade", "climb ?up", "arkose", "\\byoga\\b", "\\bjudo\\b", "karate",
  ])],
  ["sport.gear", rule([
    "decathlon", "intersport", "go ?sport", "\\bcourir\\b", "foot ?locker", "\\bnike\\b",
    "adidas", "\\basics\\b", "\\bpuma\\b", "running", "\\bsport\\b",
  ])],
  ["tech.games", rule([
    "micromania", "game ?stop", "playstation", "\\bxbox\\b", "nintendo", "epic ?games",
    "riot ?games", "\\bsteam\\b", "jeux ?video",
  ])],
  ["tech.electronics", rule([
    "\\bfnac\\b", "darty", "boulanger", "\\bldlc\\b", "materiel ?net", "top ?achat",
    "grosbill", "rue ?du ?commerce", "apple ?store", "samsung", "xiaomi", "back ?market",
    "\\bdell\\b", "lenovo", "logitech", "\\bhigh ?tech", "informatique", "electromenager",
  ])],
  ["shopping.fashion", rule([
    "\\bzara\\b", "h ?m\\b", "uniqlo", "kiabi", "primark", "\\bcelio\\b", "promod", "camaieu",
    "pimkie", "bershka", "pull ?bear", "stradivarius", "\\bmango\\b", "zalando", "\\basos\\b",
    "shein", "vinted", "chaussures", "vetement", "\\bpret ?a ?porter", "bijouterie",
  ])],
  ["shopping.home", rule([
    "\\bikea\\b", "leroy ?merlin", "castorama", "brico", "weldom", "conforama", "\\bbut\\b",
    "maison ?du ?monde", "maisons ?du ?monde", "alinea", "sostrene", "ameublement",
    "\\bdeco\\b", "literie",
  ])],
  ["shopping.marketplace", rule([
    "amazon", "\\bamzn\\b", "cdiscount", "la ?redoute", "\\btemu\\b", "aliexpress", "veepee",
    "showroomprive", "\\bebay\\b", "wish\\b", "leboncoin",
  ])],
  ["shopping.discount", rule([
    "\\baction\\b", "\\bgifi\\b", "centrakor", "foir ?fouille", "\\bhema\\b", "\\bnoz\\b",
    "stokomani", "bazar",
  ])],
  ["shopping.garden", rule(["jardiland", "truffaut", "gamm ?vert", "botanic", "jardinerie", "\\bfleuriste"])],
  ["shopping", rule([
    "galeries ?lafayette", "printemps", "\\bbhv\\b", "\\bshop", "boutique", "\\bgrand ?magasin",
  ])],

  /* Le temps libre. Les abonnements avant les loisirs : Netflix n'est pas une
     sortie, et une salle de cinéma n'est pas un abonnement. */
  ["subscriptions.streaming", rule([
    "netflix", "spotify", "deezer", "canal", "disney", "paramount", "\\bocs\\b", "molotov",
    "audible", "youtube", "twitch", "\\bmubi\\b", "apple ?music",
  ])],
  ["subscriptions.software", rule([
    "itunes", "icloud", "apple ?com", "apple ?services", "google", "microsoft", "office ?365",
    "adobe", "dropbox", "openai", "chatgpt", "anthropic", "claude ?ai", "github", "notion",
    "figma", "canva", "\\bsaas\\b", "licence ?logiciel", "abonnement",
  ])],
  ["subscriptions.press", rule([
    "\\blemonde\\b", "le ?monde", "\\bfigaro\\b", "liberation", "mediapart", "les ?echos",
    "\\bequipe\\b", "patreon", "substack", "linkedin", "\\bpresse\\b", "\\babonnement ?presse",
  ])],
  ["education.driving", rule(["auto ?ecole", "permis ?de ?conduire", "\\bcode ?de ?la ?route"])],
  ["education.school", rule([
    "universite", "\\becole\\b", "\\bcollege\\b", "\\blycee\\b", "\\bcrous\\b", "scolarite",
    "inscription ?pedago", "\\bcnam\\b", "\\bcned\\b",
  ])],
  ["education.training", rule([
    "formation", "udemy", "coursera", "openclassrooms", "acadomia", "kartable", "superprof",
    "\\bbafa\\b", "\\bmooc\\b",
  ])],
  ["kids.childcare", rule([
    "creche", "garderie", "periscolaire", "assistante ?maternelle", "\\bnounou\\b",
    "centre ?de ?loisirs", "pediatr", "\\bcaf\\b",
  ])],
  ["kids.toys", rule([
    "oxybul", "king ?jouet", "grande ?recre", "\\bjouet", "orchestra", "vertbaudet",
    "petit ?bateau", "\\baubert\\b", "puericulture",
  ])],
  ["leisure.cinema", rule(["cinema", "\\bugc\\b", "\\bpathe\\b", "gaumont", "\\bmk2\\b", "\\bcgr\\b", "kinepolis"])],
  ["leisure.live", rule([
    "theatre", "\\bopera\\b", "concert", "festival", "ticketmaster", "spectacle",
    "fnac ?spectacles", "billetreduc", "\\bdice\\b", "shotgun", "\\bcabaret",
  ])],
  ["leisure.culture", rule([
    "\\bmusee\\b", "exposition", "cultura", "nature ?et ?decouvertes", "librairie", "gibert",
    "momox", "\\blivre\\b", "mediatheque",
  ])],
  ["leisure.outing", rule([
    "bowling", "laser ?game", "escape ?game", "karaoke", "parc ?attraction", "disneyland",
    "\\bzoo\\b", "aquarium", "discotheque", "boite ?de ?nuit", "\\bloisirs\\b", "accrobranche",
  ])],
  ["leisure.betting", rule(["\\bfdj\\b", "\\bpmu\\b", "loterie", "winamax", "betclic", "unibet", "\\bparions"])],

  /* L'épargne et l'investissement : ce n'est pas de la consommation, mais ça
     sort du compte courant et ça doit se voir — le nier ferait mentir le total. */
  ["savings.crypto", rule(["coinbase", "binance", "kraken", "bitstamp", "bitpanda", "\\bcrypto", "ledger"])],
  ["savings.invest", rule([
    "\\bpea\\b", "assurance ?vie", "\\bper\\b", "linxea", "yomoni", "\\bnalo\\b", "ramify",
    "goodvest", "\\bscpi\\b", "\\bcorum\\b", "louve ?invest", "trade ?republic", "degiro",
    "bourse ?direct", "\\bsaxo\\b", "\\bbourse\\b",
  ])],
  ["savings.bank", rule([
    "livret", "\\bldds\\b", "\\blep\\b", "\\bpel\\b", "\\bcel\\b", "epargne", "versement",
  ])],
];

/* ── D'où vient l'argent ───────────────────────────────────────────────────
   Ces règles ne s'appliquent qu'aux CRÉDITS, et seulement après que les règles
   ci-dessus se sont tues. Deux raisons, et la seconde est la plus importante :

   • un mot d'entrée se retrouve tel quel sur des SORTIES — « remboursement prêt »
     est une mensualité, « versement livret » une épargne, « pension alimentaire »
     peut partir comme arriver. Les tester sur un débit reclasserait des dépenses
     en revenus ;
   • quand une règle de DÉPENSE reconnaît un crédit (le remboursement d'une
     pharmacie, un avoir chez un marchand), on veut qu'il reste sur SON poste,
     où il vient en déduction — c'est ce que fait `spendingByCategory`. Le voir
     ailleurs, en « revenus », gonflerait à la fois les entrées et les dépenses
     du mois. D'où l'ordre : les règles de dépense d'abord, celles-ci ensuite.

   Un crédit qu'aucune des deux listes n'attrape reste « income » tout court —
   le « divers » du poste. C'était le comportement de tout crédit avant ces
   règles ; elles ne font que le préciser quand le libellé le permet.

   Conséquence de cet ordre, et elle est VOULUE : les termes qu'une règle de
   dépense reconnaît déjà n'ont rien à faire ici, ils n'y seraient jamais
   atteints. Un remboursement de la Sécu (« CPAM », « mutuelle ») reste donc en
   déduction du poste santé, une allocation de la CAF en déduction du poste
   enfants, un virement Vinted en déduction du shopping. Ce sont bien des
   remboursements de ce qu'on a payé, pas des revenus de plus.

   Entre elles, comme dans `RULES` : la première liste qui accroche gagne, et les
   AMBIGUËS passent en tête. « Prime » est un salaire, sauf dans « prime
   d'activité » — d'où les aides avant les salaires. */
const INCOME_RULES: [sub: SpendingSubcategory, re: RegExp][] = [
  ["income.benefits", rule([
    "pole ?emploi", "france ?travail", "\\bassedic\\b", "allocation", "\\bapl\\b",
    "prime ?activite", "\\brsa\\b", "aide ?logement", "indemnite ?journaliere",
  ])],
  ["income.salary", rule([
    "salaire", "\\bpaie\\b", "\\bpaye\\b", "remuneration", "traitement", "\\bsolde ?mensuel",
    "bulletin ?de ?paie", "acompte ?salaire", "\\bprime\\b", "interessement", "participation",
    "honoraires", "\\bfacture ?client", "\\bfreelance\\b", "\\bmalt\\b", "\\bupwork\\b", "stripe",
  ])],
  ["income.pension", rule([
    "retraite", "\\bpension\\b", "\\bcarsat\\b", "\\bagirc\\b", "\\barrco\\b", "\\bcnav\\b",
    "\\bcnracl\\b", "\\bircantec\\b",
  ])],
  ["income.refund", rule([
    "remboursement", "\\bavoir\\b", "\\bretrocession", "\\bindemnisation", "sinistre",
    "\\btrop ?percu", "\\bdedommagement",
  ])],
  ["income.interest", rule([
    "interets", "dividende", "\\bcoupon\\b", "\\bplus ?value", "\\bfermage\\b",
  ])],
  ["income.sale", rule(["\\bvente\\b", "\\bcession\\b", "\\brevente\\b"])],
];

/**
 * Sous-poste d'une ENSEIGNE reconnue par `lib/bank/merchants`.
 *
 * Deuxième filet, après les mots du libellé : la table des marchands est tenue
 * pour les logos, mais elle sait déjà reconnaître des enseignes que les règles
 * ci-dessus n'attrapent pas toujours (variantes d'orthographe, motifs plus
 * larges). Lui donner son poste ne coûte qu'une ligne par marchand, et évite de
 * maintenir deux listes d'enseignes qui divergeraient.
 *
 * Les intermédiaires de paiement (PayPal, Stripe) n'y sont PAS : ils ne disent
 * rien du poste, seulement du moyen. Un achat PayPal doit rester « Autres »
 * plutôt que devenir un virement.
 */
const MERCHANT_SUB: Record<string, SpendingSubcategory> = {
  netflix: "subscriptions.streaming", spotify: "subscriptions.streaming",
  disney: "subscriptions.streaming", youtube: "subscriptions.streaming",
  canal: "subscriptions.streaming",
  apple: "subscriptions.software", google: "subscriptions.software",
  microsoft: "subscriptions.software", openai: "subscriptions.software",
  anthropic: "subscriptions.software", adobe: "subscriptions.software",
  steam: "tech.games",
  orange: "telecom.mobile", sfr: "telecom.mobile", free: "telecom.mobile",
  bouygues: "telecom.mobile",
  carrefour: "food.groceries", leclerc: "food.groceries", intermarche: "food.groceries",
  lidl: "food.groceries", aldi: "food.groceries", auchan: "food.groceries",
  monoprix: "food.groceries", franprix: "food.groceries", picard: "food.groceries",
  "super-u": "food.groceries", casino: "food.groceries",
  biocoop: "food.organic",
  "uber-eats": "food.delivery", deliveroo: "food.delivery", "just-eat": "food.delivery",
  mcdonalds: "food.fastfood", "burger-king": "food.fastfood", kfc: "food.fastfood",
  subway: "food.fastfood",
  starbucks: "food.cafe",
  sncf: "transport.train", blablacar: "transport.train",
  ratp: "transport.transit", uber: "transport.ride",
  "air-france": "travel.flight", airbnb: "travel.stay", booking: "travel.stay",
  total: "fuel.station", shell: "fuel.station", station: "fuel.station",
  autoroute: "fuel.toll",
  fnac: "tech.electronics", darty: "tech.electronics",
  decathlon: "sport.gear", nike: "sport.gear",
  ikea: "shopping.home", "leroy-merlin": "shopping.home",
  zalando: "shopping.fashion", zara: "shopping.fashion",
  cdiscount: "shopping.marketplace", amazon: "shopping.marketplace",
  sephora: "beauty.cosmetics",
  edf: "utilities.power", engie: "utilities.power", veolia: "utilities.water",
  doctolib: "health.doctor", pharmacie: "health.pharmacy",
  revolut: "transfer", boursorama: "transfer", "credit-agricole": "transfer",
  lydia: "transfer", n26: "transfer",
  binance: "savings.crypto", coinbase: "savings.crypto", "trade-republic": "savings.invest",
};

/** La forme minimale qu'une opération doit avoir pour être classée. */
export interface CategorizableTransaction {
  label?: string | null;
  detail?: string | null;
  /** Nature au sens de `transactions.ts` — sert de repli quand le libellé se tait. */
  kind?: string | null;
  /** Montant SIGNÉ : c'est lui qui distingue une entrée d'une dépense. */
  amount: number;
}

/** Repli par NATURE quand ni le libellé ni l'enseigne n'ont parlé. Une nature ne
 *  dit pas où va l'argent, mais « retrait » et « frais » sont des postes entiers. */
const KIND_FALLBACK: Record<string, SpendingCategory> = {
  fee: "fees",
  interest: "fees",
  withdrawal: "cash",
  transfer: "transfer",
  check: "transfer",
};

/**
 * Sous-poste d'une opération : mots du libellé, puis enseigne reconnue, puis
 * nature, « autres » à défaut.
 *
 * Une ENTRÉE d'argent n'est jamais une dépense : elle part en « revenus » sans
 * passer par les règles, sauf quand celles-ci reconnaissent un poste précis (un
 * remboursement de pharmacie reste de la santé, et le voir en déduction de son
 * poste vaut mieux que de le noyer dans les revenus).
 */
export function subcategorizeTransaction(tx: CategorizableTransaction): SpendingSubcategory {
  const text = searchKey(tx.label, tx.detail);

  if (text) {
    for (const [sub, re] of RULES) {
      if (re.test(text)) return sub;
    }
  }

  const merchant: Merchant | null = findMerchant(tx as BankTransaction);
  const byMerchant = merchant ? MERCHANT_SUB[merchant.slug] : undefined;
  if (byMerchant) return byMerchant;

  /* Un crédit : on cherche D'OÙ il vient, avec les règles réservées aux entrées.
     Elles ne passent qu'ici, en dernier recours — un crédit qu'une règle de
     dépense a reconnu reste sur son poste, en déduction (cf. `INCOME_RULES`). */
  if (tx.amount > 0) {
    if (text) {
      for (const [sub, re] of INCOME_RULES) {
        if (re.test(text)) return sub;
      }
    }
    return "income";
  }

  const kind = String(tx.kind ?? "");
  return KIND_FALLBACK[kind] ?? "other";
}

/** Poste d'une opération — le parent de son sous-poste. */
export const categorizeTransaction = (tx: CategorizableTransaction): SpendingCategory =>
  parentOfSub(subcategorizeTransaction(tx));

/* ── Agrégation ────────────────────────────────────────────────────────────── */

export interface SubSlice {
  id: SpendingSubcategory;
  amount: number;
  count: number;
}

export interface CategorySlice {
  id: SpendingCategory;
  color: string;
  /** Somme dépensée, en POSITIF — un graphique de dépenses ne se lit pas en négatif. */
  amount: number;
  /** Part du total dépensé, en %. */
  pct: number;
  /** Nombre d'opérations du poste, pour la légende. */
  count: number;
  /** Détail du poste, du plus gros au plus petit. Vide quand le poste n'a qu'un
   *  seul sous-poste : le répéter sous son propre nom n'apprendrait rien. */
  subs: SubSlice[];
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Dépenses réparties par poste puis par sous-poste, de la plus grosse à la plus
 * petite.
 *
 * Seuls les DÉBITS comptent : mêler les entrées ferait un camembert où le
 * salaire écrase tout le reste et où « 30 % » ne voudrait plus rien dire. Les
 * remboursements viennent en revanche EN DÉDUCTION de leur poste — un achat
 * annulé n'est pas une dépense —, ce qui peut ramener un poste à zéro ou en
 * dessous ; il disparaît alors du graphique plutôt que d'y tenir une part
 * négative, impossible à dessiner.
 *
 * `keepSingleSub` lève la règle du sous-poste unique. Par défaut, un poste qui
 * ne s'est réparti que sur un seul sous-poste rend une liste VIDE : sous
 * l'anneau des dépenses, « Logement 980 € » suivi de « Loyer 980 € » ne fait que
 * redire le même chiffre une ligne plus bas. Un diagramme de flux, lui, a une
 * colonne à remplir avec ce détail, et « Logement → Loyer » y APPREND quelque
 * chose : que tout le logement est du loyer. C'est à l'appelant de trancher,
 * parce que la réponse dépend de ce qu'il dessine.
 */
export interface SpendingOptions {
  /** Garder le détail d'un poste même quand il n'a qu'un seul sous-poste. */
  keepSingleSub?: boolean;
}

export function spendingByCategory(
  txs: CategorizableTransaction[],
  { keepSingleSub = false }: SpendingOptions = {},
): {
  slices: CategorySlice[];
  total: number;
  count: number;
} {
  const sums = new Map<SpendingCategory, { amount: number; count: number; subs: Map<string, SubSlice> }>();
  let count = 0;

  for (const tx of txs) {
    const sub = subcategorizeTransaction(tx);
    const category = parentOfSub(sub);
    // Les revenus et les mouvements nuls n'ont rien à faire dans des dépenses.
    if (category === "income" || tx.amount === 0) continue;

    const bucket = sums.get(category) ?? { amount: 0, count: 0, subs: new Map() };
    bucket.amount -= tx.amount; // le débit est négatif : la dépense est son opposé
    const inner = bucket.subs.get(sub) ?? { id: sub, amount: 0, count: 0 };
    inner.amount -= tx.amount;
    if (tx.amount < 0) {
      bucket.count += 1;
      inner.count += 1;
      count += 1;
    }
    bucket.subs.set(sub, inner);
    sums.set(category, bucket);
  }

  const positive = [...sums.entries()]
    .map(([id, b]) => ({
      id,
      color: categoryColor(id),
      amount: round2(b.amount),
      count: b.count,
      subs: [...b.subs.values()]
        .map((s) => ({ ...s, amount: round2(s.amount) }))
        .filter((s) => s.amount > 0)
        .sort((a, b2) => b2.amount - a.amount),
    }))
    .filter((s) => s.amount > 0)
    // Un seul sous-poste : c'est le poste lui-même, le détailler serait le
    // redire deux fois de suite avec le même chiffre — sauf si l'appelant a une
    // colonne à remplir avec (cf. `keepSingleSub`).
    .map((s) => ({ ...s, subs: keepSingleSub || s.subs.length > 1 ? s.subs : [] }));

  const total = round2(positive.reduce((s, p) => s + p.amount, 0));

  const slices = positive
    .map((s) => ({ ...s, pct: total > 0 ? (s.amount / total) * 100 : 0 }))
    .sort((a, b) => b.amount - a.amount);

  return { slices, total, count };
}
