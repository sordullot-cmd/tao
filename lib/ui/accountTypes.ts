import { T } from "@/lib/ui/tokens";
import { t } from "@/lib/i18n";

/**
 * Couleur d'identité d'un compte — dérivée de son TYPE, pas de son identifiant.
 *
 * Convention de l'app (venue de la page « Ajouter un trade », désormais valable
 * partout) : eval ambre, funded bleu, live vert, démo violet. Deux comptes du
 * même type portent donc la même couleur : la pastille dit « quel genre de
 * compte », elle n'identifie pas un compte en particulier.
 *
 * Chaque type porte le triplet complet encre / aplat / bordure, pour que les
 * pastilles, les cases à cocher et les puces de statut viennent tous d'ici.
 * `label` est une fonction pour que le libellé suive la langue courante.
 */
export interface AccountTypeStyle {
  fg: string;
  bg: string;
  bd: string;
  label: () => string;
}

export const ACCOUNT_TYPE_COLORS: Record<string, AccountTypeStyle> = {
  eval:   { fg: T.amber,  bg: T.amberBg,  bd: T.amberBd,  label: () => t("addTrade.eval") },
  funded: { fg: T.blue,   bg: T.blueBg,   bd: T.blueBd,   label: () => t("addTrade.funded") },
  live:   { fg: T.green,  bg: T.greenBg,  bd: T.greenBd,  label: () => t("addTrade.live") },
  demo:   { fg: T.purple, bg: T.purpleBg, bd: T.purpleBd, label: () => t("addTrade.demo") },
};

export const DEFAULT_ACCOUNT_TYPE = "live";

/** Accepte un compte, un type déjà normalisé, ou rien. Type inconnu → « live ». */
export function accountTypeOf(account: unknown): string {
  const raw =
    typeof account === "string"
      ? account
      : (account as { account_type?: string } | null | undefined)?.account_type;
  const key = String(raw || "").toLowerCase();
  return key in ACCOUNT_TYPE_COLORS ? key : DEFAULT_ACCOUNT_TYPE;
}

/** Le triplet complet (encre / aplat / bordure) du type d'un compte. */
export function accountTypeStyle(account: unknown): AccountTypeStyle {
  return ACCOUNT_TYPE_COLORS[accountTypeOf(account)];
}

/**
 * Encre du type d'un compte : pastilles, courbes et sparklines.
 * Passer l'objet compte (pas son id) — la couleur suit `account_type`.
 */
export function accountColor(account: unknown): string {
  return accountTypeStyle(account).fg;
}

/**
 * Courbe d'un agrégat (une prop firm, le portefeuille entier) : aucun type de
 * compte ne s'applique, on prend l'accent signature réservé à cet usage.
 */
export const AGGREGATE_CURVE_COLOR = T.kraken;
