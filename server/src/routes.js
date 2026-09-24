// server/src/routes.js
const express = require("express");
const crypto  = require("crypto");
const router  = express.Router();

const { pool, isProActive, effectiveAccountType } = require("./db");
const { requireAuth } = require("./auth");
const { listAccounts, exchangeOAuthCode } = require("./derivApi");
const cinetpay = require("./cinetpay");

const ENCRYPTION_KEY = Buffer.from(process.env.ENCRYPTION_KEY, "hex"); // 32 bytes hex
const IV_LENGTH = 16;

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "oumbarry2999@gmail.com")
  .split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
const PRO_PRICE_XOF = Number(process.env.PRO_PRICE_XOF || 10000);
const PRO_DAYS      = Number(process.env.PRO_DAYS || 30);
const FRONTEND_URL  = process.env.FRONTEND_URL || "https://drgold-ia.web.app";
const BACKEND_URL   = process.env.BACKEND_URL || "https://drgold-ia-server-m1mz.onrender.com";
const OAUTH_REDIRECT = `${FRONTEND_URL}/deriv-callback`;

const DEFAULT_EA_PARAMS = {
  stratMode: "CONTINUATION",
  candleCount: 3,
  initialLot: 0.01,
  martingaleMult: 1.5,
  maxGridLevels: 3,
  gridMode: "FIXE",
  gridDistancePips: 50,
  gridATRMult: 1.5,
  globalTPMoney: 10,
  globalSLMoney: 20,
  breakEvenMoney: 5,
  dailyLossLimit: 20,
  useDailyFilters: false,
  emaPeriod: 200,
  useRSI: false,
  rsiPeriod: 14,
  rsiLevelHigh: 70,
  rsiLevelLow: 30,
  atrPeriod: 14,
  tgBotToken: "",
  tgChatID: "",
  tgMiniAppURL: "",
  magicNumber: 990011,
};

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
  delete user.token_encrypted; // jamais renvoye au client
  user.has_token        = hasToken;
  user.is_admin         = isAdminEmail(user.email);
  user.pro_active       = !!isProActive(row);
  user.effective_account_type = effectiveAccountType(row);
  user.token_age_days   = row.token_saved_at ? Math.floor((Date.now() - new Date(row.token_saved_at)) / 86400000) : null;
  user.pro_price_xof    = PRO_PRICE_XOF;
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

// PUT /api/settings — met a jour les parametres EA
router.put("/api/settings", requireAuth, async (req, res) => {
  try {
    const { params } = req.body;
    if (!params) return res.status(400).json({ error: "params requis" });
    await pool.query("UPDATE users SET params = $1 WHERE uid = $2", [JSON.stringify(params), req.uid]);
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

    const accessToken = await exchangeOAuthCode({ code, codeVerifier: code_verifier, redirectUri: OAUTH_REDIRECT });
    const accounts    = await listAccounts(accessToken);
    if (accounts.length === 0) return res.status(400).json({ error: "Aucun compte trouve sur ce compte Deriv" });

    // Un meme compte Deriv ne peut etre lie qu'a un seul utilisateur DrGold
    const ids = accounts.map((a) => a.account_id);
    const clash = await pool.query(
      `SELECT uid FROM users WHERE uid <> $1 AND deriv_accounts IS NOT NULL
         AND EXISTS (SELECT 1 FROM jsonb_array_elements(deriv_accounts) a WHERE a->>'account_id' = ANY($2))`,
      [req.uid, ids]
    );
    if (clash.rows.length > 0) return res.status(409).json({ error: "Ce compte Deriv est deja lie a un autre utilisateur DrGold" });

    await pool.query(
      `UPDATE users SET deriv_accounts = $1, deriv_linked_at = now(),
         deriv_signup_via_app = deriv_signup_via_app OR $2
       WHERE uid = $3`,
      [JSON.stringify(accounts), !!signup, req.uid]
    );
    res.json({ status: "ok", accounts });
  } catch (err) {
    console.error("oauth error:", err.message);
    res.status(502).json({ error: err.message });
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
    const { rows } = await pool.query("SELECT ea_active, approved, token_encrypted FROM users WHERE uid = $1", [req.uid]);
    const row = rows[0];
    if (!row) return res.status(404).json({ error: "utilisateur introuvable" });
    if (!row.ea_active) {
      if (!row.approved) return res.status(403).json({ error: "Votre compte est en attente de validation" });
      if (!row.token_encrypted) return res.status(400).json({ error: "Ajoutez d'abord votre token Deriv" });
    }
    const result = await pool.query(
      "UPDATE users SET ea_active = NOT ea_active WHERE uid = $1 RETURNING ea_active",
      [req.uid]
    );
    res.json({ ea_active: result.rows[0].ea_active });
  } catch (err) {
    console.error("toggle error:", err);
    res.status(500).json({ error: "Erreur bascule EA" });
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
  }
  return upd.rows[0] || payment;
}

// POST /api/payment/checkout — demarre un paiement CinetPay pour la formule Pro
router.post("/api/payment/checkout", requireAuth, async (req, res) => {
  try {
    await ensureUser(req.uid, req.email);
    const id = "DG" + Date.now().toString(36).toUpperCase() + crypto.randomBytes(3).toString("hex").toUpperCase();
    await pool.query(
      "INSERT INTO payments (id, uid, amount, days) VALUES ($1, $2, $3, $4)",
      [id, req.uid, PRO_PRICE_XOF, PRO_DAYS]
    );
    const checkoutUrl = await cinetpay.createCheckout({
      amount: PRO_PRICE_XOF,
      transactionId: id,
      successUrl: `${FRONTEND_URL}/paiement?id=${id}`,
      failedUrl:  `${FRONTEND_URL}/paiement?id=${id}`,
      notifyUrl:  `${BACKEND_URL}/api/payment/webhook?id=${id}`,
      description: `DrGold IA Pro - ${PRO_DAYS} jours`,
    });
    res.status(201).json({ id, checkoutUrl });
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
    res.json({ id: payment.id, status: payment.status, amount: payment.amount, days: payment.days });
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
    const payments = await pool.query(
      "SELECT id, uid, amount, status, created_at, paid_at FROM payments ORDER BY created_at DESC LIMIT 100"
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
  await pool.query("UPDATE users SET approved = true WHERE lower(email) = ANY($1) AND NOT approved", [ADMIN_EMAILS]);
}

module.exports = router;
module.exports.decrypt = decrypt;
module.exports.approveAdmins = approveAdmins;
