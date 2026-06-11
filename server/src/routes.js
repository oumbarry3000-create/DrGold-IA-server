// server/src/routes.js
const express = require("express");
const crypto  = require("crypto");
const router  = express.Router();

const ENCRYPTION_KEY = Buffer.from(process.env.ENCRYPTION_KEY, "hex"); // 32 bytes hex
const IV_LENGTH = 16;

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

// POST /encrypt-token
router.post("/encrypt-token", (req, res) => {
  try {
    const { token, uid } = req.body;
    if (!token || !uid) return res.status(400).json({ error: "token et uid requis" });
    const encrypted = encrypt(token);
    res.json({ encrypted });
  } catch (err) {
    console.error("encrypt error:", err);
    res.status(500).json({ error: "Erreur chiffrement" });
  }
});

// GET /decrypt-token (usage interne engine uniquement)
router.post("/decrypt-token", (req, res) => {
  try {
    const { encrypted } = req.body;
    const token = decrypt(encrypted);
    res.json({ token });
  } catch (err) {
    res.status(500).json({ error: "Erreur déchiffrement" });
  }
});

// GET /health
router.get("/health", (req, res) => {
  res.json({ status: "ok", ts: new Date().toISOString() });
});

module.exports = router;
module.exports.decrypt = decrypt;
