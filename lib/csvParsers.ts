/**
 * CSV Parsers for different broker formats
 * Converts broker-specific CSV exports to standardized trade format
 */
import type { ParsedTrade, ContractType, BrokerHint, TradeStats, Direction } from "@/lib/types/trade";

type Dict<T> = Record<string, T>;

/**
 * Detect contract type (micro, mini, standard) from symbol and product type
 * Tradovate uses Product column ("E-Micro", "E-Mini") which should take priority
 * MICRO contracts: MNQ, MES, MYM, M2K (1/10th of mini, tick=0.5)
 * MINI contracts:  NQ, ES, YM, NK (standard size, tick=1)
 * STANDARD:        Other forex/commodity contracts
 */
export const detectContractType = (symbol: string | null | undefined, productType: string | null = null): ContractType => {
  if (!symbol) return 'standard';

  // If Tradovate Product column is provided, use it first
  if (productType) {
    const product = productType.toUpperCase();
    if (product.includes('MICRO')) return 'micro';
    if (product.includes('MINI')) return 'mini';
  }

  const sym = symbol.toUpperCase();
  
  // Remove month/year suffix (M6, U6, Z6, H6) for pattern matching
  const base = sym.replace(/[HMUZ]\d{1,2}$/, '').toUpperCase();
  
  // Micro contracts: 1/10th of mini, $2 per point
  if ((['MNQ', 'MES', 'MYM', 'M2K', 'MME', 'MNGU'] as const).includes(base as never)) {
    return 'micro';
  }

  // Mini contracts: Standard size, $20-50 per point
  if ((['NQ', 'ES', 'YM', 'NK', 'NE', 'GE', 'GC', 'CL'] as const).includes(base as never)) {
    return 'mini';
  }

  return 'standard';
};

/**
 * Get the correct point multiplier for a contract
 * Tradovate Product type ("E-Micro", "E-Mini") can help determine multiplier
 * 
 * IMPORTANT: Different contracts have different tick sizes and point values:
 * Micro (1/10th):      MNQ=$2/pt, MES=$5/pt, MYM=$0.5/pt, M2K=$0.2/pt
 * Mini (standard):     NQ=$20/pt, ES=$50/pt, YM=$5/pt, NK=$2/pt
 * Commodities:         GC=$100/pt, CL=$1000/pt, NG=$10000/pt
 */
export const getContractMultiplier = (symbol: string | null | undefined, productType: string | null = null): number => {
  if (!symbol) return 1;
  const base = symbol.toUpperCase().replace(/[HMUZ]\d{1,2}$/, '');
  
  // If Tradovate Product is "E-Micro", force micro tier multipliers
  if (productType && productType.toUpperCase().includes('MICRO')) {
    const microMap = {
      'NQ': 2,       // Micro NASDAQ (from NQ mini)
      'ES': 5,       // Micro S&P 500 (from ES mini)
      'YM': 0.5,     // Micro Dow (from YM mini)
      'NK': 0.2,     // Micro Russell (from NK mini)
      'MNQ': 2,      // Micro NASDAQ
      'MES': 5,      // Micro S&P
      'MYM': 0.5,    // Micro Dow
      'M2K': 0.2,    // Micro Russell
    };
    if (microMap[base as keyof typeof microMap]) return microMap[base as keyof typeof microMap];
  }

  const multipliers: Record<string, number> = {
    // Micro contracts - explicitly labeled
    'MNQ': 2,      // Micro NASDAQ-100 ($2/pt)
    'MES': 5,      // Micro S&P 500 ($5/pt)
    'MYM': 0.5,    // Micro Dow Jones ($0.5/pt)
    'M2K': 0.2,    // Micro Russell 2000 ($0.2/pt)
    'MME': 2,      // Micro Emini
    'MNGU': 1,     // Micro Natural Gas
    
    // Mini/Standard futures contracts
    'NQ': 20,      // E-Mini NASDAQ-100 ($20/pt)
    'ES': 50,      // E-Mini S&P 500 ($50/pt)
    'YM': 5,       // Micro Dow Jones ($5/pt - confusing name, this is actually micro-sized)
    'NK': 2,       // Micro Russell 2000 ($2/pt - also micro-sized despite "mini" appearance)
    'NE': 10,      // E-Micro EUR
    'GE': 12.5,    // E-Micro GBP
    
    // Commodities
    'GC': 100,     // Gold ($100/pt)
    'SI': 2000,    // Silver ($2000/pt)
    'CL': 1000,    // Crude Oil ($1000/pt)
    'NG': 10000,   // Natural Gas ($10000/pt)
    
    // Currencies
    'EUR': 12.5,   // EUR/USD
    'GBP': 15.625, // GBP/USD
    'JPY': 12.5,   // USD/JPY
  };
  
  return multipliers[base] || 1;
};

/* ──────────────────────────────────────────────────────────────────
 * NOTE: les helpers internes ci-dessous (parseCSVLine, parseDate, etc.)
 * et les parsers broker-specific manipulent des données CSV brutes
 * fortement variables. Le typage interne est volontairement permissif
 * (any) tandis que la surface publique est strictement typée.
 * ────────────────────────────────────────────────────────────────── */
/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Parse a CSV line, handling quoted fields and embedded commas
 */
const parseCSVLine = (line: string): string[] => {
  const result: string[] = [];
  let current = '';
  let insideQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      insideQuotes = !insideQuotes;
    } else if (char === ',' && !insideQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
};

/**
 * Extract HH:MM from a timestamp string
 */
const extractTime = (dateString: string | null | undefined): string => {
  if (!dateString) return '';
  const match = dateString.match(/(\d{2}):(\d{2}):?(\d{2})?/);
  return match ? `${match[1]}:${match[2]}` : '';
};

/**
 * Extract date from timestamp string and convert to ISO format (YYYY-MM-DD)
 * Handles formats like: "04/14/2026 14:30:00", "2026-04-14 14:30:00", etc.
 */
// Extrait "HH:MM:SS" tel quel depuis le Fill Time du CSV ("MM/DD/YYYY HH:MM:SS"
// ou simplement "HH:MM[:SS]"). On ne convertit PAS le fuseau : l'heure inscrite
// dans le fichier est déjà l'heure locale du compte broker — c'est elle qu'on
// affiche.
const extractTimeHHMMSS = (fillTimeStr: string | null | undefined): string => {
  if (!fillTimeStr) return '';
  const m = String(fillTimeStr).match(
    /(\d{1,2})\/(\d{1,2})\/\d{2,4}\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/
  );
  if (m) {
    const [, , , HH, MIN, SS] = m;
    return `${String(HH).padStart(2,'0')}:${MIN}:${(SS||'00').padStart(2,'0')}`;
  }
  const t = String(fillTimeStr).match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!t) return '';
  return `${String(t[1]).padStart(2,'0')}:${t[2]}:${(t[3]||'00').padStart(2,'0')}`;
};

