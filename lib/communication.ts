/**
 * La chaîne de la communication — le domaine de la page du même nom.
 *
 * ── Le modèle ────────────────────────────────────────────────────────────
 * Parler n'est pas UNE compétence, c'est une chaîne de maillons qui se
 * transmettent le relais :
 *
 *   pensée → formulation → choix des mots → construction de la phrase →
 *   débit → livraison → réaction de l'autre → rebond
 *
 * Quand deux ou trois maillons cèdent, on en conclut « je ne sais pas
 * communiquer », et on s'entraîne donc à tout, c'est-à-dire à rien. La page
 * existe pour rendre la chaîne VISIBLE : on voit lequel casse, on travaille
 * celui-là.
 *
 * ── Ce que ce module refuse de faire ─────────────────────────────────────
 * Pas de score d'aisance calculé par l'app, pas de badge de « niveau atteint »
 * décerné par un compteur de clics. Aucun de ces chiffres n'existe : ce qui se
 * mesure ici, c'est le VOLUME de pratique (fait / pas fait) et l'auto-note
 * hebdomadaire que l'utilisateur pose lui-même. Un progrès en conversation ne
 * se constate pas dans un navigateur, il se constate en face de quelqu'un —
 * l'app tient le carnet, elle ne remet pas les notes.
 *
 * ── Le moteur : les preuves ──────────────────────────────────────────────
 * « J'attends d'avoir confiance pour parler » ne se réalise jamais. L'ordre
 * inverse, si : je parle → une petite interaction réussit → j'en garde la
 * trace → la trace s'accumule. `preuves` est donc la collection la plus
 * importante du magasin, et pas un journal décoratif.
 *
 * Tout est PUR ici (rien de React, rien du navigateur) pour que chaque règle
 * soit sous test : c'est le seul endroit où une erreur passerait inaperçue —
 * une séance mal composée ressemble à une séance.
 */

export const COMM_KEY = "tr4de_communication";
export const COMM_CLOUD_KEY = "communication";

/* ─── Les compétences ────────────────────────────────────────────────────── */

export interface Skill {
  id: string;
  label: string;
  /** Ce que la compétence veut dire, en une phrase qu'on peut se noter. */
  mesure: string;
  /** Priorité du diagnostic de départ, de 1 à 5 étoiles. */
  priorite: number;
}

/**
 * Les neuf compétences, dans l'ordre de la chaîne puis des usages.
 *
 * Ce sont EXACTEMENT celles de l'auto-évaluation : une compétence qu'on
 * entraîne sans jamais la noter ne se voit pas progresser, et une note qui ne
 * correspond à aucun exercice ne se rattrape pas. Chaque exercice pointe donc
 * vers l'une d'elles, et chacune reçoit au moins un exercice.
 */
export const SKILLS: Skill[] = [
  { id: "debit",        label: "Débit",         mesure: "Je parle à un rythme que l'autre peut suivre, et je m'arrête entre mes idées.", priorite: 5 },
  { id: "clarte",       label: "Clarté",        mesure: "Mes phrases ont un sujet, une action, une précision — et une idée à la fois.", priorite: 5 },
  { id: "vocabulaire",  label: "Vocabulaire",   mesure: "Je trouve le mot juste sans le chercher.", priorite: 4 },
  { id: "fluidite",     label: "Fluidité",      mesure: "Ça sort sans blocage ni béquille (« en fait », « enfin bref »).", priorite: 5 },
  { id: "conversation", label: "Conversation",  mesure: "Après une réponse, j'ai toujours quelque chose à dire.", priorite: 5 },
  { id: "storytelling", label: "Storytelling",  mesure: "Mes histoires ont un début, un problème, un moment fort — et une fin.", priorite: 5 },
  { id: "humour",       label: "Humour",        mesure: "Des associations me viennent sur le moment, et je les dis.", priorite: 3 },
  { id: "groupe",       label: "Groupe",        mesure: "J'entre dans une conversation à plusieurs au lieu de la regarder.", priorite: 5 },
  { id: "confiance",    label: "Confiance",     mesure: "Je parle sans attendre d'être sûr que ce sera bien reçu.", priorite: 5 },
];

export const skillById = (id: string): Skill | null => SKILLS.find(s => s.id === id) ?? null;

/* ─── La chaîne ──────────────────────────────────────────────────────────── */

export interface Maillon {
  label: string;
  /** La compétence qui tient ce maillon — c'est sa note qui le colore. */
  skill: string;
  /** Ce qui casse ICI, dit avec les mots qu'on emploie quand ça casse. */
  panne: string;
}

/**
 * Les huit maillons, dans l'ordre où le relais passe.
 *
 * Deux maillons peuvent dépendre de la même compétence (formuler et construire
 * relèvent tous deux de la clarté) : c'est voulu. La chaîne décrit un TRAJET,
 * l'auto-évaluation décrit des aptitudes ; forcer l'une à épouser l'autre
 * aurait fait disparaître soit un maillon qu'on reconnaît, soit une note qu'on
 * sait poser.
 */
