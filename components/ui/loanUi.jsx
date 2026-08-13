"use client";

/**
 * Bribes d'affichage d'un crédit, partagées par le formulaire de saisie et la
 * page « Crédits & passifs ».
 *
 * Elles vivent à part parce que les deux surfaces doivent dire la MÊME chose :
 * la modale annonce ce qui manque pour projeter, la page le redemande au même
 * endroit et dans les mêmes termes. Deux formulations divergentes pour la même
 * condition absente, et l'utilisateur cherche un champ qui ne s'appelle pas
 * pareil selon l'écran.
 *
 * Le calcul, lui, reste dans `lib/loans` : ici il n'y a que de la mise en mots.
 */

import React from "react";
import { T } from "@/lib/ui/tokens";
import { t } from "@/lib/i18n";

/** Libellé du champ qui manque — les mêmes mots que l'étiquette du formulaire. */
const GAP_KEYS = {
  rate: "patrimoine.loan.fieldRate",
  payment: "patrimoine.loan.fieldPayment",
  startDate: "patrimoine.loan.fieldStart",
  principal: "patrimoine.loan.fieldPrincipal",
};

/** « le taux annuel, la mensualité et la 1ʳᵉ échéance » — énumération lisible,
 *  la conjonction venant de la langue active et non d'un « , » à la fin. */
function joinFields(gaps) {
  const labels = (gaps || []).filter((g) => GAP_KEYS[g]).map((g) => t(GAP_KEYS[g]).toLowerCase());
  if (labels.length === 0) return "";
  if (labels.length === 1) return labels[0];
  return `${labels.slice(0, -1).join(", ")} ${t("patrimoine.loan.and")} ${labels[labels.length - 1]}`;
}

/** Phrase d'invite : ce qu'il faut saisir pour débloquer l'échéancier. */
export function loanGapsSentence(gaps) {
  const fields = joinFields(gaps);
  if (!fields) return "";
  return t("patrimoine.loan.gapsSentence").replace("{fields}", fields);
}

/** Durée en clair : « 19 ans et 8 mois » plutôt que « 236 mois ». */
export function durationLabel(months) {
  if (!Number.isFinite(months) || months <= 0) return "—";
  const y = Math.floor(months / 12);
  const m = Math.round(months % 12);
  if (y === 0) return t("patrimoine.loan.nMonths").replace("{n}", String(m));
  if (m === 0) return t("patrimoine.loan.nYears").replace("{n}", String(y));
  return t("patrimoine.loan.nYearsMonths").replace("{y}", String(y)).replace("{m}", String(m));
}

/**
 * Barre de progression d'un remboursement.
 *
 * `role="img"` avec son libellé : la barre porte une information (la part déjà
 * remboursée) qu'aucun texte voisin ne répète, elle ne peut donc pas être
 * décorative. Bornée à [0, 100] — un restant dû saisi au-dessus du capital
 * emprunté ferait sinon déborder le remplissage hors de la piste.
 */
export function LoanBar({ pct, color, ariaLabel, height = 8 }) {
  const safe = Number.isFinite(pct) ? Math.min(100, Math.max(0, pct)) : 0;
  return (
    <div
      role="img"
      aria-label={ariaLabel}
      style={{ height, width: "100%", borderRadius: 999, overflow: "hidden", background: T.accentBg }}
    >
      <div
        style={{
          width: `${safe}%`,
          height: "100%",
          background: color || T.text,
          borderRadius: 999,
          transition: "width 240ms var(--ease-out, ease)",
        }}
      />
    </div>
  );
}
