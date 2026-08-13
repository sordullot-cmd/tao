"use client";

import React, { useState } from "react";

export default function Navbar({ user, onLogoutClick, onProfileClick }) {
  const [showMenu, setShowMenu] = useState(false);

  return (
    <header className="border-b border-gray-200 bg-white/80 backdrop-blur sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <img src="/logo.svg" alt="tao" className="w-10 h-10 rounded-full object-cover" />
          <h1 className="text-2xl font-bold text-gray-900">tao trade</h1>
        </div>

        {/* User Section */}
        <div className="flex items-center gap-4">
          {user && (
            <div className="flex items-center gap-4">
              <span className="text-sm font-medium text-gray-700">
                {user.username}
              </span>
              <div className="relative">
                <button
                  onClick={() => setShowMenu(!showMenu)}
                  className="w-10 h-10 bg-blue-600 text-white rounded-lg flex items-center justify-center font-bold hover:bg-blue-700 transition-colors"
                >
                  {user.username?.charAt(0).toUpperCase()}
                </button>

                {/* Dropdown Menu */}
                {showMenu && (
                  <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
                    <button
                      onClick={() => {
                        onProfileClick?.();
                        setShowMenu(false);
                      }}
                      className="w-full text-left px-4 py-3 text-gray-700 hover:bg-gray-50 border-b border-gray-200 font-medium transition-colors"
                    >
                      👤 View Profile
                    </button>
                    <button
                      onClick={() => {
                        onLogoutClick?.();
                        setShowMenu(false);
                      }}
                      className="w-full text-left px-4 py-3 text-red-600 hover:bg-red-50 font-medium transition-colors"
                    >
                      🚪 Logout
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
