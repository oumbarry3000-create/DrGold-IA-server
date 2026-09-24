// scripts/set-cinetpay-env.js
// Copie les identifiants CinetPay de piTrade (xtrade-backend/.env) + l'URL du
// proxy Fixie vers le service Render drgold-ia-server, puis relance un
// deploiement. Aucun secret n'est ecrit dans ce fichier ni affiche.
//
// Usage :  node scripts/set-cinetpay-env.js <CLE_API_RENDER> "<FIXIE_URL>"
const fs   = require("fs");
const path = require("path");

const [renderKey, fixieUrl] = process.argv.slice(2);
if (!renderKey || !fixieUrl) {
  console.error('Usage : node scripts/set-cinetpay-env.js <CLE_API_RENDER> "<FIXIE_URL>"');
  process.exit(1);
}

const SERVICE = "https://api.render.com/v1/services/srv-daqjblojo6nc73eljp40";
const envFile = path.join(__dirname, "..", "..", "xtrade-backend", ".env");
const env = fs.readFileSync(envFile, "utf8").split(/\r?\n/).reduce((acc, line) => {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) acc[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  return acc;
}, {});

const values = {
  CINETPAY_BASE_URL:     env.CINETPAY_BASE_URL || "https://api.cinetpay.net",
  CINETPAY_API_KEY:      env.CINETPAY_API_KEY,
  CINETPAY_API_PASSWORD: env.CINETPAY_API_PASSWORD,
  FIXIE_URL:             fixieUrl,
};

(async () => {
  const headers = { Authorization: `Bearer ${renderKey}`, "Content-Type": "application/json" };
  for (const [key, value] of Object.entries(values)) {
    if (!value) { console.log(`❌ ${key} introuvable dans xtrade-backend/.env`); continue; }
    const res = await fetch(`${SERVICE}/env-vars/${key}`, { method: "PUT", headers, body: JSON.stringify({ value }) });
    console.log(`${res.ok ? "✅" : "❌"} ${key} (${res.status})`);
  }
  const dep = await fetch(`${SERVICE}/deploys`, { method: "POST", headers, body: "{}" });
  console.log(dep.ok ? "🚀 Redéploiement lancé (2-3 min)" : `❌ Redéploiement refusé (${dep.status})`);
})();
