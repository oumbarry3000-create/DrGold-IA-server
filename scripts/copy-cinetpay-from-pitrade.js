// scripts/copy-cinetpay-from-pitrade.js
// Copie CINETPAY_API_KEY / CINETPAY_API_PASSWORD depuis le service Render de
// piTrade (-trade-backend, compte oumbarry300) vers drgold-ia-server (compte
// barrygrouptrading2025), puis relance le deploiement. Aucun secret affiche.
//
// Usage :  node scripts/copy-cinetpay-from-pitrade.js <CLE_RENDER_OUMBARRY300> <CLE_RENDER_BARRYGROUP>
const [pitradeKey, drgoldKey] = process.argv.slice(2);
if (!pitradeKey || !drgoldKey) {
  console.error("Usage : node scripts/copy-cinetpay-from-pitrade.js <CLE_RENDER_OUMBARRY300> <CLE_RENDER_BARRYGROUP>");
  process.exit(1);
}

const PITRADE = "https://api.render.com/v1/services/srv-d9u8kf6417fc73805u7g";
const DRGOLD  = "https://api.render.com/v1/services/srv-daqjblojo6nc73eljp40";
const KEYS    = ["CINETPAY_API_KEY", "CINETPAY_API_PASSWORD"];

(async () => {
  const src = await fetch(`${PITRADE}/env-vars?limit=100`, { headers: { Authorization: `Bearer ${pitradeKey}` } });
  if (!src.ok) { console.log(`❌ Lecture piTrade impossible (${src.status})`); return; }
  const vars = Object.fromEntries((await src.json()).map((x) => [x.envVar.key, x.envVar.value]));

  const headers = { Authorization: `Bearer ${drgoldKey}`, "Content-Type": "application/json" };
  for (const key of KEYS) {
    if (!vars[key]) { console.log(`❌ ${key} absent aussi sur piTrade`); continue; }
    const res = await fetch(`${DRGOLD}/env-vars/${key}`, { method: "PUT", headers, body: JSON.stringify({ value: vars[key] }) });
    console.log(`${res.ok ? "✅" : "❌"} ${key} (${res.status})`);
  }
  const dep = await fetch(`${DRGOLD}/deploys`, { method: "POST", headers, body: "{}" });
  console.log(dep.ok ? "🚀 Redéploiement lancé (2-3 min)" : `❌ Redéploiement refusé (${dep.status})`);
})();
