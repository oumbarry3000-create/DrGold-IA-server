// server/src/messaging.js
// Messagerie : une conversation support par trader (client <-> admin),
// annonces a tous / Pro / Basique, pieces jointes Cloudinary, emails Resend.
const express = require("express");
const router  = express.Router();

const { pool, isProActive } = require("./db");
const { requireAuth }       = require("./auth");
const { requireAdmin, ensureUser, ADMIN_EMAILS } = require("./routes");
const { sendEmail, sendBulk, emailEnabled } = require("./mailer");
const { signUpload, cleanAttachment, uploadsEnabled } = require("./uploads");

const MAX_BODY = 4000;

function readMessage(req) {
  const body = String(req.body?.body || "").trim().slice(0, MAX_BODY);
  const att  = cleanAttachment(req.body?.attachment);
  return { body, att };
}

async function insertMessage(uid, sender, body, att) {
  const { rows } = await pool.query(
    `INSERT INTO messages (uid, sender, body, attachment_url, attachment_name, attachment_type, read_by_client, read_by_admin)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [uid, sender, body, att?.url || null, att?.name || null, att?.type || null, sender === "client", sender === "admin"]
  );
  return rows[0];
}

// GET /api/inbox/status — compteurs pour les badges du tableau de bord
router.get("/api/inbox/status", requireAuth, async (req, res) => {
  try {
    await ensureUser(req.uid, req.email);
    const { rows: [u] } = await pool.query("SELECT plan, plan_expires_at, announcements_seen_at FROM users WHERE uid = $1", [req.uid]);
    const audience = isProActive(u) ? ["all", "pro"] : ["all", "basic"];
    const { rows: [c] } = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM messages WHERE uid = $1 AND sender = 'admin' AND NOT read_by_client) AS unread,
         (SELECT COUNT(*) FROM announcements WHERE audience = ANY($2) AND created_at > COALESCE($3, 'epoch'::timestamptz)) AS new_announcements`,
      [req.uid, audience, u.announcements_seen_at]
    );
    const { rows: [n] } = await pool.query("SELECT COUNT(*) AS unread FROM notifications WHERE uid = $1 AND NOT read", [req.uid]);
    res.json({ unread: Number(c.unread), newAnnouncements: Number(c.new_announcements), unreadNotifications: Number(n.unread), uploads: uploadsEnabled() });
  } catch (err) {
    console.error("inbox status error:", err);
    res.status(500).json({ error: "Erreur messagerie" });
  }
});

// GET /api/messages — ma conversation avec le support (marque les reponses lues)
router.get("/api/messages", requireAuth, async (req, res) => {
  try {
    await ensureUser(req.uid, req.email);
    const { rows } = await pool.query("SELECT * FROM messages WHERE uid = $1 ORDER BY created_at ASC LIMIT 500", [req.uid]);
    await pool.query("UPDATE messages SET read_by_client = true WHERE uid = $1 AND sender = 'admin' AND NOT read_by_client", [req.uid]);
    res.json({ messages: rows });
  } catch (err) {
    console.error("messages error:", err);
    res.status(500).json({ error: "Erreur lecture messages" });
  }
});

// POST /api/messages — le trader ecrit au support
router.post("/api/messages", requireAuth, async (req, res) => {
  try {
    const { body, att } = readMessage(req);
    if (!body && !att) return res.status(400).json({ error: "Message vide" });
    await ensureUser(req.uid, req.email);
    const msg = await insertMessage(req.uid, "client", body, att);
    for (const admin of ADMIN_EMAILS) {
      sendEmail(admin, `💬 Nouveau message de ${req.email}`, "Nouveau message d'un trader",
        `${req.email} :\n\n${body || "(pièce jointe)"}`, "Répondre", "/admin");
    }
    res.status(201).json({ message: msg });
  } catch (err) {
    console.error("send message error:", err);
    res.status(500).json({ error: "Envoi impossible" });
  }
});

// GET /api/announcements — annonces visibles pour ma formule (et marque vues)
router.get("/api/announcements", requireAuth, async (req, res) => {
  try {
    await ensureUser(req.uid, req.email);
    const { rows: [u] } = await pool.query("SELECT plan, plan_expires_at FROM users WHERE uid = $1", [req.uid]);
    const audience = isProActive(u) ? ["all", "pro"] : ["all", "basic"];
    const { rows } = await pool.query(
      "SELECT id, title, body, audience, attachment_url, attachment_name, attachment_type, created_at, updated_at FROM announcements WHERE audience = ANY($1) ORDER BY created_at DESC LIMIT 50",
      [audience]
    );
    await pool.query("UPDATE users SET announcements_seen_at = now() WHERE uid = $1", [req.uid]);
    res.json({ announcements: rows });
  } catch (err) {
    console.error("announcements error:", err);
    res.status(500).json({ error: "Erreur lecture annonces" });
  }
});

