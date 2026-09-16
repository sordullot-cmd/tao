/**
 * Le parcours de communication — le domaine de la page du même nom.
 *
 * ── Ce que le plan a d'inhabituel ────────────────────────────────────────
 * Il refuse de tout travailler en même temps. Huit compétences se perturbent
 * entre elles : chercher le mot parfait ralentit la phrase, une phrase qui
 * s'allonge fait accélérer le débit, un débit qui s'emballe empêche d'écouter,
 * et ne pas écouter coupe le rebond. Les monter ensemble revient à n'en monter
 * aucune. Le parcours les prend donc DANS L'ORDRE, en dix phases, et une seule
 * compétence est « celle du jour » à un moment donné.
 *
 * C'est la seule chose que ce module impose vraiment, et c'est pour ça qu'elle
 * est ici plutôt que dans l'interface : la séance du jour se compose à partir
 * de la PHASE COURANTE, jamais à partir de ce qui va le plus mal. Un programme
 * qui courrait après la compétence la plus basse reviendrait à travailler les
 * huit à la fois, par la bande.
 *
 * ── La séance, en cinq temps ─────────────────────────────────────────────
 *   ① échauffement  — élocution, formulation. Toujours, quelle que soit la phase.
 *   ② compétence    — UNE seule, celle de la phase.
 *   ③ simulation    — une vraie conversation, avec ses aléas.
 *   ④ débrief       — ce qui a cloché, nommé précisément.
 *   ⑤ mission       — dehors. Vérifiée à la séance SUIVANTE, pas cochée le soir
 *                     même : c'est la seule façon de savoir si ça a été fait.
 *
 * ── Ce que ce module refuse de faire ─────────────────────────────────────
 * Aucun score d'aisance calculé, aucune phase décernée par un compteur de
 * clics. Ce qui se mesure : le VOLUME de pratique, les FAUTES qu'on se relève
 * soi-même en débrief, et l'auto-note hebdomadaire. Le progrès en conversation
 * se constate en face de quelqu'un — l'app tient le carnet, elle ne remet pas
 * les notes.
 *
 * Tout est pur ici (rien de React, rien du navigateur) : une séance mal
 * composée ressemble à une séance, et c'est le genre d'erreur qu'on ne voit
 * pas à l'écran.
 */

export const COMM_KEY = "tr4de_communication";
export const COMM_CLOUD_KEY = "communication";

/* ─── Les huit compétences ───────────────────────────────────────────────── */

/** Le point de départ observé, tel quel : rouge = à construire, orange = amorcé. */
export type Feu = "rouge" | "orange" | "vert";

export interface Skill {
  id: string;
  label: string;
  /** Ce que la compétence veut dire, dans des termes qu'on peut se noter. */
  mesure: string;
  /** L'état au premier jour. Il ne bouge JAMAIS : c'est la ligne de départ. */
  depart: Feu;
}

/**
 * Les huit, dans l'ordre où le parcours les prend.
 *
 * Le départ n'est pas une note que l'app aurait calculée : c'est le diagnostic
 * posé au début, gardé tel quel. Il sert de repère fixe — sans lui, une
 * auto-note à 5 ne dit pas si l'on vient de 2 ou de 8.
 */
export const SKILLS: Skill[] = [
  { id: "clarte",       label: "Clarté",             depart: "rouge",  mesure: "Une idée par phrase, et je termine celle que j'ai commencée." },
  { id: "debit",        label: "Contrôle du débit",  depart: "rouge",  mesure: "Je ralentis, je pose des pauses, je tolère le silence." },
  { id: "formulation",  label: "Formulation",        depart: "orange", mesure: "Je prends le mot précis qui me vient, pas le mot parfait que je cherche." },
  { id: "conversation", label: "Conversation",       depart: "orange", mesure: "Je sais quelle branche prendre, sans chercher un nouveau sujet." },
  { id: "storytelling", label: "Storytelling",       depart: "rouge",  mesure: "Mes histoires tiennent une direction et une durée." },
  { id: "groupes",      label: "Groupes",            depart: "rouge",  mesure: "J'entre, je reprends la parole, je fais participer." },
  { id: "humour",       label: "Humour",             depart: "orange", mesure: "Des associations me viennent sur le moment, et je les dis." },
  { id: "confiance",    label: "Confiance",          depart: "orange", mesure: "Je parle sans guetter l'approbation." },
];

export const skillById = (id: string): Skill | null => SKILLS.find(s => s.id === id) ?? null;

/** Le feu d'une note sur dix. Trois états : un indicateur se lit d'un coup d'œil. */
export const feuDe = (note: number | null): Feu | null =>
  note == null ? null : note <= 3 ? "rouge" : note <= 6 ? "orange" : "vert";

/* ─── La chaîne ──────────────────────────────────────────────────────────── */

export interface Maillon {
  label: string;
  skill: string;
  /** Ce qui casse ICI, dit avec les mots qu'on emploie quand ça casse. */
  panne: string;
}

/**
 * Les huit maillons du trajet d'une phrase, dans l'ordre du relais.
 *
 * La chaîne n'est pas le programme (c'est le rôle des phases) : c'est le
 * DIAGNOSTIC. Elle dit où le relais tombe, en mots qu'on reconnaît — « je me
 * dépêche » se reconnaît, « débit : 4/10 » ne se reconnaît pas. Deux maillons
 * peuvent dépendre de la même compétence : un trajet et une aptitude ne se
 * découpent pas pareil, et forcer l'un à épouser l'autre ferait disparaître
 * soit un maillon qu'on vit, soit une note qu'on sait poser.
 */
export const CHAINE: Maillon[] = [
  { label: "Pensée",      skill: "conversation", panne: "Je ne sais pas quelle branche prendre." },
  { label: "Formulation", skill: "formulation",  panne: "Je commence une phrase, je la change en route." },
  { label: "Mots",        skill: "formulation",  panne: "Je cherche le mot parfait." },
  { label: "Phrase",      skill: "clarte",       panne: "J'empile deux idées dans une seule phrase." },
  { label: "Débit",       skill: "debit",        panne: "Je me dépêche." },
  { label: "Livraison",   skill: "clarte",       panne: "Je reprends depuis le début, je perds le fil." },
  { label: "Réaction",    skill: "confiance",    panne: "Je guette son visage plus que mes mots." },
  { label: "Rebond",      skill: "conversation", panne: "Elle répond, et le vide revient." },
];

/* ─── Les dix phases ─────────────────────────────────────────────────────── */

export interface Phase {
  n: number;
  label: string;
  /** La fenêtre indicative du parcours — un repère, pas une échéance. */
  semaines: string;
  /** Les mêmes bornes en nombres, pour situer la semaine courante. */
  de: number;
  a: number;
  /** Ce qu'on cherche à obtenir, et rien d'autre. */
  objectif: string;
  /** LA compétence de la phase. Une seule, c'est tout le principe. */
  skill: string;
  /** Ce qu'on met volontairement de côté pendant cette phase. */
  ecarte?: string;
}

export const PHASES: Phase[] = [
  {
    n: 1, label: "Clarté", semaines: "Semaines 1–2", de: 1, a: 2, skill: "clarte",
    objectif: "Parler proprement avant de chercher à parler brillamment.",
    ecarte: "Le charisme et l'humour attendent. Ils décorent une phrase qu'on ne suit pas encore.",
  },
  {
    n: 2, label: "Contrôle de la parole", semaines: "Semaines 3–4", de: 3, a: 4, skill: "debit",
    objectif: "Passer de « pensée → panique → parole rapide → correction » à « pensée → pause → phrase → pause ».",
  },
  {
    n: 3, label: "Formulation & vocabulaire", semaines: "Semaines 5–7", de: 5, a: 7, skill: "formulation",
    objectif: "Choisir un mot, pas accumuler du vocabulaire.",
    ecarte: "Pas de listes de cinq cents mots : on peut tous les connaître et continuer à chercher les siens.",
  },
  {
    n: 4, label: "Conversation", semaines: "Semaines 8–11", de: 8, a: 11, skill: "conversation",
    objectif: "Tenir une conversation sans chercher un nouveau sujet : extraire plusieurs conversations d'un seul.",
  },
  {
    n: 5, label: "Parler avec n'importe qui", semaines: "Semaines 12–15", de: 12, a: 15, skill: "conversation",
    objectif: "Le bavard, le silencieux, l'inconnu, celui que ça n'intéresse pas — et savoir quand s'arrêter.",
  },
  {
    n: 6, label: "Groupes", semaines: "Semaines 16–19", de: 16, a: 19, skill: "groupes",
    objectif: "Entrer sans attendre le moment parfait, reprendre la parole, faire participer les autres.",
  },
  {
    n: 7, label: "Storytelling", semaines: "Semaines 20–23", de: 20, a: 23, skill: "storytelling",
    objectif: "Contexte → objectif → problème → escalade → résultat. Court, clair, mémorable.",
    ecarte: "Le suspense, le rythme, la punchline viennent après la structure — jamais avant.",
  },
  {
    n: 8, label: "Humour & spontanéité", semaines: "Semaines 24–27", de: 24, a: 27, skill: "humour",
    objectif: "L'humour de conversation : exagérer, taquiner, observer, associer, rappeler, rire de soi.",
  },
  {
    n: 9, label: "Présence & confiance", semaines: "Semaines 28–32", de: 28, a: 32, skill: "confiance",
    objectif: "Regard, posture, voix, silence, place prise — et ne plus chercher l'approbation.",
    ecarte: "Ici seulement : des techniques de confiance n'entrent pas dans une tête encore occupée à construire ses phrases.",
  },
  {
    n: 10, label: "Maîtrise", semaines: "Ensuite", de: 33, a: 52, skill: "confiance",
    objectif: "Tout mélangé, sans correction phrase par phrase. On regarde la conversation entière.",
  },
];

export const PHASE_MIN = 1;
export const PHASE_MAX = PHASES.length;
export const phaseOf = (n: number): Phase =>
  PHASES[Math.max(0, Math.min(PHASE_MAX - 1, Math.round(n) - 1))];

/* ─── Les exercices ──────────────────────────────────────────────────────── */

/**
 * `voix`    — à voix haute, seul. L'app minute et cadence.
 * `ecrit`   — se prépare dans la page, et se relit plus tard.
 * `terrain` — avec de vraies personnes. L'app ne peut que le rappeler et en
 *             recueillir la preuve ; c'est là que le progrès se joue.
 */
export type Forme = "voix" | "ecrit" | "terrain";

export interface Etape {
  label: string;
  /** Durée imposée, en secondes. Absente = l'étape n'est pas chronométrée. */
  secondes?: number;
}

export interface Drill {
  id: string;
  label: string;
  skill: string;
  /** La phase à laquelle il appartient. 0 = échauffement, disponible toujours. */
  phase: number;
  /** Minutes. Courtes : une séance qu'on saute n'entraîne rien. */
  duree: number;
  forme: Forme;
  consigne: string;
  /** Le piège de l'exercice — ce qui le rend inutile quand on s'y laisse aller. */
  garde?: string;
  /** Ce sur quoi on travaille, tiré au sort : une réplique, un sujet, une phrase. */
  matiere?: string[];
  /** Ce qu'on travaille EN ENTIER, sans tirage : un texte, une liste à parcourir. */
  contenu?: string[];
  /**
   * Les interdits. Ce sont eux qui font l'exercice : « raconte ta journée » n'est
   * pas un exercice, « raconte ta journée sans recommencer une phrase » en est un.
   */
  contraintes?: string[];
  /** À quoi on voit que c'est réussi. Un fait observable, jamais une note. */
  critere?: string;
  /** Les étapes chronométrées, quand l'exercice en impose. */
  etapes?: Etape[];
  champs?: string[];
}

