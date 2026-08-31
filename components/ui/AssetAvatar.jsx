"use client";

/**
 * Vignette d'un actif du patrimoine.
 *
 * Le logo de l'établissement quand on le connaît, à défaut les initiales sur la
 * teinte du type d'actif. Les quatre pages Finance qui listent des actifs
 * (synthèse, classe, crédits, fiche) portaient chacune leur copie de ce bloc, et
 * seule la synthèse gérait le logo : le même compte s'affichait donc avec son
 * logo à un endroit et en initiales à l'autre.
 *
 * La teinte se déduit du type — l'appelant n'a pas à la passer, et ne peut donc
 * pas la passer fausse.
 */

import React from "react";
import { LogoTile } from "@/components/ui/accountRows";
import { bankLogo } from "@/lib/bank/bankLogos";
import { styleOfType } from "@/lib/patrimoine";

export default function AssetAvatar({ asset, size = 32 }) {
  if (!asset) return null;

  /* La résolution se fait à l'AFFICHAGE et non à la saisie : un logo livré avec
     l'application passe devant celui enregistré, et un actif saisi avant que sa
     banque n'ait son fichier local le récupère sans qu'on ait à le rouvrir. */
  const logo = bankLogo(asset.institution, asset.logo);
  if (logo) {
    return <LogoTile src={logo} size={size} name={asset.institution || asset.name} shape="circle" />;
  }

  const style = styleOfType(asset.type);
  return (
    <span
      aria-hidden="true"
      style={{
        width: size, height: size, borderRadius: "50%", flexShrink: 0,
        background: style.chip.bg, color: style.chip.text,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        fontSize: Math.max(10, Math.round(size * 0.34)), fontWeight: 600,
        fontFamily: "var(--font-sans)",
      }}
    >
      {String(asset.name || "?").slice(0, 2).toUpperCase()}
    </span>
  );
}
