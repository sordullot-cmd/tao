"use client";

/**
 * L'icône d'un poste de dépense, dans sa couleur.
 *
 * Remplace la pastille ronde qui tenait ce rôle : une gommette de 10 px ne dit
 * QUE « ce poste a une couleur », et il faut lire le nom à côté pour savoir
 * lequel. Une icône se reconnaît avant le texte, ce qui compte dans un tableau
 * de quinze lignes qu'on parcourt du regard plutôt qu'on ne lit. La couleur, qui
 * est la même que dans l'anneau et le diagramme de flux, est conservée : c'est
 * elle qui relie la ligne du tableau à sa part dans les graphiques.
 *
 * ── Pourquoi le fond est en alpha et non en teinte claire ────────────────────
 * Un `tint(couleur, 0.9)` donnerait un pastel calculé sur du BLANC, qui vire au
 * gris sale dès que la carte passe en thème sombre. La même couleur à 12 %
 * d'opacité se pose au contraire sur le fond réel, quel qu'il soit : elle
 * s'éclaircit sur blanc et s'assombrit sur noir, sans qu'on ait deux palettes à
 * tenir. C'est aussi ce qui garde l'icône lisible sur les deux fonds, puisque le
 * trait, lui, reste à pleine saturation.
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

/** Fond de la vignette : la couleur du poste, très diluée (cf. en-tête). */
const BG_ALPHA = "1F"; // 12 %

export default function CategoryIcon({ category, size = 26 }) {
  const Icon = ICONS[category] || Shapes;
  const color = categoryColor(category);
  return (
    <span
      aria-hidden="true"
      style={{
        width: size, height: size, flexShrink: 0, borderRadius: size / 3.2,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        background: `${color}${BG_ALPHA}`, color,
      }}
    >
      <Icon size={Math.round(size * 0.58)} strokeWidth={1.75} />
    </span>
  );
}
