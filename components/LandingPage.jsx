"use client";

import React from "react";
import { useRouter } from "next/navigation";

export default function LandingPage({ onLoginClick }) {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-blue-800">
      {/* Header with Login Button */}
      <header className="border-b border-blue-700 bg-blue-700/50 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <img src="/logo.svg" alt="tao" className="w-10 h-10 rounded-full object-cover" />
            <h1 className="text-2xl font-bold text-white">tao trade</h1>
          </div>
          <button
            onClick={onLoginClick}
            className="px-6 py-2 bg-white text-blue-700 font-semibold rounded-lg hover:bg-gray-100 transition-colors shadow-lg"
          >
            Login / Sign Up
          </button>
        </div>
      </header>

      {/* Hero Section */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center mb-16">
          <h2 className="text-5xl md:text-6xl font-bold text-white mb-6">
            Trading Platform
          </h2>
          <p className="text-xl md:text-2xl text-blue-100 mb-8">
            Gérez vos trades, analysez vos performances, améliorez vos stratégies
          </p>
          <button
            onClick={onLoginClick}
            className="px-8 py-3 bg-white text-blue-700 font-bold rounded-lg hover:bg-gray-100 transition-colors shadow-lg text-lg"
          >
            Commencer Maintenant
          </button>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-3 gap-8 mt-20">
          {/* Feature 1 */}
          <div className="bg-white/10 backdrop-blur border border-white/20 rounded-lg p-8 hover:bg-white/20 transition-all">
            <div className="text-4xl mb-4">📊</div>
            <h3 className="text-xl font-bold text-white mb-3">Analyse Avancée</h3>
            <p className="text-blue-100">
              Visualisez vos trades avec des graphiques détaillés et des statistiques en temps réel
            </p>
          </div>

          {/* Feature 2 */}
          <div className="bg-white/10 backdrop-blur border border-white/20 rounded-lg p-8 hover:bg-white/20 transition-all">
            <div className="text-4xl mb-4">💾</div>
            <h3 className="text-xl font-bold text-white mb-3">Sauvegarde Sécurisée</h3>
            <p className="text-blue-100">
              Tous vos trades sont sauvegardés et accessibles de n'importe où avec votre compte
            </p>
          </div>

          {/* Feature 3 */}
          <div className="bg-white/10 backdrop-blur border border-white/20 rounded-lg p-8 hover:bg-white/20 transition-all">
            <div className="text-4xl mb-4">📈</div>
            <h3 className="text-xl font-bold text-white mb-3">Performance P&L</h3>
            <p className="text-blue-100">
              Suivez votre profit & loss, win rate et autres métriques importantes
            </p>
          </div>

          {/* Feature 4 */}
          <div className="bg-white/10 backdrop-blur border border-white/20 rounded-lg p-8 hover:bg-white/20 transition-all">
            <div className="text-4xl mb-4">📥</div>
            <h3 className="text-xl font-bold text-white mb-3">Import CSV</h3>
            <p className="text-blue-100">
              Importez facilement vos trades depuis vos fichiers CSV
            </p>
          </div>

          {/* Feature 5 */}
          <div className="bg-white/10 backdrop-blur border border-white/20 rounded-lg p-8 hover:bg-white/20 transition-all">
            <div className="text-4xl mb-4">👤</div>
            <h3 className="text-xl font-bold text-white mb-3">Compte Utilisateur</h3>
            <p className="text-blue-100">
              Créez votre compte gratuit et commencez à tracker vos trades
            </p>
          </div>

          {/* Feature 6 */}
          <div className="bg-white/10 backdrop-blur border border-white/20 rounded-lg p-8 hover:bg-white/20 transition-all">
            <div className="text-4xl mb-4">🔒</div>
            <h3 className="text-xl font-bold text-white mb-3">Sécurisé</h3>
            <p className="text-blue-100">
              Vos données sont chiffrées et stockées de manière sécurisée
            </p>
          </div>
        </div>

        {/* CTA Section */}
        <div className="mt-20 bg-white/10 backdrop-blur border border-white/20 rounded-lg p-12 text-center">
          <h3 className="text-3xl font-bold text-white mb-4">
            Prêt à commencer?
          </h3>
          <p className="text-blue-100 mb-8 text-lg">
            Créez un compte gratuit et commencez à gérer vos trades dès maintenant
          </p>
          <button
            onClick={onLoginClick}
            className="px-8 py-3 bg-white text-blue-700 font-bold rounded-lg hover:bg-gray-100 transition-colors shadow-lg text-lg"
          >
            Se Connecter / S'Inscrire
          </button>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-blue-700 bg-blue-700/50 backdrop-blur mt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <p className="text-center text-blue-100">
            © 2026 tao trade. Trading platform pour traders professionnels.
          </p>
        </div>
      </footer>
    </div>
  );
}
