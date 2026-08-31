"use client";

/**
 * Vignette d'une opération de relevé — la marque en face, quelle qu'elle soit :
 * l'enseigne d'un achat (`findMerchant`) comme la banque d'où vient un virement
 * (`findTransferBank`). Les deux sont des entrées de la même table, et une même
 * marque doit s'afficher pareil des deux côtés.
 *
 * Trois états, du plus informatif au plus prudent :
 *   — le logo du marchand quand il est livré dans `public/marchands/` ;
 *   — à défaut, ses initiales sur la couleur de la marque : reconnaissable
 *     d'un coup d'œil dans une liste, là où quinze icônes grises identiques ne
 *     distinguent rien ;
 *   — marchand non reconnu : rien ici, l'appelant garde son icône de nature.
 *     Un logo faux serait pire que pas de logo — il se lirait comme une
 *     information vérifiée.
 *
 * Même construction qu'`AssetAvatar` : la teinte se déduit de la donnée, elle
 * n'est pas passée par l'appelant, qui ne peut donc pas la passer fausse.
 */

import React from "react";
import { LogoTile } from "@/components/ui/accountRows";
import { tileRadius } from "@/lib/ui/tokens";
import { inkOn, merchantInitials } from "@/lib/bank/merchants";

export default function MerchantAvatar({ merchant, size = 32 }) {
  if (!merchant) return null;

  if (merchant.logo) {
    return <LogoTile src={merchant.logo} size={size} name={merchant.name} />;
  }

  return (
    <span
      aria-hidden="true"
      style={{
        width: size, height: size, borderRadius: tileRadius(size), flexShrink: 0,
        background: merchant.color, color: inkOn(merchant.color),
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        fontSize: Math.max(10, Math.round(size * 0.34)), fontWeight: 600,
        fontFamily: "var(--font-sans)", letterSpacing: 0.2,
      }}
    >
      {merchantInitials(merchant.name)}
    </span>
  );
}
