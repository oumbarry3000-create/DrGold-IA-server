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
  register: (extra = {}) => authFetch("/api/register", { method: "POST", body: JSON.stringify(extra) }),
  me: () => authFetch("/api/me"),
  saveSettings: (params) => authFetch("/api/settings", { method: "PUT", body: JSON.stringify({ params }) }),
  updateDerivToken: (token) => authFetch("/api/deriv-token", { method: "PUT", body: JSON.stringify({ token }) }),
  linkDerivOAuth: (code, code_verifier, signup) =>
    authFetch("/api/deriv/oauth", { method: "POST", body: JSON.stringify({ code, code_verifier, signup }) }),
  setAccountType: (type) => authFetch("/api/account-type", { method: "PUT", body: JSON.stringify({ type }) }),
  toggleEA: () => authFetch("/api/ea/toggle", { method: "POST" }),
  startCheckout: () => authFetch("/api/payment/checkout", { method: "POST" }),
  paymentStatus: (id) => authFetch(`/api/payment/${encodeURIComponent(id)}`),
  adminUsers: () => authFetch("/api/admin/users"),
  inboxStatus: () => authFetch("/api/inbox/status"),
  messages: () => authFetch("/api/messages"),
  sendMessage: (body, attachment) => authFetch("/api/messages", { method: "POST", body: JSON.stringify({ body, attachment }) }),
  announcements: () => authFetch("/api/announcements"),
  uploadSignature: () => authFetch("/api/upload-signature"),
  adminConversations: () => authFetch("/api/admin/conversations"),
  adminMessages: (uid) => authFetch(`/api/admin/messages/${encodeURIComponent(uid)}`),
  adminSendMessage: (uid, body, attachment) =>
    authFetch(`/api/admin/messages/${encodeURIComponent(uid)}`, { method: "POST", body: JSON.stringify({ body, attachment }) }),
  adminAnnouncements: () => authFetch("/api/admin/announcements"),
  adminPostAnnouncement: (data) => authFetch("/api/admin/announcements", { method: "POST", body: JSON.stringify(data) }),
  editMessage: (id, body) => authFetch(`/api/messages/${id}`, { method: "PUT", body: JSON.stringify({ body }) }),
  deleteMessage: (id) => authFetch(`/api/messages/${id}`, { method: "DELETE" }),
  adminEditMessage: (id, body) => authFetch(`/api/admin/messages/${id}`, { method: "PUT", body: JSON.stringify({ body }) }),
  adminDeleteMessage: (id) => authFetch(`/api/admin/messages/${id}`, { method: "DELETE" }),
  adminEditAnnouncement: (id, data) => authFetch(`/api/admin/announcements/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  adminDeleteAnnouncement: (id) => authFetch(`/api/admin/announcements/${id}`, { method: "DELETE" }),
  adminDeleteUser: (uid) => authFetch(`/api/admin/users/${encodeURIComponent(uid)}`, { method: "DELETE" }),
  unlinkDeriv: () => authFetch("/api/deriv/unlink", { method: "POST" }),
  deleteAccount: () => authFetch("/api/me", { method: "DELETE", body: JSON.stringify({ confirm: "SUPPRIMER" }) }),
  assistantStatus: () => authFetch("/api/assistant/status"),
  askAssistant: (messages) => authFetch("/api/assistant", { method: "POST", body: JSON.stringify({ messages }) }),
  adminUpdate: (uid, body) => authFetch(`/api/admin/users/${encodeURIComponent(uid)}`, { method: "POST", body: JSON.stringify(body) }),
};
