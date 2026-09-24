// src/lib/ui.js
// Styles partages des nouvelles pages (meme palette que le tableau de bord).
export const ui = {
  page:    { width: "100%" },
  center:  { minHeight: "100vh", background: "#060d1a", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, fontFamily: "'Inter', sans-serif" },
  box:     { background: "#0d1829", border: "1px solid #1e3a5f", borderRadius: 14, padding: 20, marginBottom: 20 },
  h2:      { color: "#f1f5f9", fontSize: 18, fontWeight: 800, margin: "12px 0 8px" },
  h3:      { color: "#94a3b8", fontSize: 13, fontWeight: 700, margin: "0 0 14px" },
  muted:   { color: "#64748b", fontSize: 13, lineHeight: 1.6, margin: "0 0 16px" },
  btnGold: { background: "linear-gradient(135deg, #f59e0b, #d97706)", color: "#060d1a", border: "none", borderRadius: 10, padding: "11px 18px", fontSize: 14, fontWeight: 800, cursor: "pointer" },
  btnDark: { background: "#1e3a5f", color: "#f1f5f9", border: "1px solid #2d4a6f", borderRadius: 10, padding: "10px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" },
  btnRed:  { background: "#7f1d1d33", color: "#fca5a5", border: "1px solid #ef444455", borderRadius: 8, padding: "6px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer" },
  btnSm:   { background: "#1e3a5f", color: "#f1f5f9", border: "1px solid #2d4a6f", borderRadius: 8, padding: "6px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer" },
  input:   { background: "#0a1525", border: "1px solid #1e3a5f", borderRadius: 10, padding: "10px 12px", color: "#f1f5f9", fontSize: 14, outline: "none", width: "100%", boxSizing: "border-box" },
  error:   { background: "#7f1d1d33", border: "1px solid #ef444455", borderRadius: 8, padding: "10px 14px", color: "#fca5a5", fontSize: 13, margin: "10px 0" },
  ok:      { background: "#14532d33", border: "1px solid #22c55e44", borderRadius: 8, padding: "10px 14px", color: "#86efac", fontSize: 13, margin: "10px 0" },
  badge:   (bg, fg) => ({ display: "inline-block", background: bg, color: fg, borderRadius: 999, padding: "3px 10px", fontSize: 11, fontWeight: 800 }),
};

export const fmtXof = (n) => `${Number(n || 0).toLocaleString("fr-FR")} FCFA`;
export const fmtUsd = (n) => `${Number(n || 0).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} $`;
export const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("fr-FR") : "—");
