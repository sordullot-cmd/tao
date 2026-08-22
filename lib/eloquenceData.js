/**
 * eloquenceData — contenu statique de la page « Éloquence ».
 *
 * Tout ce qui ne dépend pas de l'IA vit ici : les quatre repères de la parole et
 * leurs seuils, la bibliothèque de textes à lire, les virelangues et leur
 * protocole de répétition, les occlusives T·D·B·P, les échauffements, les thèmes
 * du générateur de sujets, les cadres (frameworks) de structuration, la liste des
 * mots de remplissage et la définition des axes de notation.
 *
 * L'entraînement est rangé en trois temps (voir `EXERCISE_MODES`) :
 *   articulation → la mécanique, à la répétition, sans note ;
 *   reading      → le texte d'un autre, avec une intention ;
 *   speaking     → ses propres mots, sous contrainte.
 *
 * Persistance : la page stocke l'historique des sessions et la progression via
 * useCloudState (clés ci-dessous), comme les autres pages de productivité.
 */

export const ELOQ_STORAGE_KEY = "tr4de_eloquence_v1";
export const ELOQ_CLOUD_KEY = "eloquence";

/* ─────────────── Niveaux de difficulté ─────────────── */
export const LEVELS = [
  { id: 1, label: "Facile",     color: "#16A34A" },
  { id: 2, label: "Moyen",      color: "#3B82F6" },
  { id: 3, label: "Difficile",  color: "#F59E0B" },
  { id: 4, label: "Expert",     color: "#EF4444" },
];
export const LEVEL_BY_ID = Object.fromEntries(LEVELS.map((l) => [l.id, l]));

/* ─────────────── Les quatre repères de la parole ───────────────
 * Le socle de la page : quatre règles simples, mesurables sur l'enregistrement,
 * qui valent pour TOUS les exercices. Elles sont affichées en permanence et
 * chaque prise est notée dessus (voir `buildCoachChecks`).
 *
 * Une seule source pour les seuils : l'interface, le prompt de l'IA et les
 * consignes d'exercice les lisent ici. Les changer se fait à un seul endroit. */
export const SPEECH_TARGETS = {
  // Débit : la cible de travail, et le seuil au-delà duquel on parle trop vite.
  wpmMin: 110,
  wpmMax: 130,
  wpmTooFast: 150,
  wpmTooSlow: 90,
  // Silences : part du temps passé à respirer (pauses internes ≥ 0.3 s).
  pauseRatioMin: 0.12,
  pauseRatioMax: 0.35,
  // Bruits parasites : écart voix / bruit de fond, en dB.
  snrGood: 25,
  snrPoor: 15,
  // Fins de phrase descendantes : part des phrases qui retombent.
  fallingRatioGood: 0.6,
  fallingRatioPoor: 0.35,
};

/* Les quatre repères, dans l'ordre d'affichage. `rule` est la consigne brute,
 * telle qu'on la garde en tête avant de parler. */
export const SPEECH_RULES = [
  {
    id: "pace",
    label: "Débit",
    rule: `Vise ${SPEECH_TARGETS.wpmMin}–${SPEECH_TARGETS.wpmMax} mots/minute.`,
    why: `Au-delà de ${SPEECH_TARGETS.wpmTooFast} mots/minute, tu parles trop vite : on décroche.`,
  },
  {
    id: "silences",
    label: "Silences",
    rule: "Mets de vrais silences.",
    why: "Une pause après une idée la fait exister. Elle remplace aussi le « euh ».",
  },
  {
    id: "noise",
    label: "Bruits parasites",
    rule: "Coupe les bruits parasites.",
    why: "Bruits de bouche, souffles dans le micro, fond sonore : tout ça brouille la voix.",
  },
  {
    id: "endings",
    label: "Fins de phrase",
    rule: "Finis tes phrases en descendant.",
    why: "Une fin qui remonte sonne comme une question, et fait douter de ce que tu affirmes.",
  },
];

/* ─────────────── Axes de notation (0–100) ───────────────
 * Partagés entre l'affichage et le prompt de l'IA. L'ordre fixe le rendu. */
export const SCORE_AXES = [
  { id: "structure",    label: "Structure",    desc: "Organisation logique des idées (intro, corps, conclusion)." },
  { id: "vocabulary",   label: "Vocabulaire",  desc: "Richesse, précision et variété du lexique." },
  { id: "clarity",      label: "Clarté",       desc: "Facilité à suivre le propos, phrases nettes." },
  { id: "confidence",   label: "Confiance",    desc: "Assurance perçue, peu d'hésitations et de mots de remplissage." },
  { id: "diction",      label: "Diction",      desc: "Articulation et netteté de la prononciation." },
  { id: "rhythm",       label: "Rythme",       desc: "Cadence, débit, pauses et variation du tempo." },
];
// Axe supplémentaire affiché uniquement pour les exercices de lecture.
export const FIDELITY_AXIS = { id: "fidelity", label: "Fidélité", desc: "Exactitude de la lecture par rapport au texte de référence." };

/* ─────────────── Mots de remplissage (FR) ───────────────
 * Comptés localement sur la transcription pour donner une métrique immédiate et
 * nourrir l'analyse IA. Ordre du plus long au plus court pour un matching propre. */
export const FILLER_WORDS = [
  "du coup", "en fait", "c'est-à-dire", "c'est à dire", "tu vois", "vous voyez",
  "je veux dire", "on va dire", "comment dire", "et tout", "et cetera",
  "voilà", "genre", "enfin", "bah", "ben", "euh", "heu", "hum", "bref",
  "quoi", "donc", "alors",
];

/* ─────────────── Bibliothèque de textes (lecture à voix haute) ───────────────
 * Genres variés et longueurs croissantes pour travailler la diction sur des
 * registres différents. `text` est lu tel quel ; il sert aussi de référence
 * pour mesurer la fidélité de lecture. */