/* Horloge 12 h → 24 h. Alpha Futures horodate « 01/09/2026 12:03:43.25 AM » :
   sans cette conversion, 12:03 AM (minuit passé) devenait midi, et la page
   Trades en déduisait la mauvaise session. Le suffixe est exigé collé à
   l'heure pour ne pas réinterpréter un export déjà en 24 h. */
const toHHMMSS24 = (raw: string | null | undefined): string => {
  const hhmmss = extractTimeHHMMSS(raw);
  if (!hhmmss) return '';
  const ampm = String(raw).match(/\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?\s*([AaPp])\.?[Mm]/);
  if (!ampm) return hhmmss;
  const [hh, mm, ss] = hhmmss.split(':');
  let h = Number(hh) % 12;
  if (ampm[1].toLowerCase() === 'p') h += 12;
  return `${String(h).padStart(2,'0')}:${mm}:${ss}`;
};

// Backward-compat
const extractTimeHHMM = extractTimeHHMMSS;

const extractDateISO = (dateString: string | null | undefined): string => {
  if (!dateString) return new Date().toISOString().split('T')[0];
  
  try {
    // Try MM/DD/YYYY format (American)
    const mmddyyMatch = dateString.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
    if (mmddyyMatch) {
      const month = String(mmddyyMatch[1]).padStart(2, '0');
      const day = String(mmddyyMatch[2]).padStart(2, '0');
      const year = mmddyyMatch[3].length === 2 ? 
        '20' + mmddyyMatch[3] : 
        mmddyyMatch[3];
      return `${year}-${month}-${day}`;
    }
    
    // Try YYYY-MM-DD format
    const isoMatch = dateString.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
      return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
    }
    
    // Try to parse as Date
    const date = new Date(dateString);
    if (!isNaN(date.getTime())) {
      return date.toISOString().split('T')[0];
    }
  } catch (e) {}
  
  return new Date().toISOString().split('T')[0];
};

/**
 * Parse Tradovate export format - POSITION TRACKING
 * 
 * Flux:
 * 1. NETTOYAGE: Filtrer Status = "Filled" seulement
 * 2. INDEXATION: Trier par Fill Time (croissant)
 * 3. POSITION TRACKING: Chaque BUY += qty, chaque SELL -= qty
 * 4. DÉCLENCHEUR: Quand Position_Actuelle == 0 → 1 Trade Complet
 */
export const parseTradovateCSV = (csvText: string): ParsedTrade[] => {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().trim());

  // Find critical columns
  const getColumnIndex = (colNames: string[]): number => {
    for (const name of colNames) {
      const idx = headers.findIndex(h => h === name);
      if (idx !== -1) return idx;
    }
    return -1;
  };

  const bsIdx = getColumnIndex(['b/s']);
  const contractIdx = getColumnIndex(['contract']);
  const productIdx = getColumnIndex(['product']);
  const statusIdx = getColumnIndex(['status']);
  const avgPriceIdx = getColumnIndex(['avg fill price']);
  const filledQtyIdx = getColumnIndex(['filled qty']);
  const fillTimeIdx = getColumnIndex(['fill time']);

  // STEP 1: NETTOYAGE - Filter only Status = "Filled"
  const rawOrders = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = parseCSVLine(line);
    const status = (values[statusIdx] || '').trim();
    
    if (!status.toLowerCase().includes('filled')) continue;

    const bs = (values[bsIdx] || '').trim().toUpperCase();
    const contract = (values[contractIdx] || '').trim().toUpperCase();
    const product = (values[productIdx] || '').trim();
    const avgPrice = parseFloat((values[avgPriceIdx] || '0').replace(/[^0-9.-]/g, ''));
    const filledQty = parseFloat((values[filledQtyIdx] || '0').replace(/[^0-9.-]/g, ''));
    const fillTime = (values[fillTimeIdx] || '').trim();

    if (isNaN(avgPrice) || avgPrice === 0 || filledQty === 0) continue;
    if (!bs.includes('BUY') && !bs.includes('SELL')) continue;

    // Extract base contract symbol (strip month/year suffix like Z6, H7, etc.)
    const baseSymbol = contract.replace(/[HMUZ]\d{1,2}$/, '');
    
    // Get correct multiplier using global function (handles micro vs mini)
    const multiplier = getContractMultiplier(baseSymbol, product);

    rawOrders.push({
      bs: bs.includes('SELL') ? 'SELL' : 'BUY',
      contract,
      product,
      avgPrice,
      quantity: filledQty,
      multiplier,
      fillTime,
      timestamp: new Date(fillTime).getTime()
    });
  }

  console.log(`✓ Step 1 (Nettoyage): ${rawOrders.length} filled orders`);

  // STEP 2: INDEXATION - Sort by Fill Time
  rawOrders.sort((a, b) => a.timestamp - b.timestamp);

  // STEP 3 & 4: POSITION TRACKING + DÉCLENCHEUR
  const trades: ParsedTrade[] = [];
  let currentPosition = 0;
  let currentCycle = [];
  let entryPrice: number | null = null;
  let entryTime: string | null = null;
  let tradeDirection: number | null = null;

  for (const order of rawOrders) {
    const direction = order.bs === 'BUY' ? 1 : -1;

    // Add to current cycle
    currentCycle.push(order);

    // Update position
    currentPosition += direction * order.quantity;

    // Track entry
    if (currentPosition !== 0 && tradeDirection === null) {
      tradeDirection = direction;
      entryPrice = order.avgPrice;
      entryTime = order.fillTime;
    }

    console.log(`  ${order.bs} ${order.quantity} @ ${order.avgPrice} → Position = ${currentPosition}`);

    // DÉCLENCHEUR: Position returns to 0 = TRADE COMPLETE
    if (currentPosition === 0 && currentCycle.length > 0) {
      // Calculate trade metrics
      let totalCashFlow = 0;
      let totalNotional = 0;
      let entryQty = 0, exitQty = 0;
      let entrySum = 0, exitSum = 0;

      for (const o of currentCycle) {
        const cf = o.bs === 'SELL' ? 
          o.quantity * o.avgPrice * o.multiplier : 
          -(o.quantity * o.avgPrice * o.multiplier);
        
        totalCashFlow += cf;
        totalNotional += o.quantity * o.avgPrice * o.multiplier;

        if (tradeDirection === 1 && o.bs === 'BUY') {
          entryQty += o.quantity;
          entrySum += o.quantity * o.avgPrice;
        } else if (tradeDirection === 1 && o.bs === 'SELL') {
          exitQty += o.quantity;
          exitSum += o.quantity * o.avgPrice;
        }
      }

      const tradeEntry = entryQty > 0 ? entrySum / entryQty : (entryPrice ?? 0);
      const tradeExit = exitQty > 0 ? exitSum / exitQty : 0;

      const exitTime = currentCycle[currentCycle.length - 1]?.fillTime;
      trades.push({
        date: extractDateISO(entryTime),
        symbol: currentCycle[0].contract || 'UNKNOWN',
        entry: tradeEntry,
        exit: tradeExit,
        quantity: Math.abs(currentPosition === 0 ? entryQty : 0) || Math.abs(tradeDirection ?? 0) * currentCycle[0].quantity,
        direction: tradeDirection === 1 ? 'Long' : 'Short',
        pnl: Math.round(totalCashFlow * 100) / 100,
        volume: totalNotional,
        ordersCount: currentCycle.length,
        entryTime: extractTimeHHMM(entryTime),
        exitTime: extractTimeHHMM(exitTime),
        _orders: currentCycle
      });

      console.log(`  ✓ TRADE CLOSED: PnL = ${Math.round(totalCashFlow * 100) / 100} USD (${currentCycle.length} orders)\n`);

      // Reset for next cycle
      currentCycle = [];
      currentPosition = 0;
      tradeDirection = null;
      entryPrice = null;
      entryTime = null;
    }
  }

  // If there's an unclosed position, close it at current price
  if (currentCycle.length > 0 && currentPosition !== 0) {
    console.log(`  ⚠ Unclosed position: ${Math.abs(currentPosition)} contracts`);
    let totalCashFlow = 0;
    let totalNotional = 0;
    
    for (const o of currentCycle) {
      const cf = o.bs === 'SELL' ? 
        o.quantity * o.avgPrice * o.multiplier : 
        -(o.quantity * o.avgPrice * o.multiplier);
      totalCashFlow += cf;
      totalNotional += o.quantity * o.avgPrice * o.multiplier;
    }

    trades.push({
      date: extractDateISO(entryTime),
      symbol: currentCycle[0].contract,
      entry: entryPrice || 0,
      exit: currentCycle[currentCycle.length - 1].avgPrice,
      quantity: Math.abs(currentPosition),
      direction: tradeDirection === 1 ? 'Long' : 'Short',
      pnl: Math.round(totalCashFlow * 100) / 100,
      volume: totalNotional,
      ordersCount: currentCycle.length,
      entryTime: extractTimeHHMM(entryTime),
      exitTime: extractTimeHHMM(currentCycle[currentCycle.length - 1]?.fillTime),
      _orders: currentCycle,
      _unclosed: true
    });
  }

  console.log(`\n✓ Tradovate: ${trades.length} complete trades identified\n`);
  return trades;
};

