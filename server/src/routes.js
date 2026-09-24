// server/src/routes.js
const express = require("express");
const crypto  = require("crypto");
const router  = express.Router();

const { pool, isProActive, effectiveAccountType } = require("./db");
const { requireAuth } = require("./auth");
const { listAccounts, exchangeOAuthCode } = require("./derivApi");
const cinetpay = require("./cinetpay");
const firebaseAdmin = require("firebase-admin");
const { notify } = require("./notifications");

const ENCRYPTION_KEY = Buffer.from(process.env.ENCRYPTION_KEY, "hex"); // 32 bytes hex
const IV_LENGTH = 16;

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "oumbarry2999@gmail.com")
  .split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
const { usdToXof, usdToXofRate, freshRate } = require("./fx");
// Prix Pro fixe en dollars ; le client paie l'equivalent en FCFA au taux du jour
const PRO_PRICE_USD = Number(process.env.PRO_PRICE_USD || 17);
const PRO_DAYS      = Number(process.env.PRO_DAYS || 30);
const FRONTEND_URL  = process.env.FRONTEND_URL || "https://drgold-ia.web.app";
const BACKEND_URL   = process.env.BACKEND_URL || "https://drgold-ia-server-m1mz.onrender.com";
const OAUTH_REDIRECT = `${FRONTEND_URL}/deriv-callback`;

const { DEFAULT_EA_PARAMS, TG_KEYS, pick, getBotParams, setBotParams } = require("./botSettings");

function encrypt(text) {
  const iv         = crypto.randomBytes(IV_LENGTH);
  const cipher     = crypto.createCipheriv("aes-256-cbc", ENCRYPTION_KEY, iv);
  const encrypted  = Buffer.concat([cipher.update(text), cipher.final()]);
  return iv.toString("hex") + ":" + encrypted.toString("hex");
}

function decrypt(text) {
  const [ivHex, encHex] = text.split(":");
  const iv        = Buffer.from(ivHex, "hex");
  const enc       = Buffer.from(encHex, "hex");
  const decipher  = crypto.createDecipheriv("aes-256-cbc", ENCRYPTION_KEY, iv);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString();
}

const isAdminEmail = (email) => ADMIN_EMAILS.includes(String(email || "").toLowerCase());

// Cree la ligne utilisateur si besoin (comptes Firebase anterieurs a la
// migration Postgres, ou premier appel apres inscription). Les admins sont
// valides d'office.
async function ensureUser(uid, email) {
  await pool.query(
    `INSERT INTO users (uid, email, ea_active, params, approved)
     VALUES ($1, $2, false, $3, $4)
     ON CONFLICT (uid) DO NOTHING`,
    [uid, email, JSON.stringify(DEFAULT_EA_PARAMS), isAdminEmail(email)]
  );
  if (isAdminEmail(email)) await pool.query("UPDATE users SET approved = true WHERE uid = $1 AND NOT approved", [uid]);
}

async function requireAdmin(req, res, next) {
  if (!isAdminEmail(req.email)) return res.status(403).json({ error: "acces reserve a l'administrateur" });
  next();
}

// pg renvoie les NUMERIC en string - on les reconvertit en nombre pour le client
function numify(row, keys) {
  for (const k of keys) {
    if (row[k] !== null && row[k] !== undefined) row[k] = Number(row[k]);
  }
  return row;
}

// Etat d'abonnement / onboarding expose au client
function publicUser(row) {
  const user = numify({ ...row }, ["deriv_balance"]);
  const hasToken = !!user.token_encrypted;
  const hasOAuth = !!user.oauth_access_encrypted;
  // jamais de jeton renvoye au client
  delete user.token_encrypted;
  delete user.oauth_access_encrypted;
  delete user.oauth_refresh_encrypted;
  user.has_token        = hasToken;          // token manuel (optionnel, 24h/24)
  user.has_deriv_access = hasToken || hasOAuth;
  user.is_admin         = isAdminEmail(user.email);
  user.pro_active       = !!isProActive(row);
  user.effective_account_type = effectiveAccountType(row);
  user.token_age_days   = row.token_saved_at ? Math.floor((Date.now() - new Date(row.token_saved_at)) / 86400000) : null;
  user.pro_price_usd    = PRO_PRICE_USD;
  user.pro_price_xof    = usdToXof(PRO_PRICE_USD); // indicatif, recalcule au paiement
  user.fx_rate          = Math.round(usdToXofRate() * 100) / 100;
  user.pro_days         = PRO_DAYS;
  return user;
}