/* ─── La matière ───────────────────────────────────────────────────────────
   Les textes, listes et sujets que les exercices consomment. Ils vivent ici,
   dans le domaine, et pas dans la page : c'est ce qu'on corrigera le plus
   souvent (une réplique qui ne déclenche rien, une phrase trop facile à
   découper), et une donnée qu'on corrige a besoin d'être sous test, pas au
   milieu d'un JSX de six cents lignes.
   ------------------------------------------------------------------------ */

/**
 * Le texte de lecture. Le MÊME du premier jour au dernier, et c'est voulu : un
 * texte connu laisse toute l'attention au débit, et le relire trois semaines
 * plus tard est la seule façon d'entendre qu'on a changé.
 */
export const TEXTE_LECTURE =
  "La communication est une compétence qui se développe avec la pratique. " +
  "On n'a pas besoin de trouver les mots parfaits pour être compris. " +
  "Il est souvent plus important de parler simplement, de prendre son temps " +
  "et de laisser à l'autre la possibilité de répondre. " +
  "Une conversation n'est pas une performance. C'est un échange entre deux personnes.";

export const VIRELANGUES = [
  "Les petits poissons nagent paisiblement près des grandes pierres.",
  "Trois très gros rats gris trottent très rapidement.",
  "Je cherche six chemises sèches chez ce cher Serge.",
];

/** Des phrases qui empilent — à découper en phrases qui portent une idée. */
export const PHRASES_LONGUES = [
  "Je pense que le sport est quelque chose qui est vraiment important dans la vie parce que ça permet de rester en bonne santé mais également de rencontrer des personnes et de pouvoir se détendre après une journée compliquée.",
  "En ce moment qu'est-ce que je fais j'essaie d'améliorer ma communication et ma compétence en terme de conversation parce que je trouve que c'est quelque chose qui me manque un peu.",
  "Hier je devais aller au magasin mais comme j'étais en retard et qu'en plus il y avait du monde et que mon frère n'était pas prêt on est finalement partis beaucoup plus tard que prévu.",
  "Le film était pas mal mais je trouve que la fin était bizarre enfin je veux dire pas bizarre mais plutôt décevante parce qu'on ne comprend pas vraiment ce qui arrive au personnage.",
  "J'aimerais bien me lever plus tôt le matin pour avoir le temps de faire des choses avant les cours mais le problème c'est que je me couche tard et que du coup je suis fatigué.",
  "Moi en fait hier j'étais avec mes potes et puis après on est sorti enfin bref je sais plus trop.",
];

/** Les amorces à terminer. On s'entraîne à FINIR, pas à bien commencer. */
export const AMORCES = [
  "Je pense que…",
  "Ce qui m'énerve, c'est…",
  "Ce que j'aimerais apprendre, c'est…",
  "Une chose que je regrette, c'est…",
  "Ce qui me surprend chez les gens, c'est…",
  "Quand j'ai du temps libre, je…",
  "La dernière fois que j'ai changé d'avis, c'était…",
  "Ce dont je suis fier, c'est…",
  "Ce que je ne supporte pas, c'est…",
  "Si je devais recommencer, je…",
];

/** Un mot, trois secondes pour démarrer, trente secondes de parole. */
export const MOTS_SPONTANES = [
  "plage", "argent", "université", "famille", "sport", "voyage", "amitié", "liberté",
  "travail", "réussite", "peur", "habitude", "musique", "ville", "hiver", "hasard",
];

/* Sujets de parole, réutilisés par plusieurs exercices : ce qu'on raconte
   importe moins que la façon dont on le raconte, et un sujet qu'on connaît
   laisse toute l'attention à la forme. */
const SUJETS = [
  "Ce que tu as fait hier.",
  "Un endroit où tu retournerais demain.",
  "La dernière fois que tu as changé d'avis.",
  "Quelque chose que tu sais faire et que peu de gens savent faire.",
  "Ce qui t'occupe l'esprit en ce moment.",
  "Un truc que tu recommandes à tout le monde.",
  "Ce que tu ferais d'une journée entièrement libre.",
  "La dernière chose qui t'a énervé.",
  "Une personne que tu admires, et pourquoi.",
  "Ce que tu comptes faire de ta semaine.",
];

/** Les cinq étapes d'une opinion développée — la structure à automatiser. */
const ETAPES_OPINION: Etape[] = [
  { label: "Opinion", secondes: 20 },
  { label: "Pourquoi", secondes: 40 },
  { label: "Exemple concret", secondes: 40 },
  { label: "Nuance ou contre-exemple", secondes: 40 },
  { label: "Conclusion", secondes: 20 },
];

