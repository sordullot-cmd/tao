-- Migration 034 : archive des mouvements bancaires
--
-- La migration 033 posait un principe : ne rien conserver au repos, tout relire
-- en direct. Il tient pour les SOLDES — la banque rend toujours le solde du
-- jour. Il ne tient pas pour l'HISTORIQUE.
--
-- La DSP2 n'ouvre l'accès aux opérations anciennes qu'un temps limité après
-- l'authentification forte ; passé ce délai, la plupart des ASPSP referment
-- l'accès aux 90 derniers jours. Une application qui ne stocke rien perd donc
-- son passé au fil de l'eau, sans que rien ne le signale : la courbe se raccourcit
-- toute seule. Cette table est ce qui manque — l'historique profond est capturé
-- au moment où la banque l'ouvre (juste après le consentement), puis conservé.
--
-- Ce qui est archivé est réduit au strict nécessaire à l'affichage d'un relevé,
-- et seulement les opérations COMPTABILISÉES : une opération en attente n'est
-- pas définitive (son libellé et son montant peuvent encore changer), et elle
-- est hors du solde rendu par la banque.

CREATE TABLE IF NOT EXISTS bank_transactions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- uid du compte chez l'agrégateur, comme dans `bank_connections.account_uids`.
  account_uid  TEXT NOT NULL,
  -- Empreinte STABLE de l'opération (cf. `lib/bank/archive.ts`). Ce n'est pas la
  -- référence de la banque : toutes n'en rendent pas, et l'identifiant de repli
  -- dépend du rang dans la pagination — donc de la requête, pas de l'opération.
  tx_key       TEXT NOT NULL,
  booked_on    DATE NOT NULL,
  label        TEXT NOT NULL DEFAULT '',
  detail       TEXT,
  amount       NUMERIC(14,2) NOT NULL,
  currency     TEXT NOT NULL DEFAULT 'EUR',
  kind         TEXT NOT NULL DEFAULT 'other',
  -- Première lecture : c'est la date d'ARCHIVAGE, pas celle de l'opération.
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Relire deux fois la même fenêtre ne doit pas dupliquer le relevé : c'est cet
-- index qui fait de chaque écriture un upsert.
CREATE UNIQUE INDEX IF NOT EXISTS bank_transactions_key_idx
  ON bank_transactions (user_id, account_uid, tx_key);

-- L'accès type : le relevé d'un compte, du plus récent au plus ancien.
CREATE INDEX IF NOT EXISTS bank_transactions_account_date_idx
  ON bank_transactions (user_id, account_uid, booked_on DESC);

-- RLS : des données bancaires ne se lisent que par leur propriétaire.
ALTER TABLE bank_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bank_transactions_select_own" ON bank_transactions;
CREATE POLICY "bank_transactions_select_own" ON bank_transactions
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "bank_transactions_insert_own" ON bank_transactions;
CREATE POLICY "bank_transactions_insert_own" ON bank_transactions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "bank_transactions_update_own" ON bank_transactions;
CREATE POLICY "bank_transactions_update_own" ON bank_transactions
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "bank_transactions_delete_own" ON bank_transactions;
CREATE POLICY "bank_transactions_delete_own" ON bank_transactions
  FOR DELETE USING (auth.uid() = user_id);

COMMENT ON TABLE bank_transactions IS
  'Archive des mouvements bancaires comptabilisés. Conserve l''historique profond capté après le consentement, que la banque referme ensuite à 90 jours.';
