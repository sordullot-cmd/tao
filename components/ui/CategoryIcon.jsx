"use client";

/**
 * L'icône d'un poste de dépense, sur une vignette RONDE de sa couleur.
 *
 * Remplace la pastille ronde qui tenait ce rôle : une gommette de 10 px ne dit
 * QUE « ce poste a une couleur », et il faut lire le nom à côté pour savoir
 * lequel. Une icône se reconnaît avant le texte, ce qui compte dans un tableau
 * de quinze lignes qu'on parcourt du regard plutôt qu'on ne lit. La couleur, qui
 * est la même que dans l'anneau et le diagramme de flux, est conservée : c'est
 * elle qui relie la ligne du tableau à sa part dans les graphiques.
 *
 * ── Un disque pâle, le glyphe dans la teinte ────────────────────────────────
 * La règle est celle de `vignette` (lib/ui/color) : voile de la teinte à 14 %
 * sur le disque, glyphe dans cette même teinte. C'est la vignette des pages
 * Focus et Sport, partagée ici avec les habitudes et les catégories
 * d'objectifs — une seule famille d'un bout à l'autre de l'app.
 *
 * L'état précédent faisait l'inverse — aplat saturé, glyphe blanc. Deux raisons
 * de l'avoir abandonné. La palette des postes est en bonne partie pastel, donc
 * le blanc y tenait inégalement ; et ces trois pages finissaient par former une
 * famille à part au milieu d'une app qui pose partout ailleurs de l'encre
 * colorée sur un fond calme. Le voile rend au passage vingt-huit postes
 * distinguables à cette taille, ce que l'aplat coûtait — des teintes voisines
 * s'y confondaient plus vite.
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
import { vignette } from "@/lib/ui/color";


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
 *  perd dedans. Le trait n'est pas réglé ici — c'est celui de lucide par défaut,
 *  comme sur les vignettes des pages Focus et Sport. */
export default function CategoryIcon({ category, size = 32 }) {
  const Icon = ICONS[category] || Shapes;
  const color = categoryColor(category);
  return (
    <span
      aria-hidden="true"
      style={{
        width: size, height: size, flexShrink: 0, borderRadius: 999,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        ...vignette(color),
      }}
    >
      <Icon size={Math.round(size * 0.52)} />
    </span>
  );
}