// POST /encrypt-token — conserve pour compatibilite (anciens clients)
router.post("/encrypt-token", (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: "token requis" });
    res.json({ encrypted: encrypt(token) });
  } catch (err) {
    console.error("encrypt error:", err);
    res.status(500).json({ error: "Erreur chiffrement" });
  }
});

// GET /health
router.get("/health", (req, res) => {
  res.json({ status: "ok", ts: new Date().toISOString() });
});

// POST /api/register — cree la ligne utilisateur juste apres l'inscription Firebase
router.post("/api/register", requireAuth, async (req, res) => {
  try {
    await ensureUser(req.uid, req.email);
    const { phone } = req.body || {};
    if (phone) await pool.query("UPDATE users SET phone = $1 WHERE uid = $2", [String(phone).slice(0, 30), req.uid]);
    res.json({ status: "ok" });
  } catch (err) {
    console.error("register error:", err);
    res.status(500).json({ error: "Erreur creation utilisateur" });
  }
});

// GET /api/me — etat utilisateur + 50 derniers trades du compte en cours
router.get("/api/me", requireAuth, async (req, res) => {
  try {
    await ensureUser(req.uid, req.email);
    const userResult = await pool.query("SELECT * FROM users WHERE uid = $1", [req.uid]);
    const row = userResult.rows[0];

    const tradesResult = await pool.query(
      "SELECT * FROM trades WHERE uid = $1 ORDER BY opened_at DESC LIMIT 50",
      [req.uid]
    );
    const trades = tradesResult.rows.reverse().map((t) => numify(t, ["lots", "entry", "exit", "pnl"]));

    res.json({ user: publicUser(row), trades });
  } catch (err) {
    console.error("me error:", err);
    res.status(500).json({ error: "Erreur lecture utilisateur" });
  }
});

// PUT /api/settings — reglages PERSONNELS du trader (notifications Telegram).
// Les parametres du bot sont globaux et reserves a l'admin (/api/admin/bot-settings).
router.put("/api/settings", requireAuth, async (req, res) => {
  try {
    const { params } = req.body;
    if (!params) return res.status(400).json({ error: "params requis" });
    const personal = pick(params, TG_KEYS);
    await pool.query("UPDATE users SET params = params || $1::jsonb WHERE uid = $2", [JSON.stringify(personal), req.uid]);
    res.json({ status: "ok" });
  } catch (err) {
    console.error("settings error:", err);
    res.status(500).json({ error: "Erreur sauvegarde parametres" });
  }
});

// POST /api/deriv/oauth — liaison du compte Deriv via OAuth (PKCE). On ne
// garde que la liste des comptes (l'access token expire en 1 h).
router.post("/api/deriv/oauth", requireAuth, async (req, res) => {
  try {
    const { code, code_verifier, signup } = req.body || {};
    if (!code || !code_verifier) return res.status(400).json({ error: "code OAuth manquant" });
    await ensureUser(req.uid, req.email);

    const tokens   = await exchangeOAuthCode({ code, codeVerifier: code_verifier, redirectUri: OAUTH_REDIRECT });
    const accounts = await listAccounts(tokens.accessToken);
    if (accounts.length === 0) return res.status(400).json({ error: "Aucun compte trouve sur ce compte Deriv" });

    // Un meme compte Deriv ne peut etre lie qu'a un seul utilisateur Tradify
    const ids = accounts.map((a) => a.account_id);
    const clash = await pool.query(
      `SELECT uid FROM users WHERE uid <> $1 AND deriv_accounts IS NOT NULL
         AND EXISTS (SELECT 1 FROM jsonb_array_elements(deriv_accounts) a WHERE a->>'account_id' = ANY($2))`,
      [req.uid, ids]
    );
    if (clash.rows.length > 0) return res.status(409).json({ error: "Ce compte Deriv est deja lie a un autre utilisateur Tradify" });

    // Liaison reussie = compte valide automatiquement ; le bot utilisera ces
    // jetons OAuth (pas de token a copier par le client).
    await pool.query(
      `UPDATE users SET deriv_accounts = $1, deriv_linked_at = now(),
         deriv_signup_via_app = deriv_signup_via_app OR $2,
         oauth_access_encrypted = $3, oauth_refresh_encrypted = $4, oauth_expires_at = $5,
         deriv_reauth_needed = false, approved = true
       WHERE uid = $6`,
      [JSON.stringify(accounts), !!signup, encrypt(tokens.accessToken),
       tokens.refreshToken ? encrypt(tokens.refreshToken) : null, tokens.expiresAt, req.uid]
    );
    res.json({ status: "ok", accounts });
  } catch (err) {
    console.error("oauth error:", err.message);
    res.status(502).json({ error: err.message });
  }
});

