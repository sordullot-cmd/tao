-- Migration 033 : connexions bancaires (agrégation DSP2 via Enable Banking)
--
-- Une ligne par SESSION consentie : l'utilisateur autorise sa banque une fois,
-- Enable Banking rend un `session_id` et la liste des comptes (`uid`) couverts.
-- Les SOLDES ne sont pas stockés ici — ils sont relus en direct à chaque
-- agrégation, pour ne pas conserver de données bancaires au repos plus que
-- nécessaire. Seuls les identifiants techniques de la session le sont.
--
-- Le consentement DSP2 est limité dans le temps (90 jours demandés, la banque
-- peut plafonner) : `valid_until` permet de prévenir l'utilisateur avant
-- l'expiration plutôt que de le laisser découvrir une agrégation muette.

CREATE TABLE IF NOT EXISTS bank_connections (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id    TEXT NOT NULL,
  aspsp_name    TEXT NOT NULL,
  aspsp_country TEXT NOT NULL DEFAULT 'FR',
  -- uid des comptes couverts par la session, tels que rendus par l'agrégateur.
  account_uids  JSONB NOT NULL DEFAULT '[]'::jsonb,
  valid_until   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Reconnecter la même banque ne doit pas empiler des sessions mortes.
CREATE UNIQUE INDEX IF NOT EXISTS bank_connections_user_session_idx
  ON bank_connections (user_id, session_id);

CREATE INDEX IF NOT EXISTS bank_connections_user_idx
  ON bank_connections (user_id);

-- RLS : des données bancaires ne se lisent que par leur propriétaire.
ALTER TABLE bank_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bank_connections_select_own" ON bank_connections;
CREATE POLICY "bank_connections_select_own" ON bank_connections
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "bank_connections_insert_own" ON bank_connections;
CREATE POLICY "bank_connections_insert_own" ON bank_connections
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "bank_connections_delete_own" ON bank_connections;
CREATE POLICY "bank_connections_delete_own" ON bank_connections
  FOR DELETE USING (auth.uid() = user_id);

COMMENT ON TABLE bank_connections IS
  'Sessions de consentement DSP2 (Enable Banking). Aucun solde stocké : ils sont relus en direct à chaque agrégation.';
