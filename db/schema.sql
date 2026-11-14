CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_e164 VARCHAR(16) NOT NULL UNIQUE,
  display_name VARCHAR(40) NOT NULL,
  password_hash TEXT NOT NULL,
  phone_verified BOOLEAN NOT NULL DEFAULT FALSE,
  role VARCHAR(16) NOT NULL DEFAULT 'player' CHECK (role IN ('player','admin')),
  status VARCHAR(16) NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS demo_wallets (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  balance BIGINT NOT NULL DEFAULT 10000 CHECK (balance >= 0),
  cash_balance BIGINT NOT NULL DEFAULT 0 CHECK (cash_balance >= 0),
  bonus_balance BIGINT NOT NULL DEFAULT 10000 CHECK (bonus_balance >= 0),
  CONSTRAINT demo_wallets_balance_split_check
    CHECK (balance = cash_balance + bonus_balance),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS demo_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  delta BIGINT NOT NULL CHECK (delta <> 0),
  balance_after BIGINT NOT NULL CHECK (balance_after >= 0),
  reason VARCHAR(40) NOT NULL,
  reference_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_demo_ledger_user_created
  ON demo_ledger(user_id, created_at DESC);

CREATE SCHEMA IF NOT EXISTS demo_game_hub;

CREATE TABLE IF NOT EXISTS demo_game_hub.sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES users(id),
  provider_id VARCHAR(64) NOT NULL,
  game_id VARCHAR(96) NOT NULL,
  environment VARCHAR(8) NOT NULL DEFAULT 'DEMO' CHECK (environment = 'DEMO'),
  status VARCHAR(32) NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','closed','expired','failed')),
  token_jti UUID NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_demo_game_hub_sessions_player
  ON demo_game_hub.sessions(player_id, created_at DESC);

CREATE TABLE IF NOT EXISTS demo_game_hub.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES users(id),
  session_id UUID NOT NULL REFERENCES demo_game_hub.sessions(id),
  provider_id VARCHAR(64) NOT NULL,
  operation VARCHAR(24) NOT NULL
    CHECK (operation IN ('placeBet','settleWin','refundBet')),
  idempotency_key VARCHAR(128) NOT NULL,
  request_hash CHAR(64) NOT NULL,
  external_transaction_id VARCHAR(128),
  reference_transaction_id UUID REFERENCES demo_game_hub.transactions(id),
  amount BIGINT NOT NULL CHECK (amount > 0),
  cash_amount BIGINT NOT NULL DEFAULT 0 CHECK (cash_amount >= 0),
  bonus_amount BIGINT NOT NULL DEFAULT 0 CHECK (bonus_amount >= 0),
  status VARCHAR(32) NOT NULL
    CHECK (status IN ('committed','settled','refunded','reconciliation_required')),
  response JSONB NOT NULL,
  reconciliation_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT demo_game_hub_transaction_amount_split_check
    CHECK (amount >= cash_amount + bonus_amount),
  CONSTRAINT demo_game_hub_idempotency_unique
    UNIQUE (provider_id, operation, idempotency_key)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_demo_game_hub_external_transaction
  ON demo_game_hub.transactions(provider_id, external_transaction_id)
  WHERE external_transaction_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_demo_game_hub_one_settlement_per_bet
  ON demo_game_hub.transactions(provider_id, reference_transaction_id)
  WHERE operation = 'settleWin';
CREATE UNIQUE INDEX IF NOT EXISTS idx_demo_game_hub_one_refund_per_bet
  ON demo_game_hub.transactions(provider_id, reference_transaction_id)
  WHERE operation = 'refundBet';
CREATE INDEX IF NOT EXISTS idx_demo_game_hub_transactions_player
  ON demo_game_hub.transactions(player_id, created_at DESC);

CREATE TABLE IF NOT EXISTS demo_game_hub.callback_nonces (
  provider_id VARCHAR(64) NOT NULL,
  nonce VARCHAR(128) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (provider_id, nonce)
);

-- La API crea usuario, billetera y movimiento inicial dentro de una transacción.
-- No existen tablas de depósitos, retiros ni saldos monetarios en este entorno demo.
