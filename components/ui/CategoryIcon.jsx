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
 * ── Un disque PLEIN, le glyphe en blanc ─────────────────────────────────────
 * Même traitement que les pastilles d'habitudes : la couleur du poste en aplat,
 * le dessin en blanc par dessus. Les deux pages posent la même vignette ronde
 * devant un libellé, elles ne doivent pas la peindre chacune à sa façon.
 *
 * Un état antérieur faisait l'inverse — cercle quasi blanc, teinte pure dans le
 * glyphe — pour que vingt-huit postes restent distinguables les uns des autres à
 * cette taille : c'est ce que l'aplat coûte, des teintes voisines s'y confondent
 * plus vite. Le gain, lui, est la parenté d'un bout à l'autre de l'app.
 *
 * ── La teinte telle quelle, et c'est l'ENCRE qui s'adapte ───────────────────
 * Le disque porte la couleur du poste SANS correction, à 80 % comme les deux
 * autres pages : elle reste franche, jamais rabattue vers le brun pour arranger
 * un calcul. Une version antérieure descendait chaque teinte claire jusqu'à ce
 * que le blanc du glyphe tienne son rapport ; la mesure était juste, mais elle
 * ternissait l'ambre et le cyan, et la colonne perdait ce qu'elle devait gagner.
 *
 * C'est donc le GLYPHE qui cède, pas la couleur. La palette des postes est en
 * bonne partie PASTEL (vert d'eau, rose pâle, cyan) là où les cartes d'habitudes
 * tirent sur des teintes saturées : sur 28 postes, 22 rendraient une icône
 * blanche illisible — un blanc sur #D7FFB8 plafonne à 1,1:1, autant ne rien
 * dessiner. Le glyphe est donc blanc quand l'aplat est assez profond pour le
 * porter (bleus, violets, gris foncés — le rendu des autres pages), et prend
 * sinon la MÊME teinte assombrie juste ce qu'il faut. Deux encres, une seule
 * règle : le dessin doit se voir.
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
import { contrast, inkOn, tint } from "@/lib/ui/color";
import { T } from "@/lib/ui/tokens";

/* Force de l'aplat, la même que les pastilles des pages Habitudes et Quête de
   soi : la teinte à 80 %. Elle reste franchement colorée — c'est tout l'objet —
   et perd juste l'agressivité du 100 %.

   Le mélange est calculé EN JS et non laissé à `color-mix` : il faut mesurer le
   contraste de l'aplat obtenu pour choisir l'encre du glyphe, et une fonction
   CSS ne se mesure pas. Composé sur du blanc, celui des cartes.

   3:1, le seuil des éléments graphiques : un trait de 2 px n'est pas du texte de
   lecture. */
const DISC_MIX = 0.2;
const INK_RATIO = 3;

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
  const disc = tint(color, DISC_MIX);
  const ink = contrast("#FFFFFF", disc) >= INK_RATIO ? T.onSolid : inkOn(color, disc, INK_RATIO);
  return (
    <span
      aria-hidden="true"
      style={{
        width: size, height: size, flexShrink: 0, borderRadius: 999,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        background: disc, color: ink,
      }}
    >
      <Icon size={Math.round(size * 0.52)} strokeWidth={2} />
    </span>
  );
}