export const READING_TEXTS = [
  {
    id: "r-hare",
    level: 1,
    genre: "Fable",
    title: "Le lièvre et la tortue",
    text:
      "Rien ne sert de courir, il faut partir à point. Le lièvre et la tortue en sont un témoignage. " +
      "« Gageons, dit la tortue, que vous n'atteindrez pas si tôt que moi ce but. » Le lièvre, sûr de lui, " +
      "se mit à rire de cette prétention : comment une créature aussi lente oserait-elle le défier à la course ? " +
      "Il accepta le pari sans la moindre hésitation, persuadé que la victoire lui était déjà acquise. " +
      "Le jour venu, les deux concurrents s'élancèrent ensemble. Le lièvre, en quelques bonds prodigieux, " +
      "disparut au loin et laissa sa rivale loin derrière lui. Estimant avoir tout le temps du monde, il " +
      "décida de brouter quelques herbes tendres, de humer les fleurs du chemin, puis, gagné par la chaleur, " +
      "il s'allongea à l'ombre d'un grand chêne et s'endormit profondément. La tortue, elle, patiente et " +
      "régulière, ne se laissa jamais distraire. Elle avançait pas à pas, sans jamais s'arrêter, sourde aux " +
      "moqueries et indifférente à la fatigue. Lorsque le lièvre se réveilla en sursaut et aperçut son ombre " +
      "déjà longue, il bondit de toutes ses forces vers la ligne d'arrivée. Mais il était trop tard : la " +
      "tortue, calme et triomphante, venait de franchir le but la première. La constance, ce jour-là, " +
      "l'avait emporté sur la vitesse, et l'orgueil reçut la leçon qu'il méritait.",
  },
  {
    id: "r-morning",
    level: 1,
    genre: "Narratif",
    title: "Un matin ordinaire",
    text:
      "Le soleil se levait doucement sur la ville encore endormie. Dans la cuisine, l'odeur du café chaud " +
      "remplissait l'air et se mêlait à celle du pain grillé. Camille ouvrit la fenêtre, respira profondément, " +
      "et sourit. La journée commençait bien. Les oiseaux chantaient sur le rebord, le ciel était clair, " +
      "et tout semblait possible. En bas, dans la rue, les premiers passants pressaient le pas, le col relevé, " +
      "tandis qu'un boulanger relevait son rideau de fer dans un grand bruit métallique. Camille prit le temps " +
      "de savourer ces quelques minutes suspendues, où la ville hésitait encore entre le sommeil et l'éveil. " +
      "Elle versa lentement le café dans sa tasse préférée, celle dont l'anse était un peu ébréchée, et " +
      "s'installa près de la fenêtre. Rien d'extraordinaire n'allait se produire ce jour-là, et c'était " +
      "précisément ce qui la rendait heureuse : la douceur tranquille des matins ordinaires, ces instants " +
      "modestes que l'on oublie trop souvent de regarder, mais qui font, mis bout à bout, la trame paisible " +
      "d'une vie. Elle termina sa tasse, ramassa son sac, et descendit l'escalier le cœur léger.",
  },
  {
    id: "r-sea",
    level: 2,
    genre: "Descriptif",
    title: "Devant la mer",
    text:
      "La mer s'étendait à perte de vue, immense et changeante. Les vagues venaient mourir sur le sable " +
      "dans un murmure régulier, comme une respiration ancienne qui ne s'interrompait jamais. Au loin, un " +
      "voilier glissait sur la ligne d'horizon, minuscule point blanc suspendu entre le bleu du ciel et celui " +
      "de l'eau. Le vent portait un parfum de sel et de liberté, et l'on aurait dit que le temps lui-même " +
      "ralentissait. Sur le rivage, les galets polis par des siècles de marées roulaient les uns contre les " +
      "autres à chaque retrait de l'écume, dans un cliquetis doux et continu. Quelques mouettes décrivaient " +
      "de larges cercles au-dessus des rochers, lançant par instants leurs cris aigus que le vent emportait " +
      "aussitôt. La lumière du couchant teintait peu à peu la surface de l'eau de reflets cuivrés, puis " +
      "pourpres, et les nuages s'embrasaient lentement à l'horizon. On pouvait rester là des heures, le regard " +
      "perdu dans cette immensité mouvante, à sentir le sable encore tiède glisser entre ses doigts, gagné " +
      "par cette paix profonde que seule la mer sait offrir à ceux qui acceptent enfin de ne plus rien " +
      "attendre, et de se laisser simplement bercer par le rythme éternel des marées.",
  },
  {
    id: "r-discours",
    level: 2,
    genre: "Discours",
    title: "L'appel au courage",
    text:
      "Mes amis, nous voici réunis à un moment décisif. Le chemin devant nous n'est pas facile, je ne vous " +
      "le cacherai pas. Il sera long, semé d'embûches, et il y aura des jours où le doute nous tenaillera, " +
      "où nous serons tentés de baisser les bras et de rebrousser chemin. Mais l'histoire ne retient jamais " +
      "ceux qui ont reculé devant l'obstacle. Elle retient ceux qui, malgré la peur, ont choisi d'avancer ; " +
      "ceux qui, le cœur serré mais la tête haute, ont fait le pas de plus que les autres n'osaient faire. " +
      "Regardez autour de vous. Chacun de ceux qui nous ont précédés a connu, lui aussi, ses heures de " +
      "découragement. Et pourtant ils ont tenu, parce qu'ils croyaient en quelque chose de plus grand qu'eux. " +
      "Aujourd'hui, je ne vous demande pas d'être des héros, ni d'être parfaits. Je vous demande seulement " +
      "d'être présents, fidèles à votre parole, solidaires les uns des autres dans l'épreuve. Car ce que nul " +
      "ne peut accomplir seul, nous le pouvons ensemble. Ensemble, pas à pas, jour après jour, nous " +
      "construirons ce que d'autres jugeaient impossible. Et quand tout sera achevé, nous pourrons regarder " +
      "en arrière, sans honte et sans regret, et dire que nous n'avons pas tremblé devant l'avenir.",
  },
  {
    id: "r-science",
    level: 3,
    genre: "Vulgarisation",
    title: "La lumière des étoiles",
    text:
      "Lorsque vous contemplez le ciel nocturne, vous ne voyez pas les étoiles telles qu'elles sont, mais " +
      "telles qu'elles étaient. La lumière, bien que d'une rapidité vertigineuse, parcourant près de trois " +
      "cent mille kilomètres en une seule seconde, met des années, parfois des millénaires, à nous parvenir. " +
      "L'étoile la plus proche, après le Soleil, se trouve déjà à plus de quatre années de distance ; sa " +
      "lueur, ce soir, a quitté sa surface alors que vous étiez plus jeune de quatre ans. Ainsi, certains de " +
      "ces points scintillants que nous admirons pourraient s'être éteints depuis fort longtemps, et nous " +
      "continuerions pourtant à recevoir leur dernier éclat, comme une lettre expédiée par un auteur déjà " +
      "disparu. Observer le firmament, c'est donc regarder le passé : un voyage immobile à travers le temps, " +
      "où chaque lueur raconte une histoire achevée bien avant que nos yeux ne la recueillent. Plus une étoile " +
      "est lointaine, plus loin dans le temps notre regard remonte ; les télescopes les plus puissants " +
      "captent ainsi la lumière de galaxies nées il y a des milliards d'années, presque aux origines de " +
      "l'univers. Lever les yeux vers les étoiles, c'est, sans bouger d'un pas, contempler la mémoire même " +
      "du cosmos, et mesurer à quel point notre présent n'est qu'un point minuscule dans l'immensité du temps.",
  },
  {
    id: "r-philo",
    level: 3,
    genre: "Argumentatif",
    title: "Sur la liberté",
    text:
      "On confond souvent la liberté avec l'absence de contraintes. Pourtant, être libre ne signifie pas " +
      "faire tout ce qui nous passe par la tête, au gré de nos impulsions et de nos humeurs. Celui qui obéit " +
      "à chacun de ses caprices n'est pas libre : il est l'esclave de ses désirs, ballotté d'une envie à " +
      "l'autre, incapable de s'appartenir vraiment. Songez à celui qui ne peut résister à aucune tentation : " +
      "il croit choisir, alors qu'il ne fait que céder. Sa volonté est prisonnière de tout ce qui le sollicite. " +
      "La véritable liberté, au contraire, suppose la maîtrise de soi, la capacité de prendre du recul, de " +
      "peser ses raisons, de choisir en connaissance de cause et d'assumer pleinement les conséquences de " +
      "ses actes. Elle ne consiste pas à n'avoir aucune limite, mais à se donner à soi-même les règles que " +
      "l'on juge justes, et à savoir y demeurer fidèle même lorsque cela coûte. C'est pourquoi la liberté " +
      "n'est jamais un point de départ tout offert, mais une conquête de chaque instant. Elle se gagne moins " +
      "contre le monde extérieur, ses lois et ses obstacles, que contre soi-même, contre la facilité, la " +
      "paresse et la peur. Être libre, en somme, c'est devenir l'auteur de sa propre vie plutôt que le " +
      "spectateur passif de ses penchants.",
  },
  {
    id: "r-proust",
    level: 4,
    genre: "Littéraire",
    title: "La phrase longue",
    text:
      "Longtemps, lorsque je revenais le soir de ces promenades où, l'esprit encore plein des paysages " +
      "traversés et des conversations échangées, je laissais mes pensées vagabonder sans contrainte, il " +
      "m'arrivait, au détour d'une rue familière dont la lumière déclinante allongeait démesurément les " +
      "ombres et donnait aux façades une teinte d'or éteint, de ressentir cette mélancolie douce et profonde " +
      "que seuls connaissent ceux qui, ayant beaucoup espéré, ont appris à se réjouir des choses simples sans " +
      "pour autant renoncer à leurs rêves les plus lointains. Alors, sans que je susse pourquoi, une odeur " +
      "oubliée, le grincement particulier d'une porte, ou la silhouette d'un passant entrevue à la faveur du " +
      "crépuscule, suffisaient à rappeler en moi, avec une netteté presque douloureuse, des heures que je " +
      "croyais à jamais perdues ; et il me semblait alors que le temps, loin de s'écouler en ligne droite et " +
      "de tout emporter sur son passage, demeurait au contraire blotti tout entier dans ces sensations " +
      "minuscules, prêt à ressurgir intact dès qu'un hasard, plus puissant que toute la volonté du monde, " +
      "consentait enfin à le délivrer.",
  },
  {
    id: "r-juridique",
    level: 4,
    genre: "Technique",
    title: "Clause complexe",
    text:
      "Nonobstant toute stipulation contraire, les parties conviennent expressément que l'inexécution, par " +
      "l'une d'elles, d'une quelconque de ses obligations substantielles, dûment constatée et notifiée par " +
      "lettre recommandée avec accusé de réception, autorisera l'autre partie, après l'expiration d'un délai " +
      "raisonnable demeuré infructueux, à résilier de plein droit le présent contrat, sans préjudice des " +
      "dommages et intérêts auxquels elle pourrait légitimement prétendre en réparation du préjudice subi. " +
      "Il est en outre précisé que la tolérance dont l'une des parties pourrait faire preuve, à l'égard des " +
      "manquements de l'autre, ne saurait en aucun cas être interprétée comme une renonciation, même tacite, " +
      "à se prévaloir ultérieurement des stipulations de la présente clause. Les parties reconnaissent enfin " +
      "que les présentes dispositions, négociées de bonne foi et en pleine connaissance de leur portée, " +
      "expriment fidèlement leur commune intention, et qu'elles prévaudront sur toute correspondance, " +
      "promesse ou convention antérieure, écrite ou verbale, ayant pu intervenir entre elles relativement au " +
      "même objet, lesquelles seront réputées nulles et non avenues à compter de la signature des présentes.",
  },

  /* ── Niveau 2 — registres variés ── */
  {
    id: "r-interview",
    level: 2,
    genre: "Dialogue",
    title: "L'entretien",
    text:
      "— Qu'est-ce qui vous a donné envie de vous lancer ? demanda la journaliste en posant son carnet. " +
      "— Honnêtement, répondit-il en souriant, c'est la peur de regretter. Je me suis dit qu'il valait " +
      "mieux essayer et échouer que de passer ma vie à imaginer ce qui aurait pu arriver. " +
      "— Et les débuts, comment les avez-vous vécus ? reprit-elle, intriguée. " +
      "— Difficiles, je ne vais pas vous mentir. Il y a eu des nuits sans sommeil, des doutes, des proches " +
      "qui ne comprenaient pas. Mais chaque petit obstacle franchi me donnait un peu plus confiance. " +
      "— Si vous deviez donner un seul conseil à quelqu'un qui hésite encore ? " +
      "— Je lui dirais de commencer petit, mais de commencer vraiment. On apprend infiniment plus en faisant " +
      "qu'en réfléchissant indéfiniment. Aujourd'hui, quoi qu'il advienne, je ne regrette rien.",
  },
  {
    id: "r-recette",
    level: 2,
    genre: "Procédural",
    title: "La pâte à crêpes",
    text:
      "Pour réussir une pâte à crêpes légère, commencez par tamiser la farine dans un grand saladier afin " +
      "d'éviter qu'elle ne forme des paquets. Creusez un puits au centre, cassez-y les œufs un à un, puis " +
      "versez peu à peu le lait tout en fouettant énergiquement du centre vers les bords, pour éviter les " +
      "grumeaux. Ajoutez une pincée de sel, une cuillère de sucre, et, si vous le souhaitez, une cuillère " +
      "d'huile ou de beurre fondu qui rendra les crêpes plus moelleuses. Parfumez selon votre goût d'un peu " +
      "de vanille, de fleur d'oranger ou d'un zeste de citron. Laissez ensuite reposer la pâte au moins une " +
      "heure à température ambiante : ce temps de repos, souvent négligé, permet à la farine de bien " +
      "s'imprégner et fait toute la différence sur la texture finale. Au moment de cuire, graissez " +
      "légèrement une poêle bien chaude, versez une petite louche de pâte en l'inclinant pour la répartir, " +
      "et retournez la crêpe dès que les bords se détachent et que le dessous est joliment doré.",
  },

  /* ── Niveau 3 — difficile ── */
  {
    id: "r-hugo-aube",
    level: 3,
    genre: "Poésie",
    title: "Demain, dès l'aube — Victor Hugo",
    text:
      "Demain, dès l'aube, à l'heure où blanchit la campagne, " +
      "je partirai. Vois-tu, je sais que tu m'attends. " +
      "J'irai par la forêt, j'irai par la montagne. " +
      "Je ne puis demeurer loin de toi plus longtemps. " +
      "Je marcherai les yeux fixés sur mes pensées, " +
      "sans rien voir au dehors, sans entendre aucun bruit, " +
      "seul, inconnu, le dos courbé, les mains croisées, " +
      "triste, et le jour pour moi sera comme la nuit.",
  },
  {
    id: "r-eco",
    level: 3,
    genre: "Vulgarisation",
    title: "Comprendre l'inflation",
    text:
      "L'inflation, souvent décrite comme une simple hausse des prix, traduit en réalité une érosion " +
      "progressive du pouvoir d'achat de la monnaie. Lorsque la quantité de monnaie en circulation croît " +
      "plus vite que la production de biens et de services, chaque unité perd un peu de sa valeur, et il " +
      "faut désormais davantage de pièces et de billets pour acquérir exactement les mêmes choses qu'hier. " +
      "Un même billet, glissé dans une poche et oublié quelques années, achètera demain moins de pain, " +
      "moins d'essence, moins de tout. Les causes en sont multiples : une demande qui s'emballe, des coûts " +
      "de production qui grimpent, ou encore une création de monnaie trop abondante. Comprendre ce mécanisme, " +
      "c'est saisir pourquoi épargner sans investir revient parfois à s'appauvrir lentement, sans même s'en " +
      "apercevoir, car l'argent qui dort perd silencieusement de sa substance. C'est aussi comprendre " +
      "pourquoi une inflation maîtrisée, modérée et prévisible, est jugée préférable à une hausse brutale " +
      "qui désoriente les ménages, décourage l'épargne et finit par fragiliser la confiance même que l'on " +
      "accorde à la monnaie.",
  },
  {
    id: "r-temps",
    level: 3,
    genre: "Philosophie",
    title: "L'instant présent",
    text:
      "Le présent nous échappe sans cesse : à peine l'avons-nous nommé qu'il appartient déjà au passé. " +
      "Nous vivons ainsi suspendus entre un souvenir qui s'efface et une attente qui n'existe pas encore, " +
      "tendus vers un avenir qui, sitôt atteint, se dérobe à son tour. Nous passons une grande partie de " +
      "notre existence à regretter ce qui n'est plus ou à espérer ce qui n'est pas encore, négligeant " +
      "l'unique moment qui nous soit réellement donné de vivre. Pourtant, c'est dans cet instant fugitif, " +
      "et nulle part ailleurs, que la vie se joue véritablement : c'est là que nous respirons, que nous " +
      "aimons, que nous agissons. Peut-être la sagesse consiste-t-elle moins à retenir le temps, ce qui est " +
      "impossible, qu'à habiter pleinement l'instant, à lui prêter toute notre attention avant qu'il ne " +
      "s'évanouisse. Goûter le présent sans le retenir de force, l'accueillir tel qu'il vient, voilà peut-être " +
      "le seul moyen de ne pas passer à côté de sa propre vie.",
  },
  {
    id: "r-sommeil",
    level: 3,
    genre: "Vulgarisation",
    title: "Le travail du sommeil",
    text:
      "Le sommeil n'est pas un simple repos : c'est un travail intense et invisible. Pendant que nous " +
      "dormons, loin de s'éteindre, le cerveau s'active selon un ordre précis : il trie les souvenirs de la " +
      "journée, en consolide certains et en efface d'autres, renforce les apprentissages et élimine peu à " +
      "peu les déchets accumulés durant les heures d'éveil. Les rêves eux-mêmes, longtemps tenus pour de " +
      "simples fantaisies, participeraient à ce grand rangement nocturne, en reliant entre elles des idées " +
      "que la veille tenait séparées. Le corps, de son côté, en profite pour réparer les tissus, réguler les " +
      "hormones et renforcer les défenses immunitaires. Négliger son sommeil, c'est priver l'esprit de cet " +
      "entretien nocturne dont dépend, en grande partie, la clarté de nos pensées, la solidité de notre " +
      "mémoire et la justesse de nos décisions. Une nuit trop courte, répétée jour après jour, ne se rattrape " +
      "jamais tout à fait : elle laisse une dette silencieuse qui finit, tôt ou tard, par se faire sentir.",
  },
  {
    id: "r-liaisons",
    level: 3,
    genre: "Diction",
    title: "Les liaisons",
    text:
      "Les enfants attentifs ont écouté un étrange récit. Quand ils en eurent assez entendu, ils ont " +
      "applaudi avec entrain, puis ont accouru vers les anciens arbres où nichaient autrefois de grands " +
      "oiseaux. Ils y ont aperçu, émerveillés, un immense aigle aux ailes ouvertes, et de tout petits " +
      "êtres ailés voletant en tous sens entre les hautes herbes humides. Les uns ont observé un instant " +
      "ces oiseaux en silence ; les autres ont aussitôt imaginé d'extraordinaires aventures où il était " +
      "question d'îles inconnues et d'océans agités. Un enfant, plus hardi, est allé tout en haut, là où " +
      "les branches anciennes ploient sous le vent, et il a entendu, au loin, un écho amusant lui répondre. " +
      "Tous ensemble, ils ont alors entonné un air ancien, et leurs voix, unies en un seul élan, ont empli " +
      "le grand espace ouvert d'une joie immense et insouciante.",
  },

  /* ── Niveau 4 — expert ── */
  {
    id: "r-baudelaire",
    level: 4,
    genre: "Poésie",
    title: "L'albatros — Baudelaire",
    text:
      "Souvent, pour s'amuser, les hommes d'équipage prennent des albatros, vastes oiseaux des mers, " +
      "qui suivent, indolents compagnons de voyage, le navire glissant sur les gouffres amers. " +
      "À peine les ont-ils déposés sur les planches, que ces rois de l'azur, maladroits et honteux, " +
      "laissent piteusement leurs grandes ailes blanches comme des avirons traîner à côté d'eux.",
  },
  {
    id: "r-festin",
    level: 4,
    genre: "Littéraire",
    title: "Le festin (énumération)",
    text:
      "On apporta force jambons, saucissons, andouilles, cervelas, langues fumées, pâtés en croûte, " +
      "terrines parfumées, fromages affinés, confitures, massepains, dragées et mille autres friandises. " +
      "Vinrent ensuite des volailles dorées, des chapons rôtis à la broche, des cuisses de canard luisantes " +
      "de graisse, des poissons en gelée, des huîtres ouvertes sur leur lit de glace, des soupes fumantes et " +
      "des sauces onctueuses où l'on trempait de larges tranches de pain croustillant. Les flacons de vin, " +
      "rouges, blancs et ambrés, passaient de main en main sans jamais se vider, et les cruches d'hydromel " +
      "se renversaient dans les gobelets avec un joyeux glouglou. Et chacun de bâfrer, de lamper, de " +
      "ripailler, de mâcher, de mastiquer, de s'esclaffer et de festoyer si gaillardement que la table tout " +
      "entière en tremblait d'aise et de gourmandise, que les chandelles vacillaient sous les éclats de rire, " +
      "et que la fête, commencée au crépuscule, se prolongea sans relâche jusqu'aux premières lueurs du matin.",
  },
  {
    id: "r-sifflantes",
    level: 4,
    genre: "Diction",
    title: "Sifflantes et chuintantes",
    text:
      "Sous ses souliers cirés, Sacha chasse sans cesse ces six sangsues sournoises qui se cachent sous " +
      "les souches sèches. Chaque chuchotement choisi cisèle ce chant chuchoté, ce chuintement chaud où " +
      "s'échouent ces serpents soyeux. « Cessez ! » souffle Cécile, soucieuse, sachant ces choses si " +
      "saugrenues qu'elles semblent surgir d'un songe. Sur le seuil, ses sœurs sèchent six chemises serrées, " +
      "tandis que ce sage chasseur sache choisir ses chaussures sans se soucier des soupçons. Si ce chat " +
      "sauvage cessait ses chasses cisaillantes, ces souris songeuses sortiraient sans cesse sous ce ciel " +
      "chargé. Cessez ces simagrées, chuchote-t-elle sans cesse, ces chuchotis chuintants cessent si " +
      "rarement, ces sons sifflants se succèdent sans souffle, sans secours, sans cesse.",
  },
  {
    id: "r-admin",
    level: 4,
    genre: "Administratif",
    title: "La circulaire",
    text:
      "Conformément aux dispositions susvisées, et sous réserve de l'accomplissement préalable des " +
      "formalités déclaratives incombant au demandeur, lequel devra justifier, par la production de toute " +
      "pièce probante, de la régularité de sa situation au regard des obligations légales et réglementaires " +
      "en vigueur, l'autorité compétente se réserve la faculté de subordonner la délivrance de " +
      "l'autorisation sollicitée à la souscription d'engagements complémentaires. Il est rappelé, à toutes " +
      "fins utiles, que tout dossier incomplet ou comportant des éléments inexacts sera réputé irrecevable " +
      "et fera l'objet d'un classement sans suite, sans qu'il soit besoin d'en aviser préalablement " +
      "l'intéressé. Le demandeur dispose, à compter de la notification de la présente décision, d'un délai " +
      "de deux mois pour former, le cas échéant, un recours gracieux auprès de l'autorité signataire, ou un " +
      "recours contentieux devant la juridiction administrative territorialement compétente. Les services " +
      "instructeurs demeurent à la disposition des usagers pour tout renseignement complémentaire, aux jours " +
      "et heures d'ouverture habituels, et veilleront à apporter à chaque demande une réponse motivée dans " +
      "les meilleurs délais que permettront les contraintes du service.",
  },
  {
    id: "r-medical",
    level: 4,
    genre: "Technique",
    title: "Le compte rendu",
    text:
      "L'examen anatomopathologique révèle une prolifération cellulaire atypique caractérisée par un " +
      "pléomorphisme nucléaire marqué, une activité mitotique élevée et des foyers de nécrose " +
      "intratumorale, évoquant un adénocarcinome moyennement différencié. Les marges de résection " +
      "apparaissent, en l'état, saines sur les coupes examinées, bien qu'un contingent infiltrant ait été " +
      "repéré à proximité immédiate du tissu sain, imposant la plus grande prudence dans l'interprétation. " +
      "L'extension locorégionale de la lésion et l'éventuel envahissement ganglionnaire devront être " +
      "précisés sans délai par un complément d'imagerie en coupes fines, idéalement couplé à une exploration " +
      "fonctionnelle, afin d'établir une stadification rigoureuse. Au vu de ces éléments, une concertation " +
      "pluridisciplinaire est vivement recommandée, réunissant chirurgien, oncologue et radiologue, pour " +
      "définir la stratégie thérapeutique la mieux adaptée au cas du patient et arrêter, d'un commun accord, " +
      "le calendrier des examens et des interventions à programmer.",
  },
  {
    id: "r-bergson",
    level: 4,
    genre: "Philosophie",
    title: "La durée",
    text:
      "La durée n'est pas une succession d'instants juxtaposés, semblables aux grains d'un collier que l'on " +
      "pourrait compter un à un ; elle est un écoulement continu, une mélodie où chaque note prolonge la " +
      "précédente et annonce la suivante, sans qu'aucune frontière nette ne vienne jamais les séparer. " +
      "Lorsque nous écoutons un air, nous ne percevons pas une suite de sons isolés : nous saisissons un " +
      "mouvement vivant, où le passé tout entier se prolonge dans le présent et se penche déjà vers l'avenir. " +
      "Ainsi en va-t-il de notre vie intérieure, qui ne cesse de gonfler du souvenir de ce qu'elle vient de " +
      "vivre, comme une boule de neige qui grossit en roulant. Vouloir la saisir par le calcul, la découper " +
      "en parts égales et mesurables, c'est la figer et la trahir ; car ce qui est vivant ne se laisse jamais " +
      "immobiliser sans perdre, dans cette immobilité même, ce qui faisait précisément sa vie. L'intelligence, " +
      "habituée à manier des choses fixes, échoue à penser ce qui dure ; seule une intuition patiente, " +
      "épousant le mouvement du dedans, peut espérer en effleurer la nature.",
  },
  {
    id: "r-mallarme",
    level: 4,
    genre: "Littéraire",
    title: "Le vers pur",
    text:
      "Aboli bibelot d'inanité sonore, le vers se ploie et se déploie, chiffre vain qu'aucun sens " +
      "n'épuise ; et dans l'azur exilé de sa propre clarté, l'idée pure, suspendue, se refuse à choir " +
      "parmi les mots trop humains qui voudraient, vainement, l'enclore.",
  },
  {
    id: "r-appel",
    level: 4,
    genre: "Discours",
    title: "Tenir debout",
    text:
      "Il viendra un jour où l'on s'étonnera d'avoir tant hésité. Ce jour-là, on ne demandera pas à " +
      "chacun ce qu'il possédait, mais ce qu'il a osé ; non ce qu'il a craint, mais ce qu'il a défendu ; " +
      "non les titres qu'il a portés, mais les causes auxquelles il a prêté son courage. On ne nous jugera " +
      "pas sur l'abondance de nos discours, mais sur la constance de nos actes ; pas sur les promesses que " +
      "nous avons faites, mais sur celles que nous avons tenues. Car les époques difficiles ne révèlent pas " +
      "seulement la valeur des hommes : elles la forgent. C'est dans la tempête, et non dans le calme, que " +
      "l'on reconnaît ceux sur qui l'on peut compter. Alors, lorsque viendront les heures sombres — et elles " +
      "viendront —, souvenons-nous que rien de grand ne s'est jamais accompli sans peine, ni sans risque, ni " +
      "sans foi. Que l'on dise alors de nous que, placés devant l'adversité, nous n'avons pas baissé les yeux, " +
      "que nous n'avons pas cherché d'excuses ni attendu que d'autres agissent à notre place, mais que nous " +
      "avons tenu, debout, fidèles jusqu'au bout à ce que nous croyions juste.",
  },

  {
    id: "r-plaidoirie",
    level: 4,
    genre: "Juridique",
    title: "La plaidoirie",
    text:
      "Mesdames, Messieurs, il ne vous est pas demandé aujourd'hui de trancher entre deux récits, mais " +
      "d'apprécier, à l'aune des seuls éléments régulièrement versés aux débats, si la preuve rapportée " +
      "par l'accusation présente ce caractère de certitude sans lequel aucune condamnation ne saurait être " +
      "prononcée. Or que vous a-t-on montré ? Des présomptions, dont on a fait des indices ; des indices, " +
      "dont on a fait des certitudes ; et de ces certitudes empruntées, on prétend tirer la ruine d'une " +
      "existence. On vous a dit que le doute profitait à l'accusé comme s'il s'agissait d'une faveur : " +
      "ce n'est pas une faveur, c'est une règle, et cette règle est la vôtre autant que la sienne. " +
      "Écartez, je vous en conjure, l'émotion légitime que suscitent les faits, car l'émotion condamne " +
      "vite et se repent lentement. Jugez sur les pièces, sur les dates, sur les contradictions que " +
      "l'instruction n'a jamais levées. Et si, au terme de vos délibérations, il subsiste dans vos " +
      "consciences la plus mince hésitation, alors votre devoir est écrit d'avance, et il porte un nom " +
      "que la loi elle-même vous impose de prononcer : l'acquittement.",
  },
  {
    id: "r-alexandrins",
    level: 4,
    genre: "Théâtre",
    title: "La tirade du remords",
    text:
      "Que reste-t-il d'un cœur qui s'est trop tôt promis ? Un serment répété que le temps a démis. " +
      "J'ai voulu, par orgueil, gouverner ma tendresse, et j'ai fait de ma force une longue faiblesse. " +
      "Vous parliez, je me tais ; vous pleuriez, je riais ; vous partiez, et je crus que je vous " +
      "reverrais. Le ciel, qui me punit de ce que j'ai su taire, me rend chaque silence en clameur " +
      "solitaire. Ah ! si l'aveu tardif pouvait, en un instant, défaire ce que fit un orgueil " +
      "obstiné, je dirais tout ; mais l'heure a passé sans retour, et le remords, ce soir, m'est " +
      "un plus sûr amour. Qu'importe désormais que la cour me contemple : je n'ai plus de rival, " +
      "je n'ai plus rien d'exemple. Je marche seul, chargé de ce que j'ai perdu, et je paie " +
      "lentement le prix de mon refus.",
  },
  {
    id: "r-quantique",
    level: 4,
    genre: "Scientifique",
    title: "L'intrication",
    text:
      "Lorsque deux particules interagissent puis se séparent, la mécanique quantique interdit, dans le " +
      "cas général, de leur attribuer des états individuels : le système ne se décrit plus que par une " +
      "fonction d'onde globale, non factorisable, dont les corrélations excèdent tout ce qu'autorise une " +
      "explication classique par variables cachées locales. Les inégalités de Bell, établies en mille " +
      "neuf cent soixante-quatre, transforment cette querelle d'interprétation en une prédiction " +
      "expérimentalement réfutable ; les expériences successives, en fermant l'une après l'autre les " +
      "échappatoires de détection et de localité, en ont confirmé la violation avec une précision " +
      "statistique difficilement contestable. Il serait pourtant abusif d'en conclure à la transmission " +
      "instantanée d'une information : les corrélations observées, aussi troublantes soient-elles, ne " +
      "permettent aucun signal utilisable, et la causalité relativiste demeure intacte. Ce que la " +
      "décohérence nous enseigne, c'est que la frontière entre le microscopique et le macroscopique n'est " +
      "pas une ligne franche, mais un dégradé continu, où l'enchevêtrement irréversible avec " +
      "l'environnement dissout progressivement les superpositions que nous ne savons plus, dès lors, " +
      "observer directement.",
  },
  {
    id: "r-depeche",
    level: 4,
    genre: "Journalistique",
    title: "La dépêche",
    text:
      "Selon un communiqué diffusé vendredi en fin d'après-midi, les négociations engagées à Copenhague " +
      "entre les représentants des vingt-sept États membres et les délégations sud-américaines auraient " +
      "abouti, après quarante-huit heures de discussions ininterrompues, à un accord de principe portant " +
      "sur la réduction progressive des droits de douane applicables aux produits agroalimentaires. " +
      "L'exécutif chiffre à trois virgule sept milliards d'euros l'impact annuel du dispositif, dont " +
      "quatre-vingt-douze pour cent bénéficieraient, selon les projections officielles, aux filières " +
      "d'exportation. Plusieurs organisations professionnelles ont aussitôt dénoncé un calendrier " +
      "« irréaliste » et réclamé des clauses de sauvegarde renforcées, tandis que les syndicats " +
      "agricoles annonçaient des mobilisations dans dix-sept départements à compter du vingt-trois. " +
      "Interrogé sur ces critiques, le porte-parole a rappelé que le texte, encore provisoire, devrait " +
      "être soumis à ratification au premier trimestre, puis examiné article par article, et qu'aucune " +
      "entrée en vigueur ne pouvait raisonnablement être envisagée avant l'exercice suivant.",
  },
  {
    id: "r-liaisons-exp",
    level: 4,
    genre: "Diction",
    title: "Liaisons dangereuses",
    text:
      "Les anciens amis arrivaient en avance, les uns après les autres, sans un instant d'hésitation. " +
      "Ils entraient, s'installaient en un instant, et attendaient en observant les hôtes affairés. " +
      "En haut, les héros hésitaient ; en bas, les habitants humiliés hurlaient. On honore les hommes " +
      "honnêtes, on hait les hâbleurs, et l'on hésite devant les héritiers hautains. Ces onze heures " +
      "interminables usaient une assemblée impatiente : aucun ordre annoncé, aucun appel entendu, " +
      "aucune issue envisagée. Un immense enthousiasme unissait pourtant ces inconnus attentifs, " +
      "attendant un ultime instant les illustres invités. Ils ont ouvert un à un ces innombrables " +
      "in-octavo empoussiérés, en ont extrait un extrait ancien, et en ont entamé, avec un art " +
      "impeccable, une inoubliable et interminable lecture.",
  },
  {
    id: "r-nombres",
    level: 4,
    genre: "Diction",
    title: "Le bilan chiffré",
    text:
      "Au trente et un décembre deux mille dix-huit, l'établissement dénombrait quatre-vingt-dix-sept " +
      "mille trois cent quatre-vingt-cinq dossiers actifs, contre soixante-quinze mille huit cent " +
      "douze l'exercice précédent, soit une progression de vingt-huit virgule quatre-vingt-quatorze " +
      "pour cent. Les charges d'exploitation s'élèvent à deux millions six cent quatre-vingt-quinze " +
      "mille cinq cent soixante-dix-sept euros et quatre-vingt-treize centimes, dont quatre-vingt-un " +
      "pour cent de dépenses de personnel. Sur les quatre-vingt-dix-neuf agents recensés, soixante-treize " +
      "exercent à temps plein, seize à quatre-vingts pour cent, et dix à mi-temps. Le taux de " +
      "recouvrement, établi à quatre-vingt-quatorze virgule sept pour cent au premier semestre, " +
      "redescend à quatre-vingt-huit virgule deux au second, écart imputable pour l'essentiel aux " +
      "cinq cent quatre-vingt-seize créances contestées entre le quinze août et le vingt-deux " +
      "septembre. Prévisions pour deux mille dix-neuf : cent douze mille dossiers, trois millions " +
      "quatre-vingt-dix mille euros de charges, et quatre-vingt-seize pour cent de recouvrement.",
  },
  {
    id: "r-phrase-longue",
    level: 4,
    genre: "Littéraire",
    title: "La phrase sans fin",
    text:
      "Il se souvenait, non pas de la maison elle-même, dont les murs avaient depuis longtemps changé " +
      "de couleur et de propriétaires, ni même du jardin, que d'autres mains avaient taillé, dessiné, " +
      "puis abandonné, mais de cette heure indécise, entre le jour qui ne veut pas finir et la nuit qui " +
      "n'ose pas commencer, où l'on entendait, montant de la cuisine ouverte sur la cour, le bruit des " +
      "assiettes empilées, les rires étouffés d'une conversation dont il ne comprenait pas les mots, et, " +
      "plus loin, par-dessus les toits tièdes, cette rumeur de ville qui n'était ni tout à fait un bruit " +
      "ni tout à fait un silence ; et c'était cela, précisément cela, et non les événements que l'on " +
      "raconte, que sa mémoire avait choisi de garder, comme si, de toute une enfance, elle n'avait " +
      "retenu qu'un parfum, une lumière et le sentiment, jamais éprouvé depuis, que rien de ce qui " +
      "durait alors ne pourrait jamais cesser.",
  },
  {
    id: "r-architecture",
    level: 4,
    genre: "Technique",
    title: "L'architecture distribuée",
    text:
      "La décomposition d'un monolithe en services autonomes déplace la complexité plutôt qu'elle ne la " +
      "supprime : ce que l'on gagne en découplage fonctionnel, on le paie en latence réseau, en " +
      "cohérence différée et en observabilité. Dès lors qu'une transaction traverse plusieurs frontières " +
      "de processus, l'atomicité classique n'est plus tenable ; il faut lui substituer des mécanismes " +
      "compensatoires, orchestrés ou chorégraphiés, dont la logique de reprise doit être pensée avant " +
      "l'implémentation, et non après le premier incident de production. L'idempotence des opérations " +
      "cesse d'être une élégance théorique pour devenir une exigence opérationnelle, puisqu'un message " +
      "réémis après expiration d'un délai d'attente sera, tôt ou tard, traité deux fois. Ajoutons que la " +
      "supervision agrégée, la corrélation des traces distribuées et la gestion fine des versions " +
      "d'interface représentent un coût permanent, rarement anticipé lors de l'arbitrage initial. " +
      "Fragmenter un système est une décision structurante, difficilement réversible, qui ne se justifie " +
      "qu'au regard de contraintes réelles d'échelle, d'autonomie des équipes ou de disponibilité, " +
      "jamais du seul attrait de la nouveauté.",
  },
];

