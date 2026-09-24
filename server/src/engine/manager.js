// server/src/engine/manager.js
// Fait tourner un DerivClient par trader eligible : EA active + compte valide
// par l'admin + token Deriv. Compte reel uniquement avec un Pro actif (sinon
// demo). Coupe l'EA si la limite de perte du jour est atteinte.
const { pool, effectiveAccountType } = require("../db");
const DerivClient  = require("./derivClient");
const { decrypt }  = require("../routes");
const { sendTelegram } = require("../strategy/telegram");

// Map uid -> DerivClient actif
const activeClients = new Map();

async function startEAEngine() {
  console.log("🤖 EA Engine démarré — polling Postgres toutes les 10s");
  await pollUsers();
  setInterval(pollUsers, 10_000);
}

async function pollUsers() {
  try {
    // Pro expire : retour automatique en demo
    await pool.query(
      `UPDATE users SET deriv_account_type = 'demo'
       WHERE deriv_account_type = 'real' AND (plan <> 'pro' OR plan_expires_at IS NULL OR plan_expires_at <= now())`
    );

    await enforceDailyLossLimits();

    const { rows } = await pool.query(
      `SELECT uid, ea_active, approved, params, token_encrypted, plan, plan_expires_at, deriv_account_type
       FROM users`
    );

    for (const row of rows) {
      const uid      = row.uid;
      const eligible = row.ea_active === true && row.approved === true && !!row.token_encrypted;
      const type     = effectiveAccountType(row);
      const client   = activeClients.get(uid);

      if (eligible && !client) {
        await activateUser(uid, row, type);
      } else if (!eligible && client) {
        deactivateUser(uid);
      } else if (eligible && client && (client.tokenEncrypted !== row.token_encrypted || client.accountType !== type)) {
        // Nouveau token ou passage demo <-> reel : reconnexion
        console.log(`[${uid}] Token ou compte change (${client.accountType} -> ${type}), reconnexion...`);
        deactivateUser(uid);
        await activateUser(uid, row, type);
      } else if (eligible && client) {
        client.params = { ...client.params, ...row.params, derivAccountType: type };
      }
    }
  } catch (err) {
    console.error("pollUsers error:", err.message);
  }
}

// Limite de perte journaliere (params.dailyLossLimit en USD, 0 = desactivee)
async function enforceDailyLossLimits() {
  const { rows } = await pool.query(`
    SELECT u.uid, u.params, t.pnl_today
    FROM users u
    JOIN (
      SELECT uid, SUM(pnl) AS pnl_today FROM trades
      WHERE status = 'closed' AND closed_at >= date_trunc('day', now())
      GROUP BY uid
    ) t ON t.uid = u.uid
    WHERE u.ea_active = true`);

  for (const row of rows) {
    const limit = Number(row.params?.dailyLossLimit || 0);
    const pnl   = Number(row.pnl_today || 0);
    if (limit > 0 && pnl <= -limit) {
      await pool.query("UPDATE users SET ea_active = false WHERE uid = $1", [row.uid]);
      console.log(`[${row.uid}] 🛑 Limite de perte du jour atteinte (${pnl.toFixed(2)} $ / -${limit} $) : EA coupe`);
      const p = row.params || {};
      sendTelegram(p.tgBotToken, p.tgChatID,
        `🛑 <b>DrGold IA arrêté</b>\nLimite de perte du jour atteinte : ${pnl.toFixed(2)} $ (limite ${limit} $).\nRéactivez l'EA demain depuis le tableau de bord.`,
        p.tgMiniAppURL).catch(() => {});
    }
  }
}

async function activateUser(uid, row, accountType) {
  try {
    const tokenEncrypted = row.token_encrypted;
    const derivToken = decrypt(tokenEncrypted);
    const params     = { ...(row.params || {}), derivAccountType: accountType };

    console.log(`[${uid}] Activation EA (compte ${accountType})...`);
    const client = new DerivClient(uid, derivToken, params);
    client.tokenEncrypted = tokenEncrypted;
    client.accountType    = accountType;
    activeClients.set(uid, client);
    client.start();
  } catch (err) {
    console.error(`[${uid}] activateUser error:`, err.message);
  }
}

function deactivateUser(uid) {
  const client = activeClients.get(uid);
  if (client) {
    client.stop();
    activeClients.delete(uid);
    console.log(`[${uid}] EA désactivé`);
  }
}

module.exports = { startEAEngine };
