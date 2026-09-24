// server/src/engine/manager.js
// Fait tourner un DerivClient par trader eligible : EA active + compte valide
// par l'admin + token Deriv. Compte reel uniquement avec un Pro actif (sinon
// demo). Coupe l'EA si la limite de perte du jour est atteinte.
const { pool, effectiveAccountType } = require("../db");
const DerivClient  = require("./derivClient");
const { decrypt }  = require("../routes");
const { sendTelegram } = require("../strategy/telegram");
const { notify }       = require("../notifications");
const { getBotParams, TG_KEYS, pick } = require("../botSettings");

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

    const botParams = await getBotParams();
    await enforceDailyLossLimits(botParams);

    const { rows } = await pool.query(
      `SELECT uid, ea_active, approved, params, token_encrypted, oauth_access_encrypted, oauth_refresh_encrypted,
              deriv_reauth_needed, plan, plan_expires_at, deriv_account_type
       FROM users`
    );

    // Comptes supprimes : on coupe leur bot
    const existing = new Set(rows.map((r) => r.uid));
    for (const uid of [...activeClients.keys()]) {
      if (!existing.has(uid)) deactivateUser(uid);
    }

    for (const row of rows) {
      const uid      = row.uid;
      // Token manuel prioritaire (24h/24), sinon connexion OAuth encore utilisable
      const hasAccess = !!row.token_encrypted || (!!row.oauth_access_encrypted && !row.deriv_reauth_needed);
      const eligible  = row.ea_active === true && row.approved === true && hasAccess;
      row.credKey     = row.token_encrypted || row.oauth_access_encrypted;
      const type     = effectiveAccountType(row);
      const client   = activeClients.get(uid);

      if (eligible && !client) {
        await activateUser(uid, { ...row, params: { ...botParams, ...pick(row.params, TG_KEYS) } }, type);
      } else if (!eligible && client) {
        deactivateUser(uid);
      } else if (eligible && client && (client.tokenEncrypted !== row.credKey || client.accountType !== type)) {
        // Nouveau token ou passage demo <-> reel : reconnexion
        console.log(`[${uid}] Token ou compte change (${client.accountType} -> ${type}), reconnexion...`);
        deactivateUser(uid);
        await activateUser(uid, { ...row, params: { ...botParams, ...pick(row.params, TG_KEYS) } }, type);
      } else if (eligible && client) {
        client.params = { ...botParams, ...pick(row.params, TG_KEYS), derivAccountType: type };
      }
    }
  } catch (err) {
    console.error("pollUsers error:", err.message);
  }
}

// Limite de perte journaliere (params.dailyLossLimit en USD, 0 = desactivee)
async function enforceDailyLossLimits(botParams) {
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
    const limit = Number(botParams.dailyLossLimit || 0);
    const pnl   = Number(row.pnl_today || 0);
    // Alerte a 80 % de la limite (une fois par jour)
    if (limit > 0 && pnl <= -0.8 * limit && pnl > -limit) {
      notify(row.uid, { category: "trading", level: "warning", title: "Risque : limite de perte proche",
        body: `Pertes du jour : ${pnl.toFixed(2)} $ sur une limite de ${limit} $. Le bot s'arrêtera automatiquement à la limite.`,
        dedupeKey: `risk80-${new Date().toISOString().slice(0, 10)}`, dedupeMinutes: 1440 });
    }
    if (limit > 0 && pnl <= -limit) {
      await pool.query("UPDATE users SET ea_active = false WHERE uid = $1", [row.uid]);
      console.log(`[${row.uid}] 🛑 Limite de perte du jour atteinte (${pnl.toFixed(2)} $ / -${limit} $) : EA coupe`);
      notify(row.uid, { category: "bot", level: "danger", title: "Bot arrêté : limite de perte atteinte",
        body: `Pertes du jour : ${pnl.toFixed(2)} $ (limite ${limit} $). Réactivez le bot demain depuis le tableau de bord.` });
      const p = row.params || {};
      sendTelegram(p.tgBotToken, p.tgChatID,
        `🛑 <b>Tradify arrêté</b>\nLimite de perte du jour atteinte : ${pnl.toFixed(2)} $ (limite ${limit} $).\nRéactivez l'EA demain depuis le tableau de bord.`,
        p.tgMiniAppURL).catch(() => {});
    }
  }
}

async function activateUser(uid, row, accountType) {
  try {
    const usePat     = !!row.token_encrypted;
    const derivToken = decrypt(usePat ? row.token_encrypted : row.oauth_access_encrypted);
    const params     = { ...(row.params || {}), derivAccountType: accountType };

    console.log(`[${uid}] Activation EA (compte ${accountType}, ${usePat ? "token" : "OAuth"})...`);
    const client = new DerivClient(uid, derivToken, params);
    client.authKind       = usePat ? "pat" : "oauth";
    client.refreshToken   = !usePat && row.oauth_refresh_encrypted ? decrypt(row.oauth_refresh_encrypted) : null;
    client.tokenEncrypted = row.credKey;
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

// Etat live (prix actuel, P&L en cours) des contrats ouverts d'un trader
function getLiveContracts(uid) {
  const client = activeClients.get(uid);
  return client ? { connected: !!client.authorized, accountId: client.accountId || null, contracts: client.live || {} } : { connected: false, accountId: null, contracts: {} };
}

module.exports = { startEAEngine, getLiveContracts };
