/**
 * Prévisualisation des squelettes — `?skeleton=1` force TOUS les gardes de
 * chargement à montrer leur squelette, sur n'importe quel écran.
 *
 * Sans elle, un squelette n'est visible qu'à la seconde où il sert : la
 * première ouverture d'un compte sur une machine, requête cloud en vol. Il est
 * donc impossible de vérifier qu'il a bien la FORME du contenu qu'il remplace —
 * or c'est tout ce qu'on lui demande.
 *
 * Le drapeau est lu UNE fois, à l'évaluation du module : la coquille navigue
 * par `#hash`, la chaîne de requête survit donc aux changements de page, et une
 * lecture par rendu coûterait un `URLSearchParams` à chaque barre.
 *
 * Ce fichier est une FEUILLE volontairement sans dépendance : il est importé
 * par `lib/hooks/useFirstLoad`, et le faire passer par le module des composants
 * ferait remonter tout `components/ui/da` (et ses icônes) dans chaque page qui
 * n'a besoin que du booléen.
 */
const PREVIEW = (() => {
  if (typeof window === "undefined") return false;
  try {
    return new URLSearchParams(window.location.search).get("skeleton") === "1";
  } catch {
    return false;
  }
})();

/**
 * Condition d'un garde de chargement, prévisualisation comprise.
 * À poser sur CHAQUE garde : `if (showSkeleton(loading && !data.length))`.
 */
export function showSkeleton(condition: boolean): boolean {
  return PREVIEW || condition;
}