export const CHAINE: Maillon[] = [
  { label: "Pensée",      skill: "conversation", panne: "Je ne sais pas quoi dire." },
  { label: "Formulation", skill: "clarte",       panne: "Je sais ce que je veux dire, ça sort mal." },
  { label: "Mots",        skill: "vocabulaire",  panne: "Je cherche le mot." },
  { label: "Phrase",      skill: "clarte",       panne: "J'empile les idées dans une seule phrase." },
  { label: "Débit",       skill: "debit",        panne: "Je me dépêche." },
  { label: "Livraison",   skill: "fluidite",     panne: "Ça bloque, je reprends, je perds le fil." },
  { label: "Réaction",    skill: "confiance",    panne: "Je guette son visage plus que mes mots." },
  { label: "Rebond",      skill: "conversation", panne: "Elle répond, et le vide revient." },
];

/* ─── Les niveaux ────────────────────────────────────────────────────────── */

export interface Niveau {
  n: number;
  label: string;
  /** Ce qu'on cherche à obtenir à ce niveau, et rien d'autre. */
  vise: string;
}

/**
 * Huit niveaux, plus le zéro.
 *
 * L'ordre n'est pas décoratif : l'élégance vient APRÈS la maîtrise. Travailler
 * l'humour ou le charisme sur un instrument qui se dépêche et empile les idées
 * revient à décorer une phrase que personne ne suit. La séquence est donc
 * clarté → fluidité → précision → élégance → spontanéité, et les niveaux la
 * suivent.
 */
export const NIVEAUX: Niveau[] = [
  { n: 0, label: "Reconstruire l'instrument", vise: "Ralentir, poser des pauses, respirer avant de répondre." },
  { n: 1, label: "Construire ses phrases",    vise: "Sujet, action, précision. Une idée par phrase." },
  { n: 2, label: "Vocabulaire actif",         vise: "Des mots qu'on utilise, pas des mots qu'on reconnaît." },
  { n: 3, label: "Ne plus jamais être bloqué", vise: "Quatre relances disponibles après n'importe quelle réponse." },
  { n: 4, label: "Suivre les fils",           vise: "Tirer cinq minutes de conversation d'une seule phrase." },
  { n: 5, label: "Storytelling",              vise: "L'architecture d'abord : contexte, objectif, problème, moment fort, fin." },
  { n: 6, label: "Retrouver son humour",      vise: "Associer vite, exagérer, contraster — et le dire sur le moment." },
  { n: 7, label: "Sortir du mode spectateur", vise: "Entrer UNE fois dans la conversation du groupe. Une phrase suffit." },
  { n: 8, label: "Maîtrise",                  vise: "Présence, teasing, silences, relancer une discussion morte." },
];

export const NIVEAU_MAX = NIVEAUX.length - 1;
export const niveauOf = (n: number): Niveau => NIVEAUX[Math.max(0, Math.min(NIVEAU_MAX, Math.round(n)))];

/** Les cinq étages de la progression, du premier au dernier. */
export const ETAGES = ["Clarté", "Fluidité", "Précision", "Élégance", "Spontanéité"];

/* ─── Les exercices ──────────────────────────────────────────────────────── */

/**
 * `voix`    — se fait à voix haute, seul. L'app minute et cadence.
 * `ecrit`   — se prépare par écrit dans la page, et se relit plus tard.
 * `terrain` — se fait avec de vraies personnes. L'app ne peut que le rappeler
 *             et en recueillir la preuve ; c'est le seul endroit où le progrès
 *             se joue vraiment.
 */
export type Forme = "voix" | "ecrit" | "terrain";

export interface Drill {
  id: string;
  label: string;
  skill: string;
  niveau: number;
  /** Minutes. Volontairement courtes : une séance qu'on saute n'entraîne rien. */
  duree: number;
  forme: Forme;
  /** La consigne, à l'impératif, telle qu'on se la donne. */
  consigne: string;
  /** Le piège de l'exercice — ce qui le rend inutile quand on s'y laisse aller. */
  garde?: string;
  /** De quoi lancer l'exercice : une réplique, une phrase à réparer, un sujet. */
  matiere?: string[];
  /** Les cases à remplir quand l'exercice produit un écrit. */
  champs?: string[];
}

/* La matière est écrite ici, dans le domaine, et pas dans la page : c'est elle
   qu'on corrigera le plus souvent (une réplique qui ne déclenche rien, une
   phrase à réparer trop facile), et une donnée qu'on corrige a besoin d'être
   sous test, pas dans un JSX de 600 lignes. */