/**
 * Parse MetaTrader 5 HTML export format
 * MetaTrader 5 exports a complete HTML table with trade data
 */
export const parseMT5HTML = (htmlText: string): ParsedTrade[] => {
  try {
    const trades: ParsedTrade[] = [];
    
    // Extract table rows from HTML
    const rowRegex = /<tr[^>]*>(.*?)<\/tr>/gs;
    let match;
    let isHeader = true;
    let columnMap: Dict<number> = {};
    let rowCount = 0;
    
    while ((match = rowRegex.exec(htmlText)) !== null) {
      const rowContent = match[1];
      const cellRegex = /<td[^>]*>(.*?)<\/td>/gs;
      const cells = [];
      let cellMatch;
      
      while ((cellMatch = cellRegex.exec(rowContent)) !== null) {
        // Extract text and remove HTML tags
        let cellText = cellMatch[1]
          .replace(/<[^>]*>/g, '')
          .trim();
        // Remove &nbsp; and other HTML entities
        cellText = cellText
          .replace(/&nbsp;/g, '')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&amp;/g, '&')
          .trim();
        if (cellText) cells.push(cellText);
      }
      
      if (cells.length === 0) continue;
      
      // Skip empty rows
      if (cells.every(c => !c)) continue;
      
      // First non-empty row is header
      if (isHeader) {
        isHeader = false;
        columnMap = buildColumnMap(cells);
        continue;
      }
      
      // Skip if not enough cells
      if (cells.length < 5) continue;
      
      // Parse trade data
      rowCount++;
      try {
        const openDate = cells[columnMap.openDate !== undefined ? columnMap.openDate : 1] || cells[1];
        const closeDate = cells[columnMap.closeDate !== undefined ? columnMap.closeDate : 8] || cells[8] || openDate;
        const type = cells[columnMap.type !== undefined ? columnMap.type : 3] || cells[3] || 'BUY';
        const symbol = cells[columnMap.symbol !== undefined ? columnMap.symbol : 4] || cells[4];
        const openPrice = parseFloat((cells[columnMap.openPrice !== undefined ? columnMap.openPrice : 6] || cells[6] || '0').replace(/[^0-9.-]/g, '')) || 0;
        const closePrice = parseFloat((cells[columnMap.closePrice !== undefined ? columnMap.closePrice : 7] || cells[7] || '0').replace(/[^0-9.-]/g, '')) || 0;
        const profit = parseFloat((cells[columnMap.profit !== undefined ? columnMap.profit : 12] || cells[12] || '0').replace(/[^0-9.-]/g, '')) || 0;
        
        if (symbol && symbol.trim() && openPrice > 0 && closePrice > 0) {
          const trade = {
            id: cells[0] || `mt5_${rowCount}_${Date.now()}`,
            date: formatDate(closeDate || openDate),
            symbol: symbol.trim().toUpperCase(),
            direction: type?.toUpperCase().includes('SELL') || type?.toUpperCase().includes('SHORT') ? 'Short' : 'Long',
            entry: openPrice,
            exit: closePrice,
            pnl: isNaN(profit) ? 0 : profit,
            qty: 1,
            broker: 'mt5',
            contract_type: detectContractType(symbol.trim().toUpperCase()),
            lot_size: 1
          };
          
          if (trade.entry && trade.exit && trade.symbol) {
            trades.push(trade);
          }
        }
      } catch (rowErr) {
        console.warn('Row parse error at row', rowCount, ':', rowErr);
        continue;
      }
    }
    
    console.log(`MT5 HTML: Parsed ${trades.length} trades from ${rowCount} rows`);
    return trades;
  } catch (err) {
    console.error('MT5 HTML parse error:', err);
    return [];
  }
};

/**
 * Build column index map from header row
 */
const buildColumnMap = (headerCells: string[]): Dict<number> => {
  const map: Dict<number> = {};
  headerCells.forEach((cell: string, idx: number) => {
    const lower = cell.toLowerCase();
    if (lower.includes('open') && lower.includes('date')) map.openDate = idx;
    if (lower.includes('open') && lower.includes('price')) map.openPrice = idx;
    if (lower.includes('close') && lower.includes('date')) map.closeDate = idx;
    if (lower.includes('close') && lower.includes('price')) map.closePrice = idx;
    if (lower.includes('type') || lower.includes('direction') || lower.includes('order')) map.type = idx;
    if (lower.includes('symbol') || lower.includes('instrument')) map.symbol = idx;
    if (lower.includes('profit') || lower.includes('pnl')) map.profit = idx;
  });
  return map;
};

