-- Frais réels du relevé, quand le broker les chiffre (collage Alpha Futures).
-- Sans cette colonne, le site retombe sur son barème moyen (lib/tradeFees.ts)
-- au rechargement : le P&L net affiché s'écartait alors du relevé.
-- `pnl` reste le BRUT ; c'est applyNetPnl() qui déduit, une seule fois.
ALTER TABLE apex_trades ADD COLUMN IF NOT EXISTS fees NUMERIC;
