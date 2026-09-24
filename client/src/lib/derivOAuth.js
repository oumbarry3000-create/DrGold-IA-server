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

export async function startDerivOAuth({ signup = false } = {}) {
  const verifier  = randomString(64);
  const state     = randomString(32);
  const challenge = await sha256Base64Url(verifier);
  sessionStorage.setItem("deriv_pkce_verifier", verifier);
  sessionStorage.setItem("deriv_oauth_state", state);
  sessionStorage.setItem("deriv_oauth_signup", signup ? "1" : "0");

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

// Lit et consomme le contexte PKCE stocke avant la redirection
export function takeOAuthContext(returnedState) {
  const verifier = sessionStorage.getItem("deriv_pkce_verifier");
  const state    = sessionStorage.getItem("deriv_oauth_state");
  const signup   = sessionStorage.getItem("deriv_oauth_signup") === "1";
  sessionStorage.removeItem("deriv_pkce_verifier");
  sessionStorage.removeItem("deriv_oauth_state");
  sessionStorage.removeItem("deriv_oauth_signup");
  if (!verifier || !state || state !== returnedState) return null;
  return { verifier, signup };
}
