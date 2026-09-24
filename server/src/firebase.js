// server/src/firebase.js
// Firebase Admin est utilise UNIQUEMENT pour l'authentification (verification
// des tokens ID, voir auth.js) - toutes les donnees vivent dans Postgres
// (Neon, voir db.js), plus dans Firestore.
const admin = require("firebase-admin");

function initFirebase() {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

module.exports = { initFirebase };
