// src/pages/Dashboard.jsx
import { useState, useEffect } from "react";
import { doc, onSnapshot, collection, query, orderBy, limit, setDoc } from "firebase/firestore";
import { auth, db } from "../lib/firebase";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";

export default function Dashboard() {
  const [userData, setUserData]   = useState(null);
  const [trades, setTrades]       = useState([]);
  const [toggling, setToggling]   = useState(false);

  const uid = auth.currentUser?.uid;

  // Listener user doc
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(doc(db, "users", uid), (snap) => {
      setUserData(snap.data());
    });
  }, [uid]);

  // Listener trades (50 derniers)
  useEffect(() => {
    if (!uid) return;
    const q = query(collection(db, "users", uid, "trades"), orderBy("opened_at", "desc"), limit(50));
    return onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() })).reverse();
      setTrades(list);
    });
  }, [uid]);

  async function toggleEA() {
    if (!uid || toggling) return;
    setToggling(true);
    await setDoc(doc(db, "users", uid), { ea_active: !userData?.ea_active }, { merge: true });
    setToggling(false);
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
        <div>
          <h1 style={s.appTitle}>◈ DrGold<span style={s.gold}> IA</span></h1>
          <p style={s.appSub}>XAUUSD · TrendRider</p>
        </div>
        <div style={s.topActions}>
          <a href="/settings" style={s.settingsBtn}>⚙️ Paramètres</a>
          <button
            style={{ ...s.eaToggle, ...(eaActive ? s.eaOn : s.eaOff), ...(toggling ? { opacity: 0.6 } : {}) }}
            onClick={toggleEA} disabled={toggling}>
            {eaActive ? "🟢 EA Actif" : "🔴 EA Inactif"}
          </button>
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
                {t.opened_at?.toDate ? t.opened_at.toDate().toLocaleString("fr-FR") : "—"}
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
  appTitle:     { color: "#f1f5f9", fontSize: 22, fontWeight: 800, margin: "0 0 4px", letterSpacing: "-0.5px" },
  gold:         { color: "#f59e0b" },
  appSub:       { color: "#475569", fontSize: 13, margin: 0 },
  topActions:   { display: "flex", gap: 10, alignItems: "center" },
  settingsBtn:  { background: "#0d1829", border: "1px solid #1e3a5f", borderRadius: 8, padding: "8px 16px", color: "#94a3b8", fontSize: 13, textDecoration: "none", fontWeight: 600 },
  eaToggle:     { border: "none", borderRadius: 8, padding: "8px 18px", fontSize: 13, fontWeight: 800, cursor: "pointer" },
  eaOn:         { background: "#14532d33", color: "#22c55e", border: "1px solid #22c55e44" },
  eaOff:        { background: "#7f1d1d33", color: "#ef4444", border: "1px solid #ef444444" },
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