export const DRILLS: Drill[] = [
  /* ── Phase 0 : l'échauffement. Il ouvre CHAQUE séance, quelle que soit la
     phase — c'est l'instrument, et on ne joue pas d'un instrument froid. Ce
     sont aussi les trois habitudes qui resteront après le parcours : lire à
     voix haute, parler sans préparation, avoir une vraie interaction. ── */
  {
    id: "lecture", label: "Lecture articulée", skill: "debit", phase: 0, duree: 5, forme: "voix",
    consigne: "Lis le texte à voix haute, deux fois. La première à ton débit naturel. La seconde à 70 % de ce débit.",
    contenu: [TEXTE_LECTURE],
    contraintes: ["Prononce chaque mot jusqu'au bout", "Ne mange pas les fins de phrases", "Pause après chaque point"],
    critere: "La deuxième lecture est audiblement plus lente, et aucune fin de mot n'est avalée.",
    etapes: [{ label: "Débit naturel" }, { label: "70 % du débit" }],
    garde: "Ralentir n'est pas traîner : on ne change pas la vitesse des mots, on ajoute du blanc entre les groupes.",
  },
  {
    id: "virelangues", label: "Articulation", skill: "debit", phase: 0, duree: 3, forme: "voix",
    consigne: "Trois fois chaque phrase. Commence lentement, accélère progressivement. Dès que tu avales un mot, tu ralentis.",
    contenu: VIRELANGUES,
    critere: "Tu trouves la vitesse maximale à laquelle tu restes parfaitement compréhensible. C'est cette limite qu'on cherche, pas la vitesse.",
  },
  {
    id: "frein", label: "Le frein", skill: "debit", phase: 0, duree: 5, forme: "voix",
    consigne: "Raconte le sujet à voix haute. Une phrase, puis une pause. Une phrase, puis une pause.",
    matiere: SUJETS,
    contraintes: ["Interdiction de te dépêcher", "La pause tombe entre deux phrases, jamais au milieu"],
    critere: "Tu tiens les cinq minutes sans accélérer sur la fin.",
    garde: "Ça va sonner artificiel. C'est le but : on installe le contrôle d'abord, on le rendra naturel ensuite.",
  },
  {
    id: "sans-bequille", label: "Sans béquille", skill: "formulation", phase: 0, duree: 4, forme: "voix",
    consigne: "90 secondes sur le sujet, sans « en fait », « du coup », « genre », « enfin bref ». À chaque béquille : tu t'arrêtes, tu respires, tu reprends la phrase depuis son début.",
    matiere: SUJETS,
    contraintes: ["Zéro « du coup »", "Zéro « en fait »", "Zéro « genre »", "Le silence remplace la béquille"],
    critere: "Compte tes béquilles. Le but n'est pas zéro aujourd'hui : c'est moins que la dernière fois.",
    etapes: [{ label: "Parle", secondes: 90 }],
    garde: "Le silence qui remplace la béquille n'est pas un trou : c'est le temps que l'autre prend pour te suivre.",
  },
  {
    id: "journal", label: "Journal de conversation", skill: "conversation", phase: 0, duree: 3, forme: "ecrit",
    consigne: "Le soir, sur une vraie conversation de la journée. Dix réponses courtes valent mieux qu'une longue.",
    champs: [
      "Avec qui ai-je parlé, et de quoi ?",
      "À quel moment ai-je manqué d'idées ?",
      "Quelle question aurais-je pu poser ?",
      "Quelle information personnelle aurais-je pu partager ?",
      "Ai-je parlé trop vite, ou fait des phrases trop longues ?",
      "Ai-je évité de prendre la parole ?",
      "Qu'est-ce que je veux améliorer demain ?",
    ],
    critere: "Écrit le jour même. Le lendemain, on ne se souvient plus du moment où l'on a manqué d'idées.",
  },
  {
    id: "preuve", label: "La preuve du jour", skill: "confiance", phase: 0, duree: 0, forme: "terrain",
    consigne: "Note une interaction qui s'est bien passée aujourd'hui, même minuscule : une phrase placée, une question posée, un silence tenu.",
    garde: "La confiance ne précède pas la prise de parole, elle la suit. Ce carnet est l'endroit où la preuve s'accumule.",
  },

  /* ── Phase 1 : clarté ── */
  {
    id: "cinq-reponses", label: "Une phrase, trois phrases, trente secondes", skill: "clarte", phase: 1, duree: 10, forme: "voix",
    consigne: "Pour chaque sujet : réponds d'abord en UNE phrase, puis en TROIS, puis développe 30 secondes.",
    contenu: [
      "Pourquoi veux-tu améliorer ta communication ?",
      "Quel est ton principal objectif cette année ?",
      "Qu'est-ce qui t'intéresse actuellement ?",
      "Quelle qualité apprécies-tu chez quelqu'un ?",
      "Quel défaut aimerais-tu améliorer chez toi ?",
    ],
    contraintes: ["Fin de phrase → pause → nouvelle idée → nouvelle phrase", "Interdiction de recommencer une phrase"],
    critere: "Des phrases propres, pas des phrases impressionnantes.",
    etapes: [{ label: "Une phrase" }, { label: "Trois phrases" }, { label: "Développe", secondes: 30 }],
    garde: "Une phrase « suffisamment bonne » est une phrase réussie. Tu continues.",
  },
  {
    id: "reparer", label: "Réduire une phrase", skill: "clarte", phase: 1, duree: 8, forme: "ecrit",
    consigne: "Cette phrase empile deux ou trois idées. Réécris-la en phrases naturelles, puis dis-la à voix haute.",
    matiere: PHRASES_LONGUES,
    champs: ["Première phrase", "Deuxième phrase", "Troisième phrase"],
    critere: "Chaque phrase de ta version porte UNE idée, et tu peux la dire d'un souffle.",
    garde: "Simple ne veut pas dire pauvre. Phrase simple + idée claire bat toujours phrase compliquée + confuse.",
  },
  {
    id: "finir", label: "Finir ses phrases", skill: "clarte", phase: 1, duree: 7, forme: "voix",
    consigne: "Une amorce, tu la termines à voix haute. Les dix, sans t'arrêter entre deux.",
    contenu: AMORCES,
    contraintes: ["Interdiction de revenir en arrière", "Même si la fin est banale, tu la dis"],
    critere: "Dix phrases finies. Aucune abandonnée en route.",
  },
  {
    id: "sans-reprise", label: "Ne pas se corriger", skill: "clarte", phase: 1, duree: 6, forme: "voix",
    consigne: "Trois minutes sur le sujet. Si une phrase sort mal : « enfin… je veux dire… » et tu continues.",
    matiere: [
      "Quel est ton plus gros défaut ?",
      "Explique quelque chose que tu connais mal.",
      "Donne ton opinion sur un sujet auquel tu n'as jamais réfléchi.",
      "Raconte quelque chose dont tu as oublié la moitié des détails.",
      "Qu'est-ce que tu ferais avec un an de libre ?",
    ],
    contraintes: ["Aucune reprise depuis le début d'une phrase", "Une seule correction par phrase, jamais deux"],
    critere: "Zéro phrase recommencée. C'est le seul critère.",
    etapes: [{ label: "Parle", secondes: 180 }],
    garde: "Reformuler en cours de route casse le débit, perd le fil, et fabrique l'impression de ne pas savoir parler. C'est la faute la plus coûteuse du programme.",
  },
  {
    id: "expliquer-simple", label: "Trois interlocuteurs", skill: "clarte", phase: 1, duree: 10, forme: "voix",
    consigne: "Explique la même chose trois fois, à trois personnes différentes. Trois minutes chacune.",
    matiere: [
      "Le trading : à un enfant de 12 ans, puis à quelqu'un de 60 ans, puis à quelqu'un qui pense que c'est du jeu.",
      "Ton année scolaire : à un ami, puis à un recruteur, puis à un enfant.",
      "Ce que tu fais de tes journées : à un inconnu, puis à ta grand-mère, puis à quelqu'un du métier.",
    ],
    contraintes: ["Aucun terme technique sans l'expliquer dans la foulée"],
    critere: "Les trois versions sont différentes. Si elles se ressemblent, tu n'as pas adapté, tu as récité.",
    garde: "Être compris, pas paraître intelligent.",
  },

  /* ── Phase 2 : contrôle de la parole ── */
  {
    id: "trente-secondes", label: "Trois secondes, puis trente", skill: "debit", phase: 2, duree: 10, forme: "voix",
    consigne: "Trois secondes de réflexion — tu ne parles pas. Puis trente secondes de réponse, pas plus.",
    matiere: SUJETS,
    contraintes: ["Interdit de dire « attends, je réfléchis »", "S'arrêter à quinze secondes est une bonne réponse"],
    critere: "Tu démarres dans les trois secondes, sans préambule.",
    etapes: [{ label: "Silence", secondes: 3 }, { label: "Réponds", secondes: 30 }],
    garde: "Le but n'est pas de remplir les trente secondes.",
  },
  {
    id: "groupes-de-mots", label: "Groupes de mots", skill: "debit", phase: 2, duree: 8, forme: "voix",
    consigne: "Raconte le sujet en découpant : cinq à sept mots, une respiration, cinq à sept mots.",
    matiere: SUJETS,
    contraintes: ["La pause tombe entre les groupes, pas au milieu d'une idée"],
    critere: "Tu entends tes propres pauses au lieu de les subir.",
    etapes: [{ label: "Parle", secondes: 180 }],
    garde: "Une pause posée exprès ne s'entend pas comme une hésitation. C'est l'hésitation qu'elle remplace.",
  },
  {
    id: "silence-cinq", label: "Cinq secondes de silence", skill: "debit", phase: 2, duree: 6, forme: "voix",
    consigne: "La question s'affiche. Tu attends cinq secondes en silence. Puis tu réponds.",
    matiere: [
      "Quelle est ta plus grande qualité ?",
      "Quelle personne admires-tu ?",
      "Quelle décision a changé ta vie ?",
      "De quoi es-tu le plus fier cette année ?",
      "Qu'est-ce que tu ferais si tu ne pouvais pas échouer ?",
    ],
    contraintes: ["Les cinq secondes se comptent en entier", "Pas de « alors… », pas de « euh »"],
    critere: "Tu tiens les cinq secondes sans les combler. Elles paraissent dix ; elles font cinq.",
    etapes: [{ label: "Silence", secondes: 5 }, { label: "Réponds", secondes: 45 }],
  },

  /* ── Phase 3 : formulation & vocabulaire ── */
  {
    id: "mot-juste", label: "Lequel exactement ?", skill: "formulation", phase: 3, duree: 10, forme: "ecrit",
    consigne: "Voici un mot générique. Trouve cinq alternatives adaptées à des contextes différents, puis la phrase corrigée avec celle qui correspond VRAIMENT à ton idée.",
    matiere: [
      "« C'est vachement intéressant. » — fascinant, complexe, stimulant, imprévisible, technique ?",
      "« C'était un truc de fou. » — inattendu, absurde, spectaculaire, gênant, inespéré ?",
      "« Il est bizarre. » — imprévisible, distant, excentrique, mal à l'aise, insaisissable ?",
      "« C'était bien. » — reposant, marquant, drôle, réussi, plus simple que prévu ?",
      "« C'est important. » — essentiel, primordial, déterminant, indispensable, significatif ?",
      "« J'ai trouvé ça nul. » — bâclé, prévisible, prétentieux, interminable, sans enjeu ?",
      "« C'est difficile. » — exigeant, technique, épuisant, ingrat, décourageant ?",
      "« Il est trop fort. » — précis, rapide, endurant, inventif, imperturbable ?",
    ],
    champs: ["Cinq alternatives", "Le mot qui correspond vraiment", "La phrase corrigée"],
    critere: "Tu sais dire pourquoi tu choisis « captivant » plutôt que « enrichissant ».",
    garde: "On ne cherche pas un mot rare. On cherche celui qui correspond à ton idée.",
  },
  {
    id: "sans-le-mot", label: "Sans le mot", skill: "formulation", phase: 3, duree: 6, forme: "voix",
    consigne: "Parle 30 secondes du sujet SANS utiliser le mot interdit.",
    matiere: [
      "Pourquoi le sport est important — sans dire « important ».",
      "Ce que tu trouves intéressant en ce moment — sans dire « intéressant ».",
      "Un truc difficile que tu as fait — sans dire « difficile ».",
      "Ce qui est bien dans ta semaine — sans dire « bien ».",
      "Raconte une chose qui t'est arrivée — sans dire « chose » ni « truc ».",
    ],
    critere: "Le détour t'oblige à préciser. C'est exactement le but.",
    etapes: [{ label: "Parle", secondes: 30 }],
  },
  {
    id: "bequilles", label: "Chasse aux béquilles", skill: "formulation", phase: 3, duree: 8, forme: "voix",
    consigne: "Trois minutes sur « une journée idéale pour moi ». Compte tes béquilles. Puis refais le MÊME sujet en les remplaçant par des silences.",
    contraintes: ["Compte : « du coup », « en fait », « bah », « genre », « voilà »"],
    critere: "La deuxième version en a moins que la première. C'est tout ce qu'on demande aujourd'hui.",
    etapes: [{ label: "Première prise", secondes: 180 }, { label: "Compte" }, { label: "Deuxième prise", secondes: 180 }],
  },
  {
    id: "trois-niveaux", label: "Dix, trente, cent vingt", skill: "formulation", phase: 3, duree: 12, forme: "voix",
    consigne: "La même question, trois fois : en 10 secondes, en 30, puis en 2 minutes.",
    matiere: [
      "Pourquoi fais-tu ce que tu fais ?",
      "Quel est ton objectif cette année ?",
      "Qu'est-ce qui te passionne ?",
      "Qu'est-ce que tu aimerais changer ?",
      "Qu'est-ce qui te rend heureux ?",
    ],
    contraintes: ["La version longue n'est pas la courte répétée plus lentement"],
    critere: "Chaque allongement AJOUTE : un exemple, une nuance, un souvenir.",
    etapes: [{ label: "Court", secondes: 10 }, { label: "Moyen", secondes: 30 }, { label: "Long", secondes: 120 }],
  },
  {
    id: "mot", label: "Le mot de la semaine", skill: "formulation", phase: 3, duree: 6, forme: "ecrit",
    consigne: "Un mot, ses cases. Dix par semaine, chacun avec une phrase à toi. Le mot n'est à toi que le jour où tu l'auras placé dans une vraie conversation.",
    champs: ["Le mot", "Définition", "Synonymes", "Contraire", "Une phrase à moi", "La réplique où je le placerai"],
    critere: "Le mot passe par quatre états : reconnu, compris, utilisé, automatique. Seuls les deux derniers comptent.",
    garde: "Apprendre des listes ne sert à rien : on peut connaître cinq cents mots et continuer à chercher les siens.",
  },

  /* ── Phase 4 : conversation ── */
  {
    id: "developper", label: "Opinion en cinq temps", skill: "clarte", phase: 4, duree: 8, forme: "voix",
    consigne: "Donne ton opinion sur le sujet en suivant les cinq étapes, chronomètre à l'appui.",
    matiere: [
      "Est-ce que l'argent rend heureux ?",
      "La discipline est-elle plus importante que la motivation ?",
      "Est-ce que les études sont indispensables pour réussir ?",
      "Les réseaux sociaux font-ils plus de mal que de bien ?",
      "Est-ce que réussir sa vie, c'est gagner beaucoup d'argent ?",
    ],
    etapes: ETAPES_OPINION,
    critere: "Tu passes d'une étape à l'autre sans y penser. C'est l'objectif caché : que la structure devienne un réflexe.",
    garde: "Ta nuance ne détruit pas ta position, elle la précise.",
  },
  {
    id: "cinq-portes", label: "Cinq portes d'entrée", skill: "conversation", phase: 4, duree: 8, forme: "ecrit",
    consigne: "Une seule phrase de l'autre contient cinq portes. Écris-les toutes les cinq, de nature différente.",
    matiere: [
      "« Je suis parti en Espagne cet été. »",
      "« J'ai commencé la boxe cette année. »",
      "« Je fais du volley depuis cinq ans. »",
      "« J'ai changé de boulot il y a deux mois. »",
      "« On a adopté un chat. »",
      "« Je me lève à 5 h en ce moment. »",
      "« J'ai revu un pote que j'avais pas vu depuis dix ans. »",
    ],
    champs: ["Question", "Expérience personnelle", "Opinion", "Émotion / réaction", "Nouvelle branche"],
    critere: "Cinq réponses vraiment différentes — pas cinq questions déguisées.",
  },
  {
    id: "reaction-perso", label: "Réaction, puis soi, puis question", skill: "conversation", phase: 4, duree: 8, forme: "ecrit",
    consigne: "Ne commence jamais par la question. Réagis d'abord, apporte quelque chose de toi, et seulement ensuite relance.",
    matiere: [
      "« J'ai commencé la boxe cette année. »",
      "« Je pars en Espagne cet été. »",
      "« Je bosse dans une agence. »",
      "« Je me suis remis à la guitare. »",
      "« J'ai déménagé en septembre. »",
      "« Je prépare un concours en parallèle. »",
    ],
    champs: ["Ma réaction", "Ce que ça m'évoque, chez moi", "Ma question"],
    critere: "L'autre peut rebondir sur TOI. C'est ce qui empêche l'interrogatoire.",
    garde: "Mauvaise version : « Depuis quand ? Pourquoi ? Où ? ». Bonne version : « Ah sérieux ? J'ai toujours voulu essayer. T'en fais depuis combien de temps ? »",
  },
  {
    id: "questions-ouvertes", label: "Ouvrir les questions", skill: "conversation", phase: 4, duree: 6, forme: "ecrit",
    consigne: "Transforme chaque question fermée en question ouverte, puis trouve la suivante.",
    contenu: [
      "« Tu as aimé ? » → « Qu'est-ce que tu as préféré ? »",
      "« C'était bien ? »",
      "« Tu y retournerais ? »",
      "« T'as fait quelque chose ce week-end ? »",
      "« Tu connais ? »",
      "« Ça s'est bien passé ? »",
      "« T'aimes ton boulot ? »",
      "« T'étais avec des amis ? »",
    ],
    champs: ["Version ouverte", "La question d'après"],
    critere: "Aucune de tes questions ne peut recevoir « oui » pour réponse.",
  },
  {
    id: "branches", label: "Les branches", skill: "conversation", phase: 4, duree: 10, forme: "ecrit",
    consigne: "Un sujet central. Écris dix branches qui en partent, puis choisis-en une et parle deux minutes.",
    matiere: [
      "Université — cours, professeurs, logement, argent, soirées, avenir…",
      "Voyage — pays, nourriture, culture, budget, gens, souvenirs…",
      "Le sport — club, niveau, blessures, coéquipiers, discipline…",
      "Le travail — métier, collègues, horaires, sens, projets…",
      "L'enfance — école, quartier, vacances, fratrie, bêtises…",
    ],
    champs: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"],
    critere: "Dix branches trouvées. Tu n'as pas besoin de connaître deux cents sujets : tu dois savoir en tirer dix d'un seul.",
  },
  {
    id: "relances", label: "Les quatre relances", skill: "conversation", phase: 4, duree: 8, forme: "ecrit",
    consigne: "Quelqu'un vient de dire ça. Écris les quatre relances. Tu n'as pas à trouver un sujet : il vient de t'en donner un.",
    matiere: [
      "J'ai changé de boulot il y a deux mois.",
      "J'ai passé le week-end chez mes parents.",
      "Je dors très mal en ce moment.",
      "J'ai arrêté les réseaux depuis un mois.",
      "Je me suis mis à cuisiner.",
      "J'ai racheté un vieux vélo.",
    ],
    champs: ["Approfondir — pourquoi ?", "Explorer — comment ça s'est passé ?", "Réagir — ah ouais, sérieux ?", "Associer — ça me fait penser à…"],
    critere: "Quatre portes ouvertes valent mieux qu'une réplique parfaite.",
  },

  /* ── Phase 5 : parler avec n'importe qui ── */
  {
    id: "profils", label: "Le profil du jour", skill: "conversation", phase: 5, duree: 10, forme: "ecrit",
    consigne: "Prépare trois phrases pour ce profil précis : une pour entrer, une pour tenir, une pour sortir proprement.",
    matiere: [
      "Quelqu'un de très bavard : tu dois reprendre la parole sans le couper brutalement.",
      "Quelqu'un de très silencieux : tu dois créer la matière toi-même.",
      "Quelqu'un de passionnant : tu dois approfondir au lieu de sauter d'un sujet à l'autre.",
      "Un inconnu complet : tu dois créer une connexion en deux minutes.",
      "Quelqu'un que ça n'intéresse visiblement pas : tu dois savoir conclure.",
      "Quelqu'un qui te met mal à l'aise : tu dois rester, sans te rétracter.",
    ],
    champs: ["Pour entrer", "Pour tenir", "Pour sortir"],
    critere: "Reconnaître qu'il faut s'arrêter est une compétence, pas un échec.",
  },
  {
    id: "pas-interrogatoire", label: "Deux questions, pas plus", skill: "conversation", phase: 5, duree: 8, forme: "voix",
    consigne: "Conversation imaginaire à voix haute. Après deux questions consécutives, ta troisième intervention DOIT être autre chose.",
    contraintes: ["Deux questions consécutives maximum", "La troisième : une anecdote, une opinion, une réaction ou une remarque"],
    critere: "Tu t'entends changer de registre au bon moment. C'est ce qui transforme un interrogatoire en conversation.",
    matiere: SUJETS,
  },

  /* ── Phase 6 : groupes ── */
  {
    id: "entrer", label: "Entrer une fois", skill: "groupes", phase: 6, duree: 0, forme: "terrain",
    consigne: "Une seule mission : entrer UNE fois dans une conversation de groupe. Une phrase suffit.",
    matiere: [
      "« Vous parliez de quoi ? »",
      "« Attends, j'ai pas suivi — il s'est passé quoi ? »",
      "« Et toi, tu le connais comment ? »",
      "« Raconte, ça m'intéresse. »",
      "« Ça s'est fini comment, du coup ? »",
    ],
    garde: "Le moment parfait n'arrive pas. Une phrase posée trop tôt vaut mieux qu'une phrase parfaite jamais dite.",
  },
  {
    id: "entrer-scenarios", label: "Cinq entrées", skill: "groupes", phase: 6, duree: 10, forme: "ecrit",
    consigne: "Trois personnes parlent déjà. Tu arrives. Écris ta phrase d'entrée pour chacune des cinq scènes.",
    contenu: [
      "Trois personnes parlent d'un voyage.",
      "Trois personnes parlent de football.",
      "Trois personnes parlent d'une soirée où tu n'étais pas.",
      "Trois personnes parlent d'un film que tu n'as pas vu.",
      "Trois personnes parlent de leurs études.",
    ],
    champs: ["Voyage", "Football", "Soirée", "Film", "Études"],
    critere: "Aucune de tes cinq phrases n'attend qu'on te donne la parole.",
  },
  {
    id: "reprendre", label: "Reprendre la parole", skill: "groupes", phase: 6, duree: 8, forme: "ecrit",
    consigne: "Tu as dit une phrase, les autres ont réagi, et tu as disparu. Écris la phrase qui te fait REVENIR trente secondes plus tard.",
    matiere: [
      "Le groupe parle d'un film que tu n'as pas vu.",
      "Deux personnes racontent un souvenir commun où tu n'étais pas.",
      "Quelqu'un vient d'arriver et tout le monde le connaît sauf toi.",
      "La conversation est sur un sujet technique que tu connais bien.",
      "On parle d'un endroit où tu es allé.",
    ],
    champs: ["Ma première phrase", "Ce que les autres répondent", "Ma phrase pour revenir"],
    critere: "Disparaître après une intervention annule l'intervention.",
  },
  {
    id: "dynamique", label: "Faire participer", skill: "groupes", phase: 6, duree: 0, forme: "terrain",
    consigne: "Aujourd'hui, renvoie une question à quelqu'un qui n'a rien dit : « et toi, t'en penses quoi ? »",
    garde: "Celui qui fait parler les autres est au centre sans avoir à s'y mettre.",
  },

  /* ── Phase 7 : storytelling ── */
  {
    id: "histoire", label: "L'histoire en cinq temps", skill: "storytelling", phase: 7, duree: 10, forme: "ecrit",
    consigne: "Une chose qui t'est vraiment arrivée, rangée en cinq temps. Puis raconte-la à voix haute en moins de 90 secondes.",
    champs: ["Contexte — où, quand ?", "Objectif — je voulais quoi ?", "Problème — qu'est-ce qui a mal tourné ?", "Escalade — ça empire comment ?", "Résultat — et alors ?"],
    critere: "Court, clair, mémorable. Si tu dépasses 90 secondes, c'est qu'il reste des détails à couper.",
    garde: "L'architecture avant le style. Trop de détails, trop vite, et l'histoire n'existe plus — même quand elle est bonne.",
  },
  {
    id: "elaguer", label: "Élaguer", skill: "storytelling", phase: 7, duree: 8, forme: "voix",
    consigne: "Raconte l'histoire en 3 minutes. Puis la même en 60 secondes. Puis en 30.",
    matiere: [
      "Une fois où quelque chose ne s'est absolument pas passé comme prévu.",
      "La dernière fois que tu as été en retard.",
      "Une rencontre inattendue.",
      "Une situation embarrassante.",
      "Un truc qui a mal tourné et qui fait rire après coup.",
    ],
    etapes: [{ label: "Version longue", secondes: 180 }, { label: "60 secondes", secondes: 60 }, { label: "30 secondes", secondes: 30 }],
    critere: "Ce qui tombe entre 180 et 30 secondes, c'est exactement ce qui rendait l'histoire illisible.",
  },
  {
    id: "tension", label: "Retarder la révélation", skill: "storytelling", phase: 7, duree: 8, forme: "voix",
    consigne: "Raconte l'histoire en gardant le résultat pour la fin. Tu annonces qu'il va se passer quelque chose, et tu fais attendre.",
    matiere: [
      "Une fois où tu as cru avoir un gros problème.",
      "Le jour où tu t'es trompé de bout en bout.",
      "Une fois où tu as failli rater quelque chose d'important.",
      "Un moment où tout a basculé en une seconde.",
    ],
    contraintes: ["Le résultat ne sort pas avant la dernière phrase"],
    critere: "« Je pensais que tout allait bien… jusqu'au moment où j'ai regardé mon téléphone. » — on doit vouloir la suite.",
  },

  /* ── Phase 8 : humour ── */
  {
    id: "levier", label: "Le levier du jour", skill: "humour", phase: 8, duree: 8, forme: "voix",
    consigne: "Lis la réplique, applique le levier, dis ta réponse à voix haute en moins de dix secondes.",
    matiere: [
      "EXAGÉRATION — « On a séché les maths. » → pousse le trait jusqu'à l'absurde.",
      "TAQUINERIE — « On a encore perdu 5-0. » → moque gentiment, sans viser ce qui fait mal.",
      "OBSERVATION — dis ce que tout le monde voit et que personne n'a formulé.",
      "ASSOCIATION — « J'ai dormi quatre heures. » → rapproche ça d'autre chose, d'inattendu.",
      "CALLBACK — reprends une information donnée cinq minutes plus tôt.",
      "AUTODÉRISION — ris de toi sans te dévaloriser : la nuance est que tu restes debout.",
    ],
    critere: "Dix secondes maximum. Le timing compte plus que la qualité de la vanne.",
    garde: "On n'entraîne pas des blagues préparées, on entraîne la vitesse d'association. « Quatre heures ? Donc t'es encore dans la journée d'hier. »",
  },
  {
    id: "exagerer", label: "Exagération", skill: "humour", phase: 8, duree: 8, forme: "ecrit",
    consigne: "Transforme la situation banale en version drôle, par l'exagération.",
    matiere: [
      "J'ai attendu 20 minutes pour avoir mon repas.",
      "Mon train a eu 5 minutes de retard.",
      "Il a mis une heure à répondre à mon message.",
      "Il fait un peu froid dans cette salle.",
      "J'ai trois pages à lire pour demain.",
      "Il y avait deux personnes à la soirée.",
      "Mon téléphone est à 8 %.",
      "J'ai perdu au premier tour.",
    ],
    champs: ["Version exagérée"],
    critere: "« J'ai attendu tellement longtemps que j'ai commencé à me demander si le restaurant élevait lui-même le poulet. »",
  },
  {
    id: "taquiner", label: "Cinq registres", skill: "humour", phase: 8, duree: 8, forme: "ecrit",
    consigne: "Pour la même situation, écris cinq réponses : une neutre, une drôle, une exagérée, une comparaison, une taquinerie légère.",
    matiere: [
      "Un ami arrive avec 30 minutes de retard.",
      "Il annonce qu'il commence la salle demain.",
      "Elle dit qu'elle va se coucher tôt ce soir, pour la troisième fois cette semaine.",
      "Il a encore oublié son chargeur.",
      "Ils ont perdu leur match 5-0.",
    ],
    champs: ["Neutre", "Drôle", "Exagérée", "Comparaison", "Taquinerie"],
    critere: "La taquinerie ne vise jamais ce qui fait vraiment mal. C'est toute la différence.",
  },

  /* ── Phase 9 : présence & confiance ── */
  {
    id: "silence", label: "Tenir le silence", skill: "confiance", phase: 9, duree: 6, forme: "voix",
    consigne: "Réponds au sujet, puis TAIS-TOI trois secondes pleines avant d'ajouter quoi que ce soit. Compte-les.",
    matiere: SUJETS,
    critere: "Tu tiens les trois secondes sans les combler.",
    etapes: [{ label: "Réponds", secondes: 45 }, { label: "Silence", secondes: 3 }],
    garde: "Parler pour combler un silence est la façon la plus sûre de perdre le fil.",
  },
  {
    id: "sous-pression", label: "Sous pression", skill: "confiance", phase: 9, duree: 10, forme: "voix",
    consigne: "Enchaîne les quatre temps sans t'arrêter entre eux. On te coupe, on te contredit, on change de sujet : tu restes fonctionnel.",
    matiere: [
      "Explique en dix secondes pourquoi on devrait t'embaucher.",
      "Défends en dix secondes une décision que tu as prise cette année.",
      "Explique en dix secondes ce que tu veux faire de ton année.",
    ],
    etapes: [
      { label: "Ta réponse", secondes: 10 },
      { label: "On te dit non — réponds", secondes: 30 },
      { label: "On te demande un exemple", secondes: 30 },
      { label: "On te coupe et on change de sujet — enchaîne", secondes: 30 },
    ],
    critere: "Parler seul dans sa chambre et parler sous pression sont deux compétences. C'est la seconde qu'on entraîne ici.",
  },
  {
    id: "sans-approbation", label: "Sans chercher l'accord", skill: "confiance", phase: 9, duree: 0, forme: "terrain",
    consigne: "Aujourd'hui, dis un avis sans le terminer par « non ? », « tu vois ? », « enfin je sais pas ».",
    garde: "Ces trois mots demandent la permission d'avoir parlé. Les retirer ne rend pas arrogant : ça rend clair.",
  },
];

