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
 * ── Un cercle BLANC, la couleur dans le glyphe ──────────────────────────────
 * Le disque a d'abord été plein — la couleur du poste en aplat, le glyphe par
 * dessus. Deux essais, deux impasses : en blanc, le trait donnait un pictogramme
 * d'application ; du même ton en plus foncé, un camaïeu qui empâtait la couleur
 * et rendait les vingt-huit postes difficiles à distinguer les uns des autres à
 * cette taille.
 *
 * C'est l'inverse qui tient : le cercle s'efface (une pointe de la teinte, assez
 * pour que la vignette existe sur une carte blanche) et la COULEUR passe dans le
 * glyphe, à pleine force. Une teinte pure sur du blanc se reconnaît au premier
 * coup d'œil, là où la même teinte diluée dans un aplat se confond avec sa
 * voisine — et la colonne cesse de crier à côté des logos d'enseignes, qui
 * gardent leurs aplats de marque.
 *
 * ── Le contraste n'est pas laissé à l'œil ───────────────────────────────────
 * Sur un disque quasi blanc, un trait de 2 px doit tenir 4,5:1 pour se lire, et
 * la palette des postes mélange des teintes sombres (bordeaux) et claires (cyan,
 * mauve, ambre) : à pleine saturation, huit d'entre elles passaient sous le
 * seuil. `deepen` (cf. `lib/ui/color`) ramène chacune juste au niveau de
 * profondeur qu'il faut, en mélangeant vers le NOIR et jamais vers le gris — la
 * teinte est conservée, et les couleurs déjà sombres ne bougent pas.
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
import { deepen, tint } from "@/lib/ui/color";

/* Le disque, et le glyphe dessus — tous deux dérivés de la couleur du poste.
   Les valeurs viennent d'une mesure de contraste sur les 28 postes, pas de
   l'œil : cf. l'en-tête.

   Le disque à 88 % de blanc se lit comme blanc tout en restant visible sur une
   carte blanche. Le glyphe est ramené sous cette luminance-là, qui est ce que
   4,5:1 exige contre un fond aussi clair. */
const DISC_TINT = 0.88;
const GLYPH_MAX_LUM = 0.13;

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
        background: tint(color, DISC_TINT), color: deepen(color, GLYPH_MAX_LUM),
      }}
    >
      <Icon size={Math.round(size * 0.52)} strokeWidth={2} />
    </span>
  );
}
