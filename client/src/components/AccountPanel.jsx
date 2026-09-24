// src/components/AccountPanel.jsx
// Parcours d'un nouveau trader : connecter Deriv (OAuth, lien partenaire pour
// les nouveaux comptes, validation automatique) puis carte formule / type de compte.
import { useState } from "react";
import { api } from "../lib/api";
import { startDerivOAuth } from "../lib/derivOAuth";
import { ui, fmtXof, fmtDate } from "../lib/ui";

const TOKEN_RENEW_DAYS = 80; // les tokens Deriv expirent au plus tard a 90 jours

export default function AccountPanel({ user, onChange }) {
  const linked   = user.has_deriv_access;
  const tokenOld = user.has_token && user.token_age_days != null && user.token_age_days >= TOKEN_RENEW_DAYS;

  // Etape unique : connecter Deriv (compte valide automatiquement ensuite)
  if (!linked) {
    return (
      <div style={{ ...ui.box, borderColor: "#f59e0b55" }}>
        <h3 style={{ ...ui.h3, color: "#f59e0b" }}>🚀 Connectez votre compte Deriv pour activer le bot</h3>
        <LinkDeriv />
      </div>
    );
  }

  if (!user.approved) {
    return (
      <div style={{ ...ui.box, borderColor: "#ef444455" }}>
        <h3 style={{ ...ui.h3, color: "#fca5a5" }}>⛔ Compte suspendu</h3>
        <p style={{ ...ui.muted, margin: 0 }}>Votre compte a été suspendu par l'équipe DrGold. Contactez le support.</p>
      </div>
    );
  }

  return (
    <>
      {user.deriv_reauth_needed && !user.has_token && (
        <div style={{ ...ui.box, borderColor: "#f59e0b" }}>
          <h3 style={{ ...ui.h3, color: "#f59e0b" }}>🔄 Reconnectez votre compte Deriv</h3>
          <p style={ui.muted}>
            Par sécurité, Deriv a mis fin à la connexion du bot. Un clic suffit pour le relancer
            (puis réactivez l'EA).
          </p>
          <button style={ui.btnGold} onClick={() => startDerivOAuth()}>Reconnecter Deriv</button>
        </div>
      )}
      {tokenOld && (
        <div style={{ ...ui.box, borderColor: "#f59e0b55" }}>
          <h3 style={{ ...ui.h3, color: "#f59e0b" }}>⏰ Votre token Deriv expire bientôt</h3>
          <p style={ui.muted}>Créé il y a {user.token_age_days} jours : remplacez-le dans Paramètres → Compte Deriv.</p>
        </div>
      )}
      <PlanCard user={user} onChange={onChange} />
    </>
  );
}

function LinkDeriv() {
  return (
    <>
      <p style={ui.muted}>
        Pas encore de compte Deriv ? Créez-le avec notre bouton : c'est gratuit et <strong style={{ color: "#f1f5f9" }}>obligatoire</strong> pour
        que votre compte DrGold soit validé.
      </p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button style={ui.btnGold} onClick={() => startDerivOAuth({ signup: true })}>Créer mon compte Deriv</button>
        <button style={ui.btnDark} onClick={() => startDerivOAuth()}>J'ai déjà un compte Deriv</button>
      </div>
    </>
  );
}

function PlanCard({ user, onChange }) {
  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState(null);
  const pro  = user.pro_active;
  const real = user.effective_account_type === "real";

  async function subscribe() {
    setBusy(true); setError(null);
    try {
      const { checkoutUrl } = await api.startCheckout();
      window.location.href = checkoutUrl;
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  async function switchType(type) {
    if (type === "real" && !window.confirm(
      "Passer le bot sur votre compte RÉEL ?\n\nLe bot tradera avec votre argent. Vous pouvez perdre tout ou partie de votre capital."
    )) return;
    setBusy(true); setError(null);
    try {
      await api.setAccountType(type);
      onChange?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={ui.box}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
        <div>
          <h3 style={ui.h3}>💎 Ma formule</h3>
          <p style={{ color: "#f1f5f9", fontSize: 20, fontWeight: 800, margin: "0 0 4px" }}>
            {pro ? "Pro" : "Basique"}{" "}
            {pro ? <span style={ui.badge("#4c1d9555", "#c4b5fd")}>jusqu'au {fmtDate(user.plan_expires_at)}</span>
                 : <span style={ui.badge("#1e293b", "#94a3b8")}>Gratuit · démo</span>}
          </p>
          <p style={{ ...ui.muted, margin: 0 }}>
            {pro ? "Compte réel autorisé, statistiques complètes." : `Pro : trading sur compte réel · ${fmtXof(user.pro_price_xof)} / ${user.pro_days} jours`}
          </p>
        </div>
        <button style={{ ...ui.btnGold, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={subscribe}>
          {pro ? `Prolonger (${fmtXof(user.pro_price_xof)})` : `Passer Pro · ${fmtXof(user.pro_price_xof)}`}
        </button>
      </div>

      <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid #1e3a5f", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span style={{ color: "#94a3b8", fontSize: 13, fontWeight: 600 }}>Le bot trade sur :</span>
        <div style={{ display: "flex", background: "#0a1525", border: "1px solid #1e3a5f", borderRadius: 10, padding: 3 }}>
          {[["demo", "Compte démo"], ["real", "Compte réel"]].map(([t, label]) => {
            const active = (t === "real") === real;
            const disabled = busy || (t === "real" && !pro);
            return (
              <button key={t} disabled={disabled} onClick={() => !active && switchType(t)}
                title={t === "real" && !pro ? "Formule Pro requise" : ""}
                style={{
                  border: "none", borderRadius: 8, padding: "7px 14px", fontSize: 13, fontWeight: 700,
                  cursor: disabled ? "not-allowed" : "pointer",
                  background: active ? (t === "real" ? "#b45309" : "#1e3a5f") : "transparent",
                  color: active ? "#f1f5f9" : disabled ? "#334155" : "#64748b",
                }}>
                {label}{t === "real" && !pro ? " 🔒" : ""}
              </button>
            );
          })}
        </div>
      </div>
      {error && <div style={ui.error}>{error}</div>}
    </div>
  );
}