export const DRILLS: Drill[] = [
  {
    id: "frein",
    label: "Le frein",
    skill: "debit",
    niveau: 0,
    duree: 5,
    forme: "voix",
    consigne: "Raconte ta journée à voix haute. Une phrase, puis une pause. Une phrase, puis une pause. Interdiction de te dépêcher.",
    garde: "Ça va sonner artificiel. C'est le but : on crée le contrôle d'abord, on le rendra naturel ensuite.",
  },
  {
    id: "souffle",
    label: "Deux secondes avant",
    skill: "debit",
    niveau: 0,
    duree: 3,
    forme: "voix",
    consigne: "Lis la question, laisse passer les deux secondes, puis réponds à voix haute. Le silence avant la réponse t'appartient.",
    garde: "Deux secondes de silence paraissent dix quand c'est toi qui les tiens. Personne d'autre ne les remarque.",
    matiere: [
      "Tu fais quoi dans la vie ?",
      "C'était comment ton week-end ?",
      "Tu écoutes quoi en ce moment ?",
      "Qu'est-ce qui t'a occupé cette semaine ?",
      "Tu connais du monde ici ?",
      "T'aimes bien ce que tu fais ?",
      "T'as des projets cet été ?",
      "Raconte-moi un truc.",
    ],
  },
  {
    id: "sans-bequille",
    label: "Sans béquille",
    skill: "fluidite",
    niveau: 0,
    duree: 4,
    forme: "voix",
    consigne: "Parle du sujet pendant 90 secondes sans « en fait », « du coup », « genre », « enfin bref ». À chaque béquille : tu t'arrêtes, tu respires, tu reprends la phrase depuis son début.",
    garde: "Le silence qui remplace la béquille n'est pas un trou : c'est le temps que l'autre prend pour te suivre. Les béquilles ne comblent pas un vide, elles le signalent.",
    matiere: [
      "Ce que tu as fait ce week-end.",
      "Un endroit où tu retournerais demain.",
      "Quelque chose que tu sais faire et que peu de gens savent faire.",
      "La dernière fois que tu as changé d'avis.",
      "Un truc que tu recommandes à tout le monde.",
      "Ce qui t'occupe l'esprit en ce moment.",
      "Une personne que tu admires, et pourquoi.",
      "Ce que tu ferais d'une journée entièrement libre.",
    ],
  },
  {
    id: "reparer",
    label: "Sujet, action, précision",
    skill: "clarte",
    niveau: 1,
    duree: 5,
    forme: "ecrit",
    consigne: "Voici une phrase qui empile. Réécris-la en trois phrases simples, puis dis-les à voix haute.",
    garde: "Simple ne veut pas dire pauvre. Phrase simple + idée claire bat toujours phrase compliquée + confuse.",
    champs: ["Première phrase", "Deuxième phrase", "Troisième phrase"],
    matiere: [
      "Moi en fait hier j'étais avec mes potes et puis après on est sorti enfin bref je sais plus trop.",
      "Du coup le prof il a dit qu'il fallait rendre le truc mais genre personne savait en vrai donc voilà on a fait comme on a pu.",
      "J'ai vu un film hier soir enfin c'était pas vraiment un film c'était plutôt une série mais bon c'était bien quoi.",
      "On devait partir tôt mais comme mon frère était pas prêt et qu'en plus il pleuvait ben finalement on est parti super tard et c'était mort.",
      "Il m'a raconté un truc de ouf hier mais en vrai je crois qu'il exagère un peu parce que son frère m'avait dit autre chose enfin bref.",
      "J'aimerais bien faire du sport mais j'ai pas trop le temps en ce moment avec les cours et tout donc je me dis que je verrai plus tard.",
      "La soirée était bien mais y'avait trop de monde et en plus la musique était nulle donc on est parti mais avant on a croisé Paul.",
      "Franchement ce jeu il est bien mais le problème c'est que les serveurs marchent jamais et du coup ben tu peux pas jouer avec tes potes.",
    ],
  },
  {
    id: "trois-phrases",
    label: "En trois phrases",
    skill: "clarte",
    niveau: 1,
    duree: 4,
    forme: "voix",
    consigne: "Résume à voix haute en EXACTEMENT trois phrases. Pas quatre. Tu t'arrêtes même si tu n'as pas tout dit.",
    garde: "Ce qui reste dehors n'est pas perdu : c'est ce qui rendait le récit illisible.",
    matiere: [
      "Ta journée d'hier.",
      "La dernière vidéo que tu as regardée en entier.",
      "Ce que tu fais dans la vie, pour quelqu'un qui n'y connaît rien.",
      "Le dernier film ou la dernière série que tu as vus.",
      "Ce à quoi tu as pensé en te levant ce matin.",
      "Le dernier truc qui t'a énervé.",
      "Ton week-end dernier.",
      "Ce que tu comptes faire de ta semaine.",
    ],
  },
  {
    id: "mot",
    label: "Le mot du jour",
    skill: "vocabulaire",
    niveau: 2,
    duree: 5,
    forme: "ecrit",
    consigne: "Un mot, cinq cases. Le mot n'est à toi que le jour où tu l'auras placé dans une vraie conversation.",
    garde: "Apprendre des listes ne sert à rien : on peut connaître cinq cents mots et continuer à chercher les siens.",
    champs: ["Le mot", "Définition", "Synonymes", "Contraire", "Une phrase à moi", "La réplique où je le placerai"],
  },
  {
    id: "relances",
    label: "Les quatre relances",
    skill: "conversation",
    niveau: 3,
    duree: 5,
    forme: "ecrit",
    consigne: "Quelqu'un vient de dire ça. Écris les quatre relances possibles. Tu n'as pas à trouver un sujet : il vient de t'en donner un.",
    garde: "Quatre portes ouvertes valent mieux qu'une réplique parfaite. On s'entraîne à les voir, pas à choisir.",
    champs: ["Approfondir — pourquoi ?", "Explorer — comment ça s'est passé ?", "Réagir — ah ouais, sérieux ?", "Associer — ça me fait penser à…"],
    matiere: [
      "J'ai commencé la boxe récemment.",
      "Je suis parti en Espagne cet été.",
      "J'ai changé de boulot il y a deux mois.",
      "Je me suis remis à la guitare.",
      "J'ai déménagé en septembre.",
      "J'ai passé le week-end chez mes parents.",
      "Je dors très mal en ce moment.",
      "J'ai arrêté les réseaux depuis un mois.",
      "On a adopté un chat.",
      "Je prépare un concours en parallèle.",
      "J'ai revu un pote que j'avais pas vu depuis dix ans.",
      "Je me suis mis à cuisiner.",
    ],
  },
  {
    id: "fil",
    label: "Le fil",
    skill: "conversation",
    niveau: 4,
    duree: 5,
    forme: "ecrit",
    consigne: "Pars de cette phrase et écris cinq maillons : chaque sujet naît du précédent. Sport → vacances → Espagne → nourriture → cuisine.",
    garde: "Une bonne conversation n'a pas de sujet principal, elle a des associations. Sauter n'est pas se perdre.",
    champs: ["1 →", "2 →", "3 →", "4 →", "5 →"],
    matiere: [
      "« Je suis parti en Espagne cet été. »",
      "« J'ai mangé dans un endroit incroyable hier. »",
      "« Je me lève à 5 h en ce moment. »",
      "« Mon frère vient d'avoir son permis. »",
      "« J'ai vu un documentaire sur les fonds marins. »",
      "« Il pleut depuis trois jours. »",
      "« J'ai racheté un vieux vélo. »",
      "« Je bosse avec quelqu'un d'insupportable. »",
    ],
  },
  {
    id: "histoire",
    label: "L'histoire en cinq temps",
    skill: "storytelling",
    niveau: 5,
    duree: 8,
    forme: "ecrit",
    consigne: "Prends une chose qui t'est vraiment arrivée. Range-la en cinq temps, puis raconte-la à voix haute en moins de 90 secondes.",
    garde: "L'architecture avant le style. Trop de détails, trop vite, et l'histoire n'existe plus — même quand elle est bonne.",
    champs: ["Contexte — où, quand ?", "Objectif — je voulais quoi ?", "Problème — qu'est-ce qui a mal tourné ?", "Moment fort", "Fin — et alors ?"],
  },
  {
    id: "association",
    label: "Association express",
    skill: "humour",
    niveau: 6,
    duree: 3,
    forme: "voix",
    consigne: "Lis la réplique. Dix secondes pour répondre à voix haute par une exagération, un contraste ou une observation. Ce qui sort, sort.",
    garde: "On n'entraîne pas des blagues préparées, on entraîne la vitesse d'association. « Quatre heures ? Donc t'es encore dans la journée d'hier. »",
    matiere: [
      "J'ai dormi quatre heures.",
      "J'ai mangé trois fois au kebab cette semaine.",
      "Je suis arrivé en retard, encore.",
      "J'ai passé six heures sur un jeu hier.",
      "Ma batterie est à 2 %.",
      "J'ai fait deux pas dehors et il s'est mis à pleuvoir.",
      "Je répète le même week-end depuis un mois.",
      "J'ai acheté un tapis de course, il sert à rien.",
      "Mon chat me réveille à 4 h tous les jours.",
      "J'ai oublié pourquoi j'ai ouvert le frigo.",
    ],
  },
  {
    id: "entrer",
    label: "Entrer une fois",
    skill: "groupe",
    niveau: 2,
    duree: 0,
    forme: "terrain",
    consigne: "Aujourd'hui, une seule mission : entrer UNE fois dans une conversation de groupe. Une phrase suffit.",
    garde: "L'objectif n'est pas de prendre le groupe. C'est d'y être entré une fois — le reste s'ajoute tout seul, plus tard.",
    matiere: [
      "« Vous parliez de quoi ? »",
      "« Attends, j'ai pas suivi — il s'est passé quoi ? »",
      "« Et toi, tu le connais comment ? »",
      "« Ah oui, je vois. » (puis tu écoutes)",
      "« Raconte, ça m'intéresse. »",
      "« Ça s'est fini comment, du coup ? »",
    ],
  },
  {
    id: "preuve",
    label: "La preuve du jour",
    skill: "confiance",
    niveau: 0,
    duree: 0,
    forme: "terrain",
    consigne: "Note une interaction qui s'est bien passée aujourd'hui, même minuscule. Une phrase placée, une question posée, un silence tenu.",
    garde: "La confiance ne précède pas la prise de parole, elle la suit. Ce carnet est l'endroit où la preuve s'accumule.",
  },
];