/**
 * Format date string to YYYY-MM-DD
 */
const formatDate = (dateStr: string | null | undefined): string => {
  if (!dateStr) return new Date().toISOString().split('T')[0];
  
  dateStr = dateStr.trim();
  
  // If already in YYYY-MM-DD format, return as-is
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr;
  }
  
  try {
    // Try to parse various date formats without timezone conversion
    let d;
    
    // Helper to convert 2-digit year to 4-digit
    const toFullYear = (y: number): number => {
      if (y < 100) {
        // Assume 00-30 = 2000-2030, 31-99 = 1931-1999
        return y <= 30 ? 2000 + y : 1900 + y;
      }
      return y;
    };
    
    // Try US format MM/DD/YYYY or MM/DD/YY
    if (dateStr.includes('/')) {
      const parts = dateStr.split('/');
      if (parts.length === 3) {
        const p0 = parseInt(parts[0]);
        const p1 = parseInt(parts[1]);
        let p2 = parseInt(parts[2]);
        
        p2 = toFullYear(p2); // Convert 2-digit year to 4-digit
        
        // Could be MM/DD/YYYY or DD/MM/YYYY
        if (p0 > 12) {
          // DD/MM/YYYY
          d = new Date(p2, p1 - 1, p0);
        } else if (p1 > 12) {
          // MM/DD/YYYY
          d = new Date(p2, p0 - 1, p1);
        } else {
          // Ambiguous, assume MM/DD/YYYY (US format)
          d = new Date(p2, p0 - 1, p1);
        }
      }
    }
    
    // Try ISO format or dash-separated
    if (!d || isNaN(d.getTime())) {
      if (dateStr.includes('-')) {
        const parts = dateStr.split('-');
        if (parts.length === 3) {
          let p0 = parseInt(parts[0]);
          const p1 = parseInt(parts[1]);
          let p2 = parseInt(parts[2]);
          
          // Assume YYYY-MM-DD if first part > 1000
          if (p0 > 1000) {
            d = new Date(p0, p1 - 1, p2);
          } else {
            // DD-MM-YYYY
            p0 = toFullYear(p0);
            d = new Date(p2, p1 - 1, p0);
          }
        }
      }
    }
    
    // Fallback: try Date constructor as last resort
    if (!d || isNaN(d.getTime())) {
      d = new Date(dateStr);
    }
    
    if (!isNaN(d.getTime())) {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
  } catch (e) {
    console.error('Date parse error:', dateStr, e);
  }
  
  return dateStr;
};

/**
 * Parse MetaTrader 5 export format
 * Expected columns: Ticket, Open Date, Open Time, Type, Symbol, Volume, Open Price, Close Price, Close Date, Close Time, Commission, Comment, Profit
 */
export const parseMT5CSV = (csvText: string): ParsedTrade[] => {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]).map(h => h.trim().toLowerCase());
  const trades: ParsedTrade[] = [];

  // Find column indices with flexible matching
  let ticketIdx = headers.findIndex(h => h.includes('ticket'));
  let openDateIdx = headers.findIndex(h => h.includes('open') && h.includes('date'));
  let openTimeIdx = headers.findIndex(h => h.includes('open') && h.includes('time'));
  let typeIdx = headers.findIndex(h => h.includes('type') || h.includes('order'));
  let symbolIdx = headers.findIndex(h => h.includes('symbol') || h.includes('instrument'));
  let volumeIdx = headers.findIndex(h => h.includes('volume') || h.includes('qty') || h.includes('quantity'));
  let openPriceIdx = headers.findIndex(h => h.includes('open') && h.includes('price'));
  let closePriceIdx = headers.findIndex(h => h.includes('close') && h.includes('price'));
  let closeDateIdx = headers.findIndex(h => h.includes('close') && h.includes('date'));
  let closeTimeIdx = headers.findIndex(h => h.includes('close') && h.includes('time'));
  let profitIdx = headers.findIndex(h => h.includes('profit') || h.includes('pnl') || h.includes('p&l'));

  // Fallback to position if not found
  if (ticketIdx === -1) ticketIdx = 0;
  if (openDateIdx === -1) openDateIdx = 1;
  if (openTimeIdx === -1) openTimeIdx = 2;
  if (typeIdx === -1) typeIdx = 3;
  if (symbolIdx === -1) symbolIdx = 4;
  if (volumeIdx === -1) volumeIdx = 5;
  if (openPriceIdx === -1) openPriceIdx = 6;
  if (closePriceIdx === -1) closePriceIdx = 7;
  if (closeDateIdx === -1) closeDateIdx = 8;
  if (closeTimeIdx === -1) closeTimeIdx = 9;
  if (profitIdx === -1) profitIdx = 12;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    const values = parseCSVLine(line);
    if (values.length < 7) continue;

    const symbol = (values[symbolIdx] || 'UNKNOWN').trim().toUpperCase();
    const typeStr = (values[typeIdx] || '').toUpperCase();
    const openPrice = parseFloat((values[openPriceIdx] || '0').replace(/[^0-9.-]/g, ''));
    const closePrice = parseFloat((values[closePriceIdx] || '0').replace(/[^0-9.-]/g, ''));
    const profit = parseFloat((values[profitIdx] || '0').replace(/[^0-9.-]/g, ''));
    const closeDate = values[closeDateIdx] || values[openDateIdx];

    if (!symbol || symbol === 'UNKNOWN' || isNaN(openPrice) || isNaN(closePrice) || openPrice === 0 || closePrice === 0) {
      continue;
    }

    const trade = {
      id: values[ticketIdx] || Date.now() + Math.random(),
      date: formatDate(closeDate),
      symbol: symbol,
      direction: typeStr.includes('BUY') || typeStr.includes('LONG') ? 'Long' : 'Short',
      entry: openPrice,
      exit: closePrice,
      pnl: isNaN(profit) ? 0 : profit,
      qty: parseFloat(values[volumeIdx]) || 1,
      broker: 'mt5',
      contract_type: detectContractType(symbol),
      lot_size: parseFloat(values[volumeIdx]) || 1
    };

    if (trade.entry && trade.exit && trade.symbol !== 'UNKNOWN') {
      trades.push(trade);
    }
  }

  return trades;
};

/**
 * Parse NinjaTrader Trade Performance export CSV.
 * Format issu de Control Center → Trade Performance → Right-click → Export.
 * Colonnes typiques : Account, Strategy, Market pos., Quantity, Entry price,
 * Exit price, Entry time, Exit time, Profit, Commission, Instrument.
 *
 * Compatible avec les comptes Sim101 (démo) et live — même schéma de colonnes.
 */
