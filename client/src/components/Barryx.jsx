// src/components/Barryx.jsx
// Barryx 🤖 : l'assistant IA de DrGold (l'admin en miniature). Bulle flottante
// en bas a droite de toutes les pages connectees ; conversation gardee sur
// l'appareil (localStorage), envoyee au serveur a chaque question.
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { auth } from "../lib/firebase";
import { api } from "../lib/api";
import { confirmDialog } from "./Dialog";

const GREETING = "Salut 👋 Moi c'est **Barryx** 🤖, l'assistant de DrGold IA. Inscription, Deriv, activation du bot, formule Pro… pose-moi ta question !";
const SUGGESTIONS = ["Comment activer le bot ?", "Connecter mon compte Deriv", "Passer en Pro", "Pourquoi aucun trade ?"];
const MAX_KEPT = 40;

const storageKey = () => `barryx_chat_${auth.currentUser?.uid || "anon"}`;
function loadChat() {
  try { return JSON.parse(localStorage.getItem(storageKey()) || "[]"); } catch { return []; }
}
function saveChat(msgs) {
  try { localStorage.setItem(storageKey(), JSON.stringify(msgs.slice(-MAX_KEPT))); } catch { /* stockage indisponible */ }
}

export default function Barryx() {
  const [open, setOpen]         = useState(false);
  const [messages, setMessages] = useState(loadChat);
  const [text, setText]         = useState("");
  const [busy, setBusy]         = useState(false);
  const [error, setError]       = useState(null);
  const [enabled, setEnabled]   = useState(true);
  const [hint, setHint]         = useState(() => loadChat().length === 0);
  const endRef   = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => { api.assistantStatus().then((s) => setEnabled(s.enabled)).catch(() => {}); }, []);
  useEffect(() => { saveChat(messages); }, [messages]);
  useEffect(() => {
    if (open) {
      endRef.current?.scrollIntoView({ block: "end" });
      inputRef.current?.focus();
    }
  }, [open, messages.length, busy]);

  async function ask(question) {
    const q = (question ?? text).trim();
    if (!q || busy) return;
    const next = [...messages, { role: "user", content: q }];
    setMessages(next);
    setText(""); setError(null); setBusy(true);
    try {
      const { reply } = await api.askAssistant(next.map(({ role, content }) => ({ role, content })));
      setMessages((m) => [...m, { role: "assistant", content: reply }]);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    const ok = await confirmDialog({ title: "Effacer la conversation ?", message: "L'historique avec Barryx sera supprimé de cet appareil.", confirmLabel: "Effacer", danger: true });
    if (ok) { setMessages([]); setError(null); }
  }

  return (
    <>
      {!open && hint && (
        <div style={st.hint} onClick={() => { setOpen(true); setHint(false); }}>
          Une question ? Je suis là 🤖
          <button style={st.hintX} aria-label="Fermer" onClick={(e) => { e.stopPropagation(); setHint(false); }}>✕</button>
        </div>
      )}
      <button style={st.fab} onClick={() => { setOpen((o) => !o); setHint(false); }} aria-label={open ? "Fermer Barryx" : "Ouvrir Barryx, l'assistant IA"}>
        {open ? "✕" : "🤖"}
      </button>

      {open && (
        <div style={st.panel} role="dialog" aria-label="Barryx, assistant IA">
          <div style={st.head}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={st.avatar}>🤖</div>
              <div>
                <div style={{ color: "#f1f5f9", fontWeight: 800, fontSize: 15 }}>Barryx</div>
                <div style={{ color: "#22c55e", fontSize: 11 }}>● Assistant IA DrGold</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              {messages.length > 0 && <button style={st.iconBtn} onClick={clear} title="Effacer la conversation">🗑️</button>}
              <button style={st.iconBtn} onClick={() => setOpen(false)} aria-label="Fermer">✕</button>
            </div>
          </div>

          <div style={st.body}>
            <Bubble role="assistant" content={GREETING} />
            {messages.map((m, i) => <Bubble key={i} role={m.role} content={m.content} />)}
            {busy && <div style={{ ...st.bubble, ...st.bot, color: "#94a3b8" }}>Barryx écrit<span className="dg-dots">…</span></div>}
            {messages.length === 0 && !busy && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
                {SUGGESTIONS.map((s) => <button key={s} style={st.chip} onClick={() => ask(s)} disabled={!enabled}>{s}</button>)}
              </div>
            )}
            {!enabled && <div style={st.err}>Barryx est en cours d'activation. En attendant, écrivez au <Link to="/messages" style={{ color: "#f59e0b" }}>Support</Link>.</div>}
            {error && <div style={st.err}>{error}</div>}
            <div ref={endRef} />
          </div>

          <div style={st.foot}>
            <div style={{ display: "flex", gap: 8 }}>
              <input ref={inputRef} style={st.input} value={text} maxLength={1500} disabled={!enabled}
                onChange={(e) => setText(e.target.value)} placeholder="Écris ta question…"
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); ask(); } }} />
              <button style={{ ...st.send, opacity: busy || !text.trim() ? 0.5 : 1 }} onClick={() => ask()} disabled={busy || !text.trim() || !enabled} aria-label="Envoyer">➤</button>
            </div>
            <div style={st.small}>
              IA : peut se tromper. Besoin d'un humain ? <Link to="/messages" style={{ color: "#f59e0b" }} onClick={() => setOpen(false)}>Écrire au Support</Link>
            </div>
          </div>
        </div>
      )}
      <style>{`.dg-dots{animation:dgblink 1s infinite}@keyframes dgblink{50%{opacity:.2}}`}</style>
    </>
  );
}

