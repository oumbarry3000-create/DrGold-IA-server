// src/pages/Login.jsx
// Connexion / inscription : email + mot de passe (oeil pour l'afficher),
// mot de passe oublie, Google, Deriv. L'acceptation des risques est exigee
// pour toute creation de compte (formulaire, Google ou Deriv).
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff, ArrowLeft, MailCheck } from "lucide-react";
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
  const { user, login, register, loginWithGoogle, googleRedirectResult, resetPassword, loading, error, setError } = useAuth();
  const [mode, setMode]             = useState("login"); // login | register | reset
  const [email, setEmail]           = useState("");
  const [password, setPassword]     = useState("");
  const [showPwd, setShowPwd]       = useState(false);
  const [acceptRisk, setAcceptRisk] = useState(false);
  const [formError, setFormError]   = useState(null);
  const [resetSent, setResetSent]   = useState(false);
  const [busySocial, setBusySocial] = useState(null);

  // Retour d'une connexion Google par redirection (mobile)
  useEffect(() => {
    googleRedirectResult().then((r) => r && afterGoogle(r));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Deja connecte : direction le tableau de bord
  useEffect(() => { if (user && !busySocial) navigate("/dashboard", { replace: true }); }, [user, busySocial, navigate]);

  function switchMode(m) {
    setMode(m); setFormError(null); setError(null); setResetSent(false);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError(null);
    if (!email || !password) return setFormError("Entrez votre email et votre mot de passe.");
    if (mode === "register" && !acceptRisk) return setFormError("Vous devez accepter les risques du trading pour créer un compte.");
    try {
      if (mode === "register") await register(email, password);
      else await login(email, password);
      navigate("/dashboard");
    } catch { /* message affiche par useAuth */ }
  }

  async function handleReset(e) {
    e.preventDefault();
    setFormError(null);
    if (!email) return setFormError("Entrez l'email de votre compte.");
    try { await resetPassword(email); setResetSent(true); } catch { /* message affiche par useAuth */ }
  }

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
        setBusySocial(null);
        return;
      }
      try { await api.register(); } catch { /* le compte est aussi cree au premier chargement */ }
    }
    setBusySocial(null);
    navigate("/dashboard", { replace: true });
  }

  async function google() {
    setFormError(null);
    if (mode === "register" && !acceptRisk) return setFormError("Cochez d'abord la case des risques pour créer votre compte.");
    setBusySocial("google");
    try {
      const r = await loginWithGoogle();
      if (r) await afterGoogle(r); // sinon : redirection vers Google en cours
    } catch {
      setBusySocial(null);
    }
  }

  function deriv() {
    setFormError(null);
    if (mode === "register" && !acceptRisk) return setFormError("Cochez d'abord la case des risques pour créer votre compte.");
    setBusySocial("deriv");
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

        {mode === "reset" ? (
          <form onSubmit={handleReset} style={st.form} noValidate>
            <button type="button" className="tf-link" onClick={() => switchMode("login")} style={{ alignSelf: "flex-start" }}>
              <ArrowLeft size={15} aria-hidden="true" /> Retour à la connexion
            </button>
            <div>
              <h2 style={{ fontSize: 17, margin: "0 0 6px" }}>Mot de passe oublié</h2>
              <p className="tf-muted" style={{ fontSize: 13, lineHeight: 1.6, margin: 0 }}>
                Entrez l'email de votre compte : vous recevrez un lien pour choisir un nouveau mot de passe.
              </p>
            </div>
            {resetSent ? (
              <div className="tf-alert tf-alert--info" role="status">
                <MailCheck size={20} aria-hidden="true" />
                <div>Email envoyé à <strong>{email}</strong>. Ouvrez le lien reçu (vérifiez aussi les spams), puis revenez vous connecter.</div>
              </div>
            ) : (
              <>
                <Field id="reset-email" label="Email">
                  <input id="reset-email" className="tf-input" type="email" autoComplete="email" value={email}
                    onChange={(e) => setEmail(e.target.value)} placeholder="vous@exemple.com" autoFocus />
                </Field>
                {message && <div className="tf-alert tf-alert--danger" role="alert">{message}</div>}
                <button type="submit" className="tf-btn tf-btn--gold tf-btn--lg tf-btn--block" disabled={loading}>
                  {loading ? "Envoi…" : "Envoyer le lien de réinitialisation"}
                </button>
              </>
            )}
            {resetSent && <button type="button" className="tf-btn tf-btn--lg tf-btn--block" onClick={() => switchMode("login")}>Retour à la connexion</button>}
          </form>
        ) : (
          <>
            <div className="tf-segment" role="tablist" aria-label="Connexion ou inscription" style={{ display: "flex", marginBottom: 22 }}>
              {[["login", "Connexion"], ["register", "Inscription"]].map(([m, label]) => (
                <button key={m} type="button" role="tab" aria-selected={mode === m} className={mode === m ? "is-active" : ""} style={{ flex: 1, justifyContent: "center" }} onClick={() => switchMode(m)}>
                  {label}
                </button>
              ))}
            </div>

            <form onSubmit={handleSubmit} style={st.form} noValidate>
              <Field id="login-email" label="Email">
                <input id="login-email" className="tf-input" type="email" autoComplete="email" value={email}
                  onChange={(e) => setEmail(e.target.value)} placeholder="vous@exemple.com" />
              </Field>

              <Field id="login-password" label="Mot de passe"
                extra={mode === "login" && <button type="button" className="tf-link" style={{ fontSize: 12 }} onClick={() => switchMode("reset")}>Mot de passe oublié ?</button>}>
                <div style={{ position: "relative" }}>
                  <input id="login-password" className="tf-input" type={showPwd ? "text" : "password"} value={password}
                    autoComplete={mode === "register" ? "new-password" : "current-password"}
                    onChange={(e) => setPassword(e.target.value)} placeholder={mode === "register" ? "6 caractères minimum" : "••••••••"}
                    style={{ width: "100%", boxSizing: "border-box", paddingRight: 46 }} />
                  <button type="button" onClick={() => setShowPwd((v) => !v)} style={st.eye}
                    aria-label={showPwd ? "Masquer le mot de passe" : "Afficher le mot de passe"} aria-pressed={showPwd}>
                    {showPwd ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </Field>

              {mode === "register" && (
                <label style={st.risk}>
                  <input type="checkbox" checked={acceptRisk} onChange={(e) => setAcceptRisk(e.target.checked)} style={{ marginTop: 3, width: 16, height: 16, flexShrink: 0 }} />
                  <span>Je comprends que le trading comporte un <strong style={{ color: "var(--text)" }}>risque élevé de perte</strong>, que les performances passées ne garantissent pas les résultats futurs, et que je peux perdre tout ou partie de mon capital.</span>
                </label>
              )}

              {message && <div className="tf-alert tf-alert--danger" role="alert">{message}</div>}

              <button type="submit" className="tf-btn tf-btn--gold tf-btn--lg tf-btn--block" disabled={loading || !!busySocial}>
                {loading && !busySocial ? "Chargement…" : mode === "login" ? "Se connecter" : "Créer mon compte"}
              </button>
            </form>

            <div className="tf-divider" role="separator"><span>ou</span></div>

            <div style={{ display: "grid", gap: 10 }}>
              <button type="button" className="tf-btn tf-btn--lg tf-btn--block" onClick={google} disabled={loading || !!busySocial} style={st.social}>
                <GoogleIcon /> {busySocial === "google" ? "Connexion à Google…" : "Continuer avec Google"}
              </button>
              <button type="button" className="tf-btn tf-btn--lg tf-btn--block" onClick={deriv} disabled={loading || !!busySocial} style={st.social}>
                <span className="tf-deriv" aria-hidden="true" style={{ fontSize: 16 }}>deriv</span>
                {busySocial === "deriv" ? "Redirection vers Deriv…" : mode === "register" ? "Créer mon compte avec Deriv" : "Continuer avec Deriv"}
              </button>
            </div>
            <p className="tf-muted" style={{ fontSize: 11.5, lineHeight: 1.6, textAlign: "center", margin: "16px 0 0" }}>
              Avec Deriv, votre compte Tradify est directement relié à votre compte de trading. Tradify n'a jamais accès à vos retraits.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function Field({ id, label, extra, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <label htmlFor={id} style={{ color: "var(--text-2)", fontSize: 13, fontWeight: 600 }}>{label}</label>
        {extra}
      </div>
      {children}
    </div>
  );
}

const st = {
  page:    { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 16px" },
  card:    { width: "100%", maxWidth: 440, padding: "32px 28px", borderRadius: 18 },
  header:  { display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 6, marginBottom: 26 },
  title:   { fontSize: 28, fontWeight: 800, margin: "6px 0 0", letterSpacing: "-0.5px" },
  form:    { display: "flex", flexDirection: "column", gap: 18 },
  eye:     { position: "absolute", right: 4, top: "50%", transform: "translateY(-50%)", width: 40, height: 40, border: "none", background: "transparent", color: "var(--text-2)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8 },
  risk:    { display: "flex", gap: 10, alignItems: "flex-start", color: "var(--text-2)", fontSize: 12.5, lineHeight: 1.6, cursor: "pointer" },
  social:  { background: "var(--bg-2)", fontWeight: 600 },
};