// POST /api/auth/deriv — "Continuer avec Deriv" (sans compte Tradify prealable).
// Le code OAuth prouve la possession du compte Deriv : on connecte le compte
// Tradify deja lie a ce compte Deriv, sinon on en cree un (valide, lie).
// Renvoie un custom token Firebase pour signInWithCustomToken.
router.post("/api/auth/deriv", async (req, res) => {
  try {
    const { code, code_verifier, signup } = req.body || {};
    if (!code || !code_verifier) return res.status(400).json({ error: "code OAuth manquant" });
    const tokens   = await exchangeOAuthCode({ code, codeVerifier: code_verifier, redirectUri: OAUTH_REDIRECT });
    const accounts = await listAccounts(tokens.accessToken);
    if (accounts.length === 0) return res.status(400).json({ error: "Aucun compte trouvé sur ce compte Deriv" });

    const ids = accounts.map((a) => a.account_id);
    const { rows } = await pool.query(
      `SELECT uid FROM users WHERE deriv_accounts IS NOT NULL
         AND EXISTS (SELECT 1 FROM jsonb_array_elements(deriv_accounts) a WHERE a->>'account_id' = ANY($1))
       ORDER BY created_at LIMIT 1`,
      [ids]
    );

    const primary = (accounts.find((a) => a.account_type === "real") || accounts[0]).account_id;
    let uid = rows[0]?.uid;
    const isNew = !uid;
    if (isNew) {
      uid = `deriv_${primary}`;
      try {
        await firebaseAdmin.auth().getUser(uid);
      } catch {
        await firebaseAdmin.auth().createUser({ uid, displayName: `Deriv ${primary}` });
      }
      await pool.query(
        `INSERT INTO users (uid, email, ea_active, params, approved, display_name)
         VALUES ($1, $2, false, $3, true, $4) ON CONFLICT (uid) DO NOTHING`,
        [uid, `${uid}@deriv.tradify`, JSON.stringify(DEFAULT_EA_PARAMS), `Trader ${primary}`]
      );
    }
    await pool.query(
      `UPDATE users SET deriv_accounts = $1, deriv_linked_at = now(),
         deriv_signup_via_app = deriv_signup_via_app OR $2,
         oauth_access_encrypted = $3, oauth_refresh_encrypted = COALESCE($4, oauth_refresh_encrypted), oauth_expires_at = $5,
         deriv_reauth_needed = false
       WHERE uid = $6`,
      [JSON.stringify(accounts), !!signup, encrypt(tokens.accessToken),
       tokens.refreshToken ? encrypt(tokens.refreshToken) : null, tokens.expiresAt, uid]
    );
    const customToken = await firebaseAdmin.auth().createCustomToken(uid, { deriv: true });
    console.log(`🔑 Connexion via Deriv (${primary}) : ${isNew ? "nouveau compte" : "compte existant"} ${uid}`);
    res.json({ customToken, isNew });
  } catch (err) {
    console.error("deriv login error:", err.message);
    res.status(502).json({ error: err.message.startsWith("OAuth") ? "La connexion Deriv a échoué, réessayez." : err.message });
  }
});