// Rendu leger : **gras**, listes et retours a la ligne (le texte n'est jamais injecte en HTML)
function Bubble({ role, content }) {
  const lines = content.split("\n");
  return (
    <div style={{ display: "flex", justifyContent: role === "user" ? "flex-end" : "flex-start", marginBottom: 8 }}>
      <div style={{ ...st.bubble, ...(role === "user" ? st.me : st.bot) }}>
        {lines.map((line, i) => (
          <div key={i} style={{ minHeight: line.trim() ? undefined : 6, paddingLeft: /^\s*([-*•]|\d+\.)\s/.test(line) ? 4 : 0 }}>
            {line.replace(/^\s*[-*]\s/, "• ").split(/(\*\*[^*]+\*\*)/g).map((part, j) =>
              part.startsWith("**") && part.endsWith("**")
                ? <strong key={j} style={{ color: "#f1f5f9" }}>{part.slice(2, -2)}</strong>
                : <span key={j}>{part}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

const st = {
  fab:    { position: "fixed", right: 18, bottom: 18, width: 58, height: 58, borderRadius: "50%", border: "2px solid #f59e0b", background: "linear-gradient(135deg, #1e3a5f, #0d1829)", color: "#fff", fontSize: 26, cursor: "pointer", boxShadow: "0 8px 24px rgba(0,0,0,0.5)", zIndex: 900 },
  hint:   { position: "fixed", right: 86, bottom: 30, background: "#f59e0b", color: "#060d1a", fontWeight: 700, fontSize: 13, borderRadius: 12, padding: "8px 30px 8px 12px", cursor: "pointer", boxShadow: "0 6px 18px rgba(0,0,0,0.4)", zIndex: 900, fontFamily: "'Inter', sans-serif" },
  hintX:  { position: "absolute", right: 6, top: 6, background: "none", border: "none", color: "#060d1a", cursor: "pointer", fontSize: 12 },
  panel:  { position: "fixed", right: 18, bottom: 88, width: "min(380px, calc(100vw - 36px))", height: "min(560px, calc(100vh - 120px))", background: "#0d1829", border: "1px solid #1e3a5f", borderRadius: 16, display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,0.6)", zIndex: 901, fontFamily: "'Inter', sans-serif", overflow: "hidden" },
  head:   { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", borderBottom: "1px solid #1e3a5f", background: "#0a1525" },
  avatar: { width: 38, height: 38, borderRadius: "50%", background: "#1e3a5f", border: "1px solid #f59e0b", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 },
  iconBtn:{ background: "none", border: "none", color: "#94a3b8", fontSize: 15, cursor: "pointer", padding: 6 },
  body:   { flex: 1, overflowY: "auto", padding: 14 },
  bubble: { maxWidth: "85%", borderRadius: 12, padding: "9px 12px", fontSize: 14, lineHeight: 1.5, wordBreak: "break-word" },
  bot:    { background: "#1e3a5f", border: "1px solid #2d4a6f", color: "#e2e8f0" },
  me:     { background: "#b4530933", border: "1px solid #f59e0b55", color: "#f1f5f9" },
  chip:   { background: "transparent", border: "1px solid #f59e0b77", color: "#fcd34d", borderRadius: 999, padding: "6px 10px", fontSize: 12, cursor: "pointer" },
  err:    { background: "#7f1d1d33", border: "1px solid #ef444455", borderRadius: 8, padding: "8px 12px", color: "#fca5a5", fontSize: 12, marginTop: 6 },
  foot:   { borderTop: "1px solid #1e3a5f", padding: 10, background: "#0a1525" },
  input:  { flex: 1, background: "#060d1a", border: "1px solid #1e3a5f", borderRadius: 10, padding: "10px 12px", color: "#f1f5f9", fontSize: 14, outline: "none", minWidth: 0 },
  send:   { width: 42, borderRadius: 10, border: "none", background: "linear-gradient(135deg, #f59e0b, #d97706)", color: "#060d1a", fontSize: 16, fontWeight: 800, cursor: "pointer" },
  small:  { color: "#475569", fontSize: 11, marginTop: 6, textAlign: "center" },
};
