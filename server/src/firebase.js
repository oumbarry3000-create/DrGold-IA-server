// server/src/firebase.js
const admin = require("firebase-admin");

let db;

async function initFirebase() {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
  db = admin.firestore();
}

function getDB() {
  return db;
}

module.exports = { initFirebase, getDB };