// PUT /api/deriv-token — enregistre le token du bot apres verification
// aupres de Deriv (et qu'il appartient bien au compte lie en OAuth).
router.put("/api/deriv-token", requireAuth, async (req, res) => {
  try {
    const token = String(req.body?.token || "").trim();
    if (!token) return res.status(400).json({ error: "token requis" });
    await ensureUser(req.uid, req.email);

    let accounts;
    try {
      accounts = await listAccounts(token, { pat: true });
    } catch (err) {
      return res.status(400).json({ error: `Token refuse par Deriv (${err.message}). Verifiez qu'il a les droits Trade + Read et qu'il n'a pas expire.` });
    }

    const { rows } = await pool.query("SELECT deriv_accounts FROM users WHERE uid = $1", [req.uid]);
    const linked = rows[0]?.deriv_accounts || [];
    if (linked.length > 0) {
      const linkedIds = new Set(linked.map((a) => a.account_id));
      if (!accounts.some((a) => linkedIds.has(a.account_id))) {
        return res.status(400).json({ error: "Ce token appartient a un autre compte Deriv que celui que vous avez connecte." });
      }
    }
    const clash = await pool.query(
      `SELECT uid FROM users WHERE uid <> $1 AND deriv_accounts IS NOT NULL
         AND EXISTS (SELECT 1 FROM jsonb_array_elements(deriv_accounts) a WHERE a->>'account_id' = ANY($2))`,
      [req.uid, accounts.map((a) => a.account_id)]
    );
    if (clash.rows.length > 0) {
      return res.status(409).json({ error: "Ce compte Deriv est deja lie a un autre compte Tradify." });
    }

    await pool.query(
      `UPDATE users SET token_encrypted = $1, token_saved_at = now(),
         deriv_accounts = COALESCE(deriv_accounts, $2)
       WHERE uid = $3`,
      [encrypt(token), JSON.stringify(accounts), req.uid]
    );
    res.json({ status: "ok", accounts });
  } catch (err) {
    console.error("deriv-token error:", err);
    res.status(500).json({ error: "Erreur mise a jour du token" });
  }
});