export const drillById = (id: string): Drill | null => DRILLS.find(d => d.id === id) ?? null;
export const drillsDuNiveau = (n: number): Drill[] => DRILLS.filter(d => d.niveau === n);

/* ─── Le magasin ─────────────────────────────────────────────────────────── */

export interface Fait {
  id: string;
  /** Jour, `AAAA-MM-JJ`. */
  date: string;
  drillId: string;
}

export interface Preuve {
  id: string;
  date: string;
  texte: string;
  /** La compétence que cette preuve atteste, si on a su le dire. */
  skill?: string | null;
}

export interface Mot {
  id: string;
  date: string;
  mot: string;
  definition: string;
  synonymes: string;
  contraire: string;
  phrase: string;
  replique: string;
  /** Jour où il a été placé dans une VRAIE conversation. Avant, il n'est pas acquis. */
  utiliseLe: string | null;
}

export interface Histoire {
  id: string;
  date: string;
  titre: string;
  contexte: string;
  objectif: string;
  probleme: string;
  momentFort: string;
  fin: string;
  /** Nombre de fois qu'elle a été racontée pour de vrai. */
  racontee: number;
}

export interface Travail {
  id: string;
  date: string;
  drillId: string;
  /** La matière tirée ce jour-là — sans elle, les réponses ne veulent rien dire. */
  matiere: string;
  reponses: string[];
}