// GET /api/upload-signature — autorisation d'envoyer UN fichier a Cloudinary
router.get("/api/upload-signature", requireAuth, (req, res) => {
  if (!uploadsEnabled()) return res.status(503).json({ error: "Envoi de fichiers pas encore configuré" });
  res.json(signUpload(req.uid));
});

// ─── Admin ───────────────────────────────────────────────────────────────────

// GET /api/admin/conversations — une ligne par trader ayant des messages
router.get("/api/admin/conversations", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT u.uid, u.email, u.plan, u.plan_expires_at,
        last.body AS last_body, last.sender AS last_sender, last.created_at AS last_at, last.attachment_url AS last_attachment,
        (SELECT COUNT(*) FROM messages m WHERE m.uid = u.uid AND m.sender = 'client' AND NOT m.read_by_admin) AS unread
      FROM users u
      JOIN LATERAL (SELECT * FROM messages m WHERE m.uid = u.uid ORDER BY m.created_at DESC LIMIT 1) last ON true
      ORDER BY last.created_at DESC`);
    res.json({
      conversations: rows.map((r) => ({ ...r, unread: Number(r.unread), pro_active: !!isProActive(r) })),
      emailEnabled: emailEnabled(),
      uploads: uploadsEnabled(),
    });
  } catch (err) {
    console.error("conversations error:", err);
    res.status(500).json({ error: "Erreur lecture conversations" });
  }
});

// GET /api/admin/messages/:uid — conversation d'un trader (marque lue)
router.get("/api/admin/messages/:uid", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM messages WHERE uid = $1 ORDER BY created_at ASC LIMIT 500", [req.params.uid]);
    await pool.query("UPDATE messages SET read_by_admin = true WHERE uid = $1 AND sender = 'client' AND NOT read_by_admin", [req.params.uid]);
    const { rows: [u] } = await pool.query("SELECT uid, email FROM users WHERE uid = $1", [req.params.uid]);
    res.json({ user: u || null, messages: rows });
  } catch (err) {
    console.error("admin messages error:", err);
    res.status(500).json({ error: "Erreur lecture messages" });
  }
});

// POST /api/admin/messages/:uid — l'admin repond (email au trader)
router.post("/api/admin/messages/:uid", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { body, att } = readMessage(req);
    if (!body && !att) return res.status(400).json({ error: "Message vide" });
    const { rows: [u] } = await pool.query("SELECT email FROM users WHERE uid = $1", [req.params.uid]);
    if (!u) return res.status(404).json({ error: "trader introuvable" });
    const msg = await insertMessage(req.params.uid, "admin", body, att);
    sendEmail(u.email, "💬 Le support Tradify vous a répondu", "Nouveau message du support",
      body || "Vous avez reçu une pièce jointe.", "Lire le message", "/messages");
    res.status(201).json({ message: msg });
  } catch (err) {
    console.error("admin send error:", err);
    res.status(500).json({ error: "Envoi impossible" });
  }
});

// GET /api/admin/announcements — historique des annonces
router.get("/api/admin/announcements", requireAuth, requireAdmin, async (req, res) => {
  const { rows } = await pool.query("SELECT * FROM announcements ORDER BY created_at DESC LIMIT 100");
  res.json({ announcements: rows });
});

// POST /api/admin/announcements — nouvelle annonce (+ email optionnel)
router.post("/api/admin/announcements", requireAuth, requireAdmin, async (req, res) => {
  try {
    const title    = String(req.body?.title || "").trim().slice(0, 150);
    const body     = String(req.body?.body || "").trim().slice(0, MAX_BODY);
    const audience = ["all", "pro", "basic"].includes(req.body?.audience) ? req.body.audience : "all";
    const att      = cleanAttachment(req.body?.attachment);
    if (!title || !body) return res.status(400).json({ error: "Titre et texte requis" });

    const { rows: [ann] } = await pool.query(
      `INSERT INTO announcements (title, body, audience, attachment_url, attachment_name, attachment_type)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [title, body, audience, att?.url || null, att?.name || null, att?.type || null]
    );

    let emailsSent = 0;
    if (req.body?.sendEmail) {
      const { rows: users } = await pool.query("SELECT email, plan, plan_expires_at FROM users");
      const targets = users
        .filter((u) => audience === "all" || (audience === "pro") === !!isProActive(u))
        .map((u) => u.email);
      emailsSent = await sendBulk(targets, `📢 ${title}`, title, body, "Voir l'annonce", "/messages");
      await pool.query("UPDATE announcements SET emails_sent = $1 WHERE id = $2", [emailsSent, ann.id]);
    }
    console.log(`[admin ${req.email}] annonce "${title}" (${audience}) — ${emailsSent} email(s)`);
    res.status(201).json({ announcement: { ...ann, emails_sent: emailsSent } });
  } catch (err) {
    console.error("announcement error:", err);
    res.status(500).json({ error: "Publication impossible" });
  }
});

