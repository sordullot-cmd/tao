/**
 * Physique des gestes — le socle commun aux surfaces que l'on peut saisir
 * (tiroir latéral, toasts, feuilles).
 *
 * Le site suivait le doigt sans jamais mesurer sa VITESSE : seule la distance
 * parcourue comptait. Concrètement, une chiquenaude rapide et courte ne
 * renvoyait rien, alors que c'est le geste le plus naturel pour se débarrasser
 * de quelque chose. Ces trois fonctions corrigent ça.
 */

/** Nombre d'échantillons conservés pour estimer la vitesse. */
const SAMPLES = 5;

export interface Sample { x: number; y: number; t: number; }

/**
 * Historique court de positions. On estime la vitesse sur les dernières
 * frames plutôt que sur le tout dernier événement : un seul `pointermove`
 * donne une valeur bruitée, et c'est justement au relâchement — quand le doigt
 * ralentit parfois d'une frame — que l'erreur se voit le plus.
 */
export class VelocityTracker {
  private samples: Sample[] = [];

  reset() { this.samples = []; }

  add(x: number, y: number, t: number) {
    this.samples.push({ x, y, t });
    if (this.samples.length > SAMPLES) this.samples.shift();
  }

  /** Vitesse en px/s sur la fenêtre d'échantillons. */
  velocity(): { x: number; y: number } {
    const s = this.samples;
    if (s.length < 2) return { x: 0, y: 0 };
    const first = s[0];
    const last = s[s.length - 1];
    const dt = last.t - first.t;
    if (dt <= 0) return { x: 0, y: 0 };
    return { x: ((last.x - first.x) / dt) * 1000, y: ((last.y - first.y) / dt) * 1000 };
  }
}

/**
 * Distance qu'un objet lancé à `velocity` px/s parcourra encore avant de
 * s'arrêter — la même décélération exponentielle que le défilement inertiel.
 *
 * C'est ce qui permet de viser la destination du geste plutôt que le point où
 * le doigt s'est levé : on décide « où ça allait », pas « où c'était ». Sans
 * ça, un lancer franc mais court est traité comme une hésitation.
 *
 * Ce n'est PAS la formule scolaire `v² / 2a` : celle-ci décrit un frottement
 * constant, alors qu'une décélération de défilement est exponentielle.
 */
export function project(velocity: number, decelerationRate = 0.998): number {
  return (velocity / 1000) * decelerationRate / (1 - decelerationRate);
}

/**
 * Résistance élastique au-delà d'une borne : plus on tire, moins ça suit.
 *
 * Un arrêt net se lit comme un blocage — l'utilisateur croit que l'interface
 * a cessé de répondre. Une résistance progressive dit la même chose (« il n'y
 * a rien de plus par là ») tout en continuant visiblement d'écouter le geste.
 *
 * @param overshoot dépassement en px au-delà de la borne
 * @param dimension taille de référence (largeur ou hauteur de la surface)
 */
export function rubberband(overshoot: number, dimension: number, constant = 0.55): number {
  if (dimension <= 0) return 0;
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}

/**
 * Seuil de vitesse (px/ms) au-delà duquel une chiquenaude vaut renvoi, quelle
 * que soit la distance parcourue. Valeur éprouvée par Sonner.
 */
export const FLICK_VELOCITY = 0.11;

/** Déplacement minimal avant de considérer qu'un appui est devenu un glissé. */
export const DRAG_HYSTERESIS = 10;
