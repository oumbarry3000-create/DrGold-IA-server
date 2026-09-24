// server/src/db.js
// Remplace Firestore comme base de donnees principale (Neon/Postgres).
// Firebase Auth reste utilise uniquement pour l'authentification (verification
// du token ID cote serveur, voir auth.js) - aucune donnee n'est plus stockee
// dans Firestore.
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  uid TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  token_encrypted TEXT,
  ea_active BOOLEAN NOT NULL DEFAULT false,
  params JSONB NOT NULL,
  deriv_balance NUMERIC,
  deriv_currency TEXT,
  deriv_loginid TEXT,
  deriv_connected BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS trades (
  contract_id TEXT PRIMARY KEY,
  uid TEXT NOT NULL REFERENCES users(uid),
  symbol TEXT,
  direction TEXT,
  lots NUMERIC,
  entry NUMERIC,
  exit NUMERIC,
  pnl NUMERIC,
  status TEXT,
  grid_level INTEGER,
  opened_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_trades_uid ON trades(uid);

-- Plateforme multi-traders : formules, validation admin, liaison Deriv
ALTER TABLE users ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'basic';
ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS approved BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS deriv_account_type TEXT NOT NULL DEFAULT 'demo';
ALTER TABLE users ADD COLUMN IF NOT EXISTS deriv_accounts JSONB;
ALTER TABLE users ADD COLUMN IF NOT EXISTS deriv_linked_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS deriv_signup_via_app BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_saved_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;

ALTER TABLE trades ADD COLUMN IF NOT EXISTS account_id TEXT;
CREATE INDEX IF NOT EXISTS idx_trades_closed ON trades(closed_at);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  uid TEXT NOT NULL REFERENCES users(uid),
  amount INTEGER NOT NULL,
  days INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  provider_status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_payments_uid ON payments(uid);
`;

async function initDb() {
  await pool.query(SCHEMA);
}

// Formule Pro active = plan "pro" non expire
function isProActive(row) {
  return row.plan === "pro" && row.plan_expires_at && new Date(row.plan_expires_at) > new Date();
}

// Compte reel seulement avec un Pro actif, sinon demo
function effectiveAccountType(row) {
  return row.deriv_account_type === "real" && isProActive(row) ? "real" : "demo";
}

module.exports = { pool, initDb, isProActive, effectiveAccountType };
