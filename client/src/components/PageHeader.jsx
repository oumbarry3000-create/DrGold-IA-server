// src/components/PageHeader.jsx
// En-tete des pages secondaires : bouton retour (page precedente, sinon
// tableau de bord) + titre + actions a droite.
import { useNavigate } from "react-router-dom";

export default function PageHeader({ title, subtitle, actions, onBack, backTo = "/dashboard" }) {
  const navigate = useNavigate();

  async function back() {
    if (onBack && !(await onBack())) return; // la page peut bloquer (modifs non enregistrees)
    if (window.history.state?.idx > 0) navigate(-1);
    else navigate(backTo, { replace: true });
  }

  return (
    <div style={st.bar}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
        <button style={st.back} onClick={back} aria-label="Retour">←</button>
        <div style={{ minWidth: 0 }}>
          <h1 style={st.title}>{title}</h1>
          {subtitle && <p style={st.subtitle}>{subtitle}</p>}
        </div>
      </div>
      {actions && <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{actions}</div>}
    </div>
  );
}

const st = {
  bar:      { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 20 },
  back:     { width: 38, height: 38, flexShrink: 0, borderRadius: 10, border: "1px solid #1e3a5f", background: "#0d1829", color: "#f1f5f9", fontSize: 18, fontWeight: 700, cursor: "pointer" },
  title:    { color: "#f1f5f9", fontSize: 21, fontWeight: 800, margin: 0 },
  subtitle: { color: "#64748b", fontSize: 13, margin: "2px 0 0" },
};