/* ─────────────── Virelangues (diction / articulation) ─────────────── */
export const TONGUE_TWISTERS = [
  { id: "tt-chasseurs", level: 1, text: "Un chasseur sachant chasser sait chasser sans son chien." },
  { id: "tt-chemises",  level: 2, text: "Les chaussettes de l'archiduchesse sont-elles sèches, archi-sèches ?" },
  { id: "tt-ton-thé",   level: 1, text: "As-tu vu le ver vert qui va vers le verre en verre vert ?" },
  { id: "tt-dindon",    level: 2, text: "Didon dîna, dit-on, du dos d'un dodu dindon." },
  { id: "tt-piano",     level: 3, text: "Trois tortues trottaient sur un trottoir très étroit." },
  { id: "tt-poisson",   level: 3, text: "Un pâtissier qui pâtissait chez un tapissier qui tapissait." },
  { id: "tt-scieur",    level: 4, text: "Si six scies scient six cyprès, six cent six scies scient six cent six cyprès." },
  { id: "tt-fruits",    level: 4, text: "Cinq chiens chassent six chats, et six chats chassent cinq chiens sans cesse." },

  /* ── Niveau 1 ── */
  { id: "tt-tonton",   level: 1, text: "Si mon tonton tond ton tonton, ton tonton sera tondu." },
  { id: "tt-toux",     level: 1, text: "Ton thé t'a-t-il ôté ta toux ?" },
  { id: "tt-souris",   level: 1, text: "Six souris sous six lits sourient sans souci." },
  { id: "tt-nuit",     level: 1, text: "Trois tortues têtues trottent toute la nuit." },

  /* ── Niveau 2 ── */
  { id: "tt-excuses",  level: 2, text: "Je veux et j'exige d'exquises excuses." },
  { id: "tt-rats",     level: 2, text: "Cinq gros rats grillent dans la grosse graisse grasse." },
  { id: "tt-douches",  level: 2, text: "Douze douches douces dans douze douches douces." },
  { id: "tt-truites",  level: 2, text: "Trois petites truites crues, trois petites truites cuites." },
  { id: "tt-serge",    level: 2, text: "Suis-je bien chez ce cher Serge ?" },

  /* ── Niveau 3 ── */
  { id: "tt-natacha",  level: 3, text: "Natacha n'attacha pas son chat Pacha qui s'échappa." },
  { id: "tt-hibou",    level: 3, text: "La pie niche haut, l'oie niche bas, où niche l'hibou ? L'hibou niche ni haut ni bas." },
  { id: "tt-dragon",   level: 3, text: "Un dragon gradé dégrade un gradé dragon." },
  { id: "tt-fritsfrais", level: 3, text: "Fruits frais, fruits frits, fruits cuits, fruits crus." },
  { id: "tt-tasderiz", level: 3, text: "Tas de riz, tas de rats : tas de riz tentant, tas de rats tentés." },
  { id: "tt-blé",      level: 3, text: "Ces cerises sont si sûres qu'on ne sait si c'en sont." },

  /* ── Niveau 4 — expert ── */
  { id: "tt-berchere", level: 4, text: "Que c'est cher, ce cher Berchère ! Mais c'est si cher que c'est sa chère affaire." },
  { id: "tt-saucisses",level: 4, text: "Ces six saucisses-ci sont si sèches qu'on ne sait si c'en sont." },
  { id: "tt-fisc",     level: 4, text: "Le fisc fixe exprès chaque taxe excessive exclusivement au luxe et à l'exquis." },
  { id: "tt-pruneau",  level: 4, text: "Pruneau cuit, pruneau cru, pruneau cuit, pruneau cru, pruneau cuit, pruneau cru." },
  { id: "tt-kiki",     level: 4, text: "Kiki la cocotte aimait Coco le concasseur de cocos ; Coco le concasseur de cocos concassait les cocos de Kiki la cocotte." },
  { id: "tt-santé",    level: 4, text: "Santé n'est pas sans « t », mais maladie est sans « t » : si la santé t'a quitté, c'est que sans « t » tu es resté." },
  { id: "tt-chasseurs-3",level: 4, text: "Trois chasseurs sachant chasser sans leur chien chassaient sans cesse ces six chevreuils chétifs." },

  /* ── Niveau 4 — expert (suite) ── */
  { id: "tt-sangsues",  level: 4, text: "Si ces six cents six sangsues sont sur son sein sans sucer son sang, ces six cents six sangsues sont sans succès." },
  { id: "tt-papous",    level: 4, text: "Chez les Papous, il y a des Papous papas et des Papous pas papas, des Papous à poux et des Papous pas à poux ; donc chez les Papous, il y a des Papous papas à poux, des Papous papas pas à poux, des Papous pas papas à poux et des Papous pas papas pas à poux." },
  { id: "tt-basques",   level: 4, text: "Ces Basques se passent ce casque et ce masque jusqu'à ce que ce masque et ce casque se cassent." },
  { id: "tt-ange",      level: 4, text: "Un ange qui songeait à changer de visage se trouva soudain si changé que jamais plus ange ne songea à se changer." },
  { id: "tt-generaux",  level: 4, text: "Un généreux déjeuner régénérerait des généraux dégénérés." },
  { id: "tt-mur",       level: 4, text: "Le mur murant Paris rend Paris murmurant." },
  { id: "tt-chat-rot",  level: 4, text: "Chat vit rôt, rôt tenta chat, chat mit patte à rôt, rôt brûla patte à chat, chat quitta rôt." },
  { id: "tt-laitues",   level: 4, text: "Tes laitues naissent-elles ? Si tes laitues naissent, mes laitues naîtront ; si mes laitues naissent, tes laitues renaîtront." },
  { id: "tt-gendarmes", level: 4, text: "Dans la gendarmerie, quand un gendarme rit, tous les gendarmes rient dans la gendarmerie." },
  { id: "tt-rats-gris", level: 4, text: "Trois gros rats gris dans trois gros trous ronds rongent trois gros croûtons ronds." },
  { id: "tt-ciel",      level: 4, text: "Ciel, si ceci se sait, ces soins sont sans succès ; si ceci se sait, ces soins seront sans succès." },
  { id: "tt-papier",    level: 4, text: "Papier, panier, piano ; papier, panier, piano ; papier, panier, piano." },
  { id: "tt-vers-verts",level: 4, text: "Les vers verts levèrent le verre vert vers le ver vert, puis versèrent le vert du verre vers le ver." },
  { id: "tt-ane-lac",   level: 4, text: "Qu'a bu l'âne au lac ? L'âne au lac a bu l'eau ; l'eau du lac, l'âne l'a bue au lac." },
  { id: "tt-cypres",    level: 4, text: "Ces cyprès sont si loin qu'on ne sait si c'en sont ; ces six cyprès-ci sont si loin qu'on ne sait s'ils en sont." },
];