export const drillById = (id: string): Drill | null => DRILLS.find(d => d.id === id) ?? null;
export const drillsDeLaPhase = (n: number): Drill[] => DRILLS.filter(d => d.phase === n);

/* ─── Les simulations ────────────────────────────────────────────────────── */

/**
 * Une conversation jouée, tour par tour.
 *
 * L'app ne peut pas improviser une réponse à ce qu'on vient de dire — elle ne
 * l'entend pas. Elle fait donc l'autre chose, celle qui manque le plus quand on
 * s'entraîne seul : elle DONNE LE TOUR SUIVANT sans qu'on sache lequel. On
 * répond à voix haute, on découvre la réplique d'après, et on enchaîne. C'est
 * la contrainte de la vraie conversation — répondre à ce qui vient, pas à ce
 * qu'on avait préparé.
 */
export interface Simulation {
  id: string;
  titre: string;
  /** À qui on a affaire : c'est ça qui rend la scène jouable. */
  profil: string;
  contexte: string;
  phase: number;
  consigne: string;
  /** Les répliques de l'autre, dans l'ordre. On les découvre une par une. */
  tours: string[];
}

export const SIMULATIONS: Simulation[] = [
  {
    id: "inconnu-soiree", titre: "Un inconnu, en soirée", profil: "Quelqu'un que tu ne connais pas, plutôt ouvert", phase: 1,
    contexte: "Tu es adossé au plan de travail de la cuisine. Quelqu'un se sert un verre à côté de toi.",
    consigne: "Trois phrases maximum par réponse. Tu ne recommences pas une phrase.",
    tours: [
      "« Franchement, cette soirée est morte. »",
      "« Ouais… t'es venu avec qui ? »",
      "« Ah ok. Et tu fais quoi sinon, dans la vie ? »",
      "« Intéressant. Moi je suis dans la logistique, c'est moins glamour. »",
      "« Bon, je vais refaire un tour. À tout à l'heure ! »",
    ],
  },
  {
    id: "bavard", titre: "Le bavard", profil: "Quelqu'un qui parle beaucoup et ne laisse pas de blanc", phase: 5,
    contexte: "Il raconte son week-end depuis quatre minutes. Tu n'as encore rien dit.",
    consigne: "Reprends la parole SANS le couper brutalement : accroche-toi à un détail qu'il vient de donner.",
    tours: [
      "« …et donc on arrive là-bas, il y avait un monde pas possible, mais genre vraiment, tu vois le truc ? »",
      "« Voilà exactement ! Et après on a voulu manger, sauf que tout était plein, donc on a fini au kebab. »",
      "« Ah mais complètement. Bref. Et toi alors, t'as fait quoi ? »",
      "« Ah ouais ? Raconte. »",
    ],
  },
  {
    id: "silencieux", titre: "Le silencieux", profil: "Quelqu'un qui répond en trois mots", phase: 5,
    contexte: "Vous attendez tous les deux. Il n'a pas l'air pressé de parler.",
    consigne: "Crée la matière toi-même : donne avant de demander, et évite les questions fermées.",
    tours: ["« Ouais. »", "« Ça va. »", "« Mouais, ça dépend des jours. »", "« Ah, ça oui. »", "« Ouais, pas faux. »"],
  },
  {
    id: "groupe-en-cours", titre: "Un groupe qui parle déjà", profil: "Trois personnes, une conversation lancée", phase: 6,
    contexte: "Tu arrives avec ton verre. Ils parlent depuis un moment, personne ne se retourne.",
    consigne: "Entre une fois. Puis REVIENS trente secondes plus tard — disparaître après une phrase annule la phrase.",
    tours: [
      "PAUL : « …et il l'a fait sans prévenir personne, tu vois le genre. »",
      "LÉA : « Bah c'est exactement ce que je disais la semaine dernière. »",
      "PAUL (se tourne vers toi) : « Tu connais Marc, toi ? »",
      "SAMI : « Ah, tiens. Et t'en penses quoi alors ? »",
      "LÉA : « Ouais, c'est pas faux. »",
    ],
  },
  {
    id: "desaccord", titre: "Quelqu'un n'est pas d'accord", profil: "Quelqu'un de direct, qui te contredit", phase: 10,
    contexte: "Tu viens de donner ton avis. Il n'est pas du même.",
    consigne: "Tu tiens ta position sans la durcir et sans chercher son approbation. Une idée par phrase.",
    tours: [
      "« Non mais là franchement je suis pas d'accord du tout. »",
      "« Ouais enfin, ça marche peut-être pour toi, mais pour la plupart des gens non. »",
      "« Mmh. Explique, parce que là je te suis pas. »",
      "« Ok, vu comme ça, c'est plus clair. »",
    ],
  },
  {
    id: "histoire-a-cinq", titre: "Raconter devant cinq personnes", profil: "Un groupe qui t'écoute, et qui peut décrocher", phase: 7,
    contexte: "Quelqu'un vient de dire « raconte-leur l'histoire du magasin ». Tout le monde se tourne vers toi.",
    consigne: "Contexte → objectif → problème → escalade → résultat. 90 secondes maximum.",
    tours: [
      "« Vas-y, raconte ! »",
      "(quelqu'un regarde son téléphone — accélère vers le problème)",
      "« Attends, attends — donc t'y étais allé pour quoi au départ ? »",
      "(rires) « Et alors ?! »",
      "« Ahah, énorme. »",
    ],
  },
  {
    id: "pas-interesse", titre: "Ça ne l'intéresse pas", profil: "Quelqu'un de poli, mais ailleurs", phase: 5,
    contexte: "Il regarde par-dessus ton épaule depuis deux minutes.",
    consigne: "Repère le signal, et conclus proprement. S'arrêter à temps est une compétence, pas un échec.",
    tours: ["« Ah ouais, d'accord. »", "(sourit, regarde ailleurs) « Hm. »", "« Ouais ouais. »", "« Excuse-moi, je vais aller dire bonjour à quelqu'un. »"],
  },
];

