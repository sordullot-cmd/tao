/**
 * Logos de banques livrés avec l'application.
 *
 * Enable Banking publie un logo par établissement, mais tous n'en ont pas, et
 * ceux qui existent sont servis depuis un domaine tiers : une banque sans logo
 * (ou dont l'image ne répond pas) retombe sur ses initiales, ce qui est correct
 * mais méconnaissable dans une liste de plusieurs centaines d'établissements.
 *
 * D'où cette table : les banques dont on a le vrai logo sous la main sont
 * servies depuis `public/banque/`, et la valeur de l'agrégateur ne sert plus
 * que de repli. La priorité au fichier local est délibérée — c'est celui qu'on
 * a choisi, il ne dépend d'aucun réseau et il ne change pas sans qu'on le
 * veuille.
 *
 * Ajouter une banque : déposer l'image dans `public/banque/` (carrée, le disque
 * de `RoundLogo` la détoure en `cover`) et ajouter une ligne ici.
 */

/**
 * Clé de comparaison d'un nom d'établissement : casse, accents et espaces
 * multiples ignorés. Le nom peut venir de l'agrégateur comme d'un champ libre,
 * il ne sera jamais écrit au caractère près.
 */
export const bankMatchKey = (s: string): string =>
  String(s || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/* Motifs, pas noms exacts : Enable Banking nomme les caisses régionales
   « Credit Agricole Alpes Provence », « Credit Agricole Nord de France »… et
   Boursorama apparaît selon les pays comme « Boursorama » ou « BoursoBank ».
   Une égalité stricte n'en attraperait aucune. */
const LOCAL_LOGOS: Array<{ match: RegExp; src: string }> = [
  { match: /\bbourso/, src: "/banque/boursorama.jpg" },
  { match: /\bcredit agricole\b/, src: "/banque/credit-agricole.jpg" },
  { match: /\brevolut\b/, src: "/banque/revolut.webp" },
];

/** Logo livré pour cette banque, `null` si elle n'en a pas dans la table. */
export function localBankLogo(name: string | null | undefined): string | null {
  const key = bankMatchKey(name || "");
  if (!key) return null;
  return LOCAL_LOGOS.find((l) => l.match.test(key))?.src ?? null;
}

/**
 * Logo à afficher pour une banque : le fichier local s'il existe, sinon celui
 * de l'agrégateur. `null` quand ni l'un ni l'autre — l'appelant retombe alors
 * sur les initiales, jamais sur une image inventée.
 */
export function bankLogo(
  name: string | null | undefined,
  fallback: string | null | undefined = null,
): string | null {
  return localBankLogo(name) || fallback || null;
}