/* ─────────────── Échauffements vocaux / articulation ───────────────
 * Routine guidée, à faire avant un exercice. Pas d'enregistrement requis. */
export const WARMUPS = [
  { id: "w-breath", title: "Respiration", duration: 60, instruction: "Inspirez par le nez en 4 temps, retenez 4 temps, expirez par la bouche en 6 temps. Répétez 5 fois pour ancrer le souffle." },
  { id: "w-jaw",    title: "Détente de la mâchoire", duration: 30, instruction: "Bâillez largement, massez les muscles de la mâchoire, puis faites des cercles lents avec la bouche grande ouverte." },
  { id: "w-lips",   title: "Vibration des lèvres", duration: 30, instruction: "Faites vibrer vos lèvres (le « brrr » du cheval) en montant et descendant dans les graves et les aigus." },
  { id: "w-vowels", title: "Voyelles exagérées", duration: 45, instruction: "Articulez à l'extrême : A – E – I – O – U, en ouvrant la bouche au maximum. Lentement, puis de plus en plus vite." },
  { id: "w-proj",   title: "Projection", duration: 45, instruction: "Comptez de 1 à 10 en imaginant parler à quelqu'un au fond de la pièce, sans crier. Posez la voix sur le souffle." },
];

/* ─────────────── Générateur de sujets : thèmes proposés ───────────────
 * `key` est envoyé à l'IA ; `label` est affiché. Le mode "surprise" laisse
 * l'IA choisir librement.
 *
 * Quinze pastilles occupaient trois lignes pour un choix qui n'engage rien : le
 * sélecteur est ramené aux registres réellement différents. La banque, elle,
 * garde tous ses thèmes — « Surprends-moi » y pioche sans distinction. */
