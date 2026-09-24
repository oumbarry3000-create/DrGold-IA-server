// src/components/AdminMessaging.jsx
// Onglets "Messages" (conversations support) et "Annonces" de l'admin.
import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { uploadFile, ACCEPT } from "../lib/upload";
import { ui, fmtDate } from "../lib/ui";
import Chat from "./Chat";

export function AdminInbox({ startUid }) {
  const [data, setData]         = useState(null);
  const [current, setCurrent]   = useState(startUid || null);
  const [thread, setThread]     = useState(null);
  const [error, setError]       = useState(null);

  const loadList = useCallback(async () => {
    try { setData(await api.adminConversations()); } catch (err) { setError(err.message); }
  }, []);
  const loadThread = useCallback(async (uid) => {
    if (!uid) return;
    try { setThread(await api.adminMessages(uid)); } catch (err) { setError(err.message); }
  }, []);

  useEffect(() => {
    loadList();
    const t = setInterval(loadList, 15000);
    return () => clearInterval(t);
  }, [loadList]);

  useEffect(() => {
    setThread(null);
    loadThread(current);
    const t = setInterval(() => loadThread(current), 10000);
    return () => clearInterval(t);
  }, [current, loadThread]);

  async function reply(body, attachment) {
    await api.adminSendMessage(current, body, attachment);
    await Promise.all([loadThread(current), loadList()]);
  }

  if (!data) return <p style={ui.muted}>{error || "Chargement…"}</p>;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 300px) 1fr", gap: 16 }} className="dg-inbox">
      <style>{`@media (max-width: 720px) { .dg-inbox { grid-template-columns: 1fr !important; } }`}</style>
      <div style={{ ...ui.box, padding: 0, overflow: "hidden", marginBottom: 0 }}>
        {!data.emailEnabled && <p style={{ ...ui.muted, fontSize: 11, padding: "10px 14px", margin: 0, borderBottom: "1px solid #1e3a5f" }}>✉️ Emails désactivés (clé Resend manquante)</p>}
        {data.conversations.length === 0 && <p style={{ ...ui.muted, padding: 16, margin: 0 }}>Aucune conversation</p>}
        {data.conversations.map((c) => (
          <button key={c.uid} onClick={() => setCurrent(c.uid)} style={{
            display: "block", width: "100%", textAlign: "left", border: "none", borderBottom: "1px solid #1e3a5f", cursor: "pointer",
            padding: "12px 14px", background: current === c.uid ? "#1e3a5f" : "transparent",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <span style={{ color: "#f1f5f9", fontWeight: 700, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.email}</span>
              {c.unread > 0 && <span style={ui.badge("#f59e0b", "#060d1a")}>{c.unread}</span>}
            </div>
            <div style={{ color: "#64748b", fontSize: 12, marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {c.last_sender === "admin" ? "Vous : " : ""}{c.last_body || (c.last_attachment ? "📎 Pièce jointe" : "")}
            </div>
            <div style={{ color: "#475569", fontSize: 10, marginTop: 2 }}>{fmtDate(c.last_at)}{c.pro_active ? " · Pro" : ""}</div>
          </button>
        ))}
      </div>
      <div style={{ ...ui.box, marginBottom: 0 }}>
        {!current ? <p style={{ ...ui.muted, textAlign: "center", marginTop: 40 }}>Choisissez une conversation</p>
          : !thread ? <p style={ui.muted}>Chargement…</p>
          : (
            <>
              <h3 style={ui.h3}>💬 {thread.user?.email}</h3>
              <Chat messages={thread.messages} mySide="admin" onSend={reply} uploads={data.uploads} emptyText="Aucun message" height={380} />
            </>
          )}
      </div>
    </div>
  );
}

export function AdminAnnouncements() {
  const [list, setList]         = useState(null);
  const [title, setTitle]       = useState("");
  const [body, setBody]         = useState("");
  const [audience, setAudience] = useState("all");
  const [sendEmail, setSendEmail] = useState(true);
  const [file, setFile]         = useState(null);
  const [busy, setBusy]         = useState(false);
  const [msg, setMsg]           = useState(null);

  const load = useCallback(() => api.adminAnnouncements().then((r) => setList(r.announcements)).catch(() => setList([])), []);
  useEffect(() => { load(); }, [load]);

  async function publish() {
    if (!title.trim() || !body.trim()) return;
    const target = { all: "TOUS les traders", pro: "les abonnés Pro", basic: "les traders Basique" }[audience];
    if (!window.confirm(`Publier cette annonce pour ${target}${sendEmail ? " et l'envoyer par email" : ""} ?`)) return;
    setBusy(true); setMsg(null);
    try {
      const attachment = file ? await uploadFile(file) : null;
      const { announcement } = await api.adminPostAnnouncement({ title, body, audience, sendEmail, attachment });
      setTitle(""); setBody(""); setFile(null);
      setMsg({ ok: `Annonce publiée${sendEmail ? ` · ${announcement.emails_sent} email(s) envoyé(s)` : ""}` });
      load();
    } catch (err) {
      setMsg({ error: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div style={ui.box}>
        <h3 style={ui.h3}>📢 Nouvelle annonce</h3>
        <input style={{ ...ui.input, marginBottom: 10 }} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Titre" maxLength={150} />
        <textarea style={{ ...ui.input, minHeight: 110, fontFamily: "inherit", marginBottom: 10 }} value={body}
          onChange={(e) => setBody(e.target.value)} placeholder="Texte de l'annonce…" />
        <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
          <label style={{ color: "#94a3b8", fontSize: 13 }}>
            Pour :{" "}
            <select value={audience} onChange={(e) => setAudience(e.target.value)} style={{ ...ui.input, width: "auto", padding: "6px 10px" }}>
              <option value="all">Tous les traders</option>
              <option value="pro">Abonnés Pro</option>
              <option value="basic">Basique (gratuit)</option>
            </select>
          </label>
          <label style={{ color: "#94a3b8", fontSize: 13, display: "flex", gap: 6, alignItems: "center" }}>
            <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} /> Envoyer aussi par email
          </label>
          <label style={{ color: "#94a3b8", fontSize: 13 }}>
            📎 <input type="file" accept={ACCEPT} onChange={(e) => setFile(e.target.files?.[0] || null)} style={{ color: "#94a3b8", fontSize: 12 }} />
          </label>
        </div>
        <button style={{ ...ui.btnGold, opacity: busy || !title.trim() || !body.trim() ? 0.5 : 1 }} disabled={busy || !title.trim() || !body.trim()} onClick={publish}>
          {busy ? "Publication…" : "Publier l'annonce"}
        </button>
        {msg?.ok && <div style={ui.ok}>{msg.ok}</div>}
        {msg?.error && <div style={ui.error}>{msg.error}</div>}
      </div>

      <div style={ui.box}>
        <h3 style={ui.h3}>Historique</h3>
        {list === null ? <p style={ui.muted}>Chargement…</p> : list.length === 0 ? <p style={ui.muted}>Aucune annonce publiée</p> :
          list.map((a) => (
            <div key={a.id} style={{ borderTop: "1px solid #1e3a5f", padding: "10px 0" }}>
              <div style={{ color: "#f1f5f9", fontWeight: 700, fontSize: 14 }}>{a.title}</div>
              <div style={{ color: "#64748b", fontSize: 11, marginTop: 2 }}>
                {fmtDate(a.created_at)} · {{ all: "Tous", pro: "Pro", basic: "Basique" }[a.audience]} · {a.emails_sent} email(s){a.attachment_url ? " · 📎" : ""}
              </div>
            </div>
          ))}
      </div>
    </>
  );
}
