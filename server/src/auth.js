// server/src/auth.js
// Verifie le token ID Firebase envoye par le client (Authorization: Bearer <idToken>).
// Firebase Auth reste la seule source d'authentification ; ce middleware ne
// touche pas Firestore, juste la verification cryptographique du token aupres
// de Firebase Admin.
const admin = require("firebase-admin");

async function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "authentification requise" });
  }
  const idToken = header.slice(7);
  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    req.uid = decoded.uid;
    req.email = decoded.email || `${decoded.uid}@deriv.tradify`; // comptes "Continuer avec Deriv"
    next();
  } catch (err) {
    res.status(401).json({ error: "token invalide ou expire" });
  }
}

module.exports = { requireAuth };