export const TOPIC_THEMES = [
  { key: "surprise",    label: "Surprends-moi",     emoji: "🎲" },
  { key: "personnel",   label: "Vécu personnel",    emoji: "💬" },
  { key: "débat",       label: "Débat d'idées",     emoji: "⚖️" },
  { key: "société",     label: "Société",           emoji: "🏛️" },
  { key: "travail",     label: "Travail & carrière", emoji: "💼" },
  { key: "philosophie", label: "Philosophie",       emoji: "🤔" },
  { key: "imaginaire",  label: "Imaginaire",        emoji: "🚀" },
];

/* ─────────────── Banque de sujets statiques ───────────────
 * Permet de proposer des sujets instantanément, sans appel à l'IA (plus rapide,
 * et utilisable même hors-ligne). Même forme que la sortie de l'IA :
 * { title, angle, suggestedStructure }. La page peut piocher ici ou générer via l'IA. */
export const TOPIC_BANK = {
  société: [
    { title: "Faut-il limiter le temps passé sur les réseaux sociaux ?", angle: "Pense à un proche que tu as vu changer à cause des écrans.", suggestedStructure: "PREP" },
    { title: "L'école devrait-elle noter les élèves ?", angle: "La note motive-t-elle ou décourage-t-elle ?", suggestedStructure: "Problème · Solution" },
    { title: "La célébrité rend-elle vraiment heureux ?", angle: "Oppose l'image publique à la vie réelle.", suggestedStructure: "3 arguments" },
    { title: "Vivre en ville ou à la campagne ?", angle: "Décris ta journée idéale dans chacun des deux.", suggestedStructure: "PREP" },
    { title: "Le bénévolat devrait-il être obligatoire ?", angle: "Que perd-on quand un geste devient une contrainte ?", suggestedStructure: "Débat" },
    { title: "Les héros d'aujourd'hui sont-ils les bons ?", angle: "Qui admires-tu, et pourquoi ?", suggestedStructure: "PREP" },
  ],
  technologie: [
    { title: "L'intelligence artificielle est-elle une menace ou une chance ?", angle: "Donne un exemple concret de ton quotidien.", suggestedStructure: "Débat" },
    { title: "Pourrait-on vivre une semaine sans smartphone ?", angle: "Raconte ce qui te manquerait vraiment.", suggestedStructure: "STAR" },
    { title: "Faut-il avoir peur des robots au travail ?", angle: "Quels métiers, et quels nouveaux métiers ?", suggestedStructure: "Problème · Solution" },
    { title: "Les jeux vidéo sont-ils un art ?", angle: "Compare à un film ou un roman.", suggestedStructure: "3 arguments" },
    { title: "La vie privée existe-t-elle encore en ligne ?", angle: "Pars d'une donnée que tu as déjà partagée sans y penser.", suggestedStructure: "PREP" },
  ],
  philosophie: [
    { title: "Peut-on être libre tout en obéissant à des règles ?", angle: "Distingue liberté et caprice.", suggestedStructure: "PREP" },
    { title: "Le bonheur se cherche-t-il ou se construit-il ?", angle: "Un moment où tu as été heureux sans le chercher.", suggestedStructure: "3 arguments" },
    { title: "Faut-il toujours dire la vérité ?", angle: "Imagine un cas où mentir protège quelqu'un.", suggestedStructure: "Débat" },
    { title: "L'échec est-il nécessaire pour réussir ?", angle: "Raconte un échec qui t'a fait grandir.", suggestedStructure: "STAR" },
    { title: "Sommes-nous responsables de tout ce que nous faisons ?", angle: "Jusqu'où va notre choix ?", suggestedStructure: "PREP" },
  ],
  quotidien: [
    { title: "Le rituel du matin parfait", angle: "Décris-le minute par minute.", suggestedStructure: "3 arguments" },
    { title: "Convaincs-moi de goûter ton plat préféré", angle: "Fais-nous saliver avec les détails sensoriels.", suggestedStructure: "PREP" },
    { title: "La meilleure habitude que j'aie prise", angle: "Avant / après.", suggestedStructure: "STAR" },
    { title: "Pourquoi tout le monde devrait essayer mon passe-temps", angle: "Vends-le comme une évidence.", suggestedStructure: "Problème · Solution" },
    { title: "Un objet du quotidien dont on ne pourrait plus se passer", angle: "Imagine un monde sans lui.", suggestedStructure: "PREP" },
  ],
  imaginaire: [
    { title: "Tu te réveilles invisible pour 24 heures", angle: "Que fais-tu en premier, et qu'apprends-tu ?", suggestedStructure: "STAR" },
    { title: "Plaide la cause des dragons devant un tribunal", angle: "Tu es leur avocat.", suggestedStructure: "3 arguments" },
    { title: "Le dernier humain sur Terre", angle: "Décris la première journée.", suggestedStructure: "PREP" },
    { title: "Vends une maison hantée à un client réticent", angle: "Transforme chaque défaut en atout.", suggestedStructure: "Problème · Solution" },
    { title: "Tu peux dîner avec n'importe quel personnage de fiction", angle: "Qui, et de quoi parlez-vous ?", suggestedStructure: "PREP" },
  ],
  débat: [
    { title: "Pour ou contre la semaine de quatre jours ?", angle: "Productivité contre fatigue.", suggestedStructure: "Débat" },
    { title: "Le talent compte-t-il plus que le travail ?", angle: "Prends un exemple sportif ou artistique.", suggestedStructure: "3 arguments" },
    { title: "Faut-il interdire la publicité destinée aux enfants ?", angle: "Liberté du commerce contre protection.", suggestedStructure: "Débat" },
    { title: "Les voitures devraient-elles être bannies des centres-villes ?", angle: "Pense aux gagnants et aux perdants.", suggestedStructure: "Problème · Solution" },
    { title: "Vaut-il mieux être craint ou aimé ?", angle: "En tant que chef d'équipe.", suggestedStructure: "PREP" },
  ],
  personnel: [
    { title: "Le meilleur conseil qu'on m'ait donné", angle: "Qui, quand, et ce que ça a changé.", suggestedStructure: "STAR" },
    { title: "Une peur que j'ai surmontée", angle: "Le avant, le déclic, le après.", suggestedStructure: "STAR" },
    { title: "La personne qui m'a le plus inspiré", angle: "Une scène précise plutôt qu'un portrait.", suggestedStructure: "PREP" },
    { title: "Si je pouvais parler à mon moi de 15 ans", angle: "Que lui dirais-tu en une minute ?", suggestedStructure: "PREP" },
    { title: "Un moment où j'ai changé d'avis", angle: "Qu'est-ce qui t'a fait basculer ?", suggestedStructure: "STAR" },
  ],
  écologie: [
    { title: "Le geste écologique le plus utile au quotidien", angle: "Évite les clichés, surprends-nous.", suggestedStructure: "PREP" },
    { title: "Faut-il culpabiliser pour sauver la planète ?", angle: "Motivation positive contre peur.", suggestedStructure: "Débat" },
    { title: "Consommer moins, vivre mieux ?", angle: "Une expérience de sobriété que tu as tentée.", suggestedStructure: "STAR" },
    { title: "Qui doit agir en premier : l'État, les entreprises ou nous ?", angle: "Réponds sans te défausser.", suggestedStructure: "3 arguments" },
  ],
  travail: [
    { title: "Le métier de mes rêves et pourquoi", angle: "Décris une journée type.", suggestedStructure: "PREP" },
    { title: "Vaut-il mieux suivre sa passion ou la sécurité ?", angle: "Donne ta définition de la réussite.", suggestedStructure: "Débat" },
    { title: "Présente-toi en une minute à un recruteur", angle: "Trois forces, un exemple chacune.", suggestedStructure: "STAR" },
    { title: "Le télétravail : libération ou isolement ?", angle: "Parle de ton expérience ou de celle d'un proche.", suggestedStructure: "3 arguments" },
    { title: "Convaincs ton équipe d'adopter ton idée", angle: "Anticipe une objection.", suggestedStructure: "Problème · Solution" },
  ],
  culture: [
    { title: "Défends un film que tout le monde déteste", angle: "Trouve-lui une vraie qualité.", suggestedStructure: "3 arguments" },
    { title: "La musique adoucit-elle vraiment les mœurs ?", angle: "Un morceau qui t'a marqué.", suggestedStructure: "PREP" },
    { title: "Faut-il rendre les musées gratuits ?", angle: "Accès à la culture contre financement.", suggestedStructure: "Débat" },
    { title: "Le livre qui a changé ma façon de voir", angle: "Une idée précise qu'il t'a laissée.", suggestedStructure: "STAR" },
  ],
  éthique: [
    { title: "La fin justifie-t-elle les moyens ?", angle: "Un dilemme concret plutôt qu'abstrait.", suggestedStructure: "Débat" },
    { title: "Rendrais-tu un portefeuille plein trouvé dans la rue ?", angle: "Et si personne ne le saura jamais ?", suggestedStructure: "PREP" },
    { title: "Peut-on juger le passé avec les valeurs d'aujourd'hui ?", angle: "Prends un exemple historique.", suggestedStructure: "3 arguments" },
    { title: "Faut-il toujours pardonner ?", angle: "Distingue pardonner et oublier.", suggestedStructure: "Débat" },
  ],
  science: [
    { title: "Explique la gravité à un enfant de six ans", angle: "Une image plutôt qu'une formule.", suggestedStructure: "PREP" },
    { title: "Coloniser Mars : rêve ou nécessité ?", angle: "Fuite en avant ou survie de l'espèce ?", suggestedStructure: "Débat" },
    { title: "La découverte scientifique la plus importante de l'histoire", angle: "Défends ton choix.", suggestedStructure: "3 arguments" },
    { title: "Faut-il tout chercher à comprendre ?", angle: "Le mystère a-t-il une valeur ?", suggestedStructure: "PREP" },
  ],
  futur: [
    { title: "À quoi ressemblera une journée en 2075 ?", angle: "Réveil, travail, soir.", suggestedStructure: "3 arguments" },
    { title: "Quel métier d'aujourd'hui aura disparu dans 30 ans ?", angle: "Et lequel apparaîtra ?", suggestedStructure: "PREP" },
    { title: "La technologie nous rapproche-t-elle ou nous éloigne-t-elle ?", angle: "Projette la tendance actuelle.", suggestedStructure: "Débat" },
    { title: "Si tu pouvais envoyer un message au futur", angle: "Que veux-tu qu'on retienne de notre époque ?", suggestedStructure: "PREP" },
  ],
  relations: [
    { title: "Qu'est-ce qu'un véritable ami ?", angle: "Illustre par un geste précis.", suggestedStructure: "PREP" },
    { title: "Faut-il tout se dire dans un couple ?", angle: "Sincérité contre tact.", suggestedStructure: "Débat" },
    { title: "Comment garder le lien avec ceux qu'on aime de loin ?", angle: "Une astuce qui marche pour toi.", suggestedStructure: "3 arguments" },
    { title: "La première impression compte-t-elle vraiment ?", angle: "Une fois où tu t'es trompé sur quelqu'un.", suggestedStructure: "STAR" },
  ],
};

