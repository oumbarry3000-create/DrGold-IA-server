// server/src/derivApi.js
// Appels REST a la nouvelle API Deriv (api.derivws.com) utilises par les
// routes : echange OAuth et verification d'un token PAT.
const DERIV_API    = "https://api.derivws.com/trading/v1/options";
const DERIV_AUTH   = "https://auth.deriv.com/oauth2/token";
const DERIV_APP_ID = process.env.DERIV_APP_ID;             // app PAT (bot)
const OAUTH_CLIENT = process.env.DERIV_OAUTH_CLIENT_ID;    // app OAuth (liaison)

async function readBody(res) {
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { message: text }; }
}

function errMessage(body) {
  return body?.errors?.[0]?.message || body?.error_description || body?.error?.message ||
    body?.error || body?.message || "erreur inconnue";
}

// Garde uniquement les champs utiles (jamais de solde ni de secret en base)
function normalizeAccounts(body) {
  const list = Array.isArray(body?.data) ? body.data : Array.isArray(body) ? body : (body?.data?.accounts || []);
  return list.map((a) => ({
    account_id:   a.account_id || a.accountId || a.loginid || a.id,
    account_type: a.account_type || a.type || (/^(VRT|DOT)/i.test(a.account_id || "") ? "demo" : "real"),
    currency:     a.currency || null,
  }));
}

async function listAccounts(bearer, { pat = false } = {}) {
  const headers = { Authorization: `Bearer ${bearer}` };
  if (pat) headers["Deriv-App-ID"] = DERIV_APP_ID || "";
  const res  = await fetch(`${DERIV_API}/accounts`, { headers });
  const body = await readBody(res);
  if (!res.ok) throw new Error(`Deriv ${res.status}: ${errMessage(body)}`);
  return normalizeAccounts(body);
}

// Echange du code OAuth (PKCE) contre un access token (valide 1 h, pas de
// refresh) : on ne s'en sert que pour lire la liste des comptes du client.
async function exchangeOAuthCode({ code, codeVerifier, redirectUri }) {
  if (!OAUTH_CLIENT) throw new Error("DERIV_OAUTH_CLIENT_ID manquant sur le serveur");
  const form = new URLSearchParams({
    grant_type:    "authorization_code",
    client_id:     OAUTH_CLIENT,
    code,
    code_verifier: codeVerifier,
    redirect_uri:  redirectUri,
  });
  const res  = await fetch(DERIV_AUTH, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
  });
  const body = await readBody(res);
  if (!res.ok || !body.access_token) throw new Error(`OAuth Deriv: ${errMessage(body)}`);
  return body.access_token;
}

module.exports = { listAccounts, exchangeOAuthCode };