export interface Evaluation {
  /** Le lundi de la semaine notée, `AAAA-MM-JJ`. */
  semaine: string;
  scores: Record<string, number>;
}

export interface CommStore {
  niveau: number;
  faits: Fait[];
  preuves: Preuve[];
  mots: Mot[];
  histoires: Histoire[];
  travaux: Travail[];
  evaluations: Evaluation[];
}

export const EMPTY_STORE: CommStore = {
  niveau: 0, faits: [], preuves: [], mots: [], histoires: [], travaux: [], evaluations: [],
};

const str = (v: unknown): string => (v == null ? "" : String(v));
const day = (v: unknown): string => str(v).slice(0, 10);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const int = (v: unknown, def = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : def;
};

/**
 * Le magasin, lisible quelle que soit la forme trouvée.
 *
 * NORMALISÉ à la lecture plutôt que migré : un champ ajouté plus tard prend sa
 * valeur par défaut chez les anciens enregistrements, sans migration ni schéma
 * à décrire (cf. CLAUDE.md, second étage de persistance).
 */
export function normalizeStore(raw: unknown): CommStore {
  const r = (raw || {}) as Record<string, unknown>;
  return {
    niveau: Math.max(0, Math.min(NIVEAU_MAX, int(r.niveau, 0))),
    faits: arr(r.faits)
      .map((v, i) => {
        const o = (v || {}) as Record<string, unknown>;
        const date = day(o.date);
        const drillId = str(o.drillId);
        if (!date || !drillId) return null;
        return { id: str(o.id) || `f${date}-${drillId}-${i}`, date, drillId } as Fait;
      })
      .filter((v): v is Fait => v !== null),
    preuves: arr(r.preuves)
      .map((v, i) => {
        const o = (v || {}) as Record<string, unknown>;
        const texte = str(o.texte).trim();
        if (!texte) return null;
        return {
          id: str(o.id) || `p${i}`,
          date: day(o.date),
          texte,
          skill: o.skill ? str(o.skill) : null,
        } as Preuve;
      })
      .filter((v): v is Preuve => v !== null)
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
    mots: arr(r.mots)
      .map((v, i) => {
        const o = (v || {}) as Record<string, unknown>;
        const mot = str(o.mot).trim();
        if (!mot) return null;
        return {
          id: str(o.id) || `m${i}`,
          date: day(o.date),
          mot,
          definition: str(o.definition),
          synonymes: str(o.synonymes),
          contraire: str(o.contraire),
          phrase: str(o.phrase),
          replique: str(o.replique),
          utiliseLe: o.utiliseLe ? day(o.utiliseLe) : null,
        } as Mot;
      })
      .filter((v): v is Mot => v !== null)
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
    histoires: arr(r.histoires)
      .map((v, i) => {
        const o = (v || {}) as Record<string, unknown>;
        const titre = str(o.titre).trim();
        if (!titre) return null;
        return {
          id: str(o.id) || `h${i}`,
          date: day(o.date),
          titre,
          contexte: str(o.contexte),
          objectif: str(o.objectif),
          probleme: str(o.probleme),
          momentFort: str(o.momentFort),
          fin: str(o.fin),
          racontee: Math.max(0, int(o.racontee, 0)),
        } as Histoire;
      })
      .filter((v): v is Histoire => v !== null)
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
    travaux: arr(r.travaux)
      .map((v, i) => {
        const o = (v || {}) as Record<string, unknown>;
        const drillId = str(o.drillId);
        if (!drillId) return null;
        return {
          id: str(o.id) || `t${i}`,
          date: day(o.date),
          drillId,
          matiere: str(o.matiere),
          reponses: arr(o.reponses).map(str),
        } as Travail;
      })
      .filter((v): v is Travail => v !== null)
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
    evaluations: arr(r.evaluations)
      .map(v => {
        const o = (v || {}) as Record<string, unknown>;
        const semaine = day(o.semaine);
        if (!semaine) return null;
        const src = (o.scores || {}) as Record<string, unknown>;
        const scores: Record<string, number> = {};
        for (const s of SKILLS) {
          const n = Number(src[s.id]);
          if (Number.isFinite(n)) scores[s.id] = Math.max(0, Math.min(10, Math.round(n)));
        }
        return { semaine, scores } as Evaluation;
      })
      .filter((v): v is Evaluation => v !== null)
      /* Les semaines sont rangées de la plus ANCIENNE à la plus récente : les
         courbes, les écarts et « la première note » se lisent tous dans ce
         sens, et le reste du magasin est déjà trié à l'envers pour la raison
         opposée (on veut le dernier retrait, la dernière preuve). */
      .sort((a, b) => a.semaine.localeCompare(b.semaine)),
  };
}

