import { NextRequest, NextResponse } from "next/server";

import { requireAuth, isAuthSuccess } from "@/lib/auth/apiAuth";
import { isBankConfigured, listInstitutions, bankConfig } from "@/lib/bank/enablebanking";

/**
 * GET /api/bank/institutions — banques disponibles dans le pays configuré.
 *
 * Le défaut de configuration est distingué de l'erreur d'appel : sans
 * identifiants Enable Banking, la page doit dire « pas configuré » et expliquer
 * quoi renseigner, pas afficher un échec réseau.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!isAuthSuccess(auth)) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  if (!isBankConfigured()) {
    return NextResponse.json({ configured: false, institutions: [] });
  }

  try {
    const country = request.nextUrl.searchParams.get("country") || bankConfig.country;
    const institutions = await listInstitutions(country);
    return NextResponse.json({ configured: true, country, institutions });
  } catch (err) {
    return NextResponse.json(
      { configured: true, error: err instanceof Error ? err.message : "Erreur inconnue" },
      { status: 502 },
    );
  }
}
