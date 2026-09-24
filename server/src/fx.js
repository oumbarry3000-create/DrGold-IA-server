// server/src/fx.js
// Prix Pro fixe en dollars, paye en FCFA (XOF) via CinetPay : conversion au
// taux du jour (open.er-api.com, gratuit, sans cle), rafraichi toutes les 6 h.
// Si le service est injoignable, on garde le dernier taux connu, sinon
// FX_FALLBACK_XOF_PER_USD (600 par defaut, volontairement prudent).
const RATE_URL   = "https://open.er-api.com/v6/latest/USD";
const REFRESH_MS = 6 * 60 * 60 * 1000;
const FALLBACK   = Number(process.env.FX_FALLBACK_XOF_PER_USD || 600);

let rate = null;       // XOF pour 1 USD
let fetchedAt = 0;

async function refreshRate() {
  try {
    const res  = await fetch(RATE_URL);
    const data = await res.json();
    const xof  = Number(data?.rates?.XOF);
    if (data?.result === "success" && xof > 100 && xof < 2000) {
      rate = xof;
      fetchedAt = Date.now();
      console.log(`💱 Taux du jour : 1 USD = ${xof.toFixed(2)} XOF`);
    } else {
      throw new Error("réponse inattendue");
    }
  } catch (err) {
    console.error("taux de change indisponible:", err.message, `(taux utilisé : ${usdToXofRate()})`);
  }
}

function usdToXofRate() {
  return rate || FALLBACK;
}

// Montant XOF a payer pour un prix en USD, arrondi au multiple de 5 superieur
// (CinetPay exige un montant XOF multiple de 5)
function usdToXof(usd) {
  return Math.ceil((usd * usdToXofRate()) / 5) * 5;
}

function startFx() {
  refreshRate();
  setInterval(refreshRate, REFRESH_MS).unref?.();
}

// Avant un paiement : taux de moins de 6 h garanti autant que possible
async function freshRate() {
  if (!rate || Date.now() - fetchedAt > REFRESH_MS) await refreshRate();
  return usdToXofRate();
}

module.exports = { startFx, usdToXof, usdToXofRate, freshRate };
