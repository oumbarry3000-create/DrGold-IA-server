// src/pages/Dashboard.jsx
import { useState, useEffect, useCallback } from "react";
import { auth } from "../lib/firebase";
import { api } from "../lib/api";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import logo from "../assets/logo.png";
import AccountPanel from "../components/AccountPanel";
import { Link } from "react-router-dom";
import { confirmDialog, notify } from "../components/Dialog";

export default function Dashboard() {
  const [userData, setUserData]   = useState(null);
  const [trades, setTrades]       = useState([]);
  const [toggling, setToggling]   = useState(false);
  const [eaError, setEaError]     = useState(null);
  const [inbox, setInbox]         = useState({ unread: 0, newAnnouncements: 0 });

  const uid = auth.currentUser?.uid;

  const load = useCallback(async () => {
    if (!uid) return;
    try {
      const [{ user, trades }, status] = await Promise.all([api.me(), api.inboxStatus().catch(() => null)]);
      setUserData(user);
      if (status) setInbox(status);
      setTrades(trades.map((t) => ({ id: t.contract_id, ...t })));
    } catch (err) {
      console.error("chargement dashboard:", err.message);
    }
  }, [uid]);

  // Polling (remplace les listeners temps reel Firestore)
  useEffect(() => {
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [load]);

  async function toggleEA() {
    if (!uid || toggling) return;
    if (userData?.ea_active) {
      const ok = await confirmDialog({
        title: "Arrêter le bot ?",
        message: "Le bot ne prendra plus de nouveaux trades. Les positions déjà ouvertes chez Deriv iront jusqu'à leur échéance.",
        confirmLabel: "Arrêter le bot",
        danger: true,
      });
      if (!ok) return;
    }
    setToggling(true); setEaError(null);
    try {
      const { ea_active } = await api.toggleEA();
      setUserData((d) => ({ ...d, ea_active }));
      notify(ea_active ? "Bot activé" : "Bot arrêté");
    } catch (err) {
      setEaError(err.message);
    } finally {
      setToggling(false);
    }
  }

  // Stats calculées
  const closed   = trades.filter((t) => t.status === "closed");
  const open     = trades.filter((t) => t.status === "open");
  const totalPnl = closed.reduce((acc, t) => acc + (t.pnl || 0), 0);
  const wins     = closed.filter((t) => (t.pnl || 0) > 0).length;
  const winRate  = closed.length > 0 ? ((wins / closed.length) * 100).toFixed(1) : "0.0";
  const totalGain= closed.filter(t=>t.pnl>0).reduce((a,t)=>a+t.pnl,0);
  const totalLoss= closed.filter(t=>t.pnl<0).reduce((a,t)=>a+Math.abs(t.pnl),0);

  // Courbe PnL cumulé
  let cumPnl = 0;
  const pnlCurve = closed.map((t, i) => {
    cumPnl += t.pnl || 0;
    return { i: i + 1, pnl: parseFloat(cumPnl.toFixed(2)) };
  });

  const eaActive = userData?.ea_active ?? false;

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.topBar}>
        <div style={s.brand}>
          <img src={logo} alt="DrGold IA" style={s.logoImg} />
          <div>
            <h1 style={s.appTitle}>DrGold<span style={s.gold}> IA</span></h1>
            <p style={s.appSub}>XAUUSD · TrendRider</p>
          </div>
        </div>
        <div style={s.topActions}>
          {userData?.is_admin && <Link to="/admin" style={s.settingsBtn}>🛡️ Admin</Link>}
          <Link to="/messages" style={s.settingsBtn}>
            💬 Messages{inbox.unread > 0 && <span style={s.badge}>{inbox.unread}</span>}
          </Link>
          <Link to="/settings" style={s.settingsBtn}>⚙️ Paramètres</Link>
          <button style={s.settingsBtn} onClick={async () => {
            const ok = await confirmDialog({ title: "Se déconnecter ?", message: "Le bot continue de trader même quand vous êtes déconnecté.", confirmLabel: "Se déconnecter" });
            if (ok) await auth.signOut();
          }}>Déconnexion</button>
          <button
            style={{ ...s.eaToggle, ...(eaActive ? s.eaOn : s.eaOff), ...(toggling ? { opacity: 0.6 } : {}) }}
            onClick={toggleEA} disabled={toggling}>
            {eaActive ? "🟢 EA Actif" : "🔴 EA Inactif"}
          </button>
        </div>
      </div>

      {eaError && <div style={s.eaError}>{eaError}</div>}

      {inbox.newAnnouncements > 0 && (
        <Link to="/messages?tab=annonces" style={s.annBanner}>
          📢 {inbox.newAnnouncements > 1 ? `${inbox.newAnnouncements} nouvelles annonces` : "Nouvelle annonce"} de DrGold IA — cliquez pour lire
        </Link>
      )}

      {userData && <AccountPanel user={userData} onChange={load} />}

      {/* Capital Deriv */}
      <div style={s.derivCard}>
        <div style={s.derivHeader}>
          <h3 style={s.sectionTitle}>💰 Capital Deriv</h3>
          <span style={{ ...s.derivStatus, ...(userData?.deriv_connected ? s.derivOn : s.derivOff) }}>
            {userData?.deriv_connected ? "🟢 Connecté" : "🔴 Déconnecté"}
          </span>
        </div>
        <div style={s.derivBody}>
          <div>
            <p style={s.cardLabel}>Solde</p>
            <p style={s.derivBalance}>
              {userData?.deriv_balance != null
                ? `${userData.deriv_balance.toFixed(2)} ${userData.deriv_currency || "USD"}`
                : "—"}
            </p>
          </div>
          <div>
            <p style={s.cardLabel}>Compte Deriv</p>
            <p style={s.derivLoginId}>
              {userData?.deriv_loginid || "—"}{" "}
              {userData?.deriv_loginid && (
                <span style={{ fontSize: 11, fontWeight: 800, color: /^(DOT|VRT)/.test(userData.deriv_loginid) ? "#60a5fa" : "#f59e0b" }}>
                  {/^(DOT|VRT)/.test(userData.deriv_loginid) ? "DÉMO" : "RÉEL"}
                </span>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div style={s.cards}>
        <StatCard label="P&L Total" value={`${totalPnl >= 0 ? "+" : ""}$${totalPnl.toFixed(2)}`}
          color={totalPnl >= 0 ? "#22c55e" : "#ef4444"} />
        <StatCard label="Win Rate" value={`${winRate}%`} color="#f59e0b" />
        <StatCard label="Trades Fermés" value={closed.length} color="#60a5fa" />
        <StatCard label="Positions Ouvertes" value={open.length} color="#a78bfa" />
        <StatCard label="Gains" value={`+$${totalGain.toFixed(2)}`} color="#22c55e" />
        <StatCard label="Pertes" value={`-$${totalLoss.toFixed(2)}`} color="#ef4444" />
      </div>

      {/* Courbe PnL */}
      <div style={s.chartBox}>
        <h3 style={s.sectionTitle}>📈 Courbe P&L Cumulé</h3>
        {pnlCurve.length > 1 ? (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={pnlCurve}>
              <XAxis dataKey="i" stroke="#1e3a5f" tick={{ fill: "#475569", fontSize: 11 }} />
              <YAxis stroke="#1e3a5f" tick={{ fill: "#475569", fontSize: 11 }} />
              <Tooltip
                contentStyle={{ background: "#0d1829", border: "1px solid #1e3a5f", borderRadius: 8 }}
                labelStyle={{ color: "#64748b" }}
                formatter={(v) => [`$${v}`, "P&L"]} />
              <ReferenceLine y={0} stroke="#334155" strokeDasharray="4 2" />
              <Line type="monotone" dataKey="pnl" stroke="#f59e0b" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div style={s.empty}>Aucun trade fermé pour le moment</div>
        )}
      </div>

      {/* Positions ouvertes */}
      {open.length > 0 && (
        <div style={s.tableBox}>
          <h3 style={s.sectionTitle}>🔓 Positions Ouvertes</h3>
          <TradeTable trades={open} open />
        </div>
      )}

      {/* Historique */}
      <div style={s.tableBox}>
        <h3 style={s.sectionTitle}>📋 Historique des Trades</h3>
        {closed.length === 0
          ? <div style={s.empty}>Aucun trade fermé</div>
          : <TradeTable trades={[...closed].reverse()} />}
      </div>
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div style={s.card}>
      <p style={s.cardLabel}>{label}</p>
      <p style={{ ...s.cardValue, color }}>{value}</p>
    </div>
  );
}

function TradeTable({ trades, open }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={s.table}>
        <thead>
          <tr>
            {["Direction","Lots","Entrée","Sortie","P&L","Ouvert le"].map((h) => (
              <th key={h} style={s.th}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {trades.map((t) => (
            <tr key={t.id} style={s.tr}>
              <td style={s.td}>
                <span style={{ color: t.direction === "BUY" ? "#22c55e" : "#ef4444", fontWeight: 700 }}>
                  {t.direction}
                </span>
              </td>
              <td style={s.td}>{t.lots?.toFixed(2)}</td>
              <td style={s.td}>{t.entry?.toFixed(2)}</td>
              <td style={s.td}>{open ? <span style={{ color: "#f59e0b" }}>En cours</span> : t.exit?.toFixed(2)}</td>
              <td style={s.td}>
                <span style={{ color: open ? "#f59e0b" : (t.pnl >= 0 ? "#22c55e" : "#ef4444"), fontWeight: 600 }}>
                  {open ? "—" : `${t.pnl >= 0 ? "+" : ""}$${t.pnl?.toFixed(2)}`}
                </span>
              </td>
              <td style={s.td}>
                {t.opened_at ? new Date(t.opened_at).toLocaleString("fr-FR") : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const s = {
  page:         { minHeight: "100vh", background: "#060d1a", padding: "24px 20px", fontFamily: "'Inter', sans-serif", maxWidth: 960, margin: "0 auto" },
  topBar:       { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28, flexWrap: "wrap", gap: 12 },
  brand:        { display: "flex", alignItems: "center", gap: 12 },
  logoImg:      { width: 40, height: 40, borderRadius: 10 },
  appTitle:     { color: "#f1f5f9", fontSize: 22, fontWeight: 800, margin: "0 0 4px", letterSpacing: "-0.5px" },
  gold:         { color: "#f59e0b" },
  appSub:       { color: "#475569", fontSize: 13, margin: 0 },
  topActions:   { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" },
  badge:        { marginLeft: 6, background: "#f59e0b", color: "#060d1a", borderRadius: 999, padding: "1px 7px", fontSize: 11, fontWeight: 800 },
  annBanner:    { display: "block", background: "#78350f33", border: "1px solid #f59e0b66", borderRadius: 10, padding: "12px 16px", color: "#fcd34d", fontSize: 14, fontWeight: 600, textDecoration: "none", marginBottom: 16 },
  eaError:      { background: "#7f1d1d33", border: "1px solid #ef444455", borderRadius: 8, padding: "10px 14px", color: "#fca5a5", fontSize: 13, marginBottom: 16 },
  settingsBtn:  { background: "#0d1829", border: "1px solid #1e3a5f", borderRadius: 8, padding: "8px 16px", color: "#94a3b8", fontSize: 13, textDecoration: "none", fontWeight: 600, cursor: "pointer" },
  eaToggle:     { border: "none", borderRadius: 8, padding: "8px 18px", fontSize: 13, fontWeight: 800, cursor: "pointer" },
  eaOn:         { background: "#14532d33", color: "#22c55e", border: "1px solid #22c55e44" },
  eaOff:        { background: "#7f1d1d33", color: "#ef4444", border: "1px solid #ef444444" },
  derivCard:    { background: "#0d1829", border: "1px solid #1e3a5f", borderRadius: 14, padding: 20, marginBottom: 20 },
  derivHeader:  { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 },
  derivStatus:  { fontSize: 12, fontWeight: 800, padding: "5px 12px", borderRadius: 999 },
  derivOn:      { background: "#14532d33", color: "#22c55e", border: "1px solid #22c55e44" },
  derivOff:     { background: "#7f1d1d33", color: "#ef4444", border: "1px solid #ef444444" },
  derivBody:    { display: "flex", gap: 32, flexWrap: "wrap" },
  derivBalance: { color: "#f59e0b", fontSize: 26, fontWeight: 800, margin: 0 },
  derivLoginId: { color: "#f1f5f9", fontSize: 18, fontWeight: 700, margin: 0 },
  cards:        { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 12, marginBottom: 24 },
  card:         { background: "#0d1829", border: "1px solid #1e3a5f", borderRadius: 12, padding: "16px 18px" },
  cardLabel:    { color: "#475569", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", margin: "0 0 8px" },
  cardValue:    { fontSize: 22, fontWeight: 800, margin: 0 },
  chartBox:     { background: "#0d1829", border: "1px solid #1e3a5f", borderRadius: 14, padding: 20, marginBottom: 20 },
  tableBox:     { background: "#0d1829", border: "1px solid #1e3a5f", borderRadius: 14, padding: 20, marginBottom: 20 },
  sectionTitle: { color: "#94a3b8", fontSize: 13, fontWeight: 700, margin: "0 0 16px" },
  empty:        { color: "#334155", fontSize: 14, textAlign: "center", padding: "32px 0" },
  table:        { width: "100%", borderCollapse: "collapse" },
  th:           { color: "#475569", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", padding: "8px 12px", borderBottom: "1px solid #1e3a5f", textAlign: "left" },
  tr:           { borderBottom: "1px solid #0f2040" },
  td:           { color: "#94a3b8", fontSize: 13, padding: "10px 12px" },
};