// Pioche aléatoire de `count` sujets dans la banque. Thème vide ou "surprise" →
// pioche tous thèmes confondus.
export function getTopicsFromBank(themeKey, count = 4) {
  const pool = (!themeKey || themeKey === "surprise")
    ? Object.values(TOPIC_BANK).flat()
    : (TOPIC_BANK[themeKey] || Object.values(TOPIC_BANK).flat());
  const a = pool.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, count);
}

// Un seul sujet au hasard (pour « Tirer un sujet »).
export function pickRandomTopic(themeKey) {
  return getTopicsFromBank(themeKey, 1)[0] || null;
}

/* ─────────────── Cadres de structuration (exercices de structure) ───────────────
 * Méthodes pour organiser une prise de parole. Servent de support à l'exercice
 * « Structure » : l'utilisateur reçoit un sujet + un cadre, parle, et l'IA juge
 * le respect du cadre. */
export const STRUCTURE_FRAMEWORKS = [
  {
    id: "prep",
    name: "PREP",
    short: "Point · Raison · Exemple · Point",
    description: "Idéal pour répondre à une question de façon claire et convaincante.",
    steps: [
      { label: "Point", hint: "Énoncez votre idée principale en une phrase." },
      { label: "Raison", hint: "Expliquez pourquoi vous le pensez." },
      { label: "Exemple", hint: "Illustrez par un cas concret ou une anecdote." },
      { label: "Point", hint: "Reformulez votre idée pour conclure." },
    ],
  },
  {
    id: "star",
    name: "STAR",
    short: "Situation · Tâche · Action · Résultat",
    description: "Parfait pour raconter une expérience (entretien, retour d'expérience).",
    steps: [
      { label: "Situation", hint: "Plantez le décor : contexte et enjeu." },
      { label: "Tâche", hint: "Quel était votre objectif ou votre rôle ?" },
      { label: "Action", hint: "Qu'avez-vous concrètement fait ?" },
      { label: "Résultat", hint: "Quel a été le résultat, qu'avez-vous appris ?" },
    ],
  },
  {
    id: "tripode",
    name: "La règle de trois",
    short: "Trois arguments",
    description: "Annoncez trois points, développez-les, puis synthétisez.",
    steps: [
      { label: "Annonce", hint: "« Je vois trois raisons à cela. »" },
      { label: "Argument 1", hint: "Le plus fort en premier." },
      { label: "Argument 2", hint: "Un angle complémentaire." },
      { label: "Argument 3", hint: "Celui qui restera en mémoire." },
      { label: "Synthèse", hint: "Reliez les trois et concluez." },
    ],
  },
  {
    id: "problème",
    name: "Problème · Solution",
    short: "Problème · Cause · Solution · Bénéfice",
    description: "Pour convaincre ou présenter une proposition.",
    steps: [
      { label: "Problème", hint: "Décrivez la difficulté de façon vivante." },
      { label: "Cause", hint: "Pourquoi ce problème existe-t-il ?" },
      { label: "Solution", hint: "Présentez votre réponse." },
      { label: "Bénéfice", hint: "Montrez ce que tout le monde y gagne." },
    ],
  },

  /* ── Modèles à ancrer par la répétition (expliquer / convaincre / raconter / avis) ──
   * Structures simples à réciter mentalement jusqu'à ce que le cerveau les emploie
   * automatiquement. */
  {
    id: "expliquer",
    name: "Expliquer",
    short: "Idée · Pourquoi · Exemple · Conclusion",
    description: "Pour rendre une idée limpide, dans l'ordre.",
    steps: [
      { label: "Idée", hint: "Énoncez l'idée en une phrase." },
      { label: "Pourquoi", hint: "Justifiez : la raison de fond." },
      { label: "Exemple", hint: "Un cas concret qui l'illustre." },
      { label: "Conclusion", hint: "Reformulez pour verrouiller." },
    ],
  },
  {
    id: "convaincre",
    name: "Convaincre",
    short: "Problème · Conséquence · Solution · Pourquoi ça marche",
    description: "Pour emporter l'adhésion et lever les doutes.",
    steps: [
      { label: "Problème", hint: "Nommez la difficulté clairement." },
      { label: "Conséquence", hint: "Montrez ce que ça coûte si rien ne change." },
      { label: "Solution", hint: "Proposez votre réponse." },
      { label: "Pourquoi ça marche", hint: "Prouvez que la solution tient." },
    ],
  },
  {
    id: "raconter",
    name: "Raconter",
    short: "Situation · Problème · Moment fort · Fin",
    description: "Pour tenir en haleine avec une histoire.",
    steps: [
      { label: "Situation", hint: "Plantez le décor en quelques mots." },
      { label: "Problème", hint: "Introduisez la tension, l'imprévu." },
      { label: "Moment fort", hint: "Le pic : suspense, émotion, bascule." },
      { label: "Fin", hint: "La chute, et ce qu'on en retient." },
    ],
  },
  {
    id: "avis",
    name: "Donner son avis",
    short: "Je pense · Parce que · Par exemple · Donc",
    description: "Pour prendre position sans tourner autour du pot.",
    steps: [
      { label: "Je pense…", hint: "Affirmez votre position sans détour." },
      { label: "Parce que…", hint: "La raison principale." },
      { label: "Par exemple…", hint: "Un exemple qui l'appuie." },
      { label: "Donc…", hint: "Concluez en reprenant votre position." },
    ],
  },
];
export const FRAMEWORK_BY_ID = Object.fromEntries(STRUCTURE_FRAMEWORKS.map((f) => [f.id, f]));

/* ─────────────── Modes d'exercice (onglets) ───────────────
 * Trois temps d'entraînement, dans l'ordre où on les enchaîne : la mécanique
 * (articulation), le texte d'un autre (lecture), puis ses propres mots (parole).
 *
 * Les six onglets précédents mélangeaient les niveaux : « Sujets » n'était qu'un
 * tiroir de sujets pour « Discours libre », « Structure » un aide-mémoire déjà
 * présent dans cet onglet, et « Défis » rejouait lecture et discours sous un
 * autre nom. Tout est désormais rangé dans l'exercice qu'il sert vraiment. */
export const EXERCISE_MODES = {
  articulation: "articulation",
  reading: "reading",
  speaking: "speaking",
};

/* Remappage des séances enregistrées sous l'ancienne organisation, pour que
 * l'historique et les courbes de progression ne repartent pas de zéro. */
const LEGACY_MODE_MAP = {
  diction: EXERCISE_MODES.articulation,
  reading: EXERCISE_MODES.reading,
  freeSpeech: EXERCISE_MODES.speaking,
  structure: EXERCISE_MODES.speaking,
  drills: EXERCISE_MODES.speaking,
};

/* Migration du store : réétiquette les séances des anciens onglets. Renvoie le
 * même objet (référence identique) si rien ne change, pour que l'appelant
 * n'écrive pas inutilement dans Supabase. */
export function migrateEloquenceStore(store) {
  if (!store || !Array.isArray(store.sessions)) return store;
  let changed = false;
  const sessions = store.sessions.map((s) => {
    const mapped = LEGACY_MODE_MAP[s.mode];
    if (!mapped || mapped === s.mode) return s;
    changed = true;
    return { ...s, mode: mapped };
  });
  return changed ? { ...store, sessions } : store;
}

/* ═══════════════════════════════════════════════════════════════════════════
   1) ARTICULATION — la mécanique, à la répétition
   ═══════════════════════════════════════════════════════════════════════════ */

/* ─────────────── Occlusives T · D · B · P ───────────────
 * Les quatre consonnes qui « claquent » : ce sont elles qui rendent une parole
 * nette, et les premières à disparaître quand on parle trop vite. Chacune se
 * répète 20 fois en exagérant le geste. Pas d'IA, pas de note : un compteur.
 * `pair` signale les deux couples sourde/sonore (P↔B, T↔D), qui se travaillent
 * en miroir : même geste, la voix en plus. */
export const CONSONANT_REPS = 20;
// Une ligne, pas un paragraphe : la consigne est relue à chaque séance, et le
// détail du geste est déjà dans le `cue` de chaque consonne.
export const CONSONANT_DRILL_INSTRUCTION =
  "Vingt fois chaque consonne, en exagérant le geste jusqu'au ridicule.";
export const CONSONANT_DRILLS = [
  {
    id: "t",
    letter: "T",
    syllables: ["TA", "TE", "TI", "TO", "TU"],
    pair: "sourde (souffle seul)",
    cue: "Pointe de la langue franche contre les dents du haut, puis lâche d'un coup sec.",
  },
  {
    id: "d",
    letter: "D",
    syllables: ["DA", "DE", "DI", "DO", "DU"],
    pair: "sonore (la voix vibre)",
    cue: "Même geste que le T, mais la voix démarre avant que la langue ne libère l'air.",
  },
  {
    id: "b",
    letter: "B",
    syllables: ["BA", "BE", "BI", "BO", "BU"],
    pair: "sonore (la voix vibre)",
    cue: "Lèvres bien scellées, la voix pousse derrière, puis l'ouverture explose.",
  },
  {
    id: "p",
    letter: "P",
    syllables: ["PA", "PE", "PI", "PO", "PU"],
    pair: "sourde (souffle seul)",
    cue: "Lèvres fermées, expulsion sèche — et de côté si tu es près d'un micro.",
  },
];

/* ─────────────── Protocole de virelangue ───────────────
 * Deux séries de dix sur le MÊME virelangue, dans cet ordre : la vitesse
 * d'abord (elle révèle où la bouche décroche), la netteté ensuite (elle répare).
 * `goal` part à l'IA quand l'utilisateur enregistre la série. */
export const TWISTER_REPS = 10;
export const TWISTER_SERIES = [
  {
    id: "accelerate",
    title: "10 fois en accélérant",
    short: "Vitesse",
    instruction:
      "Départ lent et parfaitement net. À chaque répétition, un cran plus vite. " +
      "La dernière doit être à la limite de ce que ta bouche tient encore : dès que ça bafouille, tu as trouvé ton plafond.",
    tips: [
      "Ne saute jamais une syllabe pour aller plus vite — mieux vaut ralentir d'un cran.",
      "Garde le même volume du début à la fin : c'est la vitesse qui change, pas la voix.",
    ],
    goal:
      "VIRELANGUE EN ACCÉLÉRATION : l'utilisateur répète le même virelangue dix fois, de plus en plus vite. " +
      "Juge `diction` sur la netteté des consonnes MALGRÉ la vitesse et `rhythm` sur la régularité de l'accélération. " +
      "`fidelity` = exactitude du texte à chaque répétition : signale précisément les syllabes avalées ou inversées.",
  },
  {
    id: "articulate",
    title: "10 fois en articulant à fond",
    short: "Netteté",
    instruction:
      "Reviens au tempo lent, et surarticule : chaque consonne claque, chaque voyelle s'ouvre en grand. " +
      "Exagère jusqu'au ridicule — c'est ce trop-plein qui, une fois relâché, donne une parole nette au débit normal.",
    tips: [
      "Ouvre la bouche deux fois plus que nécessaire, mâchoire décrochée.",
      "Fais claquer les fins de mots : c'est là qu'on avale le plus.",
    ],
    goal:
      "VIRELANGUE SURARTICULÉ : l'utilisateur répète le même virelangue dix fois lentement, en exagérant l'articulation. " +
      "Juge `diction` très sévèrement : chaque consonne doit s'entendre distinctement, chaque voyelle être pleinement ouverte. " +
      "Pénalise une lecture rapide ou molle même si le texte est exact ; `fidelity` = exactitude du texte.",
  },
];

