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

async function tokenRequest(fields) {
  if (!OAUTH_CLIENT) throw new Error("DERIV_OAUTH_CLIENT_ID manquant sur le serveur");
  const res  = await fetch(DERIV_AUTH, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: OAUTH_CLIENT, ...fields }),
  });
  const body = await readBody(res);
  if (!res.ok || !body.access_token) throw new Error(`OAuth Deriv: ${errMessage(body)}`);
  // Deriv documente un access token de 1 h ; on trace (sans valeurs) ce qui
  // est reellement renvoye pour savoir si un refresh token existe.
  console.log("OAuth Deriv : champs recus =", Object.keys(body).join(","), "| expires_in =", body.expires_in);
  return {
    accessToken:  body.access_token,
    refreshToken: body.refresh_token || null,
    expiresAt:    new Date(Date.now() + (Number(body.expires_in) || 3600) * 1000),
  };
}

// Echange du code OAuth (PKCE) contre les jetons du client
function exchangeOAuthCode({ code, codeVerifier, redirectUri }) {
  return tokenRequest({ grant_type: "authorization_code", code, code_verifier: codeVerifier, redirect_uri: redirectUri });
}

// Renouvellement, si Deriv a fourni un refresh token
function refreshOAuth(refreshToken) {
  return tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken });
}

module.exports = { listAccounts, exchangeOAuthCode, refreshOAuth };
