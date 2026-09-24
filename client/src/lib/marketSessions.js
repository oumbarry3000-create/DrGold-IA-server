// src/lib/marketSessions.js
// Sessions de marche configurables, en heures UTC (le Burkina Faso est en
// UTC). Affichees dans le fuseau du navigateur de l'utilisateur.
export const SESSIONS = [
  { id: "tokyo",   name: "Tokyo (Asie)", startUtc: 0,  endUtc: 6,  color: "#a78bfa" },
  { id: "london",  name: "Londres",      startUtc: 9,  endUtc: 17, color: "#22c55e" },
  { id: "newyork", name: "New York",     startUtc: 14, endUtc: 22, color: "#f5b91a" },
];
// Deriv ferme l'or chaque jour de 21:00 a 00:00 UTC, et le week-end
export const GOLD_BREAK_UTC = { start: 21, end: 24 };

const fmtHour = (h) => {
  const d = new Date();
  d.setUTCHours(h % 24, 0, 0, 0);
  return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
};

export function sessionState(s, now = new Date()) {
  const day = now.getUTCDay(); // 0 dimanche, 6 samedi
  const h = now.getUTCHours() + now.getUTCMinutes() / 60;
  const hours = `${fmtHour(s.startUtc)} – ${fmtHour(s.endUtc)}`;
  if (day === 0 || day === 6) return { status: "closed", label: "Fermée", hours, progress: 0 };
  if (h >= s.startUtc && h < s.endUtc) {
    const left = Math.round((s.endUtc - h) * 60);
    return { status: "open", label: "En cours", hours, progress: ((h - s.startUtc) / (s.endUtc - s.startUtc)) * 100,
      detail: left >= 60 ? `${Math.floor(left / 60)} h ${String(left % 60).padStart(2, "0")}` : `${left} min` };
  }
  if (h < s.startUtc) return { status: "soon", label: "À venir", hours, progress: 0 };
  return { status: "closed", label: "Fermée", hours, progress: 0 };
}

export function goldMarketOpen(now = new Date()) {
  const day = now.getUTCDay();
  const h = now.getUTCHours();
  if (day === 6 || (day === 0 && h < 23)) return false;
  return !(h >= GOLD_BREAK_UTC.start && h < GOLD_BREAK_UTC.end);
}

export const goldBreakLabel = () => `${fmtHour(GOLD_BREAK_UTC.start)} – ${fmtHour(GOLD_BREAK_UTC.end)}`;