/* ═══════════════════════════════════════════════════════════════════════════
   2) LECTURE — le texte d'un autre, avec une intention
   ═══════════════════════════════════════════════════════════════════════════ */

/* Trois façons de lire le même texte. `source` dit d'où vient le texte :
 *   "library" = bibliothèque interne · "own" = texte collé par l'utilisateur
 *   "both"    = au choix.
 * `target` surcharge la fourchette de débit des quatre repères : la lecture
 * lente cherche volontairement un débit très bas, elle ne doit pas être jugée
 * sur la fourchette de conversation. */
export const READING_INTENTIONS = [
  {
    id: "slow",
    label: "Lente & exagérée",
    tagline: "Deux fois trop lent, deux fois trop articulé.",
    source: "library",
    target: { wpmMin: 70, wpmMax: 100, wpmTooFast: 120, wpmTooSlow: 45 },
    description:
      "Lis à voix haute à la moitié de ta vitesse normale, en exagérant chaque syllabe. " +
      "Pose chaque mot, ouvre grand la bouche, laisse tomber la voix à chaque point. " +
      "C'est l'exercice de base : il installe le débit et l'articulation que tu réutiliseras partout.",
    tips: [
      "Vise 70 à 100 mots/minute : ce qui te paraît absurdement lent est en fait audible.",
      "Marque une vraie pause à chaque point, et une plus courte à chaque virgule.",
      "Descends la voix sur les derniers mots de chaque phrase.",
    ],
    goal:
      "LECTURE LENTE ET EXAGÉRÉE : l'utilisateur doit lire à environ la moitié de sa vitesse normale (cible 70–100 mots/minute) " +
      "en surarticulant chaque syllabe. Juge `diction` sur l'exagération réelle de l'articulation et `rhythm` sur la lenteur " +
      "et les pauses aux ponctuations. Pénalise fortement `rhythm` si le débit dépasse 110 mots/minute, même si la lecture est fidèle. " +
      "Vérifie aussi que les fins de phrase descendent.",
  },
  {
    id: "theatrical",
    label: "Théâtrale",
    tagline: "Joue le texte comme un acteur.",
    source: "both",
    description:
      "Lis en interprétant : joue les émotions, change de couleur de voix, marque les silences, incarne les personnages. " +
      "C'est le remède le plus rapide à une voix monotone.",
    tips: [
      "Change de couleur de voix à chaque émotion ou personnage.",
      "Ose les silences : un blanc bien placé vaut mille mots.",
      "Surjoue légèrement — à l'écoute, ça sonne juste.",
    ],
    goal:
      "LECTURE THÉÂTRALE : l'utilisateur interprète le texte comme un comédien. Juge la fidélité au texte de référence, " +
      "mais surtout l'expressivité, la variation d'intonation (mélodie), les silences expressifs et l'incarnation. " +
      "Pénalise nettement une lecture plate ou monotone, même parfaitement fidèle.",
  },
  {
    id: "imitation",
    label: "Imitation",
    tagline: "Rejoue ton orateur préféré, mot pour mot.",
    source: "own",
    placeholder:
      "Colle ici la transcription de ton orateur / personnage préféré (extrait d'interview, de discours, de podcast…).",
    description:
      "Choisis une prise de parole que tu admires, colle-la, puis rejoue-la mot pour mot en copiant sa façon de parler : " +
      "son rythme, ses pauses, son intonation, son énergie.",
    tips: [
      "Écoute d'abord l'original, repère où il accélère et où il suspend.",
      "Vise l'incarnation, pas seulement les mots : imite le ton et l'énergie.",
      "Refais-le plusieurs fois — chaque prise se rapproche du modèle.",
    ],
    goal:
      "IMITATION D'UN ORATEUR : l'utilisateur rejoue mot pour mot un extrait en copiant l'intonation, le rythme et l'énergie du modèle. " +
      "Juge la fidélité au texte MAIS surtout l'expressivité, la mélodie et l'incarnation : récite-t-il platement, ou joue-t-il vraiment ? " +
      "Pénalise une lecture monotone même fidèle.",
  },
];
export const READING_INTENTION_BY_ID = Object.fromEntries(READING_INTENTIONS.map((i) => [i.id, i]));

/* ═══════════════════════════════════════════════════════════════════════════
   3) PAROLE — ses propres mots, sous contrainte
   ═══════════════════════════════════════════════════════════════════════════ */

/* Formats de prise de parole. Ils remplacent l'ancien onglet « Défis » : ce
 * n'étaient pas des exercices à part, mais des contraintes posées sur le même
 * geste — parler d'un sujet et se faire évaluer.
 * Champs optionnels :
 *   - target       : surcharge de la fourchette de débit des repères.
 *   - durations     : durées imposées proposées (secondes).
 *   - timerTargetSec: durée à tenir sans s'arrêter (minuteur indicatif).
 *   - forbidden     : active le mot interdit (compté sur la transcription).
 *   - needsTopic    : le format exige un sujet avant de pouvoir enregistrer. */
export const SPEAKING_FORMATS = [
  {
    id: "free",
    label: "Libre",
    tagline: "Un sujet, et tu parles.",
    needsTopic: true,
    description:
      "Le format de référence : un sujet, une prise de parole, et les quatre repères mesurés dessus. " +
      "Choisis un cadre de discours si tu veux être jugé sur la structure.",
    tips: [
      "Annonce ton idée dès la première phrase, développe ensuite.",
      "Une idée, un silence. Puis l'idée suivante.",
    ],
    goal: "",
  },
  {
    id: "story",
    label: "Storytelling",
    tagline: "Transforme une anecdote banale en aventure.",
    needsTopic: true,
    frameworkId: "raconter",
    topicPlaceholder: "Ton anecdote du jour : « je suis allé acheter du pain »…",
    description:
      "Raconte une anecdote — même nulle. « Aujourd'hui, je suis allé acheter du pain » peut devenir une aventure : " +
      "ajoute du suspense, des détails, des émotions, des dialogues.",
    tips: [
      "Plante le décor, puis fais monter une petite tension.",
      "Glisse au moins un dialogue (« Et là, le boulanger me dit… »).",
      "Termine sur une chute ou une leçon, même minuscule.",
    ],
    goal:
      "STORYTELLING : l'utilisateur transforme une anecdote banale en récit vivant. Juge avant tout `structure` " +
      "(arc narratif : situation → tension → moment fort → chute) et la capacité à créer du relief (détails sensoriels, " +
      "émotions, dialogues, suspense). Pénalise un récit plat, purement factuel ou sans progression.",
  },
  {
    id: "pace",
    label: "Débit maîtrisé",
    tagline: "Deux fois moins vite que d'habitude.",
    needsTopic: true,
    target: { wpmMin: 85, wpmMax: 110, wpmTooFast: 125, wpmTooSlow: 55 },
    description:
      "Parle deux fois moins vite que d'habitude. Pose chaque mot, respire, laisse de vrais silences. " +
      "Le fond n'a aucune importance ici : seul le tempo est jugé.",
    tips: [
      "Vise 85 à 110 mots/minute — bien en dessous de ton naturel.",
      "Autorise-toi des silences de deux secondes entre les idées.",
      "Exagère : ce qui te semble trop lent est souvent juste normal.",
    ],
    goal:
      "DÉBIT LENT : l'utilisateur doit parler nettement plus lentement que la normale (cible 85–110 mots/minute), en posant sa voix. " +
      "Récompense un débit lent et des silences maîtrisés ; pénalise fortement `rhythm` si le débit reste rapide ou précipité. " +
      "Le fond compte peu, c'est le tempo qui est évalué.",
  },
  {
    id: "nonstop",
    label: "Non-stop",
    tagline: "3 minutes sur un objet, sans jamais t'arrêter.",
    needsTopic: true,
    timerTargetSec: 180,
    topicPlaceholder: "Un objet : une cuillère, un trombone, une chaussette…",
    description:
      "Choisis un objet et parle dessus trois minutes sans jamais t'arrêter. Peu importe ce que tu dis : " +
      "l'objectif est de ne laisser aucun blanc involontaire et de dompter l'hésitation.",
    tips: [
      "Quand tu bloques : décris, compare, imagine — mais ne t'arrête pas.",
      "Enchaîne les angles : à quoi ça sert, son histoire, un souvenir lié…",
      "Zéro « euh » : mieux vaut un silence assumé qu'un tic.",
    ],
    goal:
      "FLUIDITÉ (parler ~3 minutes sans s'arrêter sur un objet imposé). L'objectif est la continuité : juge principalement " +
      "`confidence` et `rhythm` sur l'absence d'hésitations et de tics de langage. Pénalise les « euh » et les blancs " +
      "involontaires ; la profondeur du contenu importe peu ici.",
  },
  {
    id: "summary",
    label: "Résumé express",
    tagline: "1 minute, puis 30 s, puis 10 s.",
    needsTopic: true,
    durations: [60, 30, 10],
    topicPlaceholder: "Le sujet, la vidéo ou l'article à résumer…",
    description:
      "Résume un sujet en une minute. Recommence en trente secondes. Puis en dix. " +
      "À chaque passage tu apprends à ne garder que l'essentiel.",
    tips: [
      "En 1 min : les idées principales. En 10 s : une seule phrase-clé.",
      "Coupe les exemples et les détails avant de couper les idées.",
      "Tenir le temps fait partie de l'exercice.",
    ],
    goal:
      "SYNTHÈSE : résumer un sujet dans un temps très contraint. Juge la capacité à aller à l'essentiel : `structure` et " +
      "`clarity` priment. Le propos doit tenir dans le temps imparti sans bâcler ni déborder ; récompense la hiérarchisation.",
  },
  {
    id: "forbidden",
    label: "Mot interdit",
    tagline: "Bannis un tic de langage.",
    needsTopic: true,
    forbidden: true,
    forbiddenChoices: ["genre", "euh", "du coup", "voilà", "en fait", "alors"],
    description:
      "Choisis un mot que tu n'as plus le droit de dire, puis parle en l'évitant totalement. " +
      "Rien ne nettoie un langage aussi vite.",
    tips: [
      "Ralentis : la plupart des tics comblent un silence de réflexion.",
      "Quand le mot te vient, remplace-le par une pause muette.",
      "Une fois un mot maîtrisé, passe au suivant.",
    ],
    goal:
      "MOT INTERDIT : un tic de langage précis est formellement banni. Compte ses occurrences dans la transcription et " +
      "pénalise fortement `confidence` et `clarity` à chaque emploi. Félicite explicitement l'utilisateur s'il l'a évité entièrement.",
  },
];
export const SPEAKING_FORMAT_BY_ID = Object.fromEntries(SPEAKING_FORMATS.map((f) => [f.id, f]));


/* ─────────────── Helpers de métriques (locales, avant l'IA) ─────────────── */