// GET /api/stats?days=30 — statistiques sur TOUS les trades + courbe journaliere
router.get("/api/stats", requireAuth, async (req, res) => {
  try {
    const days = req.query.days === "all" ? null : Math.min(Math.max(Number(req.query.days) || 30, 1), 3650);
    const { rows: [t] } = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'closed')                        AS closed,
         COUNT(*) FILTER (WHERE status = 'closed' AND pnl > 0)            AS wins,
         COUNT(*) FILTER (WHERE status = 'closed' AND pnl <= 0)           AS losses,
         COUNT(*) FILTER (WHERE status = 'open')                          AS open,
         COALESCE(SUM(pnl) FILTER (WHERE status = 'closed'), 0)           AS pnl,
         COALESCE(SUM(pnl) FILTER (WHERE status = 'closed' AND pnl > 0), 0) AS gains,
         COALESCE(-SUM(pnl) FILTER (WHERE status = 'closed' AND pnl < 0), 0) AS loss_sum,
         COALESCE(MAX(pnl) FILTER (WHERE status = 'closed'), 0)           AS best,
         COALESCE(MIN(pnl) FILTER (WHERE status = 'closed'), 0)           AS worst,
         COALESCE(SUM(pnl) FILTER (WHERE status = 'closed' AND closed_at >= date_trunc('day', now())), 0) AS pnl_today,
         COUNT(*) FILTER (WHERE status = 'closed' AND direction = 'BUY')  AS buys,
         COUNT(*) FILTER (WHERE status = 'closed' AND direction = 'BUY' AND pnl > 0) AS buy_wins,
         COUNT(*) FILTER (WHERE status = 'closed' AND direction = 'SELL') AS sells,
         COUNT(*) FILTER (WHERE status = 'closed' AND direction = 'SELL' AND pnl > 0) AS sell_wins
       FROM trades WHERE uid = $1`,
      [req.uid]
    );
    const { rows: series } = await pool.query(
      `SELECT to_char(date_trunc('day', closed_at), 'YYYY-MM-DD') AS day, SUM(pnl) AS pnl, COUNT(*) AS trades
       FROM trades WHERE uid = $1 AND status = 'closed' AND ($2::int IS NULL OR closed_at >= now() - make_interval(days => $2::int))
       GROUP BY 1 ORDER BY 1`,
      [req.uid, days]
    );
    const stats = Object.fromEntries(Object.entries(t).map(([k, v]) => [k, Number(v)]));
    stats.win_rate = stats.closed ? (stats.wins / stats.closed) * 100 : 0;
    let cum = 0;
    res.json({ stats, series: series.map((r) => { cum += Number(r.pnl); return { day: r.day, pnl: Number(r.pnl), trades: Number(r.trades), cumulative: Math.round(cum * 100) / 100 }; }) });
  } catch (err) {
    console.error("stats error:", err);
    res.status(500).json({ error: "Erreur statistiques" });
  }
});

// GET /api/trades?status=closed|open&limit=50&offset=0 — historique pagine
router.get("/api/trades", requireAuth, async (req, res) => {
  try {
    const status = ["open", "closed"].includes(req.query.status) ? req.query.status : null;
    const limit  = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const { rows } = await pool.query(
      `SELECT contract_id, symbol, direction, lots, entry, exit, pnl, status, grid_level, opened_at, closed_at, account_id
       FROM trades WHERE uid = $1 AND ($2::text IS NULL OR status = $2)
       ORDER BY COALESCE(closed_at, opened_at) DESC LIMIT $3 OFFSET $4`,
      [req.uid, status, limit, offset]
    );
    const { rows: [c] } = await pool.query("SELECT COUNT(*) AS n FROM trades WHERE uid = $1 AND ($2::text IS NULL OR status = $2)", [req.uid, status]);
    res.json({ trades: rows.map((r) => numify(r, ["lots", "entry", "exit", "pnl"])), total: Number(c.n) });
  } catch (err) {
    console.error("trades error:", err);
    res.status(500).json({ error: "Erreur historique" });
  }
});

// GET /api/positions/live — positions ouvertes + prix actuel / P&L en cours (Deriv)
router.get("/api/positions/live", requireAuth, async (req, res) => {
  try {
    const { getLiveContracts } = require("./engine/manager");
    const live = getLiveContracts(req.uid);
    const { rows } = await pool.query(
      `SELECT contract_id, symbol, direction, lots, entry, grid_level, opened_at, account_id
       FROM trades WHERE uid = $1 AND status = 'open' ORDER BY opened_at DESC`,
      [req.uid]
    );
    const positions = rows.map((r) => {
      const l = live.contracts[r.contract_id] || {};
      return {
        ...numify(r, ["lots", "entry"]),
        stake:        l.buy_price ?? Math.max(0.5, Number(r.lots) * 10),
        entry_spot:   l.entry_spot ?? null,
        current_spot: l.current_spot ?? null,
        profit:       l.profit ?? null,
        payout:       l.payout ?? null,
        expires_at:   l.date_expiry ? new Date(l.date_expiry * 1000).toISOString() : new Date(new Date(r.opened_at).getTime() + 3600000).toISOString(),
        live:         !!l.updated_at,
      };
    });
    res.json({ connected: live.connected, positions });
  } catch (err) {
    console.error("positions live error:", err);
    res.status(500).json({ error: "Erreur positions" });
  }
});

// PUT /api/profile — nom affiche
router.put("/api/profile", requireAuth, async (req, res) => {
  const name = String(req.body?.display_name || "").trim().slice(0, 60);
  await pool.query("UPDATE users SET display_name = $1 WHERE uid = $2", [name || null, req.uid]);
  res.json({ display_name: name || null });
});

// GET /api/admin/bot-settings — parametres du bot (communs a tous les traders)
router.get("/api/admin/bot-settings", requireAuth, requireAdmin, async (req, res) => {
  const { rows } = await pool.query("SELECT updated_at FROM app_settings WHERE key = 'bot_params'");
  res.json({ params: await getBotParams(), updated_at: rows[0]?.updated_at || null });
});

// PUT /api/admin/bot-settings — s'applique a tous les bots au prochain passage du moteur
router.put("/api/admin/bot-settings", requireAuth, requireAdmin, async (req, res) => {
  try {
    if (!req.body?.params) return res.status(400).json({ error: "params requis" });
    const params = await setBotParams(req.body.params);
    console.log(`[admin ${req.email}] parametres du bot mis a jour`);
    res.json({ params });
  } catch (err) {
    console.error("bot-settings error:", err);
    res.status(500).json({ error: "Enregistrement impossible" });
  }
});

// PUT /api/account-type — demo / reel (reel = formule Pro active)
router.put("/api/account-type", requireAuth, async (req, res) => {
  try {
    const type = req.body?.type === "real" ? "real" : "demo";
    const { rows } = await pool.query("SELECT * FROM users WHERE uid = $1", [req.uid]);
    if (!rows[0]) return res.status(404).json({ error: "utilisateur introuvable" });
    if (type === "real" && !isProActive(rows[0])) {
      return res.status(403).json({ error: "Le compte reel necessite la formule Pro" });
    }
    await pool.query("UPDATE users SET deriv_account_type = $1 WHERE uid = $2", [type, req.uid]);
    res.json({ deriv_account_type: type });
  } catch (err) {
    console.error("account-type error:", err);
    res.status(500).json({ error: "Erreur changement de compte" });
  }
});

// POST /api/ea/toggle — active/desactive l'EA (compte valide + token requis)
router.post("/api/ea/toggle", requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT ea_active, approved, token_encrypted, oauth_access_encrypted, deriv_reauth_needed FROM users WHERE uid = $1",
      [req.uid]
    );
    const row = rows[0];
    if (!row) return res.status(404).json({ error: "utilisateur introuvable" });
    if (!row.ea_active) {
      if (!row.token_encrypted && !row.oauth_access_encrypted) return res.status(400).json({ error: "Connectez d'abord votre compte Deriv" });
      if (!row.token_encrypted && row.deriv_reauth_needed) return res.status(400).json({ error: "Reconnectez votre compte Deriv (bouton en haut de page)" });
      if (!row.approved) return res.status(403).json({ error: "Votre compte a été suspendu. Contactez le support." });
    }
    const result = await pool.query(
      "UPDATE users SET ea_active = NOT ea_active WHERE uid = $1 RETURNING ea_active",
      [req.uid]
    );
    const on = result.rows[0].ea_active;
    notify(req.uid, { category: "bot", level: on ? "success" : "warning",
      title: on ? "Bot activé" : "Bot en pause",
      body: on ? "TrendRider est actif : il prendra les prochains signaux sur XAUUSD." : "TrendRider a été mis en pause. Les positions déjà ouvertes vont jusqu'à leur échéance." });
    res.json({ ea_active: on });
  } catch (err) {
    console.error("toggle error:", err);
    res.status(500).json({ error: "Erreur bascule EA" });
  }
});

// Supprime un compte : bot coupe (le moteur le retire au prochain passage),
// trades et messages effaces, paiements conserves (comptabilite), compte
// Firebase supprime.
async function deleteAccount(uid) {
  await pool.query("UPDATE users SET ea_active = false WHERE uid = $1", [uid]);
  await pool.query("DELETE FROM messages WHERE uid = $1", [uid]);
  await pool.query("DELETE FROM trades WHERE uid = $1", [uid]);
  await pool.query("DELETE FROM users WHERE uid = $1", [uid]);
  try {
    await firebaseAdmin.auth().deleteUser(uid);
  } catch (err) {
    if (err.code !== "auth/user-not-found") console.error("firebase deleteUser:", err.message);
  }
}

// DELETE /api/me — le trader supprime son compte (confirmation "SUPPRIMER")
router.delete("/api/me", requireAuth, async (req, res) => {
  try {
    if (req.body?.confirm !== "SUPPRIMER") return res.status(400).json({ error: "Confirmation manquante" });
    if (isAdminEmail(req.email)) return res.status(403).json({ error: "Le compte administrateur ne peut pas être supprimé ici" });
    await deleteAccount(req.uid);
    console.log(`🗑️ Compte supprime par son titulaire : ${req.email}`);
    res.json({ status: "ok" });
  } catch (err) {
    console.error("delete me error:", err);
    res.status(500).json({ error: "Suppression impossible" });
  }
});

// POST /api/deriv/unlink — le trader deconnecte son compte Deriv
router.post("/api/deriv/unlink", requireAuth, async (req, res) => {
  try {
    await pool.query(
      `UPDATE users SET ea_active = false, token_encrypted = NULL, token_saved_at = NULL,
         oauth_access_encrypted = NULL, oauth_refresh_encrypted = NULL, oauth_expires_at = NULL,
         deriv_accounts = NULL, deriv_connected = false, deriv_reauth_needed = false, deriv_loginid = NULL,
         deriv_balance = NULL
       WHERE uid = $1`,
      [req.uid]
    );
    res.json({ status: "ok" });
  } catch (err) {
    console.error("unlink error:", err);
    res.status(500).json({ error: "Déconnexion impossible" });
  }
});

// ─── Paiement formule Pro (CinetPay) ─────────────────────────────────────────

async function applyPayment(paymentId) {
  const { rows } = await pool.query("SELECT * FROM payments WHERE id = $1", [paymentId]);
  const payment  = rows[0];
  if (!payment || payment.status !== "pending") return payment;

  const { state, raw } = await cinetpay.checkStatus(paymentId);
  if (state === "pending") {
    await pool.query("UPDATE payments SET provider_status = $1 WHERE id = $2", [raw, paymentId]);
    return { ...payment, provider_status: raw };
  }
  // Mise a jour conditionnelle : un seul appel (webhook ou polling) prolonge le Pro
  const upd = await pool.query(
    `UPDATE payments SET status = $1, provider_status = $2, paid_at = CASE WHEN $1 = 'paid' THEN now() END
     WHERE id = $3 AND status = 'pending' RETURNING *`,
    [state, raw, paymentId]
  );
  if (upd.rows[0] && state === "paid") {
    await pool.query(
      `UPDATE users SET plan = 'pro',
         plan_expires_at = GREATEST(COALESCE(plan_expires_at, now()), now()) + make_interval(days => $1)
       WHERE uid = $2`,
      [payment.days, payment.uid]
    );
    console.log(`💰 Paiement ${paymentId} confirme : Pro +${payment.days} j pour ${payment.uid}`);
    notify(payment.uid, { category: "compte", level: "success", title: "Formule Pro activée",
      body: `Paiement confirmé : ${payment.days} jours de Pro ajoutés. Le compte réel est débloqué.` });
  }
  return upd.rows[0] || payment;
}

// POST /api/payment/checkout — demarre un paiement CinetPay pour la formule Pro
router.post("/api/payment/checkout", requireAuth, async (req, res) => {
  try {
    await ensureUser(req.uid, req.email);
    const id = "DG" + Date.now().toString(36).toUpperCase() + crypto.randomBytes(3).toString("hex").toUpperCase();
    const rate      = await freshRate();
    const amountXof = usdToXof(PRO_PRICE_USD);
    await pool.query(
      "INSERT INTO payments (id, uid, amount, days, email, amount_usd, fx_rate) VALUES ($1, $2, $3, $4, $5, $6, $7)",
      [id, req.uid, amountXof, PRO_DAYS, req.email, PRO_PRICE_USD, rate]
    );
    const checkoutUrl = await cinetpay.createCheckout({
      amount: amountXof,
      transactionId: id,
      successUrl: `${FRONTEND_URL}/paiement?id=${id}`,
      failedUrl:  `${FRONTEND_URL}/paiement?id=${id}`,
      notifyUrl:  `${BACKEND_URL}/api/payment/webhook?id=${id}`,
      description: `Tradify Pro - ${PRO_DAYS} jours (${PRO_PRICE_USD} USD)`,
    });
    res.status(201).json({ id, checkoutUrl, amountXof, amountUsd: PRO_PRICE_USD });
  } catch (err) {
    console.error("checkout error:", err.message);
    res.status(502).json({ error: "Paiement indisponible pour le moment, reessayez plus tard." });
  }
});

// POST /api/payment/webhook — notification serveur a serveur de CinetPay.
// Le statut est toujours reverifie aupres de CinetPay (jamais cru sur parole).
router.post("/api/payment/webhook", async (req, res) => {
  const id = req.query?.id || req.body?.merchant_transaction_id || req.body?.cpm_trans_id;
  console.log("CinetPay webhook:", JSON.stringify(req.body), "id:", id);
  if (!id) return res.status(400).json({ error: "id manquant" });
  try {
    await applyPayment(String(id));
    res.json({ ok: true });
  } catch (err) {
    console.error("webhook error:", err.message);
    res.status(500).json({ error: "verification impossible" });
  }
});

// GET /api/payment/:id — le client revient du checkout et verifie son paiement
router.get("/api/payment/:id", requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT uid FROM payments WHERE id = $1", [req.params.id]);
    if (!rows[0] || rows[0].uid !== req.uid) return res.status(404).json({ error: "paiement introuvable" });
    const payment = await applyPayment(req.params.id);
    res.json({ id: payment.id, status: payment.status, amount: payment.amount, amount_usd: payment.amount_usd != null ? Number(payment.amount_usd) : null, days: payment.days });
  } catch (err) {
    console.error("payment status error:", err.message);
    res.status(502).json({ error: "Verification du paiement impossible, reessayez dans un instant." });
  }
});

// ─── Administration ──────────────────────────────────────────────────────────

// GET /api/admin/users — tous les traders + statistiques
router.get("/api/admin/users", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT u.*,
        COALESCE(s.trades, 0)    AS trades_closed,
        COALESCE(s.wins, 0)      AS wins,
        COALESCE(s.pnl, 0)       AS pnl_total,
        COALESCE(s.pnl_today, 0) AS pnl_today,
        COALESCE(s.open, 0)      AS open_trades
      FROM users u
      LEFT JOIN (
        SELECT uid,
          COUNT(*) FILTER (WHERE status = 'closed')                     AS trades,
          COUNT(*) FILTER (WHERE status = 'closed' AND pnl > 0)         AS wins,
          SUM(pnl) FILTER (WHERE status = 'closed')                     AS pnl,
          SUM(pnl) FILTER (WHERE closed_at >= date_trunc('day', now())) AS pnl_today,
          COUNT(*) FILTER (WHERE status = 'open')                       AS open
        FROM trades GROUP BY uid
      ) s ON s.uid = u.uid
      ORDER BY u.created_at DESC`);
    const users = rows.map((r) => {
      const u = publicUser(r);
      numify(u, ["trades_closed", "wins", "pnl_total", "pnl_today", "open_trades"]);
      delete u.params;
      return u;
    });
    // Checkout ouvert puis abandonne : on le classe "expire" apres 2 h
    await pool.query("UPDATE payments SET status = 'expired' WHERE status = 'pending' AND created_at < now() - interval '2 hours'");
    const payments = await pool.query(
      "SELECT id, uid, email, amount, amount_usd, fx_rate, status, created_at, paid_at FROM payments ORDER BY created_at DESC LIMIT 100"
    );
    res.json({ users, payments: payments.rows });
  } catch (err) {
    console.error("admin users error:", err);
    res.status(500).json({ error: "Erreur lecture admin" });
  }
});

