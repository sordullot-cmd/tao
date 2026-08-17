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
 * ── La couleur du poste, telle qu'elle est dans le diagramme ────────────────
 * Le disque porte la couleur du poste SANS aucune correction — la même que sa
 * barre dans le Sankey et sa part dans l'anneau —, et le glyphe est blanc. Une
 * seule règle, sur les trois pages qui posent ce genre de vignette (Cashflow,
 * Habitudes, Quête de soi) : fond = la couleur du sujet, dessin = blanc.
 *
 * Deux réglages plus prudents ont été essayés et écartés : assombrir le disque
 * pour que le blanc tienne 3:1 (il ternissait l'ambre et le cyan), puis noircir
 * le GLYPHE sur les teintes trop claires (deux encres au lieu d'une, et la
 * parenté avec les autres pages se perdait). La palette des postes est en bonne
 * partie pastel, donc le blanc s'y lit inégalement — c'est assumé : la vignette
 * colore et situe, le NOM du poste est juste à côté et porte l'information.
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
import { T } from "@/lib/ui/tokens";


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
        background: color, color: T.onSolid,
      }}
    >
      <Icon size={Math.round(size * 0.52)} strokeWidth={2} />
    </span>
  );
}
