import type { Metadata } from "next";

import { LegalLayout } from "@/components/ui/LegalLayout";

/**
 * Politique de confidentialité.
 *
 * Portée de `app/privacy/page.tsx` de l'app patrimoine. La STRUCTURE est reprise
 * telle quelle (données traitées, finalité, hébergement, droits) ; le CONTENU
 * est réécrit, parce que celui de l'original décrit des traitements qui
 * n'existent pas ici : agrégation bancaire DSP2 via Enable Banking, lecture de
 * soldes crypto par clé API Kraken, et une adresse de contact qui n'est pas
 * celle de ce projet.
 *
 * ⚠️ À FAIRE RELIRE. Ce texte engage l'éditeur du site. Deux points sont
 * volontairement laissés en attente et doivent être complétés avant toute mise
 * en ligne publique : l'adresse de contact RGPD, et la liste des sous-traitants
 * si d'autres services que Supabase, Vercel et OpenAI sont ajoutés.
 */

export const metadata: Metadata = {
  title: "Confidentialité",
  description: "Politique de confidentialité de l'application tao trade.",
};

export default function PrivacyPage() {
  return (
    <LegalLayout title="Politique de confidentialité" updatedAt="13 août 2026">
      <p>
        <strong>tao trade</strong> est une application personnelle de journal de
        trading et de suivi d&apos;objectifs. Elle est utilisée par son propriétaire
        pour consulter ses propres données.
      </p>

      <div>
        <h2>Données traitées</h2>
        <ul>
          <li>
            <strong>Données de trading</strong> : trades, comptes, stratégies, notes
            de journal — saisis par l&apos;utilisateur ou importés depuis ses propres
            fichiers (CSV de courtier).
          </li>
          <li>
            <strong>Données personnelles d&apos;usage</strong> : objectifs, habitudes,
            séances de sport, budget prévisionnel, patrimoine — saisis à la main.
          </li>
          <li>
            <strong>Compte utilisateur</strong> : adresse email servant à
            l&apos;authentification.
          </li>
          <li>
            <strong>Enregistrements audio</strong> : uniquement si la fonction
            d&apos;entraînement à l&apos;éloquence est utilisée, pour produire
            l&apos;analyse demandée.
          </li>
        </ul>
        <p>
          L&apos;application ne se connecte à aucune banque et ne lit aucun compte
          bancaire ou de plateforme d&apos;échange. Les montants affichés sont ceux
          que l&apos;utilisateur a saisis ou importés lui-même.
        </p>
      </div>

      <div>
        <h2>Finalité et base légale</h2>
        <p>
          Ces données servent uniquement à afficher à l&apos;utilisateur ses propres
          statistiques et l&apos;évolution de ses résultats. Le traitement repose sur
          son consentement et son intérêt légitime à suivre son activité.
        </p>
      </div>

      <div>
        <h2>Hébergement et sous-traitants</h2>
        <p>
          Les données sont stockées dans une base Supabase (Postgres) et
          l&apos;application est hébergée sur Vercel. Les fonctions d&apos;analyse
          assistée par IA transmettent le contenu concerné à OpenAI, le temps de
          produire la réponse. Aucune donnée n&apos;est vendue, louée ni partagée à
          des fins commerciales.
        </p>
      </div>

      <div>
        <h2>Vos droits</h2>
        <p>
          Conformément au RGPD, l&apos;utilisateur peut accéder à ses données, les
          rectifier ou les supprimer, et retirer son consentement à tout moment.
          Adresse de contact à compléter avant publication.
        </p>
      </div>
    </LegalLayout>
  );
}
