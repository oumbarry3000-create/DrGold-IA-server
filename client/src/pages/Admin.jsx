// src/pages/Admin.jsx
// Espace administrateur : validation des traders (verifier dans le tableau
// de bord affilie Deriv que le compte a ete cree via le lien), formules,
// arret du bot, statistiques globales et paiements.
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { ui, fmtXof, fmtDate } from "../lib/ui";

const FILTERS = [
  ["all", "Tous"],
  ["pending", "Non liés / suspendus"],
  ["active", "Bot actif"],
  ["pro", "Pro"],
];

export default function Admin() {
  const navigate = useNavigate();
  const [data, setData]     = useState(null);
  const [error, setError]   = useState(null);
  const [filter, setFilter] = useState("all");
  const [busy, setBusy]     = useState(null);

  const load = useCallback(async () => {
    try {
      setData(await api.adminUsers());
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  async function act(uid, body, confirmText) {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(uid);
    try {
      await api.adminUpdate(uid, body);
      await load();
    } catch (err) {
      alert(err.message);
    } finally {
      setBusy(null);
    }
  }

  if (error && !data) {
    return (
      <div style={ui.center}>
        <div style={{ ...ui.box, maxWidth: 420, textAlign: "center" }}>
          <h2 style={ui.h2}>Accès refusé</h2>
          <p style={ui.muted}>{error}</p>
          <button style={ui.btnGold} onClick={() => navigate("/dashboard")}>Retour</button>
        </div>
      </div>
    );
  }
  if (!data) return <div style={ui.page}><p style={ui.muted}>Chargement…</p></div>;

  const users = data.users;
  const shown = users.filter((u) =>
    filter === "pending" ? !u.approved :
    filter === "active"  ? u.ea_active :
    filter === "pro"     ? u.pro_active : true);

  const paid      = data.payments.filter((p) => p.status === "paid");
  const revenue30 = paid.filter((p) => new Date(p.paid_at) > Date.now() - 30 * 86400000).reduce((a, p) => a + p.amount, 0);
  const totals = {
    traders: users.length,
    pending: users.filter((u) => !u.approved).length,
    active:  users.filter((u) => u.ea_active).length,
    pro:     users.filter((u) => u.pro_active).length,
    pnl:     users.reduce((a, u) => a + (u.pnl_total || 0), 0),
  };

  return (
    <div style={ui.page}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 20 }}>
        <h1 style={{ color: "#f1f5f9", fontSize: 22, fontWeight: 800, margin: 0 }}>🛡️ Administration <span style={{ color: "#f59e0b" }}>DrGold IA</span></h1>
        <button style={ui.btnDark} onClick={() => navigate("/dashboard")}>← Mon tableau de bord</button>
      </div>

      <div style={st.kpis}>
        <Kpi label="Traders" value={totals.traders} />
        <Kpi label="Non liés / suspendus" value={totals.pending} color={totals.pending ? "#f59e0b" : undefined} />
        <Kpi label="Bots actifs" value={totals.active} color="#22c55e" />
        <Kpi label="Abonnés Pro" value={totals.pro} color="#a78bfa" />
        <Kpi label="Revenus 30 j" value={fmtXof(revenue30)} color="#f59e0b" />
        <Kpi label="P&L clients" value={`${totals.pnl >= 0 ? "+" : ""}$${totals.pnl.toFixed(2)}`} color={totals.pnl >= 0 ? "#22c55e" : "#ef4444"} />
      </div>

      <div style={{ ...ui.box, padding: "12px 16px" }}>
        <p style={{ ...ui.muted, margin: 0 }}>
          ✅ Les traders sont <strong style={{ color: "#f1f5f9" }}>validés automatiquement</strong> dès qu'ils connectent Deriv.
          « Via lien » = compte Deriv créé avec votre lien partenaire. « Suspendre » coupe l'accès et arrête le bot.
        </p>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        {FILTERS.map(([k, label]) => (
          <button key={k} onClick={() => setFilter(k)}
            style={{ ...ui.btnSm, ...(filter === k ? { background: "#f59e0b", color: "#060d1a", border: "1px solid #f59e0b" } : {}) }}>
            {label}
          </button>
        ))}
      </div>

      <div style={{ ...ui.box, overflowX: "auto" }}>
        {shown.length === 0 ? <p style={{ ...ui.muted, textAlign: "center", margin: 20 }}>Aucun trader dans cette liste</p> : (
          <table style={st.table}>
            <thead>
              <tr>{["Trader", "Comptes Deriv", "Statut", "Formule", "Bot", "Résultats", "Actions"].map((h) => <th key={h} style={st.th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {shown.map((u) => (
                <tr key={u.uid} style={{ borderBottom: "1px solid #0f2040", opacity: busy === u.uid ? 0.5 : 1 }}>
                  <td style={st.td}>
                    <div style={{ color: "#f1f5f9", fontWeight: 600 }}>{u.email}</div>
                    <div style={st.sub}>Inscrit le {fmtDate(u.created_at)}{u.phone ? ` · ${u.phone}` : ""}</div>
                  </td>
                  <td style={st.td}>
                    {(u.deriv_accounts || []).length === 0 ? <span style={st.sub}>Non lié</span> :
                      u.deriv_accounts.map((a) => (
                        <div key={a.account_id} style={{ fontFamily: "monospace", fontSize: 12, color: a.account_type === "real" ? "#f1f5f9" : "#64748b" }}>
                          {a.account_id} <span style={st.sub}>({a.account_type})</span>
                        </div>
                      ))}
                    {u.deriv_signup_via_app && <span style={ui.badge("#14532d55", "#86efac")}>Via lien</span>}
                  </td>
                  <td style={st.td}>
                    {!u.has_deriv_access ? <span style={ui.badge("#1e293b", "#94a3b8")}>Deriv non lié</span>
                      : u.approved ? <span style={ui.badge("#14532d55", "#86efac")}>Actif</span>
                      : <span style={ui.badge("#7f1d1d55", "#fca5a5")}>Suspendu</span>}
                    <div style={st.sub}>{u.has_token ? `Token 24h/24 : ${u.token_age_days ?? "?"} j` : u.deriv_reauth_needed ? "Reconnexion requise" : u.has_deriv_access ? "OAuth" : ""}</div>
                  </td>
                  <td style={st.td}>
                    {u.pro_active ? <span style={ui.badge("#4c1d9555", "#c4b5fd")}>Pro</span> : <span style={ui.badge("#1e293b", "#94a3b8")}>Basique</span>}
                    {u.pro_active && <div style={st.sub}>jusqu'au {fmtDate(u.plan_expires_at)}</div>}
                  </td>
                  <td style={st.td}>
                    <span style={{ color: u.ea_active ? "#22c55e" : "#64748b", fontWeight: 700 }}>{u.ea_active ? "● Actif" : "○ Arrêté"}</span>
                    <div style={st.sub}>{u.effective_account_type === "real" ? "Compte réel" : "Démo"}{u.deriv_connected ? " · connecté" : ""}</div>
                  </td>
                  <td style={st.td}>
                    <div style={{ color: u.pnl_total >= 0 ? "#22c55e" : "#ef4444", fontWeight: 700 }}>{u.pnl_total >= 0 ? "+" : ""}${u.pnl_total.toFixed(2)}</div>
                    <div style={st.sub}>
                      {u.trades_closed} trades · {u.trades_closed ? Math.round((u.wins / u.trades_closed) * 100) : 0}% gagnants
                      · auj. {u.pnl_today >= 0 ? "+" : ""}{u.pnl_today.toFixed(2)}$
                    </div>
                  </td>
                  <td style={{ ...st.td, whiteSpace: "nowrap" }}>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", maxWidth: 220 }}>
                      {u.approved
                        ? <button style={ui.btnRed} disabled={busy === u.uid} onClick={() => act(u.uid, { approved: false }, `Suspendre ${u.email} ? Son bot sera arrêté.`)}>Suspendre</button>
                        : <button style={{ ...ui.btnSm, background: "#166534", border: "1px solid #22c55e" }} disabled={busy === u.uid} onClick={() => act(u.uid, { approved: true })}>Réactiver</button>}
                      <button style={ui.btnSm} disabled={busy === u.uid} onClick={() => act(u.uid, { grantProDays: 30 }, `Offrir 30 jours de Pro à ${u.email} ?`)}>+30 j Pro</button>
                      {u.pro_active && <button style={ui.btnRed} disabled={busy === u.uid} onClick={() => act(u.uid, { revokePro: true }, `Retirer le Pro de ${u.email} ? Il repassera en démo.`)}>Retirer Pro</button>}
                      {u.ea_active && <button style={ui.btnRed} disabled={busy === u.uid} onClick={() => act(u.uid, { stopEA: true }, `Arrêter le bot de ${u.email} ?`)}>Stop bot</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div style={{ ...ui.box, overflowX: "auto" }}>
        <h3 style={ui.h3}>💳 Derniers paiements</h3>
        {data.payments.length === 0 ? <p style={ui.muted}>Aucun paiement</p> : (
          <table style={st.table}>
            <thead><tr>{["Référence", "Trader", "Montant", "Statut", "Date"].map((h) => <th key={h} style={st.th}>{h}</th>)}</tr></thead>
            <tbody>
              {data.payments.map((p) => (
                <tr key={p.id} style={{ borderBottom: "1px solid #0f2040" }}>
                  <td style={{ ...st.td, fontFamily: "monospace" }}>{p.id}</td>
                  <td style={st.td}>{users.find((u) => u.uid === p.uid)?.email || p.uid}</td>
                  <td style={st.td}>{fmtXof(p.amount)}</td>
                  <td style={st.td}>
                    {p.status === "paid" ? <span style={ui.badge("#14532d55", "#86efac")}>Payé</span>
                      : p.status === "failed" ? <span style={ui.badge("#7f1d1d55", "#fca5a5")}>Échoué</span>
                      : p.status === "expired" ? <span style={ui.badge("#1e293b", "#64748b")}>Expiré</span>
                      : <span style={ui.badge("#78350f55", "#fcd34d")}>En attente</span>}
                  </td>
                  <td style={st.td}>{fmtDate(p.paid_at || p.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Kpi({ label, value, color }) {
  return (
    <div style={{ background: "#0d1829", border: "1px solid #1e3a5f", borderRadius: 12, padding: "14px 16px" }}>
      <p style={{ color: "#475569", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", margin: "0 0 6px" }}>{label}</p>
      <p style={{ color: color || "#f1f5f9", fontSize: 20, fontWeight: 800, margin: 0 }}>{value}</p>
    </div>
  );
}

const st = {
  kpis:  { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12, marginBottom: 20 },
  table: { width: "100%", borderCollapse: "collapse", minWidth: 860 },
  th:    { color: "#475569", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", padding: "8px 10px", borderBottom: "1px solid #1e3a5f", textAlign: "left" },
  td:    { color: "#94a3b8", fontSize: 13, padding: "10px", verticalAlign: "top" },
  sub:   { color: "#475569", fontSize: 11, marginTop: 3 },
};
