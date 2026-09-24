// server/src/cinetpay.js
// Integration CinetPay reprise de piTrade (meme compte marchand) : login ->
// bearer token, creation d'un paiement -> URL de checkout hebergee, puis
// verification du statut par merchant_transaction_id.
// CinetPay n'accepte que des IP whitelistees : si FIXIE_URL est defini, SEULS
// les appels CinetPay passent par ce proxy a IP fixe (pas le trafic Deriv).
const { fetch: undiciFetch, ProxyAgent } = require("undici");

const BASE_URL     = process.env.CINETPAY_BASE_URL || "https://api.cinetpay.net";
const API_KEY      = process.env.CINETPAY_API_KEY || "";
const API_PASSWORD = process.env.CINETPAY_API_PASSWORD || "";
const dispatcher   = process.env.FIXIE_URL ? new ProxyAgent(process.env.FIXIE_URL) : undefined;

const SUCCESS_STATUSES = ["ACCEPTED", "SUCCESS", "COMPLETED", "PAID"];
const FAIL_STATUSES    = ["REFUSED", "FAILED", "CANCELLED", "CANCELED"];

function cpFetch(url, options) {
  return undiciFetch(url, { ...options, dispatcher });
}

let cachedToken   = null;
let cachedTokenAt = 0;
const TOKEN_TTL_MS = 10 * 60 * 1000;

async function login() {
  if (!API_KEY || !API_PASSWORD) throw new Error("CINETPAY_API_KEY / CINETPAY_API_PASSWORD manquantes");
  if (cachedToken && Date.now() - cachedTokenAt < TOKEN_TTL_MS) return cachedToken;
  const res  = await cpFetch(`${BASE_URL}/v1/oauth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: API_KEY, api_password: API_PASSWORD }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(`CinetPay login failed: ${JSON.stringify(data)}`);
  cachedToken   = data.access_token;
  cachedTokenAt = Date.now();
  return cachedToken;
}

async function createCheckout({ amount, transactionId, successUrl, failedUrl, notifyUrl, description }) {
  const token = await login();
  const res   = await cpFetch(`${BASE_URL}/v1/payment`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      currency: "XOF",
      merchant_transaction_id: transactionId,
      amount,
      lang: "fr",
      designation: description,
      success_url: successUrl,
      failed_url: failedUrl,
      notify_url: notifyUrl,
      channel: "PUSH",
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.payment_url) throw new Error(`CinetPay payment creation failed: ${JSON.stringify(data)}`);
  return data.payment_url;
}

// Renvoie "paid" | "failed" | "pending" + le statut brut CinetPay
async function checkStatus(transactionId) {
  const token = await login();
  const res   = await cpFetch(`${BASE_URL}/v1/payment/${transactionId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data  = await res.json();
  const raw   = String(data?.status || "").toUpperCase();
  const state = SUCCESS_STATUSES.includes(raw) ? "paid" : FAIL_STATUSES.includes(raw) ? "failed" : "pending";
  return { state, raw };
}

module.exports = { createCheckout, checkStatus };
