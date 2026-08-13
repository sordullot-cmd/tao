"use client";

/**
 * Démarrage du consentement DSP2 — extrait de `BankFormModal`.
 *
 * Deux endroits déclenchent désormais la même chose : le sélecteur de la modale
 * et les raccourcis « banques favorites » de la page. La redirection quitte
 * l'application entière, donc cette fonction ne rend jamais la main en cas de
 * succès — l'appelant garde son état « en cours » jusqu'au départ de la page.
 */

import { t } from "@/lib/i18n";

export async function startBankConnection(institutionId: string): Promise<void> {
  const resp = await fetch("/api/bank/connect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ institution: institutionId }),
  });
  const data = await resp.json();
  if (!resp.ok || !data.link) throw new Error(data.error || t("patrimoine.bank.connectFailed"));
  window.location.href = data.link;
}
