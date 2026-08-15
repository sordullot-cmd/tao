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
 * du poste.
 *
 * ── Le glyphe est la MÊME couleur, en plus foncé ────────────────────────────
 * Et non un blanc ou un noir calculé : un aplat coloré traversé d'un trait blanc
 * se lit comme un pictogramme d'application, alors qu'un camaïeu se lit comme
 * une matière. La teinte reste celle du poste d'un bout à l'autre de la ligne.
 *
 * Ça se paie en CONTRASTE, et c'est ce qui décide des deux constantes plus bas.
 * Sur le disque à pleine saturation, un glyphe plus foncé du même ton plafonne
 * à 2,4:1 (mesuré sur les 28 postes) : huit d'entre eux passaient sous le seuil
 * de 3:1 des éléments graphiques, et un trait de 2 px y devenait une ombre. Le
 * disque est donc éclairci d'un cran — 15 %, assez pour que les 28 postes
 * repassent au-dessus de 3:1, trop peu pour qu'il cesse de se lire comme un
 * aplat plein à côté des logos d'enseignes.
 *
 * `DISC_TINT` à 0 rend le disque exactement tel qu'il était, au prix de ces
 * huit postes.
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
import { shade, tint } from "@/lib/ui/color";

/* Le disque, et le glyphe dessus — tous deux dérivés de la couleur du poste.
   Les valeurs viennent d'une mesure de contraste sur les 28 postes, pas de
   l'œil : cf. l'en-tête. */
const DISC_TINT = 0.15;
const GLYPH_SHADE = 0.65;

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
        background: tint(color, DISC_TINT), color: shade(color, GLYPH_SHADE),
      }}
    >
      <Icon size={Math.round(size * 0.52)} strokeWidth={2} />
    </span>
  );
}
