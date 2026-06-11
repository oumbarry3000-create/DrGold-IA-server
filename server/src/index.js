// server/src/index.js
require("dotenv").config();
const express = require("express");
const cors    = require("cors");
const { initFirebase } = require("./firebase");
const routes  = require("./routes");
const { startEAEngine } = require("./engine/manager");

const app  = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use("/", routes);

async function main() {
  await initFirebase();
  console.log("✅ Firebase Admin initialisé");

  app.listen(PORT, () => {
    console.log(`🚀 Serveur DrGold IA démarré sur port ${PORT}`);
  });

  // Lance le moteur EA (poll Firestore + WebSocket Deriv)
  startEAEngine();
}

main().catch(console.error);
