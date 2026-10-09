# 📥 How to Import Your Broker CSV File

**Status:** ✅ NEW - Support for broker exports added!

The system now supports:
| Format | Description | When to Use |
|--------|-------------|-----------|
| 🏦 **Export Broker** | Supports B/S, Contract, avgPrice, PnL columns | When exporting from your broker |
| 📄 **Generic** | Date, Symbol, Direction, Entry, Exit, PnL | Custom or converted formats |
| 📊 **Tradovate** | Tradovate-specific export format | Tradovate users |
| 🔷 **MetaTrader 5** | MT5-specific export format | MT5 users |

---

## 🚀 Quick Start: Import Your CSV

### Step 1: Export from Your Broker
Your broker export should have these columns (these are detected automatically):

```
Required columns (auto-detected):
  • Date - Trade date
  • Contract/Symbol - Asset name (ES, NQ, EURUSD, etc.)
  • B/S or Direction - Buy/Sell or Long/Short
  • avgPrice or Entry - Entry price (numeric)
  • PnL or Profit - Profit/loss (numeric)
  
Optional:
  • Account - Account number
  • OrderID - Trade ID
  • Qty - Quantity (defaults to 1)
  • Status - Trade status (Filled, Cancelled, etc.)
```

### Step 2: Save as CSV
Make sure file is saved as `.csv` (comma-separated values), not Excel.

### Step 3: Import in ApexTrader
1. Open http://localhost:3000
2. Click **"📥 Import Trades"**
3. Select **"🏦 Export Broker"** format
4. Choose your CSV file
5. Preview shows trades before import
6. Click **"✓ Importer Trades"**

---

## 📋 Example CSV Format (Broker Export)

Your CSV should look like this:

```csv
Date,Account,OrderID,B/S,Contract,Product,avgPrice,FillTime,PnL,Qty,Status
2026-03-31,46008134031,30728,BUY,NASDAQ 100,E-Mini,19842.75,09:30:33,312,1,Filled
2026-03-31,46008134031,30729,SELL,ES,E-Mini,5290.25,09:35:15,440,1,Filled
2026-03-31,46008134031,30730,BUY,NASDAQ 100,E-Mini,19760.50,09:40:22,-180,1,Filled
```

**Key points:**
- ✅ Comma-separated (not semicolon)
- ✅ Column names in first row
- ✅ B/S column contains BUY or SELL
- ✅ Contract column has the symbol (ES, NQ, EURUSD)
- ✅ avgPrice column has entry price
- ✅ PnL column has profit/loss

---

## 🔄 Column Name Variations (Auto-Detected)

The parser is flexible and recognizes variations:

| What | Variations Recognized |
|-----|----------------------|
| Date | `Date`, `date`, `Order Date`, `Trade Date` |
| Symbol | `Contract`, `Symbol`, `Instrument` |
| Direction | `B/S`, `B_S`, `Type`, `Direction` |
| Entry Price | `avgPrice`, `avg_price`, `Fill Price`, `Entry` |
| PnL | `PnL`, `P&L`, `Profit`, `Profit/Loss` |
| Quantity | `Qty`, `Quantity`, `Size`, `Volume` |

---

## ❓ Troubleshooting

### "❌ Aucun trade trouvé" (No trades found)

**Check your CSV:**
```
❌ Wrong: Using semicolons
Date;Symbol;Direction;Entry;Exit;PnL

✅ Correct: Using commas
Date,Symbol,Direction,Entry,Exit,PnL
```

**Check column order:**
```
❌ Wrong: No header row
2026-03-31,NQ,Long,19842,19920,312

✅ Correct: Column names in first row
Date,Symbol,Direction,Entry,Exit,PnL
2026-03-31,NQ,Long,19842,19920,312
```

### Import shows empty table

- Ensure all numeric columns have numbers (not text like "N/A")
- Check that B/S column contains only BUY/SELL or similar
- Verify Contract/Symbol column has valid asset names

