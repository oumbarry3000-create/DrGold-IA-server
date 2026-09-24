// src/lib/api.js
// Toutes les donnees (parametres EA, statut, trades) passent desormais par
// l'API du serveur au lieu de Firestore directement - chaque appel est
// authentifie avec le token ID Firebase courant.
import { auth } from "./firebase";

const SERVER_URL = import.meta.env.VITE_SERVER_URL;

async function authFetch(path, options = {}) {
  const user = auth.currentUser;
  if (!user) throw new Error("Non connecté");
  const idToken = await user.getIdToken();
  const res = await fetch(`${SERVER_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Erreur ${res.status}`);
  }
  return res.json();
}

export async function encryptToken(token) {
  const res = await fetch(`${SERVER_URL}/encrypt-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  if (!res.ok) throw new Error("Échec chiffrement token Deriv");
  const { encrypted } = await res.json();
  return encrypted;
}

export const api = {
  register: (token_encrypted) => authFetch("/api/register", { method: "POST", body: JSON.stringify({ token_encrypted }) }),
  me: () => authFetch("/api/me"),
  saveSettings: (params) => authFetch("/api/settings", { method: "PUT", body: JSON.stringify({ params }) }),
  updateDerivToken: (token) => authFetch("/api/deriv-token", { method: "PUT", body: JSON.stringify({ token }) }),
  toggleEA: () => authFetch("/api/ea/toggle", { method: "POST" }),
};
