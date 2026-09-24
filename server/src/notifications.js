// server/src/notifications.js
// Notifications automatiques du bot (page Messages → Notifications) :
// catégories trading | bot | compte | systeme, niveaux success | warning | info | danger.
// "dedupeKey" + "dedupeMinutes" evitent de repeter la meme notification
// (ex. reconnexions WebSocket quand le marche est ferme).
const express = require("express");
const router  = express.Router();
const { pool } = require("./db");
const { requireAuth } = require("./auth");

const CATEGORIES = ["trading", "bot", "compte", "systeme"];
const LEVELS     = ["success", "warning", "info", "danger"];

async function notify(uid, { category = "systeme", level = "info", title, body = "", dedupeKey = null, dedupeMinutes = 0 }) {
  try {
    if (dedupeKey && dedupeMinutes > 0) {
      const { rowCount } = await pool.query(
        "SELECT 1 FROM notifications WHERE uid = $1 AND dedupe_key = $2 AND created_at > now() - make_interval(mins => $3) LIMIT 1",
        [uid, dedupeKey, dedupeMinutes]
      );
      if (rowCount) return;
    }
    await pool.query(
      "INSERT INTO notifications (uid, category, level, title, body, dedupe_key) VALUES ($1, $2, $3, $4, $5, $6)",
      [uid, CATEGORIES.includes(category) ? category : "systeme", LEVELS.includes(level) ? level : "info",
       String(title).slice(0, 150), String(body).slice(0, 1000), dedupeKey]
    );
  } catch (err) {
    console.error("notify error:", err.message); // une notification ne doit jamais casser le bot
  }
}

// GET /api/notifications?category=trading — 100 dernieres
router.get("/api/notifications", requireAuth, async (req, res) => {
  const cat = CATEGORIES.includes(req.query.category) ? req.query.category : null;
  const { rows } = await pool.query(
    `SELECT id, category, level, title, body, read, created_at FROM notifications
     WHERE uid = $1 AND ($2::text IS NULL OR category = $2) ORDER BY created_at DESC LIMIT 100`,
    [req.uid, cat]
  );
  const { rows: [c] } = await pool.query("SELECT COUNT(*) AS unread FROM notifications WHERE uid = $1 AND NOT read", [req.uid]);
  res.json({ notifications: rows, unread: Number(c.unread) });
});

// POST /api/notifications/:id/read
router.post("/api/notifications/:id/read", requireAuth, async (req, res) => {
  if (!/^\d+$/.test(req.params.id)) return res.status(400).json({ error: "id invalide" });
  await pool.query("UPDATE notifications SET read = true WHERE id = $1 AND uid = $2", [req.params.id, req.uid]);
  res.json({ status: "ok" });
});

// POST /api/notifications/read-all
router.post("/api/notifications/read-all", requireAuth, async (req, res) => {
  await pool.query("UPDATE notifications SET read = true WHERE uid = $1 AND NOT read", [req.uid]);
  res.json({ status: "ok" });
});

module.exports = { router, notify };
