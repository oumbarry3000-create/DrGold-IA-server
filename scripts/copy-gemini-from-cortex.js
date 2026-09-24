// scripts/copy-gemini-from-cortex.js
// Copie la cle Gemini de CORTEX (medical-ai/.env.local, AI_API_KEY) vers le
// service Render drgold-ia-server pour activer Barryx, puis redeploie.
// La cle n'est jamais affichee.
//
// Usage :  node scripts/copy-gemini-from-cortex.js <CLE_RENDER_BARRYGROUP>
const fs   = require("fs");
const path = require("path");

const [renderKey] = process.argv.slice(2);
if (!renderKey) {
  console.error("Usage : node scripts/copy-gemini-from-cortex.js <CLE_RENDER_BARRYGROUP>");
  process.exit(1);
}

const SERVICE = "https://api.render.com/v1/services/srv-daqjblojo6nc73eljp40";
const file = path.join(__dirname, "..", "..", "medical-ai", ".env.local");
const env = fs.readFileSync(file, "utf8").split(/\r?\n/).reduce((acc, line) => {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) acc[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  return acc;
}, {});

(async () => {
  if (!env.AI_API_KEY) { console.log("❌ AI_API_KEY introuvable dans medical-ai/.env.local"); return; }
  const headers = { Authorization: `Bearer ${renderKey}`, "Content-Type": "application/json" };
  const put = await fetch(`${SERVICE}/env-vars/AI_API_KEY`, { method: "PUT", headers, body: JSON.stringify({ value: env.AI_API_KEY }) });
  console.log(`${put.ok ? "✅" : "❌"} AI_API_KEY (clé Gemini de CORTEX) (${put.status})`);
  const dep = await fetch(`${SERVICE}/deploys`, { method: "POST", headers, body: "{}" });
  console.log(dep.ok ? "🚀 Redéploiement lancé (2-3 min) — Barryx sera actif ensuite" : `❌ Redéploiement refusé (${dep.status})`);
})();