// ─── Modification / suppression ──────────────────────────────────────────────

const msgId = (req) => (/^d+$/.test(req.params.id) ? req.params.id : null);

// PUT /api/messages/:id — le trader corrige SON message
router.put("/api/messages/:id", requireAuth, async (req, res) => {
  const body = String(req.body?.body || "").trim().slice(0, MAX_BODY);
  if (!msgId(req) || !body) return res.status(400).json({ error: "Message vide" });
  const { rows } = await pool.query(
    "UPDATE messages SET body = $1, edited_at = now() WHERE id = $2 AND uid = $3 AND sender = 'client' RETURNING *",
    [body, msgId(req), req.uid]
  );
  if (!rows[0]) return res.status(404).json({ error: "Message introuvable" });
  res.json({ message: rows[0] });
});

// DELETE /api/messages/:id — le trader supprime SON message
router.delete("/api/messages/:id", requireAuth, async (req, res) => {
  if (!msgId(req)) return res.status(400).json({ error: "id invalide" });
  const { rowCount } = await pool.query("DELETE FROM messages WHERE id = $1 AND uid = $2 AND sender = 'client'", [msgId(req), req.uid]);
  if (!rowCount) return res.status(404).json({ error: "Message introuvable" });
  res.json({ status: "ok" });
});

// PUT /api/admin/messages/:id — l'admin corrige une de SES reponses
router.put("/api/admin/messages/:id", requireAuth, requireAdmin, async (req, res) => {
  const body = String(req.body?.body || "").trim().slice(0, MAX_BODY);
  if (!msgId(req) || !body) return res.status(400).json({ error: "Message vide" });
  const { rows } = await pool.query(
    "UPDATE messages SET body = $1, edited_at = now() WHERE id = $2 AND sender = 'admin' RETURNING *",
    [body, msgId(req)]
  );
  if (!rows[0]) return res.status(404).json({ error: "Message introuvable" });
  res.json({ message: rows[0] });
});

// DELETE /api/admin/messages/:id — moderation : l'admin peut supprimer tout message
router.delete("/api/admin/messages/:id", requireAuth, requireAdmin, async (req, res) => {
  if (!msgId(req)) return res.status(400).json({ error: "id invalide" });
  const { rowCount } = await pool.query("DELETE FROM messages WHERE id = $1", [msgId(req)]);
  if (!rowCount) return res.status(404).json({ error: "Message introuvable" });
  res.json({ status: "ok" });
});

// PUT /api/admin/announcements/:id — modifier une annonce (pas de nouvel email)
router.put("/api/admin/announcements/:id", requireAuth, requireAdmin, async (req, res) => {
  const title    = String(req.body?.title || "").trim().slice(0, 150);
  const body     = String(req.body?.body || "").trim().slice(0, MAX_BODY);
  const audience = ["all", "pro", "basic"].includes(req.body?.audience) ? req.body.audience : "all";
  if (!msgId(req) || !title || !body) return res.status(400).json({ error: "Titre et texte requis" });
  const { rows } = await pool.query(
    "UPDATE announcements SET title = $1, body = $2, audience = $3, updated_at = now() WHERE id = $4 RETURNING *",
    [title, body, audience, msgId(req)]
  );
  if (!rows[0]) return res.status(404).json({ error: "Annonce introuvable" });
  res.json({ announcement: rows[0] });
});

// DELETE /api/admin/announcements/:id
router.delete("/api/admin/announcements/:id", requireAuth, requireAdmin, async (req, res) => {
  if (!msgId(req)) return res.status(400).json({ error: "id invalide" });
  const { rowCount } = await pool.query("DELETE FROM announcements WHERE id = $1", [msgId(req)]);
  if (!rowCount) return res.status(404).json({ error: "Annonce introuvable" });
  res.json({ status: "ok" });
});

module.exports = router;
