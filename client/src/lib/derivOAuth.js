// src/lib/derivOAuth.js
// Connexion "Se connecter avec Deriv" (OAuth 2.0 + PKCE). Le bouton
// "Créer mon compte Deriv" passe prompt=registration + le token d'affiliation,
// pour que les nouveaux comptes soient rattachés au lien partenaire.
const CLIENT_ID      = import.meta.env.VITE_DERIV_OAUTH_CLIENT_ID || "34uv2zIlqjN1YeihyQGuD";
const AFFILIATE_T    = import.meta.env.VITE_DERIV_AFFILIATE_T || "WWGJVYTZUF3U";
const AFFILIATE_CODE = import.meta.env.VITE_DERIV_AFFILIATE_CODE || "AERBRVHW8PAN";
export const AFFILIATE_LINK = `https://t.deriv.link?t=${AFFILIATE_T}`;

const AUTH_URL = "https://auth.deriv.com/oauth2/auth";
const CHARSET  = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";

function randomString(length) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => CHARSET[b % CHARSET.length]).join("");
}

async function sha256Base64Url(text) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function redirectUri() {
  return `${window.location.origin}/deriv-callback`;
}

// mode "link" : lier Deriv au compte Tradify connecte ; "login" : se connecter a Tradify avec Deriv
export async function startDerivOAuth({ signup = false, mode = "link" } = {}) {
  const verifier  = randomString(64);
  const state     = randomString(32);
  const challenge = await sha256Base64Url(verifier);
  // localStorage (et non sessionStorage) : la creation de compte Deriv passe
  // souvent par un email de verification qui rouvre le site dans un NOUVEL
  // onglet. Contexte indexe par "state", valable 30 min.
  saveContexts({ ...loadContexts(), [state]: { verifier, signup, mode, at: Date.now() } });

  const params = new URLSearchParams({
    response_type: "code",
    client_id: CLIENT_ID,
    redirect_uri: redirectUri(),
    scope: "trade",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  if (signup) {
    params.set("prompt", "registration");
    params.set("t", AFFILIATE_T);
    params.set("utm_medium", "affiliate");
    params.set("utm_source", AFFILIATE_CODE);
  }
  window.location.href = `${AUTH_URL}?${params}`;
}

const STORE_KEY = "deriv_oauth_ctx";
const MAX_AGE   = 30 * 60 * 1000;

function loadContexts() {
  try {
    const all = JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
    // on ne garde que les contextes recents
    return Object.fromEntries(Object.entries(all).filter(([, c]) => Date.now() - c.at < MAX_AGE));
  } catch {
    return {};
  }
}

function saveContexts(all) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(all)); } catch { /* stockage indisponible */ }
}

// Lit et consomme le contexte PKCE stocke avant la redirection
export function takeOAuthContext(returnedState) {
  const all = loadContexts();
  const ctx = returnedState ? all[returnedState] : null;
  if (ctx) {
    delete all[returnedState];
    saveContexts(all);
  }
  return ctx ? { verifier: ctx.verifier, signup: !!ctx.signup, mode: ctx.mode || "link" } : null;
}