// Compte les mots d'une transcription (séparateurs Unicode-friendly).
export function countWords(text) {
  if (!text) return 0;
  const m = String(text).trim().match(/[\p{L}\p{N}'’-]+/gu);
  return m ? m.length : 0;
}

// Détecte et compte les mots de remplissage. Renvoie { total, byWord }.
export function countFillers(text) {
  const byWord = {};
  let total = 0;
  if (!text) return { total, byWord };
  const lower = " " + String(text).toLowerCase().replace(/[.,;:!?()«»"]/g, " ") + " ";
  for (const f of FILLER_WORDS) {
    // Bornes de mots autour de l'expression pour éviter les faux positifs.
    const re = new RegExp("(?<![\\p{L}])" + escapeRegex(f) + "(?![\\p{L}])", "giu");
    const matches = lower.match(re);
    if (matches && matches.length) {
      byWord[f] = matches.length;
      total += matches.length;
    }
  }
  return { total, byWord };
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Compte les occurrences d'un mot / d'une expression dans un texte (bornes de
// mots, insensible à la casse). Utilisé par le défi « mot interdit ».
export function countWordOccurrences(text, word) {
  if (!text || !word || !String(word).trim()) return 0;
  const lower = " " + String(text).toLowerCase().replace(/[.,;:!?()«»"]/g, " ") + " ";
  const re = new RegExp(
    "(?<![\\p{L}])" + escapeRegex(String(word).toLowerCase().trim()) + "(?![\\p{L}])",
    "giu"
  );
  const matches = lower.match(re);
  return matches ? matches.length : 0;
}

// Débit de parole en mots/minute à partir du nombre de mots et d'une durée (s).
export function computeWpm(wordCount, durationSec) {
  if (!durationSec || durationSec <= 0) return 0;
  return Math.round((wordCount / durationSec) * 60);
}

/* Qualification du débit, selon la cible en vigueur.
 * `target` permet aux exercices qui cherchent volontairement un débit bas
 * (lecture lente et exagérée, débit maîtrisé) d'être jugés sur LEUR cible et
 * non sur la fourchette de conversation. */
export function describeWpm(wpm, target) {
  const t = target || SPEECH_TARGETS;
  const min = t.wpmMin ?? SPEECH_TARGETS.wpmMin;
  const max = t.wpmMax ?? SPEECH_TARGETS.wpmMax;
  const tooFast = t.wpmTooFast ?? Math.round(max * 1.15);
  if (!wpm) return { label: "—", tone: "mut" };
  if (wpm >= min && wpm <= max) return { label: "Dans la cible", tone: "green" };
  if (wpm > tooFast) return { label: "Trop rapide", tone: "red" };
  if (wpm > max) return { label: "Un peu rapide", tone: "amber" };
  if (wpm >= min - 20) return { label: "Un peu lent", tone: "blue" };
  return { label: "Très lent", tone: "blue" };
}

/* ─────────────── Notation des quatre repères ───────────────
 * Traduit les mesures brutes (débit du texte + acoustique du signal) en quatre
 * verdicts lisibles. `status` vaut "ok" | "warn" | "bad" | "unknown".
 *
 * C'est le retour central de la page : il ne dépend d'aucun appel réseau, donc
 * il s'affiche même quand l'IA est indisponible. */
export function buildCoachChecks(audioMetrics, wpm, target) {
  const t = { ...SPEECH_TARGETS, ...(target || {}) };
  const m = audioMetrics || {};
  const num = (v) => (typeof v === "number" && isFinite(v) ? v : null);
  const out = [];

  // 1) Débit.
  const w = num(wpm);
  if (!w) {
    out.push({ id: "pace", label: "Débit", status: "unknown", value: "—", detail: "Débit non mesuré." });
  } else {
    const info = describeWpm(w, t);
    const status =
      w >= t.wpmMin && w <= t.wpmMax ? "ok"
      : w > t.wpmTooFast || w < t.wpmTooSlow ? "bad"
      : "warn";
    out.push({
      id: "pace",
      label: "Débit",
      status,
      value: `${w} mots/min`,
      detail:
        status === "ok" ? `${info.label} — reste là.`
        : w > t.wpmMax ? `${info.label}. Cible ${t.wpmMin}–${t.wpmMax} : pose chaque mot, respire entre les idées.`
        : `${info.label}. Cible ${t.wpmMin}–${t.wpmMax} : tu peux relancer un peu l'allure.`,
    });
  }

  // 2) Silences.
  const pr = num(m.pauseRatio);
  const pc = num(m.pauseCount);
  if (pr === null) {
    out.push({ id: "silences", label: "Silences", status: "unknown", value: "—", detail: "Pauses non mesurées." });
  } else {
    const pct = Math.round(pr * 100);
    const status =
      pr >= t.pauseRatioMin && pr <= t.pauseRatioMax ? "ok"
      : pr < t.pauseRatioMin * 0.6 || pr > t.pauseRatioMax + 0.15 ? "bad"
      : "warn";
    out.push({
      id: "silences",
      label: "Silences",
      status,
      value: `${pct} % du temps${pc !== null ? ` · ${pc} pause${pc > 1 ? "s" : ""}` : ""}`,
      detail:
        status === "ok" ? "Tu respires aux bons endroits."
        : pr < t.pauseRatioMin ? "Tu enchaînes sans respirer. Marque un silence net après chaque idée."
        : "Trop de blancs : le propos est haché. Garde les pauses aux fins d'idée, pas au milieu.",
    });
  }

  // 3) Bruits parasites.
  const snr = num(m.snrDb);
  if (snr === null) {
    out.push({ id: "noise", label: "Bruits parasites", status: "unknown", value: "—", detail: "Bruit de fond non mesurable sur cette prise." });
  } else {
    const status = snr >= t.snrGood ? "ok" : snr < t.snrPoor ? "bad" : "warn";
    out.push({
      id: "noise",
      label: "Bruits parasites",
      status,
      value: `voix ${Math.round(snr)} dB au-dessus du fond`,
      detail:
        status === "ok" ? "Prise propre : on n'entend que toi."
        : "Le fond s'entend autant que toi. Ferme la fenêtre, éloigne le micro de ta bouche, ne le touche pas.",
    });
  }

  // 4) Fins de phrase descendantes.
  const fr = num(m.fallingEndRatio);
  const analyzed = num(m.endingsAnalyzed);
  if (fr === null || !analyzed) {
    out.push({ id: "endings", label: "Fins de phrase", status: "unknown", value: "—", detail: "Pas assez de phrases complètes pour mesurer l'intonation." });
  } else {
    const status = fr >= t.fallingRatioGood ? "ok" : fr < t.fallingRatioPoor ? "bad" : "warn";
    out.push({
      id: "endings",
      label: "Fins de phrase",
      status,
      value: `${num(m.fallingEndings) || 0}/${analyzed} descendent`,
      detail:
        status === "ok" ? "Tes phrases retombent : tu affirmes."
        : "Tes fins remontent ou restent plates. Laisse la voix descendre sur les trois derniers mots, puis tais-toi.",
    });
  }

  return out;
}

// Score 0–100 tiré des quatre repères (ok = 100, warn = 60, bad = 20). Les
// repères non mesurables sont ignorés ; null si aucun ne l'est.
export function coachChecksScore(checks) {
  const vals = (checks || [])
    .filter((c) => c.status === "ok" || c.status === "warn" || c.status === "bad")
    .map((c) => (c.status === "ok" ? 100 : c.status === "warn" ? 60 : 20));
  if (!vals.length) return null;
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}

// Score global = moyenne des axes présents (arrondi).
export function overallScore(scores) {
  if (!scores) return 0;
  const vals = Object.values(scores).filter((v) => typeof v === "number");
  if (!vals.length) return 0;
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}

/* ─────────────── Axes audio (mesurés sur le son, pas sur le texte) ───────────────
 * Complètent SCORE_AXES : évalués à partir des mesures acoustiques (navigateur)
 * et/ou de l'écoute par le modèle audio. Affichés dans le bilan de séance. */
export const AUDIO_AXES = [
  { id: "voice",  label: "Voix",    desc: "Timbre, projection et stabilité de la voix." },
  { id: "melody", label: "Mélodie", desc: "Variation d'intonation : ni monotone, ni instable." },
];

/* ─────────────── Bilan de séance quotidien ─────────────── */

// Clé de jour locale "YYYY-MM-DD" à partir d'une date (défaut : maintenant).
export function todayKey(d = new Date()) {
  const dt = d instanceof Date ? d : new Date(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const day = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Moyenne des nombres finis d'un tableau, arrondie ; null si aucun.
function avgOrNull(arr, round = true) {
  const vals = (arr || []).filter((v) => typeof v === "number" && isFinite(v));
  if (!vals.length) return null;
  const m = vals.reduce((a, b) => a + b, 0) / vals.length;
  return round ? Math.round(m) : m;
}

const TEXT_AXIS_IDS = ["structure", "vocabulary", "clarity", "confidence", "diction", "rhythm"];

// Extrait la voix/mélodie d'une session : priorité à l'analyse par le modèle
// (voiceAnalysis), sinon aux sous-scores déterministes (audioScores).
function sessionVoiceMelody(s) {
  const voice =
    (s.voiceAnalysis && typeof s.voiceAnalysis.voice === "number" ? s.voiceAnalysis.voice : null) ??
    (s.audioScores && s.audioScores.voice ? s.audioScores.voice.score : null);
  const melody =
    (s.voiceAnalysis && typeof s.voiceAnalysis.melody === "number" ? s.voiceAnalysis.melody : null) ??
    (s.audioScores && s.audioScores.melody ? s.audioScores.melody.score : null);
  return { voice, melody };
}

// Moyennes des axes texte + voix/mélodie sur un ensemble de sessions.
function axisAveragesOf(list) {
  const out = {};
  for (const id of TEXT_AXIS_IDS) {
    out[id] = avgOrNull(list.map((s) => (s.scores ? s.scores[id] : null)));
  }
  out.voice = avgOrNull(list.map((s) => sessionVoiceMelody(s).voice));
  out.melody = avgOrNull(list.map((s) => sessionVoiceMelody(s).melody));
  return out;
}

/* Construit l'agrégat d'une journée, au format attendu par /api/ai/eloquence/plan.
 * `sessions` = historique complet (récent → ancien). */
export function buildDailyAggregate(sessions, dateKey) {
  const all = Array.isArray(sessions) ? sessions : [];
  const ofDay = all.filter((s) => todayKey(s.date) === dateKey);

  const byMode = { articulation: 0, reading: 0, speaking: 0 };
  for (const s of ofDay) if (byMode[s.mode] != null) byMode[s.mode]++;

  const dayAxes = axisAveragesOf(ofDay);
  const axisAverages = {
    structure: dayAxes.structure, vocabulary: dayAxes.vocabulary, clarity: dayAxes.clarity,
    confidence: dayAxes.confidence, diction: dayAxes.diction, rhythm: dayAxes.rhythm,
  };

  const am = (k) => avgOrNull(ofDay.map((s) => (s.audioMetrics ? s.audioMetrics[k] : null)), false);
  const audioAverages = {
    pitchVarSemitones: am("pitchVarSemitones"),
    loudnessVar: am("loudnessVar"),
    pauseRatio: am("pauseRatio"),
    longestPauseSec: am("longestPauseSec"),
    // Les deux mesures des repères « bruits parasites » et « fins de phrase ».
    snrDb: am("snrDb"),
    fallingEndRatio: am("fallingEndRatio"),
    wpm: avgOrNull(ofDay.map((s) => s.wpm)),
  };

  const derivedAudio = {
    voice: avgOrNull(ofDay.map((s) => (s.audioScores && s.audioScores.voice ? s.audioScores.voice.score : null))),
    melody: avgOrNull(ofDay.map((s) => (s.audioScores && s.audioScores.melody ? s.audioScores.melody.score : null))),
    rhythm: avgOrNull(ofDay.map((s) => (s.audioScores && s.audioScores.rhythm ? s.audioScores.rhythm.score : null))),
  };

  const withVoice = ofDay.filter((s) => s.voiceAnalysis);
  const voiceAverages = withVoice.length
    ? {
        voice: avgOrNull(withVoice.map((s) => s.voiceAnalysis.voice)),
        melody: avgOrNull(withVoice.map((s) => s.voiceAnalysis.melody)),
        expressiveness: avgOrNull(withVoice.map((s) => s.voiceAnalysis.expressiveness)),
        warmth: avgOrNull(withVoice.map((s) => s.voiceAnalysis.warmth)),
      }
    : null;

  // Contexte : 7 derniers jours (aujourd'hui inclus) et axes d'amélioration récurrents (jours précédents).
  const weekKeys = new Set();
  const base = new Date(dateKey + "T00:00:00");
  for (let i = 0; i < 7; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() - i);
    weekKeys.add(todayKey(d));
  }
  const ofWeek = all.filter((s) => weekKeys.has(todayKey(s.date)));
  const weekAxisAverages = axisAveragesOf(ofWeek);

  const priorDays = all.filter((s) => weekKeys.has(todayKey(s.date)) && todayKey(s.date) !== dateKey);
  const freq = {};
  for (const s of priorDays) for (const imp of s.improvements || []) freq[imp] = (freq[imp] || 0) + 1;
  const recentImprovements = Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([k]) => k);

  return {
    date: dateKey,
    sessionCount: ofDay.length,
    byMode,
    axisAverages,
    audioAverages,
    derivedAudio,
    voiceAverages,
    recentImprovements,
    weekAxisAverages,
  };
}