export const simulationById = (id: string): Simulation | null => SIMULATIONS.find(s => s.id === id) ?? null;

/* ─── Les fautes du débrief ──────────────────────────────────────────────── */

export interface Faute {
  id: string;
  label: string;
  skill: string;
}

/**
 * Ce qu'on se relève à soi-même après une simulation.
 *
 * L'app n'entend pas la séance : elle ne peut pas corriger. Elle fournit donc
 * la GRILLE — les fautes précises observées au départ, formulées de façon
 * reconnaissable — et c'est celui qui vient de parler qui coche. Cochées séance
 * après séance, elles disent quelque chose qu'aucune auto-note ne dit : ce qui
 * revient LE PLUS SOUVENT, et donc ce qui mérite la prochaine phase.
 */
export const FAUTES: Faute[] = [
  { id: "accelere",     label: "J'ai accéléré",                                 skill: "debit" },
  { id: "comble",       label: "J'ai parlé pour combler un silence",            skill: "debit" },
  { id: "recommence",   label: "J'ai recommencé une phrase en cours de route",  skill: "formulation" },
  { id: "mot-parfait",  label: "J'ai cherché le mot parfait",                   skill: "formulation" },
  { id: "generique",    label: "Je suis resté dans le générique (truc, chose)", skill: "formulation" },
  { id: "deux-idees",   label: "J'ai mis deux idées dans une phrase",           skill: "clarte" },
  { id: "trop-long",    label: "J'ai développé trop longtemps",                 skill: "clarte" },
  { id: "pas-relance",  label: "Je n'ai pas relancé sur ce qu'il a donné",      skill: "conversation" },
  { id: "change-sujet", label: "J'ai changé de sujet trop vite",                skill: "conversation" },
  { id: "spectateur",   label: "Je suis resté spectateur",                      skill: "groupes" },
  { id: "parti-partout", label: "Mon histoire est partie dans tous les sens",   skill: "storytelling" },
  { id: "approbation",  label: "J'ai cherché l'approbation",                    skill: "confiance" },
];

export const fauteById = (id: string): Faute | null => FAUTES.find(f => f.id === id) ?? null;

/* ─── Les missions ───────────────────────────────────────────────────────── */

/**
 * Ce qui se passe DEHORS, et qui se vérifie à la séance suivante.
 *
 * Une mission cochée le soir même par celui qui se l'est donnée ne prouve rien.
 * Reportée d'un jour, la question « tu l'as faite ? » se pose autrement : on
 * répond à ce qui a eu lieu, pas à ce qu'on espérait faire.
 */
export const MISSIONS: Record<number, string[]> = {
  1: [
    "Réponds à une vraie question en trois phrases, puis arrête-toi.",
    "Une conversation entière sans recommencer une seule phrase.",
  ],
  2: [
    "Laisse deux secondes de silence avant de répondre à quelqu'un, une fois.",
    "Dans une conversation, parle une fois moitié moins vite que ton réflexe.",
  ],
  3: [
    "Remplace un « intéressant » ou un « truc » par le mot exact, à voix haute.",
    "Place un des mots de ta liste dans une vraie conversation.",
  ],
  4: [
    "Relance trois fois sur un détail que l'autre a donné, sans changer de sujet.",
    "Tire cinq minutes de conversation d'une seule phrase qu'on t'a dite.",
  ],
  5: [
    "Parle à quelqu'un que tu ne connais pas, deux minutes.",
    "Repère quelqu'un qui n'a pas envie de parler, et conclus proprement.",
  ],
  6: [
    "Entre une fois dans une conversation de groupe. Une phrase suffit.",
    "Reviens une deuxième fois dans la même conversation de groupe.",
    "Renvoie une question à quelqu'un qui n'a rien dit.",
  ],
  7: [
    "Raconte une histoire en moins de 90 secondes, à une personne.",
    "Raconte une histoire devant au moins trois personnes.",
  ],
  8: [
    "Dis une association drôle sur le moment, même moyenne. Le timing compte plus que la blague.",
    "Reprends une info donnée plus tôt dans la conversation (callback).",
  ],
  9: [
    "Donne un avis sans « non ? », « tu vois ? », « enfin je sais pas ».",
    "Tiens trois secondes de silence au milieu d'un échange, sans le combler.",
  ],
  10: [
    "Une conversation entière sans rien surveiller. Tu regarderas après.",
    "Raconte quelque chose à un groupe, sans préparation.",
  ],
};