export const parseNinjaTraderCSV = (csvText: string): ParsedTrade[] => {
  const lines = csvText.trim().split('\n').filter(l => l.trim() !== '');
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().replace(/[."']/g, '').trim());
  const idx = (names: string[]): number => {
    for (const n of names) {
      const i = headers.findIndex(h => h === n || h.includes(n));
      if (i !== -1) return i;
    }
    return -1;
  };

  const instrumentIdx = idx(['instrument', 'symbol']);
  const posIdx        = idx(['market pos', 'pos', 'side']);
  const qtyIdx        = idx(['quantity', 'qty']);
  const entryIdx      = idx(['entry price']);
  const exitIdx       = idx(['exit price']);
  const entryTimeIdx  = idx(['entry time']);
  const exitTimeIdx   = idx(['exit time']);
  const profitIdx     = idx(['profit', 'p/l', 'pnl']);
  const commissionIdx = idx(['commission']);

  if (instrumentIdx === -1 || entryIdx === -1 || exitIdx === -1) return [];

  const cleanNum = (s: string): number => {
    if (!s) return 0;
    const n = parseFloat(String(s).replace(/[$,()]/g, '').replace(/\s/g, ''));
    return isNaN(n) ? 0 : (String(s).includes('(') ? -Math.abs(n) : n);
  };

  const trades: ParsedTrade[] = [];
  for (let i = 1; i < lines.length; i++) {
    const v = parseCSVLine(lines[i]);
    if (v.length < 3) continue;

    const instrumentRaw = (v[instrumentIdx] || '').trim();
    if (!instrumentRaw) continue;
    // Symbole : "ES 12-25" → "ES", "MNQ 12-25" → "MNQ"
    const symbol = instrumentRaw.split(/[\s.]/)[0].toUpperCase();

    const posRaw = (posIdx !== -1 ? v[posIdx] : '').trim().toLowerCase();
    const direction: Direction = posRaw.startsWith('s') ? 'Short' : 'Long';

    const quantity = qtyIdx !== -1 ? Math.abs(cleanNum(v[qtyIdx])) : 1;
    const entry = cleanNum(v[entryIdx]);
    const exit = cleanNum(v[exitIdx]);
    if (!entry || !exit) continue;

    const entryDateStr = entryTimeIdx !== -1 ? v[entryTimeIdx] : '';
    const exitDateStr  = exitTimeIdx !== -1 ? v[exitTimeIdx] : '';
    const date = extractDateISO(entryDateStr || exitDateStr);
    const entryTime = extractTime(entryDateStr);
    const exitTime  = extractTime(exitDateStr);

    let pnl = profitIdx !== -1 ? cleanNum(v[profitIdx]) : 0;
    if (commissionIdx !== -1) pnl -= Math.abs(cleanNum(v[commissionIdx]));

    trades.push({
      id: `nt_${date}_${symbol}_${entryTime}_${i}`,
      date,
      symbol,
      direction,
      entry,
      exit,
      pnl,
      quantity,
      entryTime,
      exitTime,
      broker: 'ninjatrader',
      contract_type: detectContractType(symbol),
    });
  }
  return trades;
};

/**
 * Parse generic CSV format
 * Expected columns: Date, Symbol, Direction (Long/Short/Buy/Sell), Entry, Exit, PnL
 */
export const parseGenericCSV = (csvText: string): ParsedTrade[] => {
  const lines = csvText.trim().split('\n').filter(line => line.trim() !== '');
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]).map(h => h.trim().toLowerCase());
  const trades: ParsedTrade[] = [];

  // Find column indices - more flexible matching
  let dateIdx = headers.findIndex(h => h.includes('date'));
  let symIdx = headers.findIndex(h => h.includes('symbol'));
  let dirIdx = headers.findIndex(h => h.includes('direction'));
  /* « Entry Time » contient aussi « entry » : sans cette exclusion, la colonne
     d'heure serait lue comme le prix d'entrée. Le repli garde les fichiers dont
     la seule colonne « entry » porte malgré tout le prix. */
  let entryIdx = headers.findIndex(h => h.includes('entry') && !h.includes('time'));
  let exitIdx = headers.findIndex(h => h.includes('exit') && !h.includes('time'));
  if (entryIdx === -1) entryIdx = headers.findIndex(h => h.includes('entry'));
  if (exitIdx === -1) exitIdx = headers.findIndex(h => h.includes('exit'));
  let pnlIdx = headers.findIndex(h => h.includes('pnl') || h.includes('profit'));

  /* Colonnes facultatives. Les exports « une ligne = un trade » (Alpha Futures)
     portent l'horodatage, la quantité et le notionnel ; jusqu'ici seul le
     parseur Tradovate les remontait, et la page Trades laissait vides ses
     colonnes Heure, Durée et Session. Absentes → champ simplement omis.
     « timestamp » est écarté : c'est la date complète, pas l'heure seule. */
  const timeIdxFor = (kind: string) => {
    const exact = headers.findIndex(h => h.includes(kind) && h.includes('time') && !h.includes('stamp'));
    return exact !== -1 ? exact : headers.findIndex(h => h.includes(kind) && h.includes('stamp'));
  };
  const entryTimeIdx = timeIdxFor('entry');
  const exitTimeIdx = timeIdxFor('exit');
  const qtyIdx = headers.findIndex(h => h.includes('quantity') || h.includes('qty') || h.includes('lots') || h.includes('size'));
  const volIdx = headers.findIndex(h => h.includes('volume'));
  /* Frais réels du relevé. Sans eux, le site retombe sur son barème moyen
     (lib/tradeFees.ts) : correct pour un export qui n'en dit rien, faux quand
     le relevé les chiffre au cent près. La colonne `pnl` reste le BRUT — c'est
     le site qui soustrait, et une seule fois. */
  const feesIdx = headers.findIndex(h => h.includes('fee') || h.includes('commission'));

  // Fallback to position if not found by name
  if (dateIdx === -1) dateIdx = 0;
  if (symIdx === -1) symIdx = 1;
  if (dirIdx === -1) dirIdx = 2;
  if (entryIdx === -1) entryIdx = 3;
  if (exitIdx === -1) exitIdx = 4;
  if (pnlIdx === -1) pnlIdx = 5;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    const values = parseCSVLine(line);
    if (values.length < 3) continue;

    // Parse values safely
    const dirStr = (values[dirIdx] || '').toLowerCase().trim();
    const direction = dirStr.includes('short') || dirStr.includes('sell') ? 'Short' : 'Long';
    
    const entryVal = parseFloat((values[entryIdx] || '0').replace(/[^0-9.-]/g, ''));
    const exitVal = parseFloat((values[exitIdx] || '0').replace(/[^0-9.-]/g, ''));
    const pnlVal = parseFloat((values[pnlIdx] || '0').replace(/[^0-9.-]/g, ''));

    // Skip if entry/exit are not valid numbers
    if (isNaN(entryVal) || isNaN(exitVal) || entryVal === 0 || exitVal === 0) {
      continue;
    }

    const qtyVal = qtyIdx !== -1
      ? (parseFloat((values[qtyIdx] || '').replace(/[^0-9.-]/g, '')) || 1)
      : 1;
    const volVal = volIdx !== -1
      ? parseFloat((values[volIdx] || '').replace(/[^0-9.-]/g, ''))
      : NaN;
    const feesVal = feesIdx !== -1
      ? Math.abs(parseFloat((values[feesIdx] || '').replace(/[^0-9.-]/g, '')))
      : NaN;
    const entryTime = entryTimeIdx !== -1 ? toHHMMSS24(values[entryTimeIdx]) : '';
    const exitTime = exitTimeIdx !== -1 ? toHHMMSS24(values[exitTimeIdx]) : '';

    const trade: ParsedTrade = {
      id: Date.now() + Math.random(),
      date: (values[dateIdx] || new Date().toISOString().split('T')[0]).trim(),
      symbol: (values[symIdx] || 'UNKNOWN').trim().toUpperCase(),
      direction,
      entry: entryVal,
      exit: exitVal,
      pnl: pnlVal || 0,
      qty: qtyVal,
      quantity: qtyVal,
      broker: 'generic',
      contract_type: detectContractType((values[symIdx] || 'UNKNOWN').trim().toUpperCase()),
      lot_size: qtyVal,
      ...(entryTime ? { entryTime } : {}),
      ...(exitTime ? { exitTime } : {}),
      ...(Number.isFinite(volVal) && volVal > 0 ? { volume: volVal } : {}),
      ...(Number.isFinite(feesVal) && feesVal > 0 ? { fees: feesVal } : {}),
    };

    trades.push(trade);
  }

  return trades;
};

