"use client";

/**
 * Vignette d'une opération de relevé.
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
import { RoundLogo } from "@/components/ui/accountRows";
import { inkOn, merchantInitials } from "@/lib/bank/merchants";

export default function MerchantAvatar({ merchant, size = 32 }) {
  if (!merchant) return null;

  if (merchant.logo) {
    return <RoundLogo src={merchant.logo} size={size} name={merchant.name} />;
  }

  return (
    <span
      aria-hidden="true"
      style={{
        width: size, height: size, borderRadius: 999, flexShrink: 0,
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
