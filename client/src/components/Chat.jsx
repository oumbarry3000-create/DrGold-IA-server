// src/components/Chat.jsx
// Fil de discussion + zone de saisie (texte + piece jointe), partage entre la
// page Messages du trader et la messagerie de l'admin. Modifier / supprimer
// selon les droits passes par la page (canEdit / canDelete).
import { useEffect, useRef, useState } from "react";
import { uploadFile, ACCEPT } from "../lib/upload";
import { ui } from "../lib/ui";
import { confirmDialog, notify } from "./Dialog";

export default function Chat({ messages, mySide, onSend, onEdit, onDelete, canEdit, canDelete, uploads, emptyText, height = 420 }) {
  const [text, setText]       = useState("");
  const [file, setFile]       = useState(null);
  const [sending, setSending] = useState(false);
  const [error, setError]     = useState(null);
  const [editing, setEditing] = useState(null); // { id, body }
  const endRef  = useRef(null);
  const fileRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [messages.length]);

  async function send() {
    if ((!text.trim() && !file) || sending) return;
    setSending(true); setError(null);
    try {
      const attachment = file ? await uploadFile(file) : null;
      await onSend(text.trim(), attachment);
      setText(""); setFile(null);
      if (fileRef.current) fileRef.current.value = "";
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  async function saveEdit() {
    if (!editing?.body.trim()) return;
    try {
      await onEdit(editing.id, editing.body.trim());
      setEditing(null);
      notify("Message modifié");
    } catch (err) {
      notify(err.message, "error");
    }
  }

  async function remove(m) {
    const ok = await confirmDialog({
      title: "Supprimer ce message ?",
      message: "Il sera supprimé définitivement pour vous et votre interlocuteur.",
      confirmLabel: "Supprimer",
      danger: true,
    });
    if (!ok) return;
    try {
      await onDelete(m.id);
      notify("Message supprimé");
    } catch (err) {
      notify(err.message, "error");
    }
  }

  return (
    <div>
      <div style={{ ...st.thread, height }}>
        {messages.length === 0 && <p style={{ ...ui.muted, textAlign: "center", marginTop: 40 }}>{emptyText}</p>}
        {messages.map((m) => {
          const mine = m.sender === mySide;
          const isEditing = editing?.id === m.id;
          return (
            <div key={m.id} style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start", marginBottom: 10 }}>
              <div style={{ ...st.bubble, ...(mine ? st.mine : st.theirs) }}>
                {m.attachment_url && <Attachment m={m} />}
                {isEditing ? (
                  <>
                    <textarea autoFocus style={{ ...ui.input, minHeight: 60, fontFamily: "inherit" }} value={editing.body}
                      onChange={(e) => setEditing({ ...editing, body: e.target.value })}
                      onKeyDown={(e) => { if (e.key === "Escape") setEditing(null); }} />
                    <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", marginTop: 6 }}>
                      <button style={st.linkBtn} onClick={() => setEditing(null)}>Annuler</button>
                      <button style={{ ...st.linkBtn, color: "#f59e0b" }} onClick={saveEdit}>Enregistrer</button>
                    </div>
                  </>
                ) : (
                  m.body && <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{m.body}</div>
                )}
                <div style={st.meta}>
                  <span>
                    {m.sender === "admin" ? "Support Tradify" : "Trader"} · {new Date(m.created_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
                    {m.edited_at && " · modifié"}
                  </span>
                  {!isEditing && (
                    <span style={{ display: "flex", gap: 8 }}>
                      {canEdit?.(m) && m.body && <button style={st.linkBtn} onClick={() => setEditing({ id: m.id, body: m.body })}>Modifier</button>}
                      {canDelete?.(m) && <button style={{ ...st.linkBtn, color: "#fca5a5" }} onClick={() => remove(m)}>Supprimer</button>}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      {file && (
        <div style={st.fileChip}>
          📎 {file.name}
          <button style={st.chipX} aria-label="Retirer la pièce jointe" onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = ""; }}>✕</button>
        </div>
      )}
      <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginTop: 10 }}>
        {uploads && (
          <>
            <input ref={fileRef} type="file" accept={ACCEPT} style={{ display: "none" }}
              onChange={(e) => setFile(e.target.files?.[0] || null)} />
            <button style={{ ...ui.btnDark, padding: "10px 12px" }} title="Joindre une image ou un PDF"
              onClick={() => fileRef.current?.click()} disabled={sending}>📎</button>
          </>
        )}
        <textarea style={{ ...ui.input, minHeight: 44, maxHeight: 140, resize: "vertical", fontFamily: "inherit" }}
          value={text} onChange={(e) => setText(e.target.value)} placeholder="Votre message… (Entrée pour envoyer)" rows={2}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} />
        <button style={{ ...ui.btnGold, opacity: sending || (!text.trim() && !file) ? 0.5 : 1 }} onClick={send} disabled={sending || (!text.trim() && !file)}>
          {sending ? "…" : "Envoyer"}
        </button>
      </div>
      {error && <div style={ui.error}>{error}</div>}
    </div>
  );
}

export function Attachment({ m }) {
  const url = m.attachment_url;
  if (m.attachment_type === "image") {
    return (
      <a href={url} target="_blank" rel="noreferrer">
        <img src={url} alt={m.attachment_name || "image"} style={{ maxWidth: "100%", maxHeight: 260, borderRadius: 8, display: "block", marginBottom: 6 }} />
      </a>
    );
  }
  return (
    <a href={url} target="_blank" rel="noreferrer" style={{ color: "#f59e0b", display: "block", marginBottom: 6 }}>
      📄 {m.attachment_name || "Fichier"}
    </a>
  );
}

const st = {
  thread:  { overflowY: "auto", background: "#0a1525", border: "1px solid #1e3a5f", borderRadius: 12, padding: 14 },
  bubble:  { maxWidth: "78%", minWidth: 160, borderRadius: 12, padding: "9px 12px", fontSize: 14, lineHeight: 1.5 },
  mine:    { background: "#b4530933", border: "1px solid #f59e0b55", color: "#f1f5f9" },
  theirs:  { background: "#1e3a5f", border: "1px solid #2d4a6f", color: "#e2e8f0" },
  meta:    { display: "flex", justifyContent: "space-between", gap: 10, color: "#64748b", fontSize: 10, marginTop: 4, flexWrap: "wrap" },
  linkBtn: { background: "none", border: "none", padding: 0, color: "#94a3b8", fontSize: 11, fontWeight: 700, cursor: "pointer" },
  fileChip:{ display: "inline-flex", alignItems: "center", gap: 8, marginTop: 10, background: "#1e3a5f", color: "#cbd5e1", borderRadius: 999, padding: "4px 10px", fontSize: 12 },
  chipX:   { background: "none", border: "none", color: "#94a3b8", cursor: "pointer" },
};