/**
 * Parse broker export format (flexible columns)
 * Handles exports with B/S, Contract, avgPrice, PnL headers
 * Auto-detects column positions by header matching
 */
export const parseBrokerExportCSV = (csvText: string): ParsedTrade[] => {
  const lines = csvText.trim().split('\n').filter(line => line.trim() !== '');
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]).map(h => h.trim().toLowerCase());
  const trades: ParsedTrade[] = [];

  // Find column indices with flexible matching
  let dateIdx = headers.findIndex(h => h.includes('date') && !h.includes('exit') && !h.includes('entry'));
  let symbolIdx = headers.findIndex(h => h.includes('contract') || h.includes('symbol') || h.includes('instrument'));
  let directionIdx = headers.findIndex(h => h.includes('b/s') || h.includes('b_s') || h.includes('type') || h.includes('direction'));
  let entryIdx = headers.findIndex(h => h.includes('avgprice') || h.includes('avg_price') || h.includes('fill') || h.includes('entry'));
  let exitIdx = headers.findIndex(h => h.includes('exit') && !h.includes('date'));
  let pnlIdx = headers.findIndex(h => h.includes('pnl') || h.includes('profit') || h.includes('p&l'));
  let qtyIdx = headers.findIndex(h => h.includes('qty') || h.includes('quantity') || h.includes('size'));

  // Fallback to position if not found
  if (dateIdx === -1) dateIdx = 0;
  if (symbolIdx === -1) symbolIdx = 2;
  if (directionIdx === -1) directionIdx = 3;
  if (entryIdx === -1) entryIdx = 6;
  if (exitIdx === -1) exitIdx = 6; // Same as entry if not found (calculate from PnL)
  if (pnlIdx === -1) pnlIdx = 8;
  if (qtyIdx === -1) qtyIdx = headers.findIndex(h => h.includes('qty')) || 9;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = parseCSVLine(line);
    if (values.length < 3) continue;

    // Parse direction (B/S, Buy/Sell, Long/Short)
    const dirStr = (values[directionIdx] || '').toUpperCase();
    const direction = dirStr.includes('SELL') || dirStr.includes('SHORT') ? 'Short' : 'Long';

    // Parse prices
    const entryVal = parseFloat((values[entryIdx] || '0').replace(/[^0-9.-]/g, ''));
    const pnlVal = parseFloat((values[pnlIdx] || '0').replace(/[^0-9.-]/g, ''));
    
    // If exit not found, try to reconstruct from entry and PnL
    let exitVal = parseFloat((values[exitIdx] || '0').replace(/[^0-9.-]/g, ''));
    if (exitVal === 0 && entryVal !== 0) {
      // Can't calculate exit reliably without quantity, skip
      if (isNaN(entryVal) || entryVal === 0) continue;
    }

    // Validate
    if (isNaN(entryVal) || entryVal === 0) {
      continue;
    }

    // If exit is same as entry, try to use a fallback or skip
    if (exitVal === 0) {
      // Try to find exit price by looking at other columns
      exitVal = parseFloat((values[entryIdx + 1] || '0').replace(/[^0-9.-]/g, ''));
      if (exitVal === 0) exitVal = entryVal; // Fallback
    }

    const trade = {
      id: Date.now() + Math.random(),
      date: (values[dateIdx] || new Date().toISOString().split('T')[0]).trim(),
      symbol: (values[symbolIdx] || 'UNKNOWN').trim().toUpperCase(),
      direction,
      entry: entryVal,
      exit: exitVal || entryVal,
      pnl: isNaN(pnlVal) ? 0 : pnlVal,
      qty: parseFloat((values[qtyIdx] || '1').replace(/[^0-9.-]/g, '')) || 1,
      broker: 'export',
      contract_type: detectContractType((values[symbolIdx] || 'UNKNOWN').trim().toUpperCase()),
      lot_size: parseFloat((values[qtyIdx] || '1').replace(/[^0-9.-]/g, '')) || 1
    };

    // Ensure we have valid entry/exit
    if (!isNaN(trade.entry) && !isNaN(trade.exit) && trade.entry !== 0) {
      trades.push(trade);
    }
  }

  return trades;
};

/**
 * Parse WealthCharts orders export format
 * 
 * Format: Pairs of BUY (mov_type=1) and SELL (mov_type=2) orders with same timestamp
 * mov_type: 1 = BUY, 2 = SELL
 * exec_qty: positive for BUY, negative for SELL
 * profit: Total profit/loss for the completed trade
 */
