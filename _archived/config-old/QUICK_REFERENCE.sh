#!/bin/bash
# Quick Start Script - Copy the commands below

# ============================================
# 🚀 CSV IMPORT SYSTEM - QUICK START
# ============================================

# 1️⃣ START THE SERVERS
   npm run dev
   # Server starts on http://localhost:3000

# 2️⃣ OPEN IN BROWSER
   http://localhost:3000

# 3️⃣ CLICK "📥 Import Trades" BUTTON
   # Modal will open

# 4️⃣ SELECT FORMAT
   # Choose: "📄 Format Générique"

# 5️⃣ SELECT FILE: sample_trades.csv
   # Click and browse to: e:\tao\sample_trades.csv

# 6️⃣ PREVIEW TRADES
   # Modal shows first 5 trades

# 7️⃣ CLICK "✓ Importer Trades"
   # Trades imported to dashboard!

# ============================================
# ✅ EXPECTED RESULT
# ============================================
# 
# Dashboard shows:
#   • 25 Total Trades
#   • +$6,100 Total P&L
#   • 80% Win Rate
#   • 2.0 Profit Factor
#   • Trades table with all details
#   • Equity curve chart

# ============================================
# 🧪 TEST IN COMMAND LINE
# ============================================

# Test CSV parsing:
   cd e:\tao
   node test-csv.js

# Expected output:
   # ✅ CSV Import Test Results:
   # Total trades parsed: 25

# ============================================
# 🧪 TEST IN BROWSER
# ============================================

# Interactive test page:
   http://localhost:3000/csv-parser-test.html

# Features:
   # • Load sample CSV
   # • Paste custom CSV
   # • See parsed results in real-time
   # • Debug format issues

# ============================================
# 📊 CSV FILE FORMAT
# ============================================

# Generic Format (default):
   # Date,Symbol,Direction,Entry,Exit,PnL
   # 2026-03-31,NQ,Long,19842,19920,312
   # 2026-03-31,ES,Short,5290,5268,440

# Required columns (case-insensitive):
   # - Date: Trade date
   # - Symbol: Asset symbol (ES, NQ, EURUSD, etc)
   # - Direction: "Long" or "Short"
   # - Entry: Entry price (number)
   # - Exit: Exit price (number)
   # - PnL: Profit/Loss (number, can be negative)

# ============================================
# 🐛 TROUBLESHOOTING
# ============================================

# Problem: "No trades found" error
# Solution: Check CSV format (comma-separated, not semicolon)
test-csv.js

# Problem: Server won't start
# Solution: Kill old processes
   Get-Process node | Stop-Process -Force
   npm run dev

# Problem: "Aucun fichier sélectionné"
# Solution: Make sure file is selected before clicking import

# Problem: Port already in use
# Solution: Check what's using it
   netstat -ano | findstr :3000
   taskkill /PID <PID> /F

# ============================================
# 📋 FILES YOU NEED
# ============================================

# Core Files (already created):
   lib/csvParsers.js              ✅ Parser functions
   components/TradeImportModal.jsx ✅ Import dialog
   components/DashboardNew.jsx     ✅ Dashboard UI
   sample_trades.csv              ✅ Test data (25 trades)

# Documentation (already created):
   QUICK_START.md                 ✅ This file
   CSV_IMPORT_GUIDE.md            ✅ Detailed guide
   CSV_SYSTEM_SUMMARY.md          ✅ How it works
   VERIFICATION_REPORT.md         ✅ Test results

# Test Files (already created):
   test-csv.js                    ✅ Command-line test
   public/csv-parser-test.html    ✅ Browser test

# ============================================
# 🔗 QUICK LINKS
# ============================================

Frontend:         http://localhost:3000
Test Page:        http://localhost:3000/csv-parser-test.html
Backend API:      http://localhost:5000

# ============================================
# ✨ FEATURES
# ============================================

✅ Import CSV trades from 3 broker formats
✅ Real-time preview of trades
✅ Automatic statistics calculation
✅ localStorage persistence (private, no server)
✅ Trade history table
✅ Equity curve visualization
✅ Support for multiple imports
✅ Clear/reset functionality

# ============================================
# 🎯 NEXT STEPS
# ============================================

1. Run: npm run dev
2. Open: http://localhost:3000
3. Click: "📥 Import Trades"
4. Select: "Format Générique"
5. Choose: sample_trades.csv
6. Click: "✓ Importer Trades"
7. View: 25 trades in dashboard ✅

# That's it! The system is ready to use.
