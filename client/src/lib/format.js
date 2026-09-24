// src/lib/format.js — formatage partage (montants, dates, initiales)
export const money = (n, { sign = false } = {}) => {
  if (n == null || Number.isNaN(Number(n))) return "—";
  const v = Number(n);
  const s = `$${Math.abs(v).toFixed(2)}`;
  if (!sign) return v < 0 ? `-${s}` : s;
  return v > 0 ? `+${s}` : v < 0 ? `-${s}` : s;
};
export const price = (n) => (n == null ? "—" : Number(n).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
export const pct = (n) => `${Number(n || 0).toFixed(1)}%`;
export const dateTime = (d) => (d ? new Date(d).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "—");
export const dateShort = (d) => (d ? new Date(d).toLocaleDateString("fr-FR") : "—");
export const isDemoAccount = (id) => /^(DOT|VRT)/i.test(id || "");

export function initials(user) {
  const src = (user?.display_name || user?.email || "?").trim();
  const parts = src.split(/[\s@._-]+/).filter(Boolean);
  return ((parts[0]?.[0] || "?") + (parts[1]?.[0] || "")).toUpperCase();
}
export function displayName(user) {
  if (user?.display_name) return user.display_name;
  return (user?.email || "").split("@")[0];
}

// Temps restant avant une date, format "12 min" / "1 h 05"
export function countdown(iso) {
  const ms = new Date(iso).getTime() - Date.now();
  if (!iso || ms <= 0) return "échéance";
  const m = Math.round(ms / 60000);
  return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}` : `${m} min`;
}
