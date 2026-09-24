// src/pages/Login.jsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import TradifyLogo from "../components/brand/TradifyLogo";

export default function Login() {
  const [mode, setMode]             = useState("login");
  const [email, setEmail]           = useState("");
  const [password, setPassword]     = useState("");
  const [acceptRisk, setAcceptRisk] = useState(false);
  const [formError, setFormError]   = useState(null);
  const { login, register, resetPassword, loading, error } = useAuth();
  const [resetSent, setResetSent] = useState(false);

  async function handleReset() {
    setFormError(null);
    if (!email) { setFormError("Entrez d'abord votre email, puis cliquez sur « Mot de passe oublié ? »."); return; }
    try { await resetPassword(email); setResetSent(true); } catch {}
  }
  const navigate = useNavigate();

  async function handleSubmit() {
    setFormError(null);
    if (!email || !password) { setFormError("Entrez votre email et votre mot de passe."); return; }
    if (mode === "register" && !acceptRisk) {
      setFormError("Vous devez accepter les risques du trading pour créer un compte.");
      return;
    }
    try {
      if (mode === "register") await register(email, password);
      else await login(email, password);
      navigate("/dashboard");
    } catch (_) {}
  }

  return (
    <div style={s.page}>
      <div style={s.card}>
        <div style={s.header}>
          <div style={s.logoWrap}>
            <TradifyLogo size={72} />
          </div>
          <h1 style={s.title}>Trad<span style={s.titleAccent}>ify</span></h1>
          <p style={s.subtitle}>Trading automatisé · XAUUSD</p>
        </div>

        <div style={s.toggle}>
          {["login", "register"].map((m) => (
            <button key={m} style={{ ...s.toggleBtn, ...(mode === m ? s.toggleActive : {}) }}
              onClick={() => setMode(m)}>
              {m === "login" ? "Connexion" : "Inscription"}
            </button>
          ))}
        </div>

        <div style={s.form}>
          <Field label="Email">
            <input style={s.input} type="email" value={email}
              onChange={(e) => setEmail(e.target.value)} placeholder="vous@exemple.com" />
          </Field>

          <Field label="Mot de passe">
            <input style={s.input} type="password" value={password}
              onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
          </Field>

          {mode === "register" && (
            <label style={s.riskBox}>
              <input type="checkbox" checked={acceptRisk} onChange={(e) => setAcceptRisk(e.target.checked)} style={{ marginTop: 2 }} />
              <span>
                Je comprends que le trading comporte un <strong>risque élevé de perte</strong>, que les performances
                passées ne garantissent pas les résultats futurs, et que je peux perdre tout ou partie de mon capital.
              </span>
            </label>
          )}

          {(formError || error) && <div style={s.errorBox}>{formError || error}</div>}

          <button style={{ ...s.btn, ...(loading ? s.btnDisabled : {}) }}
            onClick={handleSubmit} disabled={loading}>
            {loading ? "Chargement..." : mode === "login" ? "Se connecter" : "Créer mon compte"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label style={{ color: "#cbd5e1", fontSize: 13, fontWeight: 500 }}>{label}</label>
      {children}
    </div>
  );
}

const s = {
  page:        { minHeight: "100vh", background: "#060d1a", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "'Inter', sans-serif" },
  card:        { background: "#0d1829", border: "1px solid #1e3a5f", borderRadius: 20, padding: "44px 40px", width: "100%", maxWidth: 420 },
  header:      { textAlign: "center", marginBottom: 36 },
  logoWrap:    { marginBottom: 12 },
  logoImg:     { width: 72, height: 72, objectFit: "contain" },
  title:       { color: "#f1f5f9", fontSize: 28, fontWeight: 800, margin: 0, letterSpacing: "-0.5px" },
  titleAccent: { color: "#f59e0b" },
  subtitle:    { color: "#475569", fontSize: 13, marginTop: 6 },
  toggle:      { display: "flex", background: "#0a1525", borderRadius: 10, padding: 4, marginBottom: 32, border: "1px solid #1e3a5f" },
  toggleBtn:   { flex: 1, padding: "9px 0", border: "none", borderRadius: 7, background: "transparent", color: "#64748b", cursor: "pointer", fontSize: 14, fontWeight: 600, transition: "all 0.2s" },
  toggleActive:{ background: "#1e3a5f", color: "#f1f5f9" },
  form:        { display: "flex", flexDirection: "column", gap: 22 },
  input:       { background: "#0a1525", border: "1px solid #1e3a5f", borderRadius: 10, padding: "11px 14px", color: "#f1f5f9", fontSize: 14, outline: "none", width: "100%", boxSizing: "border-box" },
  optional:    { color: "#475569", fontWeight: 400, fontSize: 12 },
  helpBtn:     { width: 18, height: 18, borderRadius: "50%", border: "1px solid #334155", background: "transparent", color: "#64748b", fontSize: 11, cursor: "pointer" },
  helpBox:     { background: "#0a1525", border: "1px solid #1e3a5f", borderRadius: 8, padding: "10px 12px" },
  helpText:    { color: "#64748b", fontSize: 12, lineHeight: 1.7, margin: 0 },
  link:        { color: "#f59e0b" },
  linkBtn:     { background: "none", border: "none", color: "#f59e0b", fontSize: 13, cursor: "pointer", alignSelf: "center" },
  resetInfo:   { color: "#86efac", fontSize: 13, textAlign: "center", margin: 0 },
  riskBox:     { display: "flex", gap: 10, alignItems: "flex-start", color: "#94a3b8", fontSize: 12, lineHeight: 1.6, cursor: "pointer" },
  errorBox:    { background: "#7f1d1d33", border: "1px solid #ef444455", borderRadius: 8, padding: "10px 14px", color: "#fca5a5", fontSize: 13 },
  btn:         { background: "linear-gradient(135deg, #f59e0b, #d97706)", color: "#060d1a", border: "none", borderRadius: 10, padding: "13px 0", fontSize: 15, fontWeight: 800, cursor: "pointer", width: "100%", letterSpacing: "0.3px" },
  btnDisabled: { opacity: 0.5, cursor: "not-allowed" },
};
