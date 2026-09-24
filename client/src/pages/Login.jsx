// src/pages/Login.jsx
// Connexion / inscription uniquement avec Google ou Deriv (plus d'email +
// mot de passe). Les anciens comptes email Gmail retrouvent le MEME compte
// via Google (Firebase rattache la connexion Google a l'adresse existante).
// L'acceptation des risques est exigee pour toute creation de compte.
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { auth } from "../lib/firebase";
import { startDerivOAuth } from "../lib/derivOAuth";
import { confirmDialog } from "../components/Dialog";
import TradifyLogo from "../components/brand/TradifyLogo";

const RISK_TEXT = "Le trading comporte un risque élevé de perte. Les performances passées ne garantissent pas les résultats futurs et vous pouvez perdre tout ou partie de votre capital.";

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

export default function Login() {
  const navigate = useNavigate();
  const { user, loginWithGoogle, googleRedirectResult, loading, error } = useAuth();
  const [mode, setMode]             = useState("login"); // login | register
  const [acceptRisk, setAcceptRisk] = useState(false);
  const [formError, setFormError]   = useState(null);
  const [busy, setBusy]             = useState(null);

  // Retour d'une connexion Google par redirection (mobile)
  useEffect(() => {
    googleRedirectResult().then((r) => r && afterGoogle(r));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Deja connecte : direction le tableau de bord
  useEffect(() => { if (user && !busy) navigate("/dashboard", { replace: true }); }, [user, busy, navigate]);

  // Nouveau compte Google : acceptation des risques obligatoire
  async function afterGoogle({ isNewUser }) {
    if (isNewUser) {
      const ok = (mode === "register" && acceptRisk) || await confirmDialog({
        title: "Bienvenue sur Tradify",
        message: `${RISK_TEXT}\n\nEn continuant, vous confirmez avoir compris ces risques.`,
        confirmLabel: "J'ai compris, continuer",
        cancelLabel: "Annuler",
      });
      if (!ok) {
        try { await auth.currentUser?.delete(); } catch { await auth.signOut(); }
        setBusy(null);
        return;
      }
      try { await api.register(); } catch { /* le compte est aussi cree au premier chargement */ }
    }
    setBusy(null);
    navigate("/dashboard", { replace: true });
  }

  function needsRisk() {
    if (mode === "register" && !acceptRisk) {
      setFormError("Cochez d'abord la case des risques pour créer votre compte.");
      return true;
    }
    setFormError(null);
    return false;
  }

  async function google() {
    if (needsRisk()) return;
    setBusy("google");
    try {
      const r = await loginWithGoogle();
      if (r) await afterGoogle(r); // sinon : redirection vers Google en cours
    } catch {
      setBusy(null);
    }
  }

  function deriv() {
    if (needsRisk()) return;
    setBusy("deriv");
    startDerivOAuth({ mode: "login", signup: mode === "register" });
  }

  const message = formError || error;

  return (
    <div style={st.page}>
      <div className="tf-card" style={st.card}>
        <div style={st.header}>
          <TradifyLogo size={76} />
          <h1 style={st.title}>Trad<span style={{ color: "var(--gold)" }}>ify</span></h1>
          <p className="tf-muted" style={{ fontSize: 13, margin: 0 }}>Trading automatisé · XAUUSD</p>
        </div>

        <div className="tf-segment" role="tablist" aria-label="Connexion ou inscription" style={{ display: "flex", marginBottom: 22 }}>
          {[["login", "Connexion"], ["register", "Inscription"]].map(([m, label]) => (
            <button key={m} type="button" role="tab" aria-selected={mode === m} className={mode === m ? "is-active" : ""}
              style={{ flex: 1, justifyContent: "center" }} onClick={() => { setMode(m); setFormError(null); }}>
              {label}
            </button>
          ))}
        </div>

        <p style={{ color: "var(--text-2)", fontSize: 14, lineHeight: 1.6, textAlign: "center", margin: "0 0 18px" }}>
          {mode === "login"
            ? "Connectez-vous avec le compte utilisé lors de votre inscription."
            : "Créez votre compte en quelques secondes. Avec Deriv, votre compte de trading est relié directement et le bot est prêt."}
        </p>

        {mode === "register" && (
          <label style={st.risk}>
            <input type="checkbox" checked={acceptRisk} onChange={(e) => { setAcceptRisk(e.target.checked); setFormError(null); }}
              style={{ marginTop: 3, width: 16, height: 16, flexShrink: 0 }} />
            <span>Je comprends que le trading comporte un <strong style={{ color: "var(--text)" }}>risque élevé de perte</strong>, que les performances passées ne garantissent pas les résultats futurs, et que je peux perdre tout ou partie de mon capital.</span>
          </label>
        )}

        {message && <div className="tf-alert tf-alert--danger" role="alert" style={{ marginBottom: 14 }}>{message}</div>}

        <div style={{ display: "grid", gap: 12 }}>
          <button type="button" className="tf-btn tf-btn--lg tf-btn--block" onClick={google} disabled={loading || !!busy} style={st.social}>
            <GoogleIcon /> {busy === "google" ? "Connexion à Google…" : "Continuer avec Google"}
          </button>
          <button type="button" className="tf-btn tf-btn--lg tf-btn--block" onClick={deriv} disabled={loading || !!busy} style={st.social}>
            <span className="tf-deriv" aria-hidden="true" style={{ fontSize: 16 }}>deriv</span>
            {busy === "deriv" ? "Redirection vers Deriv…" : mode === "register" ? "Créer mon compte avec Deriv" : "Continuer avec Deriv"}
          </button>
        </div>

        <p className="tf-muted" style={{ fontSize: 11.5, lineHeight: 1.6, textAlign: "center", margin: "18px 0 0" }}>
          Pas de mot de passe à retenir. Tradify n'a jamais accès à vos retraits Deriv.
        </p>
      </div>
    </div>
  );
}

const st = {
  page:   { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 16px" },
  card:   { width: "100%", maxWidth: 440, padding: "32px 28px", borderRadius: 18 },
  header: { display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 6, marginBottom: 26 },
  title:  { fontSize: 28, fontWeight: 800, margin: "6px 0 0", letterSpacing: "-0.5px" },
  risk:   { display: "flex", gap: 10, alignItems: "flex-start", color: "var(--text-2)", fontSize: 12.5, lineHeight: 1.6, cursor: "pointer", marginBottom: 16 },
  social: { background: "var(--bg-2)", fontWeight: 600, minHeight: 52, fontSize: 15 },
};
