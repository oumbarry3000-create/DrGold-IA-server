// server/src/routes.js
const express = require("express");
const crypto  = require("crypto");
const router  = express.Router();

const { pool }       = require("./db");
const { requireAuth } = require("./auth");

const ENCRYPTION_KEY = Buffer.from(process.env.ENCRYPTION_KEY, "hex"); // 32 bytes hex
const IV_LENGTH = 16;

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

// POST /encrypt-token — utilise par le client au moment de l'inscription,
// avant que l'utilisateur soit forcement deja authentifie server-side.
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

// POST /api/register — cree la ligne utilisateur en base (appele juste apres
// createUserWithEmailAndPassword cote client)
router.post("/api/register", requireAuth, async (req, res) => {
  try {
    const { token_encrypted } = req.body;
    await pool.query(
      `INSERT INTO users (uid, email, token_encrypted, ea_active, params)
       VALUES ($1, $2, $3, false, $4)
       ON CONFLICT (uid) DO NOTHING`,
      [req.uid, req.email, token_encrypted || null, JSON.stringify(DEFAULT_EA_PARAMS)]
    );
    res.json({ status: "ok" });
  } catch (err) {
    console.error("register error:", err);
    res.status(500).json({ error: "Erreur creation utilisateur" });
  }
});

// pg renvoie les colonnes NUMERIC sous forme de string (pour eviter les
// pertes de precision) - on les reconvertit en nombre pour le client, qui
// utilise .toFixed()/calculs directement dessus.
function numify(row, keys) {
  for (const k of keys) {
    if (row[k] !== null && row[k] !== undefined) row[k] = Number(row[k]);
  }
  return row;
}

// GET /api/me — etat utilisateur + 50 derniers trades (remplace les
// onSnapshot Firestore ; le client fait du polling sur cette route)
router.get("/api/me", requireAuth, async (req, res) => {
  try {
    const userResult = await pool.query("SELECT * FROM users WHERE uid = $1", [req.uid]);
    if (userResult.rows.length === 0) return res.status(404).json({ error: "utilisateur introuvable" });

    const tradesResult = await pool.query(
      "SELECT * FROM trades WHERE uid = $1 ORDER BY opened_at DESC LIMIT 50",
      [req.uid]
    );

    const user = numify(userResult.rows[0], ["deriv_balance"]);
    delete user.token_encrypted; // jamais renvoye au client

    const trades = tradesResult.rows.reverse().map((t) => numify(t, ["lots", "entry", "exit", "pnl"]));

    res.json({ user, trades });
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

// PUT /api/deriv-token — met a jour le token Deriv (reconnexion)
router.put("/api/deriv-token", requireAuth, async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: "token requis" });
    await pool.query("UPDATE users SET token_encrypted = $1 WHERE uid = $2", [encrypt(token), req.uid]);
    res.json({ status: "ok" });
  } catch (err) {
    console.error("deriv-token error:", err);
    res.status(500).json({ error: "Erreur mise a jour du token" });
  }
});

// POST /api/ea/toggle — active/desactive l'EA
router.post("/api/ea/toggle", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      "UPDATE users SET ea_active = NOT ea_active WHERE uid = $1 RETURNING ea_active",
      [req.uid]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "utilisateur introuvable" });
    res.json({ ea_active: result.rows[0].ea_active });
  } catch (err) {
    console.error("toggle error:", err);
    res.status(500).json({ error: "Erreur bascule EA" });
  }
});

module.exports = router;
module.exports.decrypt = decrypt;
