-- Migration 031 : Prop firms (firme parente ↔ comptes enfants)
--
-- Modèle : l'utilisateur crée UNE firme (Apex, Topstep, Alpha Futures…) puis
-- rattache N comptes à cette firme depuis la page détail de la firme
-- (« paramètres » : nombre + type + taille des comptes).
--
-- Les comptes sans firme restent valides (comptes live/démo perso) :
-- trading_accounts.firm_id est nullable.

CREATE TABLE IF NOT EXISTS prop_firms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Nom affiché de la firme (« Apex Trader Funding »)
  name TEXT NOT NULL,
  -- Plateforme d'exécution par défaut, héritée par les comptes créés
  -- (« Tradovate », « Rithmic »…). Sert aussi à résoudre le logo.
  platform TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Une firme par nom et par utilisateur (évite les doublons à la création).
CREATE UNIQUE INDEX IF NOT EXISTS idx_prop_firms_user_name
  ON prop_firms(user_id, lower(name));
CREATE INDEX IF NOT EXISTS idx_prop_firms_user ON prop_firms(user_id);

-- Rattachement des comptes. ON DELETE SET NULL : supprimer une firme ne
-- supprime pas les comptes (ils redeviennent des comptes hors firme), la
-- suppression en cascade des comptes est un choix explicite fait côté UI.
ALTER TABLE trading_accounts
  ADD COLUMN IF NOT EXISTS firm_id UUID REFERENCES prop_firms(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_trading_accounts_firm ON trading_accounts(firm_id);

-- RLS : chacun ne voit que ses firmes.
ALTER TABLE prop_firms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS prop_firms_select ON prop_firms;
CREATE POLICY prop_firms_select ON prop_firms
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS prop_firms_insert ON prop_firms;
CREATE POLICY prop_firms_insert ON prop_firms
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS prop_firms_update ON prop_firms;
CREATE POLICY prop_firms_update ON prop_firms
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS prop_firms_delete ON prop_firms;
CREATE POLICY prop_firms_delete ON prop_firms
  FOR DELETE USING (auth.uid() = user_id);

COMMENT ON TABLE prop_firms IS 'Firmes de prop trading. Une firme regroupe N comptes (trading_accounts.firm_id).';
COMMENT ON COLUMN prop_firms.platform IS 'Plateforme/broker par défaut héritée par les comptes de la firme.';
COMMENT ON COLUMN trading_accounts.firm_id IS 'Firme parente (prop_firms). NULL = compte hors firme (live/démo perso).';
