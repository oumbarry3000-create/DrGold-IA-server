// server/src/engine/manager.js
const { pool }     = require("../db");
const DerivClient  = require("./derivClient");
const { decrypt }  = require("../routes");

// Map uid -> DerivClient actif
const activeClients = new Map();

async function startEAEngine() {
  console.log("🤖 EA Engine démarré — polling Postgres toutes les 10s");
  await pollUsers();
  setInterval(pollUsers, 10_000);
}

async function pollUsers() {
  try {
    const { rows } = await pool.query("SELECT uid, ea_active, params, token_encrypted FROM users");

    for (const row of rows) {
      const uid = row.uid;
      const eaActive = row.ea_active === true;

      if (eaActive && !activeClients.has(uid)) {
        await activateUser(uid, row);
      } else if (!eaActive && activeClients.has(uid)) {
        deactivateUser(uid);
      } else if (eaActive && activeClients.has(uid)) {
        const client = activeClients.get(uid);
        client.params = { ...client.params, ...row.params };
      }
    }
  } catch (err) {
    console.error("pollUsers error:", err.message);
  }
}

async function activateUser(uid, row) {
  try {
    const tokenEncrypted = row.token_encrypted;
    if (!tokenEncrypted) {
      console.error(`[${uid}] Pas de token Deriv`);
      return;
    }

    const derivToken = decrypt(tokenEncrypted);
    const params     = row.params || {};

    console.log(`[${uid}] Activation EA...`);
    const client = new DerivClient(uid, derivToken, params);
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
