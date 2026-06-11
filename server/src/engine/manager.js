// server/src/engine/manager.js
const { getDB }    = require("../firebase");
const DerivClient  = require("./derivClient");
const { decrypt }  = require("../routes");

// Map uid -> DerivClient actif
const activeClients = new Map();

async function startEAEngine() {
  console.log("🤖 EA Engine démarré — polling Firestore toutes les 10s");
  await pollFirestore();
  setInterval(pollFirestore, 10_000);
}

async function pollFirestore() {
  try {
    const db    = getDB();
    const snap  = await db.collection("users").get();

    for (const docSnap of snap.docs) {
      const uid  = docSnap.id;
      const data = docSnap.data();
      const eaActive = data.ea_active === true;

      if (eaActive && !activeClients.has(uid)) {
        // Activer EA pour cet utilisateur
        await activateUser(uid, data);
      } else if (!eaActive && activeClients.has(uid)) {
        // Désactiver
        deactivateUser(uid);
      } else if (eaActive && activeClients.has(uid)) {
        // Mettre à jour les paramètres si changés
        const client = activeClients.get(uid);
        client.params = { ...client.params, ...data.params };
      }
    }
  } catch (err) {
    console.error("pollFirestore error:", err.message);
  }
}

async function activateUser(uid, data) {
  try {
    const tokenEncrypted = data.token_encrypted;
    if (!tokenEncrypted) {
      console.error(`[${uid}] Pas de token Deriv`);
      return;
    }

    const derivToken = decrypt(tokenEncrypted);
    const params     = data.params || {};

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
