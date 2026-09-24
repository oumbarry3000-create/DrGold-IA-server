// scripts/copy-from-permigo.js
// Recupere les cles Resend (emails) et Cloudinary (pieces jointes) de PermiGo
// - d'abord sur son service Render (compte oumbarry300), sinon dans
// permigo-backend/.env - et les copie vers drgold-ia-server, puis redeploie.
// Aucun secret n'est affiche.
//
// Usage :  node scripts/copy-from-permigo.js <CLE_RENDER_OUMBARRY300> <CLE_RENDER_BARRYGROUP>
const fs   = require("fs");
const path = require("path");

const [permigoKey, drgoldKey] = process.argv.slice(2);
if (!permigoKey || !drgoldKey) {
  console.error("Usage : node scripts/copy-from-permigo.js <CLE_RENDER_OUMBARRY300> <CLE_RENDER_BARRYGROUP>");
  process.exit(1);
}

const PERMIGO = "https://api.render.com/v1/services/srv-d9rqtaijobas73e2aa80";
const DRGOLD  = "https://api.render.com/v1/services/srv-daqjblojo6nc73eljp40";
const KEYS    = ["RESEND_API_KEY", "RESEND_FROM", "CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"];

function readLocalEnv() {
  try {
    const file = path.join(__dirname, "..", "..", "permigo-backend", ".env");
    return fs.readFileSync(file, "utf8").split(/\r?\n/).reduce((acc, line) => {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m && m[2].trim()) acc[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
      return acc;
    }, {});
  } catch {
    return {};
  }
}

(async () => {
  let remote = {};
  const res = await fetch(`${PERMIGO}/env-vars?limit=100`, { headers: { Authorization: `Bearer ${permigoKey}` } });
  if (res.ok) remote = Object.fromEntries((await res.json()).map((x) => [x.envVar.key, x.envVar.value]).filter(([, v]) => v));
  else console.log(`ℹ️ Render PermiGo illisible (${res.status}), utilisation du .env local`);
  const local = readLocalEnv();

  const headers = { Authorization: `Bearer ${drgoldKey}`, "Content-Type": "application/json" };
  for (const key of KEYS) {
    let value = remote[key] || local[key];
    let source = remote[key] ? "Render PermiGo" : "PermiGo .env";
    if (!value) { console.log(`➖ ${key} introuvable dans PermiGo`); continue; }
    // Meme adresse d'envoi, mais affichee comme "DrGold IA"
    if (key === "RESEND_FROM") {
      const addr = (value.match(/<([^>]+)>/) || [null, value])[1];
      value = `DrGold IA <${addr}>`;
      console.log(`ℹ️ Expéditeur emails : ${value}${/resend\.dev$/.test(addr) ? "  (adresse de TEST : n'envoie qu'au propriétaire du compte Resend)" : ""}`);
    }
    const put = await fetch(`${DRGOLD}/env-vars/${key}`, { method: "PUT", headers, body: JSON.stringify({ value }) });
    console.log(`${put.ok ? "✅" : "❌"} ${key} (${source})`);
  }
  const dep = await fetch(`${DRGOLD}/deploys`, { method: "POST", headers, body: "{}" });
  console.log(dep.ok ? "🚀 Redéploiement lancé (2-3 min)" : `❌ Redéploiement refusé (${dep.status})`);
})();
