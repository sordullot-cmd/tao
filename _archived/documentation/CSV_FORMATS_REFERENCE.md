# 📥 Supported CSV Formats - Complete Reference

## ✅ 4 CSV Formats Now Supported

### Format 1: 🏦 Export Broker (NEW!)
**Use when:** Exporting from most brokers (Futures, CFDs, Forex)

```csv
Date,Account,OrderID,B/S,Contract,Product,avgPrice,FillTime,PnL,Qty,Status
2026-03-31,46008134031,30728,BUY,NASDAQ 100,E-Mini,19842.75,09:30:33,312,1,Filled
2026-03-31,46008134031,30729,SELL,ES,E-Mini,5290.25,09:35:15,440,1,Filled
```

**Required columns:** Date, B/S, Contract, avgPrice, PnL  
**Auto-detects:** ✅ YES  
**Example file:** sample_trades_format2.csv

---

### Format 2: 📄 Generic (Most Flexible)
**Use when:** Custom CSV, testing, or flexible format

```csv
Date,Symbol,Direction,Entry,Exit,PnL
2026-03-31,NQ,Long,19842,19920,312
2026-03-31,ES,Short,5290,5268,440
```

**Required columns:** Date, Symbol, Direction, Entry, Exit, PnL  
**Auto-detects:** ✅ YES  
**Example file:** sample_trades.csv

---

### Format 3: 📊 Tradovate
**Use when:** Trading with Tradovate platform

```csv
Exit Date,Entry Date,Symbol,Quantity,Avg Fill Price,Avg Exit Price,P&L
2026-04-15,2026-03-31,NASDAQ 100,1,19842.75,19920.00,312
```

**Required columns:** Exit Date, Entry Date, Symbol, Avg Fill Price, Avg Exit Price, P&L  
**Auto-detects:** ✅ YES  
**Example file:** (Create from Tradovate export)

---

### Format 4: 🔷 MetaTrader 5
**Use when:** Trading with MT5 platform

```csv
Ticket,Open Time,Type,Size,Item,Entry Price,Exit Price,Close Time,Profit
1,2026-03-31,Buy,1,EURUSD,1.0920,1.0960,2026-03-31,400
```

**Required columns:** Ticket, Type, Item, Entry Price, Exit Price, Profit  
**Auto-detects:** ✅ YES  
**Example file:** (Create from MT5 export)

---

## 🎯 How to Choose Your Format

### I'm using Futures/CFDs/Forex broker
→ Use **🏦 Export Broker** (NEW!)  
→ Or convert to **📄 Generic**

### I'm using Tradovate
→ Use **📊 Tradovate**

### I'm using MetaTrader 5
→ Use **🔷 MetaTrader 5**

### I don't know my format
→ Try **📄 Generic**  
→ Rename your columns to: Date, Symbol, Direction, Entry, Exit, PnL

### I'm not sure if it will work
→ Test with **sample_trades_format2.csv** first!

---

## 🔄 Column Matching (Auto-Detection)

The system searches for columns using these keywords:

### Date Column
Looks for: `date`, `order date`, `trade date`, `entry date`

### Symbol Column
Looks for: `contract`, `symbol`, `instrument`, `asset`

### Direction Column  
Looks for: `b/s`, `b_s`, `buy/sell`, `type`, `direction`, `long/short`

### Entry Price Column
Looks for: `avgprice`, `avg price`, `fill price`, `entry`, `entry price`

### Exit Price Column
Looks for: `exit`, `exit price`, `close price`

### P&L Column
Looks for: `pnl`, `p&l`, `profit`, `profit/loss`, `earnings`

---

## ✨ How Import Works

```
1. You select format (or auto-detect)
           ↓
2. You choose CSV file
           ↓
3. System reads file
           ↓
4. Appropriate parser runs
           ↓
5. Columns detected by name
           ↓
6. Data extracted & validated
           ↓
7. Preview shows first 5 trades
           ↓
8. You click import
           ↓
9. Statistics calculated
           ↓
10. Trades saved to localStorage
           ↓
11. Dashboard displays results ✅
```

---

## 📊 Comparison Table

| Feature | Generic | Export Broker | Tradovate | MT5 |
|---------|---------|---|---|---|
| **Auto-detect** | ✅ | ✅ | ✅ | ✅ |
| **Column flexibility** | Medium | High | Low | Low |
| **Ease of use** | Easy | Easy | Medium | Medium |
| **Best for** | Any | Most brokers | Tradovate | MT5 |
| **Test file** | sample_trades.csv | sample_trades_format2.csv | N/A | N/A |

---

## 🚀 Quick Start by Broker