// POST /api/admin/users/:uid — valider, offrir du Pro, arreter le bot
router.post("/api/admin/users/:uid", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { approved, grantProDays, revokePro, stopEA } = req.body || {};
    const uid = req.params.uid;
    if (typeof approved === "boolean") {
      await pool.query("UPDATE users SET approved = $1 WHERE uid = $2", [approved, uid]);
      if (!approved) await pool.query("UPDATE users SET ea_active = false WHERE uid = $1", [uid]);
    }
    if (Number(grantProDays) > 0) {
      await pool.query(
        `UPDATE users SET plan = 'pro',
           plan_expires_at = GREATEST(COALESCE(plan_expires_at, now()), now()) + make_interval(days => $1)
         WHERE uid = $2`,
        [Math.min(Number(grantProDays), 366), uid]
      );
    }
    if (revokePro) {
      await pool.query("UPDATE users SET plan = 'basic', plan_expires_at = NULL, deriv_account_type = 'demo' WHERE uid = $1", [uid]);
    }
    if (stopEA) await pool.query("UPDATE users SET ea_active = false WHERE uid = $1", [uid]);
    console.log(`[admin ${req.email}] ${uid}:`, JSON.stringify(req.body));
    res.json({ status: "ok" });
  } catch (err) {
    console.error("admin update error:", err);
    res.status(500).json({ error: "Erreur mise a jour" });
  }
});