export const parseWealthChartsCSV = (csvText: string): ParsedTrade[] => {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().trim());
  
  // Map columns - NEW FORMAT
  const getColumnIndex = (colNames: string[]): number => {
    for (const name of colNames) {
      const idx = headers.findIndex(h => h === name);
      if (idx !== -1) return idx;
    }
    return -1;
  };

  // NEW FORMAT columns
  const symbolIdx = getColumnIndex(['symbol']);
  const movTypeIdx = getColumnIndex(['mov_type']);
  const execQtyIdx = getColumnIndex(['exec_qty']);
  const priceDoneIdx = getColumnIndex(['price_done']);
  const pointsIdx = getColumnIndex(['points']);
  const profitIdx = getColumnIndex(['profit']);
  const movTimeIdx = getColumnIndex(['mov_time']);
  const createdOnIdx = getColumnIndex(['created_on']);

  // Parse all orders
  const orders = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = parseCSVLine(line);
    
    const symbol = (values[symbolIdx] || '').trim();
    const movType = parseInt((values[movTypeIdx] || '0').replace(/[^0-9]/g, ''));
    const execQty = parseFloat((values[execQtyIdx] || '0').replace(/[^0-9.-]/g, ''));
    const priceDone = parseFloat((values[priceDoneIdx] || '0').replace(/[^0-9.-]/g, ''));
    const points = (values[pointsIdx] || '').trim();
    const profit = (values[profitIdx] || '').trim();
    const movTime = (values[movTimeIdx] || '').trim();
    const createdOn = (values[createdOnIdx] || '').trim();

    // Skip if critical fields missing
    if (!symbol || execQty === 0 || isNaN(priceDone) || priceDone === 0 || !createdOn) {
      continue;
    }

    // Extract base symbol (e.g., CM.MNQM6 → MNQ)
    const baseSymbol = symbol
      .replace(/^CM\./, '')
      .replace(/[HMUZ]\d{1,2}$/, '')
      .toUpperCase();

    orders.push({
      symbol: baseSymbol,
      fullSymbol: symbol,
      movType,       // 1=BUY, 2=SELL, 3=SHORT, 4=BUY TO COVER
      execQty,       // +/- quantity
      priceDone,
      points: points ? parseFloat(points) : 0,
      profit: profit ? parseFloat(profit) : 0,
      movTime,
      createdOn,
      createdOnTime: new Date(createdOn).getTime()
    });
  }

  console.log(`WealthCharts CSV: Parsed ${orders.length} orders`);

  // Group orders by symbol and created_on (each group = 1 trade)
  const tradesBySymbolAndTime: Record<string, any[]> = {};
  orders.forEach((order: any) => {
    const key = `${order.symbol}_${order.createdOn}`;
    if (!tradesBySymbolAndTime[key]) {
      tradesBySymbolAndTime[key] = [];
    }
    tradesBySymbolAndTime[key].push(order);
  });

  console.log(`Found ${Object.keys(tradesBySymbolAndTime).length} trades`);

  // Helper functions
  const formatPrice = (price: number): string => {
    return price.toLocaleString('fr-FR', { 
      minimumFractionDigits: 2, 
      maximumFractionDigits: 2 
    }).replace(',', '.');
  };

  const extractDate = (dateString: string): string => {
    try {
      const dateObj = new Date(dateString);
      const day = String(dateObj.getDate()).padStart(2, '0');
      const month = String(dateObj.getMonth() + 1).padStart(2, '0');
      const year = dateObj.getFullYear();
      return `${year}-${month}-${day}`;
    } catch {
      return '';
    }
  };

  // Build trades
  const trades: ParsedTrade[] = [];

  Object.entries(tradesBySymbolAndTime).forEach(([key, tradeOrders]) => {
    // Sort by movType to have consistent order
    tradeOrders.sort((a, b) => a.movType - b.movType);

    // Find entry and exit orders
    // mov_type: 1=BUY, 2=SELL, 3=SHORT, 4=BUY TO COVER
    const buyOrders = tradeOrders.filter(o => o.movType === 1 || o.movType === 4); // BUY or BUY TO COVER
    const sellOrders = tradeOrders.filter(o => o.movType === 2 || o.movType === 3); // SELL or SHORT

    if (buyOrders.length === 0 || sellOrders.length === 0) {
      console.log(`✗ Trade skipped (incomplete): ${key}`);
      return;
    }

    // Determine direction from first order
    const firstOrder = tradeOrders[0];
    const isLong = firstOrder.movType === 1; // BUY = long, SHORT = short

    // Calculate weighted average prices
    let entryPrice, exitPrice, totalQty;

    if (isLong) {
      // LONG: entry = average of BUYs (mov_type=1), exit = average of SELLs (mov_type=2)
      const buyQtyTotal = buyOrders.reduce((sum, o) => sum + Math.abs(o.execQty), 0);
      const sellQtyTotal = sellOrders.reduce((sum, o) => sum + Math.abs(o.execQty), 0);
      
      entryPrice = buyOrders.reduce((sum, o) => sum + (o.priceDone * Math.abs(o.execQty)), 0) / buyQtyTotal;
      exitPrice = sellOrders.reduce((sum, o) => sum + (o.priceDone * Math.abs(o.execQty)), 0) / sellQtyTotal;
      totalQty = Math.max(buyQtyTotal, sellQtyTotal);
    } else {
      // SHORT: entry = average of SHORTs (mov_type=3), exit = average of BUY TO COVER (mov_type=4)
      const shortQtyTotal = sellOrders.reduce((sum, o) => sum + Math.abs(o.execQty), 0);
      const buyQtyTotal = buyOrders.reduce((sum, o) => sum + Math.abs(o.execQty), 0);
      
      entryPrice = sellOrders.reduce((sum, o) => sum + (o.priceDone * Math.abs(o.execQty)), 0) / shortQtyTotal;
      exitPrice = buyOrders.reduce((sum, o) => sum + (o.priceDone * Math.abs(o.execQty)), 0) / buyQtyTotal;
      totalQty = Math.max(shortQtyTotal, buyQtyTotal);
    }

    // Use profit from CSV (on the exit order)
    const exitOrder = tradeOrders[tradeOrders.length - 1];
    const pnl = exitOrder.profit || 0;
    const points = exitOrder.points || (exitPrice - entryPrice);
    
    // Calculate volume and PnL percent
    const volume = entryPrice * totalQty;
    const pnlPercent = volume !== 0 ? (pnl / volume) * 100 : 0;

    // Timing
    const entryTime = extractTime(tradeOrders[0].movTime);
    const exitTime = extractTime(exitOrder.movTime);
    const date = extractDate(tradeOrders[0].createdOn);

    const firstDate = new Date(tradeOrders[0].movTime);
    const lastDate = new Date(exitOrder.movTime);
    const holdMinutes = Math.max(0, Math.round((lastDate.getTime() - firstDate.getTime()) / 60000));

    const symbol = tradeOrders[0].symbol;

    console.log(`✓ Trade: ${symbol} ${isLong ? 'LONG' : 'SHORT'} @ ${entryPrice} → ${exitPrice}, PnL: ${pnl}`);

    trades.push({
      date,
      time: entryTime,
      entryTime,
      exitTime,
      symbol,
      direction: isLong ? 'Long' : 'Short',
      entry: Math.round(entryPrice * 100) / 100,
      exit: Math.round(exitPrice * 100) / 100,
      qty: totalQty,
      points: Math.round(points * 100) / 100,
      pnl: Math.round(pnl * 100) / 100,
      pnlPercent: Math.round(pnlPercent * 100) / 100,
      volume: Math.round(volume * 100) / 100,
      holdMinutes,
      broker: 'wealthcharts',
      contract_type: detectContractType(symbol),
      lot_size: totalQty,
      formattedEntry: formatPrice(entryPrice),
      formattedExit: formatPrice(exitPrice),
      formattedPoints: `${points > 0 ? '+' : ''}${Math.round(points * 100) / 100}`,
      formattedProfit: `${pnl > 0 ? '+' : ''}${Math.round(pnl * 100) / 100}`,
      formattedProfitPercent: `${pnlPercent > 0 ? '+' : ''}${Math.round(pnlPercent * 100) / 100}%`
    });
  });

  console.log(`\n✓ WealthCharts CSV: Parsed ${trades.length} complete trades`);
  return trades;
};

