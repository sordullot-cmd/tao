import type { Metadata } from "next";

import { LegalLayout } from "@/components/ui/LegalLayout";

/**
 * Conditions d'utilisation.
 *
 * Portée de `app/terms/page.tsx` de l'app patrimoine. Mêmes sections que
 * l'original (objet, absence de garantie, responsabilité, contact) ; le contenu
 * change, l'original décrivant un service d'agrégation bancaire en lecture seule
 * qui n'a pas d'équivalent ici.
 *
 * ⚠️ À FAIRE RELIRE avant toute mise en ligne publique : l'adresse de contact
 * reste à compléter, et la clause d'absence de conseil financier mérite d'être
 * validée pour une app de trading, où elle porte plus loin que sur une app de
 * patrimoine.
 */

export const metadata: Metadata = {
  title: "Conditions d'utilisation",
  description: "Conditions d'utilisation de l'application tao trade.",
};

export default function TermsPage() {
  return (
    <LegalLayout title="Conditions d'utilisation" updatedAt="13 août 2026">
      <p>
        <strong>tao trade</strong> est une application personnelle et privée, mise à
        disposition à titre gratuit pour un usage strictement individuel.
      </p>

      <div>
        <h2>Objet du service</h2>
        <p>
          L&apos;application enregistre et met en forme les trades, objectifs et
          données personnelles saisis ou importés par l&apos;utilisateur, afin
          d&apos;en afficher des statistiques. Elle ne passe aucun ordre, ne se
          connecte à aucun courtier en écriture et ne réalise aucune opération
          financière.
        </p>
      </div>

      <div>
        <h2>Absence de conseil</h2>
        <p>
          Les statistiques, analyses et suggestions produites par
          l&apos;application — y compris celles générées par ses fonctions
          d&apos;intelligence artificielle — sont fournies à titre informatif. Elles
          ne constituent ni un conseil en investissement, ni une recommandation
          personnalisée, ni un document comptable ou fiscal opposable.
          L&apos;utilisateur reste seul responsable de ses décisions et de ses
          pertes éventuelles.
        </p>
      </div>

      <div>
        <h2>Absence de garantie</h2>
        <p>
          Le service est fourni « en l&apos;état », sans garantie d&apos;exactitude
          ni de disponibilité. Les montants affichés dépendent de ce qui a été saisi
          ou importé et peuvent comporter des erreurs.
        </p>
      </div>

      <div>
        <h2>Responsabilité</h2>
        <p>
          L&apos;éditeur ne saurait être tenu responsable d&apos;un préjudice
          résultant de l&apos;utilisation du service, d&apos;une perte de données ou
          d&apos;une indisponibilité des prestataires tiers dont il dépend.
        </p>
      </div>

      <div>
        <h2>Contact</h2>
        <p>Adresse de contact à compléter avant publication.</p>
      </div>
    </LegalLayout>
  );
}
