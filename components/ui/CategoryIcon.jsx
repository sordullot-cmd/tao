"use client";

/**
 * L'icône d'un poste de dépense, sur une pastille RONDE de sa couleur.
 *
 * Remplace la pastille ronde qui tenait ce rôle : une gommette de 10 px ne dit
 * QUE « ce poste a une couleur », et il faut lire le nom à côté pour savoir
 * lequel. Une icône se reconnaît avant le texte, ce qui compte dans un tableau
 * de quinze lignes qu'on parcourt du regard plutôt qu'on ne lit. La couleur, qui
 * est la même que dans l'anneau et le diagramme de flux, est conservée : c'est
 * elle qui relie la ligne du tableau à sa part dans les graphiques.
 *
 * ── Ronde et PLEINE, comme un logo ──────────────────────────────────────────
 * Elle se lit dans la même colonne que les vignettes d'enseignes, qui sont des
 * logos ronds à couleur pleine. Une pastille pâle à côté d'eux ne se lisait pas
 * comme la même famille d'objet : elle avait l'air d'un état désactivé. D'où le
 * même dessin qu'`AssetAvatar` et `MerchantAvatar` — disque opaque de la couleur
 * du poste, glyphe dans l'encre qui contraste dessus.
 *
 * L'encre est CALCULÉE (`inkOn`, la même fonction que les initiales d'un
 * marchand) et non choisie : la palette des postes tient une trentaine de
 * teintes, et un couple couleur/encre à maintenir par poste finirait par
 * comporter un blanc sur jaune. Le seuil est le point d'équilibre des contrastes
 * WCAG, pas l'intuition — un vert vif « paraît » sombre et ne rend pourtant
 * que 2,3:1 en blanc.
 *
 * La couleur pleine, à l'identique dans l'anneau et le diagramme de flux, est ce
 * qui relie la ligne du tableau à sa part dans les graphiques.
 *
 * Le choix des icônes est de la PRÉSENTATION, pas du classement : il vit donc
 * ici et non dans `lib/bank/categories`, qui décide des postes et de leurs
 * couleurs et se teste sans rien afficher.
 */

import React from "react";
import {
  ArrowLeftRight, Baby, Banknote, CandlestickChart, Car, CreditCard, Dumbbell,
  Fuel, GraduationCap, HeartPulse, Home, Landmark, Laptop, PawPrint, Percent,
  PiggyBank, Plane, Repeat, Shapes, ShieldCheck, ShoppingBag, Smartphone,
  Sparkles, Ticket, TrainFront, UtensilsCrossed, Wallet, Zap,
} from "lucide-react";
import { categoryColor } from "@/lib/bank/categories";
import { inkOn } from "@/lib/bank/merchants";

/* Une icône par poste de `SPENDING_CATEGORIES`. Le critère est ce que le poste
   ACHÈTE, pas la famille dans laquelle il est rangé : « carburant » prend la
   pompe et non la voiture, sans quoi trois postes du même groupe porteraient le
   même dessin et l'icône ne distinguerait plus rien. */
const ICONS = {
  housing: Home,
  utilities: Zap,
  telecom: Smartphone,
  insurance: ShieldCheck,
  food: UtensilsCrossed,
  transport: TrainFront,
  fuel: Fuel,
  car: Car,
  travel: Plane,
  shopping: ShoppingBag,
  tech: Laptop,
  beauty: Sparkles,
  health: HeartPulse,
  sport: Dumbbell,
  pets: PawPrint,
  leisure: Ticket,
  subscriptions: Repeat,
  education: GraduationCap,
  kids: Baby,
  trading: CandlestickChart,
  savings: PiggyBank,
  credit: CreditCard,
  taxes: Landmark,
  fees: Percent,
  cash: Banknote,
  transfer: ArrowLeftRight,
  income: Wallet,
  /* « Autres » n'est pas un poste, c'est l'aveu que la règle n'a pas tranché : il
     porte donc une forme abstraite, et surtout pas l'objet de quoi que ce soit. */
  other: Shapes,
};

/** Taille par défaut : celle d'un logo d'enseigne. Les deux listes se lisent
 *  l'une à côté de l'autre, leurs vignettes doivent avoir le même encombrement.
 *
 *  Le glyphe occupe un peu plus de la moitié du disque : plus gros, il touche le
 *  bord et la pastille cesse de se lire comme une vignette ; plus petit, il se
 *  perd dans l'aplat. Le trait est épaissi d'un cran par rapport aux icônes de
 *  l'interface — sur fond plein, un trait de 1,75 disparaît. */
export default function CategoryIcon({ category, size = 32 }) {
  const Icon = ICONS[category] || Shapes;
  const color = categoryColor(category);
  return (
    <span
      aria-hidden="true"
      style={{
        width: size, height: size, flexShrink: 0, borderRadius: 999,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        background: color, color: inkOn(color),
      }}
    >
      <Icon size={Math.round(size * 0.52)} strokeWidth={2} />
    </span>
  );
}