// Au demarrage : les comptes admin existants sont valides d'office (sinon le
// moteur, qui exige approved = true, couperait leur bot)
async function approveAdmins() {
  const r = await pool.query("UPDATE users SET approved = true WHERE lower(email) = ANY($1) AND NOT approved", [ADMIN_EMAILS]);
  const admins = await pool.query("SELECT email, approved FROM users WHERE lower(email) = ANY($1)", [ADMIN_EMAILS]);
  console.log(`👤 Admins (${ADMIN_EMAILS.join(",")}) : ${admins.rows.length} en base, ${r.rowCount} valide(s) au demarrage`);
}

// DELETE /api/admin/users/:uid — supprimer un trader (pas un admin)
router.delete("/api/admin/users/:uid", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT email FROM users WHERE uid = $1", [req.params.uid]);
    if (!rows[0]) return res.status(404).json({ error: "trader introuvable" });
    if (isAdminEmail(rows[0].email)) return res.status(403).json({ error: "Impossible de supprimer un administrateur" });
    await deleteAccount(req.params.uid);
    console.log(`[admin ${req.email}] 🗑️ trader supprime : ${rows[0].email}`);
    res.json({ status: "ok" });
  } catch (err) {
    console.error("admin delete error:", err);
    res.status(500).json({ error: "Suppression impossible" });
  }
});

module.exports = router;
module.exports.decrypt = decrypt;
module.exports.encrypt = encrypt;
module.exports.requireAdmin = requireAdmin;
module.exports.ensureUser = ensureUser;
module.exports.ADMIN_EMAILS = ADMIN_EMAILS;
module.exports.approveAdmins = approveAdmins;
