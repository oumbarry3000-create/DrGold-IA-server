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
-- Connexion Deriv par OAuth (sans token a copier par le client)
ALTER TABLE users ADD COLUMN IF NOT EXISTS oauth_access_encrypted TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS oauth_refresh_encrypted TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS oauth_expires_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS deriv_reauth_needed BOOLEAN NOT NULL DEFAULT false;

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

-- Messagerie support (une conversation par trader) + annonces
CREATE TABLE IF NOT EXISTS messages (
  id BIGSERIAL PRIMARY KEY,
  uid TEXT NOT NULL REFERENCES users(uid),
  sender TEXT NOT NULL,                 -- 'client' | 'admin'
  body TEXT NOT NULL DEFAULT '',
  attachment_url TEXT,
  attachment_name TEXT,
  attachment_type TEXT,                 -- 'image' | 'file'
  read_by_client BOOLEAN NOT NULL DEFAULT false,
  read_by_admin BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_messages_uid ON messages(uid, created_at);

CREATE TABLE IF NOT EXISTS announcements (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  audience TEXT NOT NULL DEFAULT 'all', -- 'all' | 'pro' | 'basic'
  attachment_url TEXT,
  attachment_name TEXT,
  attachment_type TEXT,
  emails_sent INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE users ADD COLUMN IF NOT EXISTS announcements_seen_at TIMESTAMPTZ;

-- Edition / suppression ; les paiements survivent a la suppression d'un compte (comptabilite)
ALTER TABLE messages ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_uid_fkey;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS email TEXT;
UPDATE payments p SET email = u.email FROM users u WHERE p.uid = u.uid AND p.email IS NULL;
-- Prix Pro en dollars, paye en FCFA : on garde le prix USD et le taux utilise
ALTER TABLE payments ADD COLUMN IF NOT EXISTS amount_usd NUMERIC;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS fx_rate NUMERIC;

-- Notifications automatiques du bot + nom affiche du profil
CREATE TABLE IF NOT EXISTS notifications (
  id BIGSERIAL PRIMARY KEY,
  uid TEXT NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
  category TEXT NOT NULL,
  level TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  dedupe_key TEXT,
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_uid ON notifications(uid, created_at DESC);
ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name TEXT;

-- Configuration globale (parametres du bot geres par l'admin)
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;

async function initDb() {
  await pool.query(SCHEMA);
  // Parametres du bot devenus globaux : on reprend ceux du trader le plus
  // actif (sans ses reglages Telegram) pour ne pas changer le comportement actuel
  await runOnce("global_bot_params_2026_09_24",
    `INSERT INTO app_settings (key, value)
     SELECT 'bot_params', u.params - 'tgBotToken' - 'tgChatID' - 'tgMiniAppURL'
     FROM users u
     ORDER BY (SELECT COUNT(*) FROM trades t WHERE t.uid = u.uid) DESC
     LIMIT 1
     ON CONFLICT (key) DO NOTHING`);
  await runOnce("auto_approve_linked_2026_09_24",
    // Passage a la validation automatique : les traders deja lies qui
    // attendaient une validation manuelle sont valides (une seule fois, pour
    // ne pas reactiver plus tard un compte suspendu par l'admin).
    `UPDATE users SET approved = true
     WHERE NOT approved AND (token_encrypted IS NOT NULL OR oauth_access_encrypted IS NOT NULL)`);
}

async function runOnce(name, sql) {
  await pool.query("CREATE TABLE IF NOT EXISTS app_migrations (name TEXT PRIMARY KEY, ran_at TIMESTAMPTZ NOT NULL DEFAULT now())");
  const { rowCount } = await pool.query("INSERT INTO app_migrations (name) VALUES ($1) ON CONFLICT DO NOTHING", [name]);
  if (rowCount === 1) {
    const r = await pool.query(sql);
    console.log(`🗄️ Migration ${name} : ${r.rowCount} ligne(s)`);
  }
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
