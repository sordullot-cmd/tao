import { resolvePlatformIcon, PROP_FIRM_PRESETS } from "@/lib/brokers/platforms";

/**
 * Identité visuelle d'un compte : celle de sa PROP FIRM.
 *
 * La plateforme d'exécution (Tradovate, Rithmic, NinjaTrader…) ne sert qu'à
 * l'import — c'est elle qui dit quel parseur appliquer à un fichier. Elle ne
 * doit apparaître ni comme logo ni comme nom d'un compte : un compte Apex
 * exécuté sur Tradovate est un compte Apex.
 *
 * Le logo d'une firme se résout donc sur son NOM (le catalogue de
 * lib/brokers/platforms porte les logos des prop firms connues), jamais sur son
 * champ `platform`, qui est justement la plateforme d'exécution.
 */

interface FirmLike {
  id?: string;
  name?: string;
  /** Maison de prop trading choisie (PLATFORMS.id) — survit à un renommage. */
  brand?: string | null;
  /** Plateforme d'exécution héritée par les comptes — volontairement ignorée ici. */
  platform?: string | null;
}

interface AccountLike {
  firm_id?: string | null;
  broker?: string | null;
  name?: string | null;
}

/**
 * Marque d'une firme : la maison choisie à la création (`brand`), sinon
 * déduite de son nom pour les firmes créées avant que la marque existe.
 *
 * C'est ce qui fait qu'une firme « Topstep » renommée « Mes comptes Topstep »,
 * ou même « Compte perso », garde son rattachement : le nom est un libellé
 * libre, le lien vit dans `brand`.
 */
export function firmBrandId(firm: FirmLike | null | undefined): string | null {
  if (firm?.brand) return firm.brand;
  if (!firm?.name) return null;
  const key = firm.name.trim().toLowerCase();
  if (!key) return null;
  const exact = PROP_FIRM_PRESETS.find((p) => p.id === key || p.name.toLowerCase() === key);
  if (exact) return exact.id;
  // « Topstep #2 », « Apex 2 », « Lucid » : le nom porte encore la maison.
  const partial = PROP_FIRM_PRESETS.find(
    (p) => key.includes(p.id) || key.includes(p.name.toLowerCase()) || p.name.toLowerCase().includes(key)
  );
  return partial?.id || null;
}

/** Logo d'une prop firm, porté par sa marque. `null` si aucune n'est connue. */
export function firmLogo(firm: FirmLike | null | undefined): string | null {
  const brand = firmBrandId(firm);
  if (brand) return resolvePlatformIcon(brand);
  // Firme hors catalogue : rien à afficher plutôt qu'un logo approchant.
  return null;
}

/** La firme d'un compte, depuis une liste ou une Map indexée par id. */
export function firmOfAccount(
  account: AccountLike | null | undefined,
  firms: FirmLike[] | Map<string, FirmLike> | null | undefined
): FirmLike | null {
  const id = account?.firm_id;
  if (!id || !firms) return null;
  if (firms instanceof Map) return firms.get(id) || null;
  return firms.find((f) => f.id === id) || null;
}

/**
 * Ce qu'on affiche pour identifier un compte : logo et nom de sa prop firm.
 *
 * Un compte sans firme (live ou démo personnel) n'a pas de prop firm à
 * montrer : on retombe alors sur son broker, qui est son seul rattachement —
 * et non sur un rond vide.
 */
export function accountBrand(
  account: AccountLike | null | undefined,
  firms: FirmLike[] | Map<string, FirmLike> | null | undefined
): { logo: string | null; label: string; firm: FirmLike | null } {
  const firm = firmOfAccount(account, firms);
  if (firm) return { logo: firmLogo(firm), label: firm.name || "", firm };
  return {
    logo: account?.broker ? resolvePlatformIcon(account.broker) : null,
    label: account?.broker || "",
    firm: null,
  };
}

/** Raccourci quand seul le logo est utile. */
export function accountLogo(
  account: AccountLike | null | undefined,
  firms: FirmLike[] | Map<string, FirmLike> | null | undefined
): string | null {
  return accountBrand(account, firms).logo;
}
