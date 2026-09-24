// src/components/Dialog.jsx
// Fenetres de confirmation et notifications de l'app (remplacent
// window.confirm / alert). Usage :
//   if (await confirmDialog({ title, message, confirmLabel, danger, requireText })) { ... }
//   notify("Enregistré"), notify("Erreur…", "error")
import { useEffect, useState } from "react";

let pushDialog = null;
let pushToast  = null;

export function confirmDialog(options) {
  return new Promise((resolve) => {
    if (!pushDialog) return resolve(window.confirm(options.message || options.title));
    pushDialog({ ...options, resolve });
  });
}

export function notify(text, kind = "success") {
  pushToast?.({ id: Date.now() + Math.random(), text, kind });
}

export function DialogHost() {
  const [dialog, setDialog] = useState(null);
  const [typed, setTyped]   = useState("");
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    pushDialog = (d) => { setTyped(""); setDialog(d); };
    pushToast  = (t) => {
      setToasts((list) => [...list, t]);
      setTimeout(() => setToasts((list) => list.filter((x) => x.id !== t.id)), 3500);
    };
    return () => { pushDialog = null; pushToast = null; };
  }, []);

  useEffect(() => {
    if (!dialog) return;
    const onKey = (e) => { if (e.key === "Escape") close(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function close(result) {
    dialog?.resolve(result);
    setDialog(null);
  }

  const blocked = dialog?.requireText && typed.trim().toUpperCase() !== dialog.requireText;

  return (
    <>
      {dialog && (
        <div style={st.overlay} onMouseDown={(e) => e.target === e.currentTarget && close(false)}>
          <div style={st.modal} role="dialog" aria-modal="true" aria-labelledby="dg-dialog-title">
            <h3 id="dg-dialog-title" style={{ ...st.title, color: dialog.danger ? "#fca5a5" : "#f1f5f9" }}>
              {dialog.danger ? "⚠️ " : ""}{dialog.title}
            </h3>
            {dialog.message && <p style={st.message}>{dialog.message}</p>}
            {dialog.requireText && (
              <>
                <p style={{ ...st.message, marginBottom: 6 }}>
                  Tapez <strong style={{ color: "#f1f5f9" }}>{dialog.requireText}</strong> pour confirmer :
                </p>
                <input autoFocus style={st.input} value={typed} onChange={(e) => setTyped(e.target.value)} />
              </>
            )}
            <div style={st.actions}>
              {!dialog.alertOnly && <button style={st.cancel} onClick={() => close(false)}>{dialog.cancelLabel || "Annuler"}</button>}
              <button autoFocus={!dialog.requireText} disabled={blocked}
                style={{ ...(dialog.danger ? st.danger : st.confirm), opacity: blocked ? 0.4 : 1, cursor: blocked ? "not-allowed" : "pointer" }}
                onClick={() => close(true)}>
                {dialog.confirmLabel || "Confirmer"}
              </button>
            </div>
          </div>
        </div>
      )}
      <div style={st.toasts} aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} style={{ ...st.toast, ...(t.kind === "error" ? st.toastErr : st.toastOk) }}>
            {t.kind === "error" ? "⚠️ " : "✅ "}{t.text}
          </div>
        ))}
      </div>
    </>
  );
}

const st = {
  overlay:  { position: "fixed", inset: 0, background: "rgba(2,6,15,0.75)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 1000 },
  modal:    { background: "#0d1829", border: "1px solid #1e3a5f", borderRadius: 14, padding: 22, width: "100%", maxWidth: 420, boxShadow: "0 20px 60px rgba(0,0,0,0.5)", fontFamily: "'Inter', sans-serif" },
  title:    { fontSize: 17, fontWeight: 800, margin: "0 0 10px" },
  message:  { color: "#94a3b8", fontSize: 14, lineHeight: 1.6, margin: "0 0 16px", whiteSpace: "pre-wrap" },
  input:    { background: "#0a1525", border: "1px solid #1e3a5f", borderRadius: 10, padding: "10px 12px", color: "#f1f5f9", fontSize: 14, width: "100%", boxSizing: "border-box", marginBottom: 16, outline: "none" },
  actions:  { display: "flex", justifyContent: "flex-end", gap: 10, flexWrap: "wrap" },
  cancel:   { background: "transparent", color: "#94a3b8", border: "1px solid #334155", borderRadius: 10, padding: "10px 16px", fontSize: 14, fontWeight: 600, cursor: "pointer" },
  confirm:  { background: "linear-gradient(135deg, #f59e0b, #d97706)", color: "#060d1a", border: "none", borderRadius: 10, padding: "10px 18px", fontSize: 14, fontWeight: 800 },
  danger:   { background: "#dc2626", color: "#fff", border: "none", borderRadius: 10, padding: "10px 18px", fontSize: 14, fontWeight: 800 },
  toasts:   { position: "fixed", bottom: 16, left: "50%", transform: "translateX(-50%)", display: "flex", flexDirection: "column", gap: 8, zIndex: 1001, width: "calc(100% - 32px)", maxWidth: 420, pointerEvents: "none" },
  toast:    { borderRadius: 10, padding: "11px 14px", fontSize: 14, fontWeight: 600, fontFamily: "'Inter', sans-serif", boxShadow: "0 8px 24px rgba(0,0,0,0.4)" },
  toastOk:  { background: "#14532d", color: "#dcfce7", border: "1px solid #22c55e" },
  toastErr: { background: "#7f1d1d", color: "#fee2e2", border: "1px solid #ef4444" },
};