### Only some trades import

- Check for rows with missing data
- Look for non-numeric values in price columns
- Verify PnL column has numbers (can be negative)

---

## 📊 Sample Files Included

Test with these files in e:\tao:

1. **sample_trades.csv** - Generic format (25 trades)
   - Format: Date, Symbol, Direction, Entry, Exit, PnL
   - Use when: Testing or custom CSV

2. **sample_trades_format2.csv** - Broker export format (25 trades)
   - Format: Date, Account, OrderID, B/S, Contract, avgPrice, PnL
   - Use when: Testing broker format

---

## 🎯 Best Practices

### 1. Before Importing
- ✅ Ensure file is CSV, not Excel
- ✅ Remove any header comments
- ✅ Check for empty rows at end
- ✅ Verify at least 2 rows (header + 1 trade)

### 2. CSV File Structure
```
✅ GOOD - Clean structure:
Date,Symbol,Type,Entry,Exit,PnL
2026-03-31,NQ,Long,19842,19920,312

❌ BAD - Extra headers:
My Trading Journal
Account: 123456
Date,Symbol,Type,Entry,Exit,PnL
2026-03-31,NQ,Long,19842,19920,312
```

### 3. Data Types
```
✅ Numbers should be actual numbers:
19842    → correct
19842.75 → correct

❌ Don't use text or special chars:
$19,842  → incorrect
19842€   → incorrect
```

---

## 📞 Quick Commands

**Test your CSV in terminal:**
```bash
cd e:\tao
node test-advanced.js
```

**Test in browser:**
```
http://localhost:3000/csv-parser-test.html
```

**Command to test specific format:**
```bash
# Generic format
node test-csv.js

# Broker export format  
node test-advanced.js
```

---

## 💡 If Auto-Detection Doesn't Work

Explicitly select the format in the modal:

1. Click "🏦 Export Broker" instead of auto-detect
2. Or "📄 Generic" if that matches better
3. System will use your selection

---

## 📈 What Happens After Import

After successful import, you'll see:

**Dashboard:**
```
Total Trades:  25
Total P&L:     +$6,100
Win Rate:      80%
Profit Factor: 2.0
```

**Trades Table:**
- All trades displayed with dates, symbols, directions, prices
- Statistics calculated automatically
- Equity curve showing performance over time

**Storage:**
- All trades saved locally in browser
- Data persists until you click "Clear Trades"
- Can import multiple times (no duplicates)

---

## ✨ Features

**Working Now:**
- ✅ Import from 4 broker formats
- ✅ Auto-detect format
- ✅ Real-time preview
- ✅ Automatic statistics
- ✅ Trade table
- ✅ Equity curve
- ✅ Multiple imports

**Coming Soon:**
- 🔄 Export to CSV
- 📝 Add trade notes
- 📊 Advanced analytics

---

## 📄 File Formats Quick Reference

### Format 1: Generic (Most Flexible)
```csv
Date,Symbol,Direction,Entry,Exit,PnL
2026-03-31,NQ,Long,19842,19920,312
```
**Use when:** Custom format, testing, or simple trades

### Format 2: Browser Export (New!)
```csv
Date,Account,OrderID,B/S,Contract,avgPrice,PnL
2026-03-31,ACC123,1001,BUY,NQ,19842.75,312
```
**Use when:** Exporting from most brokers

### Format 3: Tradovate
```csv
Exit Date,Entry Date,Symbol,Quantity,Avg Fill Price,Avg Exit Price,P&L
2026-04-15,2026-03-31,NASDAQ 100,1,19842.75,19920.00,312
```
**Use when:** Using Tradovate

### Format 4: MetaTrader 5
```csv
Ticket,Open Time,Type,Size,Item,Entry Price,Exit Price,Profit
1,2026-03-31,Buy,1,EURUSD,1.0920,1.0960,400
```
**Use when:** Using MT5

---

**Ready to import?** → http://localhost:3000 🚀
