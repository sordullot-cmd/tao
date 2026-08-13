"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/supabaseAuthProvider";

export default function NavbarAuth() {
  const { user, logout, isAuthenticated } = useAuth();
  const router = useRouter();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const handleLogout = async () => {
    try {
      // Appeler le logout de Supabase
      await logout();
      
      // ⏳ Attendre 500ms pour s'assurer que la session est complètement effacée
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // 🚀 Rediriger vers /login
      router.push("/login");
    } catch (error) {
      console.error("Logout error:", error);
      // En cas d'erreur, forcer la redirection quand même
      router.push("/login");
    }
  };

  if (!isAuthenticated) return null;

  return (
    <nav className="bg-white shadow-lg border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <img src="/logo.svg" alt="tao" className="w-8 h-8 rounded-full object-cover" />
          <span className="text-xl font-bold text-gray-900">tao trade</span>
        </div>

        {/* User menu */}
        <div className="relative">
          <button
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="flex items-center gap-3 px-4 py-2 bg-blue-50 hover:bg-blue-100 rounded-lg transition"
          >
            <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-blue-400 rounded-full flex items-center justify-center text-white font-semibold">
              {user?.email?.[0].toUpperCase() || "U"}
            </div>
            <div className="text-sm">
              <p className="font-semibold text-gray-900">{user?.email?.split("@")[0]}</p>
            </div>
          </button>

          {/* Dropdown menu */}
          {isDropdownOpen && (
            <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-xl border border-gray-200 z-50">
              <div className="p-3 border-b border-gray-100">
                <p className="text-xs text-gray-500">Connecté en tant que</p>
                <p className="text-sm font-semibold text-gray-900 truncate">{user?.email}</p>
              </div>
              <button
                onClick={handleLogout}
                className="w-full text-left px-4 py-2 text-red-600 hover:bg-red-50 transition text-sm font-medium"
              >
                Déconnexion
              </button>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
