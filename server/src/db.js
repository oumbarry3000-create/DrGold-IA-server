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
`;

async function initDb() {
  await pool.query(SCHEMA);
}

module.exports = { pool, initDb };