### If You Use...

**Interactive Brokers**
```
Export → IB Gateway
Format → Use Generic or Export Broker
Steps:  → Rename to: Date, Symbol, Direction, Entry, Exit, PnL
```

**TD Ameritrade / Charles Schwab**
```
Export → Account → Trades
Format → Use Generic or Export Broker
Steps:  → Save as CSV → Import
```

**Tastytrade**
```
Export → Account Statements → Trades
Format → Use Export Broker
Steps:  → Should auto-detect
```

**Futures Prop Trading Firm**
```
Export → Whatever format provided
Format → Try Export Broker first
Steps:  → If fails, use Generic
```

**Crypto Exchange (Bybit, Deribit, etc.)**
```
Export → API or CSV download
Format → Use Generic
Steps:  → Rename columns → Import
```

---

## 🛠️ Converting Between Formats

### Convert Excel → CSV
1. Open Excel file
2. Save As → Format → CSV UTF-8
3. Click Save
4. Use in ApexTrader ✅

### Convert to Generic Format
1. Open CSV in Excel or text editor
2. Create columns: Date, Symbol, Direction, Entry, Exit, PnL
3. Map your data to these columns
4. Save as CSV
5. Import as Generic ✅

### Convert to Simplified Broker Format
1. Create columns: Date, Account, OrderID, B/S, Contract, Product, avgPrice, PnL, Qty
2. Map your data
3. Save as CSV
4. Import as Export Broker ✅

---

## ⚠️ Common Format Issues

### Issue: "Wrong delimiter (semicolon)"
```
❌ Wrong: Date;Symbol;Direction;Entry;Exit;PnL
✅ Correct: Date,Symbol,Direction,Entry,Exit,PnL
```

### Issue: "Text in numeric column"
```
❌ Wrong: Entry price = $19,842.75
✅ Correct: Entry price = 19842.75
```

### Issue: "Mixed case in B/S"
```
❌ Wrong: BUY, buy, Buy (inconsistent)
✅ Correct: Always BUY or SELL (consistent)
```

### Issue: "Extra columns confuse parser"
```
❌ Wrong: Too many columns, no clear mapping
✅ Correct: Only include columns: Date, Symbol, Direction, Entry, Exit, PnL
```

---

## 🧪 Test Your Format

### Online Test Page
```bash
http://localhost:3000/csv-parser-test.html
```

**Steps:**
1. Paste your CSV content
2. Click "Test Parser"
3. See results instantly

### Command Line Test
```bash
cd e:\tao
node test-advanced.js
```

### Manual Test
1. Go to http://localhost:3000
2. Click "📥 Import Trades"
3. Select your format
4. Choose your file
5. Review preview
6. Import

---

## 📋 CSV Template Files

Ready to use templates in e:\tao:

```
sample_trades.csv
  → Generic format
  → 25 sample trades
  → Use to test system

sample_trades_format2.csv
  → Export Broker format
  → 25 sample trades
  → Use to test new format
```

**Copy and modify these to create your own files!**

---

## ✅ Validation Checklist

Before importing, verify:

- [ ] File extension is `.csv` (not .xlsx, .xls, .txt)
- [ ] First row contains column names
- [ ] All column names use standard characters (no special symbols)
- [ ] All data rows have same number of columns as header
- [ ] No empty rows in the middle of data
- [ ] No special formatting (bold, colors, merged cells)
- [ ] Numeric columns contain only numbers (no $, €, %, text)
- [ ] Date column has recognizable dates
- [ ] Direction column has consistent values (all BUY/SELL or all Long/Short)

---

## 📞 Format Decision Tree

```
START: You have a CSV file
  ↓
Question: What broker is it from?
  ├→ Tradovate? → Use "📊 Tradovate" → Import
  ├→ MetaTrader 5? → Use "🔷 MetaTrader 5" → Import
  └→ Other/Unknown?
      ↓
      Question: Does it have these columns?
      ├→ B/S, Contract, avgPrice? → Use "🏦 Export Broker" → Import
      ├→ Date, Symbol, Direction, Entry, Exit, PnL? → Use "📄 Generic" → Import
      └→ Other columns?
          ↓
          Action: Rename columns to Generic format
          ↓
          Action: Save as CSV
          ↓
          Use "📄 Generic" → Import ✅
```

---

## 🎯 Summary

**All formats supported, auto-detected!** ✅

**Your file format:** 🏦 Export Broker  
**Status:** Ready to import ✅  

**Next step:** http://localhost:3000 → Import CSV → Done! 🚀

---

For help: See SOLUTION.md or YOUR_IMPORT_SETUP.md