/**
 * Auto-detect CSV/HTML format and parse
 */
export const parseCSV = (csvText: string, brokerHint: BrokerHint = null): ParsedTrade[] => {
  const firstChars = csvText.trim().substring(0, 500).toLowerCase();
  
  // Check if it's HTML
  if (firstChars.includes('<!doctype') || firstChars.includes('<html') || firstChars.includes('<table') || csvText.includes('<tr')) {
    console.log('Detected HTML format');
    // Try HTML parsers
    if (brokerHint === 'mt5' || csvText.includes('metatrader') || csvText.includes('open price') || csvText.includes('open date')) {
      const result = parseMT5HTML(csvText);
      if (result.length > 0) {
        console.log(`MT5 HTML parser: ${result.length} trades found`);
        return result;
      }
    }
    // Default HTML handling as MT5
    return parseMT5HTML(csvText);
  }
  
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) return [];

  const firstLine = lines[0].toLowerCase();

  // Try to detect format from headers
  console.log('First line headers:', firstLine.substring(0, 100));
  
  // Check for WealthCharts format (has mov_type, exec_qty, price_done, symbol)
  if ((firstLine.includes('mov_type') || firstLine.includes('movtype')) && 
      (firstLine.includes('exec_qty') || firstLine.includes('execqty')) &&
      firstLine.includes('symbol') &&
      firstLine.includes('price_done')) {
    console.log('Detected WealthCharts format');
    return parseWealthChartsCSV(csvText);
  }
  
  // Check for new Tradovate format (has orderId, B/S, Contract, Status, Filled Qty)
  if ((firstLine.includes('b/s') || firstLine.includes('b_s')) && 
      firstLine.includes('contract') && 
      firstLine.includes('status') &&
      (firstLine.includes('filled') || firstLine.includes('avgprice') || firstLine.includes('avg_price'))) {
    console.log('Detected new Tradovate format');
    return parseTradovateCSV(csvText);
  }
  
  if (firstLine.includes('exit date') && firstLine.includes('entry date')) {
    console.log('Detected old Tradovate format');
    return parseTradovateCSV(csvText);
  }
  
  if (firstLine.includes('ticket') && (firstLine.includes('open date') || firstLine.includes('open price'))) {
    console.log('Detected MT5 CSV format');
    return parseMT5CSV(csvText);
  }

  // Format générique du site (Date, Symbol, Direction, Entry, Exit, PnL) :
  // en-têtes sans ambiguïté → on l'utilise même si un broker est sélectionné,
  // pour que le fichier d'exemple s'importe quel que soit le broker choisi.
  if (firstLine.includes('symbol') && firstLine.includes('direction') &&
      firstLine.includes('entry') && firstLine.includes('exit') &&
      (firstLine.includes('pnl') || firstLine.includes('profit'))) {
    console.log('Detected generic site CSV format');
    return parseGenericCSV(csvText);
  }

  // Use broker hint if provided
  if (brokerHint === 'tradovate' || brokerHint === 'ninjatrader' || brokerHint === 'rithmic') {
    console.log(`Using Tradovate-compatible parser via hint (${brokerHint})`);
    return parseTradovateCSV(csvText);
  }
  if (brokerHint === 'mt5') {
    console.log('Using MT5 parser via hint');
    return parseMT5CSV(csvText);
  }
  if (brokerHint === 'export') {
    console.log('Using Broker export parser via hint');
    return parseBrokerExportCSV(csvText);
  }

  // Default to generic parser
  console.log('Using generic parser');
  return parseGenericCSV(csvText);
};

/**
 * Calculate trade statistics from trades array
 */
export const calculateStats = (trades: ParsedTrade[]): TradeStats => {
  if (!trades || trades.length === 0) {
    return {
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      winRate: 0,
      totalPnL: 0,
      avgWin: 0,
      avgLoss: 0,
      profitFactor: 0,
      sharpeRatio: 0,
      maxDrawdown: 0
    };
  }

  const winning = trades.filter(t => t.pnl > 0);
  const losing = trades.filter(t => t.pnl < 0);
  const totalWinning = winning.reduce((sum, t) => sum + t.pnl, 0);
  const totalLosing = Math.abs(losing.reduce((sum, t) => sum + t.pnl, 0));
  const totalPnL = trades.reduce((sum, t) => sum + t.pnl, 0);

  // Calculate max drawdown
  let cumulative = 0;
  let maxDrawdown = 0;
  let peak = 0;
  for (const trade of trades) {
    cumulative += trade.pnl;
    if (cumulative > peak) peak = cumulative;
    const dd = peak - cumulative;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }

  // Calculate Sharpe Ratio (simple)
  const pnls = trades.map(t => t.pnl);
  const mean = pnls.reduce((a, b) => a + b, 0) / pnls.length;
  const variance = pnls.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / pnls.length;
  const stdDev = Math.sqrt(variance);
  const sharpeRatio = stdDev > 0 ? (mean * Math.sqrt(252)) / stdDev : 0; // Annualized

  return {
    totalTrades: trades.length,
    winningTrades: winning.length,
    losingTrades: losing.length,
    winRate: trades.length > 0 ? Math.round((winning.length / trades.length) * 100) : 0,
    totalPnL: Math.round(totalPnL * 100) / 100,
    avgWin: winning.length > 0 ? Math.round((totalWinning / winning.length) * 100) / 100 : 0,
    avgLoss: losing.length > 0 ? Math.round((totalLosing / losing.length) * 100) / 100 : 0,
    profitFactor: totalLosing > 0 ? Math.round((totalWinning / totalLosing) * 100) / 100 : totalWinning > 0 ? 999 : 0,
    sharpeRatio: Math.round(sharpeRatio * 100) / 100,
    maxDrawdown: Math.round(maxDrawdown * 100) / 100
  };
};
