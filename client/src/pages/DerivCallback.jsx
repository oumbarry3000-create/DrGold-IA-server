// src/pages/DerivCallback.jsx
// Retour de Deriv apres "Se connecter / Créer mon compte Deriv" : on envoie
// le code OAuth au serveur, qui lit la liste des comptes du trader.
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { takeOAuthContext } from "../lib/derivOAuth";
import { ui } from "../lib/ui";

export default function DerivCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState(null);
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return; // StrictMode : un seul echange (le code est a usage unique)
    done.current = true;

    const q = new URLSearchParams(window.location.search);
    if (q.get("error")) {
      setError(q.get("error_description") || "Connexion Deriv annulée.");
      return;
    }
    const ctx = takeOAuthContext(q.get("state"));
    if (!q.get("code") || !ctx) {
      setError("Session de connexion expirée. Recommencez depuis le tableau de bord.");
      return;
    }
    api.linkDerivOAuth(q.get("code"), ctx.verifier, ctx.signup)
      .then(() => navigate("/dashboard?deriv=ok", { replace: true }))
      .catch((err) => setError(err.message));
  }, [navigate]);

  return (
    <div style={ui.center}>
      <div style={{ ...ui.box, maxWidth: 440, textAlign: "center" }}>
        {error ? (
          <>
            <p style={{ fontSize: 32, margin: 0 }}>⚠️</p>
            <h2 style={ui.h2}>Liaison Deriv impossible</h2>
            <p style={ui.muted}>{error}</p>
            <button style={ui.btnGold} onClick={() => navigate("/dashboard", { replace: true })}>Retour au tableau de bord</button>
          </>
        ) : (
          <>
            <p style={{ fontSize: 32, margin: 0 }}>🔗</p>
            <h2 style={ui.h2}>Connexion de votre compte Deriv…</h2>
            <p style={ui.muted}>Ne fermez pas cette page.</p>
          </>
        )}
      </div>
    </div>
  );
}