/* ─── Le magasin ─────────────────────────────────────────────────────────── */

export interface Fait { id: string; date: string; drillId: string }
export interface Preuve { id: string; date: string; texte: string; skill?: string | null }

export interface Mot {
  id: string; date: string; mot: string; definition: string; synonymes: string;
  contraire: string; phrase: string; replique: string;
  /** Jour où il a été placé dans une VRAIE conversation. Avant, il n'est pas acquis. */
  utiliseLe: string | null;
}

export interface Histoire {
  id: string; date: string; titre: string;
  contexte: string; objectif: string; probleme: string; escalade: string; resultat: string;
  racontee: number;
}

export interface Travail {
  id: string; date: string; drillId: string; matiere: string; reponses: string[];
}

/**
 * Ce qu'on COMPTE après une séance, en plus de ce qu'on coche.
 *
 * Trois notes sur dix et trois comptages. Les comptages sont là parce qu'ils
 * sont les seuls chiffres qu'on puisse relever honnêtement tout seul : « j'ai
 * dit du coup onze fois » est vérifiable, « ma fluidité était à 6 » ne l'est
 * pas. Ce sont eux qui pilotent le renfort du lendemain.
 */
export interface Mesures {
  /** 0 à 10 — trop rapide (0) à bien tenu (10). */
  debit: number | null;
  clarte: number | null;
  /** 0 à 10 — j'ai cherché mes mots sans arrêt (0) à ils sont venus (10). */
  mots: number | null;
  /** Comptages bruts. */
  abandons: number | null;
  repetitions: number | null;
  bequilles: number | null;
}

export const MESURES_VIDES: Mesures = {
  debit: null, clarte: null, mots: null, abandons: null, repetitions: null, bequilles: null,
};

/** Les six mesures, telles que la fenêtre de débrief les demande. */
export const MESURES: Array<{ id: keyof Mesures; label: string; aide: string; type: "note" | "compte"; skill: string }> = [
  { id: "debit",       label: "Débit",              aide: "0 = je me suis emballé · 10 = tenu du début à la fin", type: "note",   skill: "debit" },
  { id: "clarte",      label: "Clarté",             aide: "0 = j'ai empilé · 10 = une idée par phrase",           type: "note",   skill: "clarte" },
  { id: "mots",        label: "Accès aux mots",     aide: "0 = j'ai cherché sans arrêt · 10 = ils sont venus",    type: "note",   skill: "formulation" },
  { id: "abandons",    label: "Phrases abandonnées", aide: "Recommencées en cours de route",                      type: "compte", skill: "clarte" },
  { id: "repetitions", label: "Répétitions",        aide: "Le même mot, la même idée",                            type: "compte", skill: "formulation" },
  { id: "bequilles",   label: "Béquilles",          aide: "« du coup », « en fait », « bah », « genre »",          type: "compte", skill: "formulation" },
];

export interface Debrief {
  id: string; date: string;
  /** Identifiants de FAUTES cochées. La liste vide est une information, pas un vide. */
  fautes: string[];
  /** Les six chiffres de la séance. Chacun peut rester vide. */
  mesures: Mesures;
  note: string;
  /** La simulation jouée ce jour-là, quand il y en avait une. */
  simulationId?: string | null;
}

export type StatutMission = "en cours" | "faite" | "ratee";

export interface Mission {
  id: string; date: string; texte: string; phase: number;
  statut: StatutMission;
  /** Jour où l'on a répondu « fait » ou « pas fait » — à la séance suivante. */
  regleLe: string | null;
}

export interface Evaluation { semaine: string; scores: Record<string, number> }

export interface CommStore {
  phase: number;
  /** Premier jour du parcours. C'est lui qui donne l'échelle de l'année. */
  debut: string | null;
  /** Le cap, en une phrase. Ce qu'on veut pouvoir faire dans douze mois. */
  cap: string;
  faits: Fait[];
  preuves: Preuve[];
  mots: Mot[];
  histoires: Histoire[];
  travaux: Travail[];
  debriefs: Debrief[];
  missions: Mission[];
  evaluations: Evaluation[];
}

/** Le cap par défaut — celui du départ, reformulable à tout moment. */
export const CAP_DEFAUT =
  "Entrer dans n'importe quelle conversation, trouver quoi dire, et y rester.";

export const EMPTY_STORE: CommStore = {
  phase: 1, debut: null, cap: CAP_DEFAUT, faits: [], preuves: [], mots: [],
  histoires: [], travaux: [], debriefs: [], missions: [], evaluations: [],
};

const str = (v: unknown): string => (v == null ? "" : String(v));
const day = (v: unknown): string => str(v).slice(0, 10);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const int = (v: unknown, def = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : def;
};
const recent = (a: { date: string }, b: { date: string }) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0);

/**
 * Le magasin, lisible quelle que soit la forme trouvée.
 *
 * NORMALISÉ à la lecture plutôt que migré (cf. CLAUDE.md) : un champ ajouté
 * plus tard prend sa valeur par défaut chez les anciens enregistrements. C'est
 * ce qui permet d'avoir remplacé les neuf « niveaux » de la première version
 * par dix phases sans rien perdre — une clé `niveau` oubliée dans le magasin
 * n'empêche simplement plus rien.
 */
