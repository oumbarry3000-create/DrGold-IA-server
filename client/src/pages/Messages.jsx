// src/pages/Messages.jsx
// Espace messages du trader : conversation avec le support + annonces.
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { ui } from "../lib/ui";
import Chat, { Attachment } from "../components/Chat";

export default function Messages() {
  const navigate = useNavigate();
  const [tab, setTab]           = useState(new URLSearchParams(window.location.search).get("tab") === "annonces" ? "annonces" : "support");
  const [messages, setMessages] = useState([]);
  const [annonces, setAnnonces] = useState(null);
  const [uploads, setUploads]   = useState(false);
  const [error, setError]       = useState(null);

  const loadMessages = useCallback(async () => {
    try {
      const { messages } = await api.messages();
      setMessages(messages);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    api.inboxStatus().then((s) => setUploads(s.uploads)).catch(() => {});
    loadMessages();
    const t = setInterval(loadMessages, 10000);
    return () => clearInterval(t);
  }, [loadMessages]);

  useEffect(() => {
    if (tab === "annonces" && annonces === null) {
      api.announcements().then((r) => setAnnonces(r.announcements)).catch((err) => setError(err.message));
    }
  }, [tab, annonces]);

  async function send(body, attachment) {
    await api.sendMessage(body, attachment);
    await loadMessages();
  }

  return (
    <div style={{ ...ui.page, maxWidth: 820 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 18 }}>
        <h1 style={{ color: "#f1f5f9", fontSize: 22, fontWeight: 800, margin: 0 }}>💬 Messages</h1>
        <button style={ui.btnDark} onClick={() => navigate("/dashboard")}>← Tableau de bord</button>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        {[["support", "Support"], ["annonces", "Annonces"]].map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            style={{ ...ui.btnSm, ...(tab === k ? { background: "#f59e0b", color: "#060d1a", border: "1px solid #f59e0b" } : {}) }}>
            {label}
          </button>
        ))}
      </div>
      {error && <div style={ui.error}>{error}</div>}

      {tab === "support" ? (
        <div style={ui.box}>
          <p style={ui.muted}>Une question sur le bot, votre abonnement ou votre compte Deriv ? Écrivez-nous, nous répondons ici (et par email).</p>
          <Chat messages={messages} mySide="client" onSend={send} uploads={uploads}
            emptyText="Aucun message pour l'instant. Écrivez-nous !" />
        </div>
      ) : (
        <div>
          {annonces === null ? <p style={ui.muted}>Chargement…</p>
            : annonces.length === 0 ? <div style={ui.box}><p style={{ ...ui.muted, margin: 0, textAlign: "center" }}>Aucune annonce pour le moment</p></div>
            : annonces.map((a) => (
              <div key={a.id} style={ui.box}>
                <p style={{ color: "#64748b", fontSize: 11, margin: "0 0 6px" }}>{new Date(a.created_at).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" })}</p>
                <h3 style={{ color: "#f59e0b", fontSize: 16, fontWeight: 800, margin: "0 0 8px" }}>📢 {a.title}</h3>
                {a.attachment_url && <Attachment m={a} />}
                <p style={{ color: "#cbd5e1", fontSize: 14, lineHeight: 1.6, margin: 0, whiteSpace: "pre-wrap" }}>{a.body}</p>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
