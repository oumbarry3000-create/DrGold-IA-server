// src/pages/Login.jsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

export default function Login() {
  const [mode, setMode]             = useState("login");
  const [email, setEmail]           = useState("");
  const [password, setPassword]     = useState("");
  const [derivToken, setDerivToken] = useState("");
  const [showHelp, setShowHelp]     = useState(false);
  const { login, register, loading, error } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit() {
    if (!email || !password) return;
    if (mode === "register" && !derivToken) {
      alert("Token Deriv requis à l'inscription");
      return;
    }
    try {
      if (mode === "register") await register(email, password, derivToken);
      else await login(email, password, derivToken || null);
      navigate("/dashboard");
    } catch (_) {}
  }

  return (
    <div style={s.page}>
      <div style={s.card}>
        <div style={s.header}>
          <div style={s.logoWrap}>
            <span style={s.logoIcon}>◈</span>
          </div>
          <h1 style={s.title}>DrGold<span style={s.titleAccent}> IA</span></h1>
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

          <Field label={
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              Token Deriv API
              {mode === "login" && <span style={s.optional}>(optionnel)</span>}
              <button style={s.helpBtn} onClick={() => setShowHelp(!showHelp)}>?</button>
            </span>
          }>
            <input style={s.input} type="text" value={derivToken}
              onChange={(e) => setDerivToken(e.target.value)}
              placeholder="Coller votre token Deriv ici" />
            {showHelp && (
              <div style={s.helpBox}>
                <p style={s.helpText}>
                  Obtenez votre token sur{" "}
                  <a href="https://app.deriv.com/account/api-token" target="_blank"
                    rel="noreferrer" style={s.link}>
                    app.deriv.com → API Token
                  </a>
                  <br />Accès requis : <strong>Trade</strong> + <strong>Read</strong>
                </p>
              </div>
            )}
          </Field>

          {error && <div style={s.errorBox}>{error}</div>}

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
  logoIcon:    { fontSize: 40, color: "#f59e0b", filter: "drop-shadow(0 0 12px #f59e0b88)" },
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
  errorBox:    { background: "#7f1d1d33", border: "1px solid #ef444455", borderRadius: 8, padding: "10px 14px", color: "#fca5a5", fontSize: 13 },
  btn:         { background: "linear-gradient(135deg, #f59e0b, #d97706)", color: "#060d1a", border: "none", borderRadius: 10, padding: "13px 0", fontSize: 15, fontWeight: 800, cursor: "pointer", width: "100%", letterSpacing: "0.3px" },
  btnDisabled: { opacity: 0.5, cursor: "not-allowed" },
};