export function normalizeStore(raw: unknown): CommStore {
  const r = (raw || {}) as Record<string, unknown>;
  return {
    phase: Math.max(PHASE_MIN, Math.min(PHASE_MAX, int(r.phase, PHASE_MIN))),
    debut: r.debut ? day(r.debut) : null,
    cap: str(r.cap).trim() || CAP_DEFAUT,
    faits: arr(r.faits).map((v, i) => {
      const o = (v || {}) as Record<string, unknown>;
      const date = day(o.date);
      const drillId = str(o.drillId);
      if (!date || !drillId) return null;
      return { id: str(o.id) || `f${date}-${drillId}-${i}`, date, drillId } as Fait;
    }).filter((v): v is Fait => v !== null),

    preuves: arr(r.preuves).map((v, i) => {
      const o = (v || {}) as Record<string, unknown>;
      const texte = str(o.texte).trim();
      if (!texte) return null;
      return { id: str(o.id) || `p${i}`, date: day(o.date), texte, skill: o.skill ? str(o.skill) : null } as Preuve;
    }).filter((v): v is Preuve => v !== null).sort(recent),

    mots: arr(r.mots).map((v, i) => {
      const o = (v || {}) as Record<string, unknown>;
      const mot = str(o.mot).trim();
      if (!mot) return null;
      return {
        id: str(o.id) || `m${i}`, date: day(o.date), mot,
        definition: str(o.definition), synonymes: str(o.synonymes), contraire: str(o.contraire),
        phrase: str(o.phrase), replique: str(o.replique),
        utiliseLe: o.utiliseLe ? day(o.utiliseLe) : null,
      } as Mot;
    }).filter((v): v is Mot => v !== null).sort(recent),

    histoires: arr(r.histoires).map((v, i) => {
      const o = (v || {}) as Record<string, unknown>;
      const titre = str(o.titre).trim();
      if (!titre) return null;
      return {
        id: str(o.id) || `h${i}`, date: day(o.date), titre,
        contexte: str(o.contexte), objectif: str(o.objectif), probleme: str(o.probleme),
        /* `escalade` remplace l'ancien « moment fort » : une histoire ne monte
           pas d'un cran, elle empire — et c'est la montée qui tient l'auditeur.
           L'ancienne clé est relue pour ne rien perdre des histoires déjà
           rangées. */
        escalade: str(o.escalade || o.momentFort),
        resultat: str(o.resultat || o.fin),
        racontee: Math.max(0, int(o.racontee, 0)),
      } as Histoire;
    }).filter((v): v is Histoire => v !== null).sort(recent),

    travaux: arr(r.travaux).map((v, i) => {
      const o = (v || {}) as Record<string, unknown>;
      const drillId = str(o.drillId);
      if (!drillId) return null;
      return {
        id: str(o.id) || `t${i}`, date: day(o.date), drillId,
        matiere: str(o.matiere), reponses: arr(o.reponses).map(str),
      } as Travail;
    }).filter((v): v is Travail => v !== null).sort(recent),

    debriefs: arr(r.debriefs).map((v, i) => {
      const o = (v || {}) as Record<string, unknown>;
      const date = day(o.date);
      if (!date) return null;
      const connues = new Set(FAUTES.map(f => f.id));
      const src = (o.mesures || {}) as Record<string, unknown>;
      const mesures = { ...MESURES_VIDES };
      for (const m of MESURES) {
        const v = Number(src[m.id]);
        if (!Number.isFinite(v)) continue;
        /* Une note est bornée à dix, un comptage ne l'est pas : on peut dire
           « du coup » vingt-deux fois en trois minutes, et le plafonner à dix
           masquerait précisément le cas qui mérite un renfort. */
        mesures[m.id] = m.type === "note"
          ? Math.max(0, Math.min(10, Math.round(v)))
          : Math.max(0, Math.round(v));
      }
      return {
        id: str(o.id) || `d${i}`, date,
        fautes: arr(o.fautes).map(str).filter(f => connues.has(f)),
        mesures,
        note: str(o.note),
        simulationId: o.simulationId ? str(o.simulationId) : null,
      } as Debrief;
    }).filter((v): v is Debrief => v !== null).sort(recent),

    missions: arr(r.missions).map((v, i) => {
      const o = (v || {}) as Record<string, unknown>;
      const texte = str(o.texte).trim();
      const date = day(o.date);
      if (!texte || !date) return null;
      const statut = str(o.statut);
      return {
        id: str(o.id) || `mi${i}`, date, texte,
        phase: Math.max(PHASE_MIN, Math.min(PHASE_MAX, int(o.phase, PHASE_MIN))),
        statut: (statut === "faite" || statut === "ratee" ? statut : "en cours") as StatutMission,
        regleLe: o.regleLe ? day(o.regleLe) : null,
      } as Mission;
    }).filter((v): v is Mission => v !== null).sort(recent),

    evaluations: arr(r.evaluations).map(v => {
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
    }).filter((v): v is Evaluation => v !== null)
      /* Les semaines montent, de la plus ancienne à la plus récente : une
         courbe, un écart et « la première note » se lisent tous dans ce sens.
         Le reste du magasin est trié à l'envers, pour la raison opposée — on y
         cherche toujours la dernière entrée. */
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

/** Marque un exercice fait ce jour-là. Deux fois le même jour ne compte qu'une. */
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
    mots: store.mots.map(m => (m.id === id ? { ...m, utiliseLe: m.utiliseLe ? null : day(date) } : m)),
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
  return { ...store, histoires: store.histoires.map(h => (h.id === id ? { ...h, racontee: h.racontee + 1 } : h)) };
}

export function withoutHistoire(store: CommStore, id: string): CommStore {
  return { ...store, histoires: store.histoires.filter(h => h.id !== id) };
}

export function withTravail(store: CommStore, t: Omit<Travail, "id">): CommStore {
  if (!t.reponses.some(r => str(r).trim())) return store;
  return { ...store, travaux: [{ ...t, id: newId("t") }, ...store.travaux] };
}

/** Le débrief du jour. Un second débrief le même jour REMPLACE le premier. */
export function withDebrief(store: CommStore, d: Omit<Debrief, "id">): CommStore {
  const date = day(d.date);
  const autres = store.debriefs.filter(x => x.date !== date);
  return normalizeStore({ ...store, debriefs: [...autres, { ...d, date, id: newId("d") }] });
}

/** Une mission prise aujourd'hui. Elle reste « en cours » jusqu'à la séance suivante. */
export function withMission(store: CommStore, date: string, texte: string, phase: number): CommStore {
  const t = str(texte).trim();
  if (!t) return store;
  return {
    ...store,
    missions: [{ id: newId("mi"), date: day(date), texte: t, phase, statut: "en cours", regleLe: null }, ...store.missions],
  };
}

/** La réponse à « tu l'as faite ? », posée un autre jour que celui de la mission. */
export function withMissionReglee(store: CommStore, id: string, faite: boolean, date: string): CommStore {
  return {
    ...store,
    missions: store.missions.map(m =>
      m.id === id ? { ...m, statut: faite ? "faite" : "ratee", regleLe: day(date) } : m),
  };
}

/** L'auto-note de la semaine. Une semaine déjà notée est REMPLACÉE, pas doublée. */
export function withEvaluation(store: CommStore, semaine: string, scores: Record<string, number>): CommStore {
  const s = day(semaine);
  const autres = store.evaluations.filter(e => e.semaine !== s);
  return normalizeStore({ ...store, evaluations: [...autres, { semaine: s, scores }] });
}

/**
 * Le premier jour du parcours.
 *
 * Posé une fois, il ne se déplace pas tout seul : c'est l'origine de l'échelle,
 * et une origine qui glisse rend toutes les semaines fausses. Il se règle à la
 * main pour celui qui a commencé avant d'ouvrir la page.
 */
export function withDebut(store: CommStore, date: string): CommStore {
  const d = day(date);
  return d ? { ...store, debut: d } : store;
}

/** Le cap de l'année, reformulé. Vide = on remet celui du départ. */
export function withCap(store: CommStore, texte: string): CommStore {
  return { ...store, cap: str(texte).trim() || CAP_DEFAUT };
}

export function withPhase(store: CommStore, n: number): CommStore {
  return { ...store, phase: Math.max(PHASE_MIN, Math.min(PHASE_MAX, Math.round(n))) };
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

export function faitsDuJour(store: CommStore, date: string): string[] {
  const d = day(date);
  return store.faits.filter(f => f.date === d).map(f => f.drillId);
}

export function derniereEvaluation(store: CommStore): Evaluation | null {
  return store.evaluations.length > 0 ? store.evaluations[store.evaluations.length - 1] : null;
}

/**
 * La mission d'une séance PRÉCÉDENTE qui attend encore sa réponse.
 *
 * Celle du jour même n'est pas rendue : on ne demande pas le matin si l'on a
 * fait ce qu'on se propose de faire dans la journée. C'est tout l'intérêt du
 * report — la question se pose à ce qui a eu lieu.
 */
export function missionEnAttente(store: CommStore, today: string): Mission | null {
  const d = day(today);
  return store.missions.find(m => m.statut === "en cours" && m.date < d) ?? null;
}

export interface EtatSkill {
  skill: Skill;
  /** La note la plus récente, ou `null` tant que rien n'a été noté. */
  note: number | null;
  /** Le feu correspondant — `null` avant la première note. */
  feu: Feu | null;
  /** L'écart avec la toute première note : le seul chiffre de progrès honnête. */
  ecart: number | null;
  suite: number[];
  /** Exercices faits qui visent cette compétence. */
  volume: number;
  /** Fautes de cette compétence relevées en débrief. */
  fautes: number;
}

export function etatDesCompetences(store: CommStore): EtatSkill[] {
  const volumeParSkill = new Map<string, number>();
  for (const f of store.faits) {
    const d = drillById(f.drillId);
    if (!d) continue;
    volumeParSkill.set(d.skill, (volumeParSkill.get(d.skill) || 0) + 1);
  }
  const fautesParSkill = new Map<string, number>();
  for (const deb of store.debriefs) {
    for (const id of deb.fautes) {
      const f = fauteById(id);
      if (!f) continue;
      fautesParSkill.set(f.skill, (fautesParSkill.get(f.skill) || 0) + 1);
    }
  }
  return SKILLS.map(skill => {
    const suite = store.evaluations
      .map(e => e.scores[skill.id])
      .filter((n): n is number => Number.isFinite(n));
    const note = suite.length > 0 ? suite[suite.length - 1] : null;
    return {
      skill,
      note,
      feu: feuDe(note),
      ecart: suite.length > 1 ? suite[suite.length - 1] - suite[0] : null,
      suite,
      volume: volumeParSkill.get(skill.id) || 0,
      fautes: fautesParSkill.get(skill.id) || 0,
    };
  });
}

/**
 * Les fautes qui REVIENNENT, sur les dernières séances.
 *
 * C'est le seul endroit où la page dit quelque chose qu'on ne savait pas :
 * une faute cochée une fois est un accident, la même cochée six fois sur dix
 * séances est le sujet de la prochaine phase. On se souvient de la dernière
 * séance, pas des dix.
 */
export function fautesFrequentes(store: CommStore, fenetre = 10): Array<{ faute: Faute; n: number }> {
  const compte = new Map<string, number>();
  for (const d of store.debriefs.slice(0, fenetre)) {
    for (const id of d.fautes) compte.set(id, (compte.get(id) || 0) + 1);
  }
  return [...compte.entries()]
    .map(([id, n]) => ({ faute: fauteById(id), n }))
    .filter((x): x is { faute: Faute; n: number } => x.faute !== null)
    .sort((a, b) => b.n - a.n || a.faute.label.localeCompare(b.faute.label));
}

export type EtatMaillon = "inconnu" | "fragile" | "en travail" | "solide";

/**
 * L'état de chaque maillon de la chaîne.
 *
 * `inconnu` tant que la compétence n'a jamais été notée : dire « fragile » d'un
 * maillon qu'on n'a pas encore regardé serait un diagnostic inventé.
 */
export function etatDeLaChaine(store: CommStore): Array<{ maillon: Maillon; etat: EtatMaillon; note: number | null }> {
  const derniere = derniereEvaluation(store);
  return CHAINE.map(maillon => {
    const note = derniere && Number.isFinite(derniere.scores[maillon.skill]) ? derniere.scores[maillon.skill] : null;
    const etat: EtatMaillon =
      note == null ? "inconnu" : note <= 3 ? "fragile" : note <= 6 ? "en travail" : "solide";
    return { maillon, etat, note };
  });
}

/* ─── La séance du jour ──────────────────────────────────────────────────── */

/**
 * Un tirage STABLE dans la journée.
 *
 * Math.random() redonnerait une séance différente à chaque rendu — on la
 * relirait toute la journée sans jamais la faire. La graine est donc le jour
 * lui-même, plus le numéro de relance quand on demande expressément autre chose.
 */
function graine(texte: string): number {
  let h = 2166136261;
  for (let i = 0; i < texte.length; i++) {
    h ^= texte.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

export function tirage<T>(liste: T[], cle: string): T | null {
  if (!liste || liste.length === 0) return null;
  return liste[graine(cle) % liste.length];
}

/** La matière d'un exercice pour un jour donné (`roll` change de tirage). */
export function matiereDuJour(drill: Drill, date: string, roll = 0): string | null {
  if (!drill.matiere || drill.matiere.length === 0) return null;
  return tirage(drill.matiere, `${day(date)}|${drill.id}|${roll}`);
}

export type TempsId = "echauffement" | "competence" | "simulation" | "debrief" | "mission";

export interface Temps {
  id: TempsId;
  label: string;
  minutes: string;
  /** Ce qu'on fait : un exercice, une simulation, une mission, ou le débrief. */
  drill?: Drill;
  simulation?: Simulation;
  mission?: string;
}

export interface Seance {
  date: string;
  phase: Phase;
  /** Les cinq temps, toujours les cinq, toujours dans cet ordre. */
  temps: Temps[];
  /**
   * L'exercice en plus, quand les débriefs signalent une habitude. Il est à
   * part et non glissé dans les cinq : la séance garde sa forme, et ce qui
   * s'ajoute se voit comme un ajout — avec sa raison écrite à côté.
   */
  renfort: { drill: Drill; priorite: Priorite } | null;
  /** Ce qui est déjà coché aujourd'hui (identifiants d'exercices et de temps). */
  faits: string[];
}

/**
 * La séance du jour : cinq temps, toujours les mêmes, toujours dans cet ordre.
 *
 * Le choix du contenu suit LA PHASE, et non la compétence la plus mal notée.
 * C'est une décision, pas une simplification : courir après le plus bas
 * reviendrait à travailler les huit compétences à la fois, ce que le parcours
 * refuse — elles se perturbent entre elles, et on ne peut pas ralentir son
 * débit tout en cherchant le mot parfait.
 *
 * L'échauffement, lui, est le même à toutes les phases : c'est l'instrument, et
 * il se reprend en main avant chaque séance, même à la dixième.
 */
export function seanceDuJour(store: CommStore, date: string, roll = 0): Seance {
  const d = day(date);
  const phase = phaseOf(store.phase);

  const echauffement = tirage(drillsDeLaPhase(0).filter(x => x.forme === "voix"), `${d}|ech|${roll}`);

  /* La compétence du jour vient de la phase. Une phase qui n'a que du terrain
     (la 6 en a deux) garde son exercice de terrain ici : c'est bien lui, le
     travail du jour. */
  const deLaPhase = drillsDeLaPhase(phase.n);
  const competence = tirage(deLaPhase, `${d}|comp|${roll}`)
    /* Phase 10 : plus d'atelier, on ne corrige plus phrase par phrase. On
       reprend alors un exercice de n'importe quelle phase précédente. */
    ?? tirage(DRILLS.filter(x => x.phase > 0 && x.phase < phase.n), `${d}|comp2|${roll}`);

  /* La simulation de la phase si elle en a une, sinon la plus proche en
     dessous : une scène trop en avance n'entraîne rien, mais une séance sans
     simulation perd ce qu'aucun atelier ne donne — l'imprévu. */
  const propres = SIMULATIONS.filter(s => s.phase === phase.n);
  const enDessous = SIMULATIONS.filter(s => s.phase <= phase.n);
  const simulation = tirage(propres.length > 0 ? propres : (enDessous.length > 0 ? enDessous : SIMULATIONS), `${d}|sim|${roll}`);

  const mission = tirage(MISSIONS[phase.n] || MISSIONS[PHASE_MIN], `${d}|mis|${roll}`);

  const temps: Temps[] = [
    { id: "echauffement", label: "Échauffement", minutes: "5 min", drill: echauffement || undefined },
    { id: "competence", label: "Compétence du jour", minutes: "10 min", drill: competence || undefined },
    { id: "simulation", label: "Simulation", minutes: "10–20 min", simulation: simulation || undefined },
    { id: "debrief", label: "Débrief", minutes: "5–10 min" },
    { id: "mission", label: "Mission réelle", minutes: "dehors", mission: mission || undefined },
  ];

  return { date: d, phase, temps, renfort: renfortDuJour(store, d, roll), faits: faitsDuJour(store, d) };
}

/* ─── L'adaptation ───────────────────────────────────────────────────────── */

export interface Priorite {
  /** La compétence à renforcer, indépendamment de la phase en cours. */
  skill: Skill;
  /** Pourquoi elle sort — la phrase à afficher, en clair. */
  raison: string;
  /** Sur combien de séances la lecture est faite. */
  seances: number;
}

/**
 * Ce qui coince VRAIMENT, d'après les dernières séances.
 *
 * Le parcours reste linéaire — une phase, une compétence — et c'est voulu. Mais
 * il serait absurde de continuer à dérouler le calendrier quand six débriefs de
 * suite disent « j'ai recommencé une phrase ». La priorité ne change donc pas la
 * phase : elle ajoute UN exercice de renfort à la séance, et elle le dit.
 *
 * Deux sources, dans cet ordre : les COMPTAGES d'abord (ils sont vérifiables :
 * on a dit « du coup » onze fois ou on ne l'a pas dit), les fautes cochées
 * ensuite. Sous trois séances, rien n'est rendu : trois est le minimum pour
 * distinguer une habitude d'un mauvais jour.
 */
export function prioriteDuMoment(store: CommStore, fenetre = 7): Priorite | null {
  const derniers = store.debriefs.slice(0, fenetre);
  if (derniers.length < 3) return null;

  /* Un comptage qui dépasse le seuil sur la MOITIÉ des séances est une
     habitude. Les seuils sont volontairement indulgents : le programme ne
     cherche pas le zéro, il cherche la baisse. */
  const seuils: Array<{ id: keyof Mesures; seuil: number; skill: string; phrase: string }> = [
    { id: "abandons", seuil: 3, skill: "clarte", phrase: "tu recommences tes phrases en cours de route" },
    { id: "bequilles", seuil: 6, skill: "formulation", phrase: "les béquilles (« du coup », « en fait ») reviennent" },
    { id: "repetitions", seuil: 5, skill: "formulation", phrase: "tu répètes les mêmes mots" },
  ];
  for (const s of seuils) {
    const concernees = derniers.filter(d => {
      const v = d.mesures[s.id];
      return v != null && v >= s.seuil;
    }).length;
    if (concernees * 2 >= derniers.length) {
      const skill = skillById(s.skill);
      if (skill) {
        return { skill, raison: `Sur ${derniers.length} séances, ${s.phrase}.`, seances: derniers.length };
      }
    }
  }

  /* Une note basse tenue dans le temps compte aussi : une moyenne sous 4 sur
     trois séances est plus parlante qu'un 2 isolé. */
  for (const m of MESURES.filter(x => x.type === "note")) {
    const notes = derniers.map(d => d.mesures[m.id]).filter((v): v is number => v != null);
    if (notes.length < 3) continue;
    const moyenne = notes.reduce((a, b) => a + b, 0) / notes.length;
    if (moyenne < 4) {
      const skill = skillById(m.skill);
      if (skill) {
        return {
          skill,
          raison: `${m.label} reste bas sur tes ${notes.length} dernières séances (${moyenne.toFixed(1)}/10).`,
          seances: notes.length,
        };
      }
    }
  }

  /* À défaut, la faute la plus cochée — à condition qu'elle revienne. */
  const frequentes = fautesFrequentes(store, fenetre);
  const tete = frequentes[0];
  if (tete && tete.n >= 3) {
    const skill = skillById(tete.faute.skill);
    if (skill) {
      return {
        skill,
        raison: `« ${tete.faute.label} » revient ${tete.n} fois sur tes ${derniers.length} dernières séances.`,
        seances: derniers.length,
      };
    }
  }
  return null;
}

/**
 * L'exercice de renfort : celui qui vise la priorité, hors de la phase.
 *
 * Il est tiré parmi les exercices DÉJÀ ouverts (phase courante ou en dessous) :
 * répondre à une faiblesse de clarté par un exercice de storytelling ajouterait
 * une difficulté au lieu d'en retirer une.
 */
export function renfortDuJour(store: CommStore, date: string, roll = 0): { drill: Drill; priorite: Priorite } | null {
  const priorite = prioriteDuMoment(store);
  if (!priorite) return null;
  const candidats = DRILLS.filter(d =>
    d.skill === priorite.skill.id && d.phase <= store.phase && d.forme !== "terrain");
  const drill = tirage(candidats, `${day(date)}|renfort|${roll}`);
  return drill ? { drill, priorite } : null;
}

/* ─── Passage de phase ───────────────────────────────────────────────────── */

export interface EtatPhase {
  phase: Phase;
  /** Exercices de cette phase déjà faits. */
  volume: number;
  volumeAttendu: number;
  /** La note de la compétence de la phase, si elle existe. */
  note: number | null;
  noteAttendue: number;
  /** Missions de cette phase réellement faites. */
  missions: number;
  missionsAttendues: number;
  /** Les trois conditions sont tenues : la page PROPOSE la suite. */
  pret: boolean;
}

/**
 * Faut-il proposer la phase suivante ?
 *
 * Trois conditions, et aucune n'est un score d'aisance : du VOLUME (on a
 * pratiqué), une AUTO-NOTE (on se sent mieux), et des MISSIONS FAITES (ça a eu
 * lieu dehors). La troisième est la seule qui parle du monde réel, et c'est
 * précisément celle qu'un logiciel ne peut pas fabriquer tout seul : il faut
 * être revenu dire que oui.
 *
 * L'app ne décide rien — elle propose, le bouton reste à l'utilisateur.
 */
export function etatDeLaPhase(store: CommStore): EtatPhase {
  const phase = phaseOf(store.phase);
  const ids = new Set(drillsDeLaPhase(phase.n).map(d => d.id));
  const volume = store.faits.filter(f => ids.has(f.drillId)).length;
  const derniere = derniereEvaluation(store);
  const note = derniere && Number.isFinite(derniere.scores[phase.skill]) ? derniere.scores[phase.skill] : null;
  const missions = store.missions.filter(m => m.phase === phase.n && m.statut === "faite").length;
  const volumeAttendu = 10;
  const noteAttendue = 6;
  const missionsAttendues = 3;
  return {
    phase, volume, volumeAttendu, note, noteAttendue, missions, missionsAttendues,
    pret: phase.n < PHASE_MAX
      && volume >= volumeAttendu
      && note != null && note >= noteAttendue
      && missions >= missionsAttendues,
  };
}

/* ─── L'année ────────────────────────────────────────────────────────────── */

const joursEntre = (a: string, b: string): number =>
  Math.round((new Date(`${day(b)}T12:00:00`).getTime() - new Date(`${day(a)}T12:00:00`).getTime()) / 86400000);

/** Le jour, décalé de `n` jours. */
export function jourPlus(date: string, n: number): string {
  const d = new Date(`${day(date)}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * La semaine du parcours, à partir du premier jour. 1 = la semaine du départ.
 *
 * `null` tant qu'aucun départ n'est posé : une semaine « 1 » affichée par
 * défaut ferait croire que le compteur tourne alors que rien n'a commencé.
 */
export function semaineDuParcours(store: CommStore, today: string): number | null {
  if (!store.debut) return null;
  const jours = joursEntre(store.debut, today);
  if (jours < 0) return 1;
  return Math.floor(jours / 7) + 1;
}

/**
 * La phase que le CALENDRIER suggère à cette semaine-là.
 *
 * Elle n'a aucune autorité : le parcours avance à la pratique, pas à la date.
 * Elle sert à situer — « le calendrier disait 5, j'en suis à 3 » est une
 * information utile, tant qu'elle ne se transforme pas en retard à rattraper.
 */
export function phaseAttendue(semaine: number | null): Phase | null {
  if (semaine == null) return null;
  return PHASES.find(p => semaine >= p.de && semaine <= p.a) ?? PHASES[PHASES.length - 1];
}

/** Le nombre d'exercices faits chaque jour — la trame de l'année. */
export function joursTravailles(store: CommStore): Map<string, number> {
  const par = new Map<string, number>();
  for (const f of store.faits) par.set(f.date, (par.get(f.date) || 0) + 1);
  return par;
}

export interface Bilan {
  du: string;
  au: string;
  /** Jours où quelque chose a été fait — pas le nombre d'exercices. */
  jours: number;
  exercices: number;
  simulations: number;
  debriefs: number;
  missionsFaites: number;
  missionsRatees: number;
  preuves: number;
  mots: number;
  motsUtilises: number;
  histoires: number;
  histoiresRacontees: number;
  /** Les fautes de la période, les plus fréquentes d'abord. */
  fautes: Array<{ faute: Faute; n: number }>;
  /** Par compétence : la note au début de la période, celle à la fin. */
  progres: Array<{ skill: Skill; de: number | null; a: number | null }>;
}

/**
 * Le bilan d'une période — ce qu'on ne peut PAS faire de mémoire.
 *
 * Sur un mois, personne ne se souvient d'avoir coché « j'ai accéléré » six fois
 * ni d'avoir noté sa clarté à 3 puis à 5. C'est la seule chose que la page
 * apporte vraiment sur la durée : elle relit à notre place, et elle relit tout.
 *
 * Les bornes sont INCLUSIVES des deux côtés : un bilan « du 1er au 31 » qui
 * laisserait le 31 dehors ferait disparaître une séance par mois.
 */
export function bilan(store: CommStore, du: string, au: string): Bilan {
  const d = day(du);
  const a = day(au);
  const dans = (x: string) => x >= d && x <= a;

  const faits = store.faits.filter(f => dans(f.date));
  const debriefs = store.debriefs.filter(x => dans(x.date));
  const missions = store.missions.filter(m => dans(m.date));
  const mots = store.mots.filter(m => dans(m.date));

  const compte = new Map<string, number>();
  for (const deb of debriefs) for (const id of deb.fautes) compte.set(id, (compte.get(id) || 0) + 1);

  const dedans = store.evaluations.filter(e => dans(e.semaine));
  const premiere = dedans.length > 0 ? dedans[0] : null;
  const derniere = dedans.length > 0 ? dedans[dedans.length - 1] : null;

  return {
    du: d,
    au: a,
    jours: new Set(faits.map(f => f.date)).size,
    exercices: faits.filter(f => !f.drillId.startsWith("sim:") && f.drillId !== "debrief" && f.drillId !== "mission").length,
    simulations: faits.filter(f => f.drillId.startsWith("sim:")).length,
    debriefs: debriefs.length,
    missionsFaites: missions.filter(m => m.statut === "faite").length,
    missionsRatees: missions.filter(m => m.statut === "ratee").length,
    preuves: store.preuves.filter(p => dans(p.date)).length,
    mots: mots.length,
    motsUtilises: store.mots.filter(m => m.utiliseLe && dans(m.utiliseLe)).length,
    histoires: store.histoires.filter(h => dans(h.date)).length,
    histoiresRacontees: store.histoires.filter(h => dans(h.date)).reduce((n, h) => n + h.racontee, 0),
    fautes: [...compte.entries()]
      .map(([id, n]) => ({ faute: fauteById(id), n }))
      .filter((x): x is { faute: Faute; n: number } => x.faute !== null)
      .sort((x, y) => y.n - x.n || x.faute.label.localeCompare(y.faute.label)),
    progres: SKILLS.map(skill => ({
      skill,
      de: premiere && Number.isFinite(premiere.scores[skill.id]) ? premiere.scores[skill.id] : null,
      a: derniere && Number.isFinite(derniere.scores[skill.id]) ? derniere.scores[skill.id] : null,
    })),
  };
}

/** Le premier jour du mois d'une date. */
export function debutDuMois(date: string): string {
  return `${day(date).slice(0, 7)}-01`;
}

/** Le dernier jour du mois d'une date. */
export function finDuMois(date: string): string {
  const d = new Date(`${debutDuMois(date)}T12:00:00`);
  d.setMonth(d.getMonth() + 1);
  d.setDate(0);
  return d.toISOString().slice(0, 10);
}

/** Le mois précédent celui d'une date, en bornes inclusives. */
export function moisPrecedent(date: string): { du: string; au: string } {
  const d = new Date(`${debutDuMois(date)}T12:00:00`);
  d.setDate(0);
  const dedans = d.toISOString().slice(0, 10);
  return { du: debutDuMois(dedans), au: finDuMois(dedans) };
}