/* ─── Écritures ──────────────────────────────────────────────────────────── */

let seq = 0;
/** Identifiant unique sans dépendre de `crypto`, absent en test. */
export function newId(prefix = "c"): string {
  seq += 1;
  return `${prefix}${Date.now().toString(36)}${seq.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Marque un exercice comme fait ce jour-là. Deux fois le même jour ne compte qu'une. */
export function withFait(store: CommStore, date: string, drillId: string): CommStore {
  const d = day(date);
  if (store.faits.some(f => f.date === d && f.drillId === drillId)) return store;
  return { ...store, faits: [{ id: newId("f"), date: d, drillId }, ...store.faits] };
}

export function withoutFait(store: CommStore, date: string, drillId: string): CommStore {
  const d = day(date);
  return { ...store, faits: store.faits.filter(f => !(f.date === d && f.drillId === drillId)) };
}

export function withPreuve(store: CommStore, preuve: Omit<Preuve, "id">): CommStore {
  const texte = str(preuve.texte).trim();
  if (!texte) return store;
  return { ...store, preuves: [{ ...preuve, texte, id: newId("p") }, ...store.preuves] };
}

export function withoutPreuve(store: CommStore, id: string): CommStore {
  return { ...store, preuves: store.preuves.filter(p => p.id !== id) };
}

export function withMot(store: CommStore, mot: Omit<Mot, "id" | "utiliseLe">): CommStore {
  const m = str(mot.mot).trim();
  if (!m) return store;
  return { ...store, mots: [{ ...mot, mot: m, id: newId("m"), utiliseLe: null }, ...store.mots] };
}

/**
 * Le jour où un mot a été PLACÉ dans une vraie conversation.
 *
 * C'est la seule chose qui fasse passer un mot de « connu » à « à moi », et
 * c'est pour ça que ça se coche à la main : aucune donnée de l'app ne peut
 * l'observer. Recocher annule — on s'est trompé de ligne, ça arrive.
 */
export function withMotUtilise(store: CommStore, id: string, date: string): CommStore {
  return {
    ...store,
    mots: store.mots.map(m =>
      m.id === id ? { ...m, utiliseLe: m.utiliseLe ? null : day(date) } : m),
  };
}

export function withoutMot(store: CommStore, id: string): CommStore {
  return { ...store, mots: store.mots.filter(m => m.id !== id) };
}

export function withHistoire(store: CommStore, h: Omit<Histoire, "id" | "racontee">): CommStore {
  const titre = str(h.titre).trim();
  if (!titre) return store;
  return { ...store, histoires: [{ ...h, titre, id: newId("h"), racontee: 0 }, ...store.histoires] };
}

export function withHistoireRacontee(store: CommStore, id: string): CommStore {
  return {
    ...store,
    histoires: store.histoires.map(h => (h.id === id ? { ...h, racontee: h.racontee + 1 } : h)),
  };
}

export function withoutHistoire(store: CommStore, id: string): CommStore {
  return { ...store, histoires: store.histoires.filter(h => h.id !== id) };
}

export function withTravail(store: CommStore, t: Omit<Travail, "id">): CommStore {
  if (!t.reponses.some(r => str(r).trim())) return store;
  return { ...store, travaux: [{ ...t, id: newId("t") }, ...store.travaux] };
}

/** L'auto-note de la semaine. Une semaine déjà notée est REMPLACÉE, pas doublée. */
export function withEvaluation(store: CommStore, semaine: string, scores: Record<string, number>): CommStore {
  const s = day(semaine);
  const autres = store.evaluations.filter(e => e.semaine !== s);
  return normalizeStore({ ...store, evaluations: [...autres, { semaine: s, scores }] });
}

export function withNiveau(store: CommStore, n: number): CommStore {
  return { ...store, niveau: Math.max(0, Math.min(NIVEAU_MAX, Math.round(n))) };
}

/* ─── Lectures dérivées ──────────────────────────────────────────────────── */

/** Le lundi de la semaine d'un jour donné — la clé sous laquelle on note. */
export function lundiDe(date: string): string {
  const d = new Date(`${day(date)}T12:00:00`);
  if (isNaN(d.getTime())) return day(date);
  const jour = (d.getDay() + 6) % 7; // lundi = 0
  d.setDate(d.getDate() - jour);
  return d.toISOString().slice(0, 10);
}

const veille = (date: string): string => {
  const d = new Date(`${day(date)}T12:00:00`);
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
};

/**
 * Le nombre de jours consécutifs travaillés, aujourd'hui compris.
 *
 * La série ne casse PAS parce que la journée en cours est encore vide : tant
 * qu'hier est fait, elle tient. Une série qui tombe à zéro tous les matins au
 * réveil ne mesure rien et décourage tout.
 */
export function serie(store: CommStore, today: string): number {
  const jours = new Set(store.faits.map(f => f.date));
  let curseur = jours.has(day(today)) ? day(today) : veille(day(today));
  let n = 0;
  while (jours.has(curseur)) {
    n += 1;
    curseur = veille(curseur);
  }
  return n;
}

/** Les exercices faits un jour donné. */
export function faitsDuJour(store: CommStore, date: string): string[] {
  const d = day(date);
  return store.faits.filter(f => f.date === d).map(f => f.drillId);
}

/** La dernière auto-évaluation, ou `null` si on n'a jamais noté. */
export function derniereEvaluation(store: CommStore): Evaluation | null {
  return store.evaluations.length > 0 ? store.evaluations[store.evaluations.length - 1] : null;
}

export interface EtatSkill {
  skill: Skill;
  /** La note la plus récente, ou `null` tant que rien n'a été noté. */
  note: number | null;
  /** L'écart avec la toute première note — le seul chiffre de progrès honnête. */
  ecart: number | null;
  /** Toutes les notes, de la plus ancienne à la plus récente (pour la courbe). */
  suite: number[];
  /** Exercices faits qui visent cette compétence. */
  volume: number;
}

/** L'état de chaque compétence : sa note, son écart depuis le début, son volume. */
export function etatDesCompetences(store: CommStore): EtatSkill[] {
  const volumeParSkill = new Map<string, number>();
  for (const f of store.faits) {
    const d = drillById(f.drillId);
    if (!d) continue;
    volumeParSkill.set(d.skill, (volumeParSkill.get(d.skill) || 0) + 1);
  }
  return SKILLS.map(skill => {
    const suite = store.evaluations
      .map(e => e.scores[skill.id])
      .filter((n): n is number => Number.isFinite(n));
    const note = suite.length > 0 ? suite[suite.length - 1] : null;
    return {
      skill,
      note,
      ecart: suite.length > 1 ? suite[suite.length - 1] - suite[0] : null,
      suite,
      volume: volumeParSkill.get(skill.id) || 0,
    };
  });
}

/**
 * L'état d'un maillon de la chaîne.
 *
 * Trois états seulement, et pas une note sur dix : un maillon se lit d'un coup
 * d'œil ou ne sert à rien. `inconnu` tant que la compétence n'a jamais été
 * notée — dire « fragile » d'un maillon qu'on n'a pas encore regardé serait un
 * diagnostic inventé.
 */
export type EtatMaillon = "inconnu" | "fragile" | "en travail" | "solide";

export function etatDeLaChaine(store: CommStore): Array<{ maillon: Maillon; etat: EtatMaillon; note: number | null }> {
  const derniere = derniereEvaluation(store);
  return CHAINE.map(maillon => {
    const note = derniere && Number.isFinite(derniere.scores[maillon.skill]) ? derniere.scores[maillon.skill] : null;
    const etat: EtatMaillon =
      note == null ? "inconnu"
      : note <= 3 ? "fragile"
      : note <= 6 ? "en travail"
      : "solide";
    return { maillon, etat, note };
  });
}

/* ─── La séance du jour ──────────────────────────────────────────────────── */

/**
 * Un tirage STABLE dans la journée.
 *
 * Math.random() redonnerait une séance différente à chaque rendu — on la
 * relirait toute la journée sans jamais la faire. La graine est donc le jour
 * lui-même, plus le numéro de relance quand on demande expressément autre
 * chose.
 */
function graine(texte: string): number {
  let h = 2166136261;
  for (let i = 0; i < texte.length; i++) {
    h ^= texte.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/** Tire un élément d'une liste, toujours le même pour une même clé. */
export function tirage<T>(liste: T[], cle: string): T | null {
  if (!liste || liste.length === 0) return null;
  return liste[graine(cle) % liste.length];
}

/** La matière d'un exercice pour un jour donné (`roll` change de tirage). */
export function matiereDuJour(drill: Drill, date: string, roll = 0): string | null {
  if (!drill.matiere || drill.matiere.length === 0) return null;
  return tirage(drill.matiere, `${day(date)}|${drill.id}|${roll}`);
}

export interface Seance {
  date: string;
  /** Instrument, atelier, terrain — dans cet ordre, et c'est un ordre de travail. */
  drills: Drill[];
  /** Les identifiants déjà cochés aujourd'hui. */
  faits: string[];
}

/**
 * La séance du jour : trois exercices, jamais plus.
 *
 * L'ordre n'est pas négociable et raconte la méthode :
 *
 *   1. l'INSTRUMENT (voix) — on ralentit avant de vouloir bien dire ;
 *   2. l'ATELIER (niveau courant) — la compétence du moment, en atelier ;
 *   3. le TERRAIN — la seule chose qui fasse vraiment progresser, et la seule
 *      que l'app ne peut pas faire à ta place.
 *
 * L'atelier est tiré parmi les exercices DÉBLOQUÉS, en préférant celui dont la
 * compétence est la plus mal notée : un programme qui ferait tourner les neuf
 * compétences à égalité passerait l'essentiel de son temps sur ce qui va déjà.
 * À notes égales, le tirage du jour tranche — on ne veut pas non plus du même
 * exercice tous les jours.
 */
export function seanceDuJour(store: CommStore, date: string, roll = 0): Seance {
  const d = day(date);
  const debloque = (dr: Drill) => dr.niveau <= store.niveau;
  const notes = new Map<string, number>();
  const derniere = derniereEvaluation(store);
  if (derniere) for (const [k, v] of Object.entries(derniere.scores)) notes.set(k, v);

  /* Une compétence jamais notée passe pour moyenne (5) et non pour excellente :
     sans ça, un utilisateur qui n'a pas encore rempli son auto-évaluation ne
     verrait jamais sortir les exercices des compétences qu'il ignore. */
  const noteDe = (dr: Drill) => notes.get(dr.skill) ?? 5;

  const choisir = (candidats: Drill[], cle: string): Drill | null => {
    const ouverts = candidats.filter(debloque);
    const pool = ouverts.length > 0 ? ouverts : candidats;
    if (pool.length === 0) return null;
    const min = Math.min(...pool.map(noteDe));
    const faibles = pool.filter(dr => noteDe(dr) === min);
    return tirage(faibles, `${d}|${cle}|${roll}`);
  };

  const instrument = choisir(DRILLS.filter(dr => dr.forme === "voix" && dr.niveau === 0), "instrument");
  /* L'atelier vient du niveau courant quand celui-ci propose quelque chose, et
     sinon de tout ce qui est débloqué : un niveau qui n'a que du terrain (le 7)
     ne doit pas rendre la séance vide.

     L'exercice DÉJÀ tiré comme instrument est écarté d'office. Au niveau 0, les
     deux puisent dans le même vivier (tout y est du travail de voix) : sans
     cette exclusion, la séance du débutant — celui qui en a le plus besoin —
     sortait à deux exercices au lieu de trois. */
  const duNiveau = DRILLS.filter(dr =>
    dr.niveau === store.niveau && dr.forme !== "terrain" && dr.id !== instrument?.id);
  const atelier = choisir(
    duNiveau.length > 0 ? duNiveau : DRILLS.filter(dr => dr.forme !== "terrain" && dr.id !== instrument?.id),
    "atelier",
  );
  const terrain = choisir(DRILLS.filter(dr => dr.forme === "terrain"), "terrain");

  const drills: Drill[] = [];
  for (const dr of [instrument, atelier, terrain]) {
    if (dr && !drills.some(x => x.id === dr.id)) drills.push(dr);
  }
  return { date: d, drills, faits: faitsDuJour(store, d) };
}

/* ─── Passage de niveau ──────────────────────────────────────────────────── */

export interface EtatNiveau {
  niveau: Niveau;
  /** Exercices de ce niveau déjà faits. */
  volume: number;
  /** Ce qu'on attend avant de proposer la suite. */
  volumeAttendu: number;
  /** La note de la compétence principale du niveau, si elle existe. */
  note: number | null;
  noteAttendue: number;
  /** Les deux conditions sont tenues : la page PROPOSE de passer. */
  pret: boolean;
}

/**
 * Faut-il proposer le niveau suivant ?
 *
 * Deux conditions, et aucune n'est un score d'aisance : du VOLUME (on a
 * pratiqué) et une AUTO-NOTE (on se sent mieux). L'app ne décide rien — elle
 * propose, le bouton reste à l'utilisateur. Un logiciel qui décrète « niveau 4
 * atteint » parce qu'on a cliqué douze fois se trompe sur ce qu'il observe.
 */
export function etatDuNiveau(store: CommStore): EtatNiveau {
  const niveau = niveauOf(store.niveau);
  const duNiveau = new Set(drillsDuNiveau(niveau.n).map(d => d.id));
  const volume = store.faits.filter(f => duNiveau.has(f.drillId)).length;
  const skills = new Set(drillsDuNiveau(niveau.n).map(d => d.skill));
  const derniere = derniereEvaluation(store);
  const notes = derniere
    ? [...skills].map(s => derniere.scores[s]).filter((n): n is number => Number.isFinite(n))
    : [];
  const note = notes.length > 0 ? Math.min(...notes) : null;
  const volumeAttendu = 10;
  const noteAttendue = 6;
  return {
    niveau,
    volume,
    volumeAttendu,
    note,
    noteAttendue,
    pret: niveau.n < NIVEAU_MAX && volume >= volumeAttendu && note != null && note >= noteAttendue,
  };
}
