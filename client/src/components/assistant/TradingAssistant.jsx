// src/components/assistant/TradingAssistant.jsx
// Assistant Tradify (Barryx) : bouton flottant + panneau de chat relie a
// POST /api/assistant (Gemini, connait l'app et la situation du trader).
// Conversation gardee sur l'appareil (localStorage).
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { X, Trash2, SendHorizontal } from "lucide-react";
import { auth } from "../../lib/firebase";
import { api } from "../../lib/api";
import { confirmDialog } from "../Dialog";
import TradifyLogo from "../brand/TradifyLogo";
import MessageBubble from "./MessageBubble";

const GREETING = "Salut 👋 Moi c'est **Barryx**, l'assistant de Tradify. Pose-moi ta question sur ton bot, tes trades, Deriv ou ton abonnement.";
const COMMANDS = [
  "Analyser ma position",
  "Pourquoi le bot n'a pas tradé ?",
  "Résumer mes performances",
  "Expliquer mon drawdown",
  "Expliquer ma dernière perte",
  "Vérifier mon risque",
  "Analyser XAUUSD",
];
const MAX_KEPT = 40;

const storageKey = () => `barryx_chat_${auth.currentUser?.uid || "anon"}`;
const loadChat = () => { try { return JSON.parse(localStorage.getItem(storageKey()) || "[]"); } catch { return []; } };
const saveChat = (msgs) => { try { localStorage.setItem(storageKey(), JSON.stringify(msgs.slice(-MAX_KEPT))); } catch { /* stockage indisponible */ } };

export function TradingAssistant({ onClose }) {
  const [messages, setMessages] = useState(loadChat);
  const [text, setText]         = useState("");
  const [busy, setBusy]         = useState(false);
  const [error, setError]       = useState(null);
  const [enabled, setEnabled]   = useState(true);
  const endRef   = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => { api.assistantStatus().then((s) => setEnabled(s.enabled)).catch(() => {}); inputRef.current?.focus(); }, []);
  useEffect(() => { saveChat(messages); }, [messages]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [messages.length, busy]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function ask(question) {
    const q = (question ?? text).trim();
    if (!q || busy || !enabled) return;
    const next = [...messages, { role: "user", content: q }];
    setMessages(next);
    setText(""); setError(null); setBusy(true);
    try {
      const { reply } = await api.askAssistant(next);
      setMessages((m) => [...m, { role: "assistant", content: reply }]);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    const ok = await confirmDialog({ title: "Effacer la conversation ?", message: "L'historique avec l'assistant sera supprimé de cet appareil.", confirmLabel: "Effacer", danger: true });
    if (ok) { setMessages([]); setError(null); }
  }

  return (
    <div className="tf-assistant" role="dialog" aria-modal="false" aria-labelledby="assistant-title">
      <div className="tf-assistant__head">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <TradifyLogo size={38} />
          <div>
            <div id="assistant-title" style={{ fontWeight: 800, fontSize: 15 }}>Assistant Tradify</div>
            <div style={{ color: "var(--green)", fontSize: 11 }}>● Barryx · IA en ligne</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 2 }}>
          {messages.length > 0 && <button type="button" className="tf-btn tf-btn--ghost tf-icon-btn" onClick={clear} aria-label="Effacer la conversation"><Trash2 size={17} /></button>}
          <button type="button" className="tf-btn tf-btn--ghost tf-icon-btn" onClick={onClose} aria-label="Fermer l'assistant"><X size={18} /></button>
        </div>
      </div>

      <div className="tf-assistant__body" aria-live="polite">
        <MessageBubble role="assistant" content={GREETING} />
        {messages.map((m, i) => <MessageBubble key={i} role={m.role} content={m.content} />)}
        {busy && <div className="tf-bubble tf-bubble--bot tf-typing" aria-label="L'assistant écrit"><span /><span /><span /></div>}
        {messages.length === 0 && !busy && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
            {COMMANDS.map((c) => (
              <button key={c} type="button" className="tf-chip" style={{ minHeight: 32, fontSize: 12, padding: "5px 11px" }} onClick={() => ask(c)} disabled={!enabled}>{c}</button>
            ))}
          </div>
        )}
        {!enabled && <div className="tf-alert tf-alert--info" style={{ marginTop: 8, fontSize: 13 }}>L'assistant est en cours d'activation. En attendant, écrivez au <Link to="/messages?tab=support" onClick={onClose}>Support</Link>.</div>}
        {error && <div className="tf-alert tf-alert--danger" style={{ marginTop: 8, fontSize: 13 }}>{error}</div>}
        <div ref={endRef} />
      </div>

      <form className="tf-assistant__foot" onSubmit={(e) => { e.preventDefault(); ask(); }}>
        <div style={{ display: "flex", gap: 8 }}>
          <label htmlFor="assistant-input" className="sr-only">Votre question</label>
          <input id="assistant-input" ref={inputRef} className="tf-input" value={text} maxLength={1500} disabled={!enabled}
            onChange={(e) => setText(e.target.value)} placeholder="Pose ta question…" autoComplete="off" />
          <button type="submit" className="tf-btn tf-btn--primary tf-icon-btn" style={{ width: 46, height: 44 }} disabled={busy || !text.trim() || !enabled} aria-label="Envoyer">
            <SendHorizontal size={18} />
          </button>
        </div>
        <p className="tf-muted" style={{ fontSize: 11, margin: "6px 0 0", textAlign: "center" }}>
          IA : peut se tromper, pas un conseil financier. <Link to="/messages?tab=support" onClick={onClose} className="tf-link" style={{ fontSize: 11 }}>Parler à un humain</Link>
        </p>
      </form>
    </div>
  );
}

export function AssistantButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      {open && <TradingAssistant onClose={() => setOpen(false)} />}
      <button type="button" className="tf-fab" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        aria-label={open ? "Fermer l'assistant Tradify" : "Ouvrir l'assistant Tradify"}>
        {open ? <X size={24} className="tf-fab__close" /> : <TradifyLogo size={52} />}
      </button>
    </>
  );
}
