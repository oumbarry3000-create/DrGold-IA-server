// src/pages/DerivCallback.jsx
// Retour de Deriv (OAuth). Deux cas :
//  - mode "login" : se connecter a Tradify avec Deriv (le serveur renvoie un
//    custom token Firebase) ;
//  - mode "link"  : lier Deriv au compte Tradify deja connecte.
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { onAuthStateChanged, signInWithCustomToken } from "firebase/auth";
import { auth } from "../lib/firebase";
import { api } from "../lib/api";
import { takeOAuthContext, startDerivOAuth } from "../lib/derivOAuth";
import TradifyLogo from "../components/brand/TradifyLogo";

// Attend la restauration de la session Firebase (null si non connecte)
const waitForUser = () => new Promise((resolve) => {
  const unsub = onAuthStateChanged(auth, (u) => { unsub(); resolve(u); });
});

export default function DerivCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState(null);
  const [retryMode, setRetryMode] = useState("link");
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return; // StrictMode : un seul echange (le code est a usage unique)
    done.current = true;

    (async () => {
      const q = new URLSearchParams(window.location.search);
      if (q.get("error")) return setError(q.get("error_description") || "Connexion Deriv annulée.");
      const ctx = takeOAuthContext(q.get("state"));
      const user = await waitForUser();
      if (!q.get("code") || !ctx) {
        setRetryMode(user ? "link" : "login");
        return setError("expired");
      }
      setRetryMode(ctx.mode);
      try {
        if (ctx.mode === "login") {
          const { customToken } = await api.loginWithDeriv(q.get("code"), ctx.verifier, ctx.signup);
          await signInWithCustomToken(auth, customToken);
          navigate("/dashboard", { replace: true });
        } else {
          if (!user) return navigate("/login", { replace: true });
          await api.linkDerivOAuth(q.get("code"), ctx.verifier, ctx.signup);
          navigate("/dashboard?deriv=ok", { replace: true });
        }
      } catch (err) {
        setError(err.message);
      }
    })();
  }, [navigate]);

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div className="tf-card" style={{ maxWidth: 440, width: "100%", textAlign: "center", padding: 28 }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}><TradifyLogo size={56} /></div>
        {error ? (
          <>
            <h1 style={{ fontSize: 18, margin: "0 0 8px" }}>{error === "expired" ? "Encore une étape" : "Connexion Deriv impossible"}</h1>
            <p className="tf-muted" style={{ fontSize: 14, lineHeight: 1.6 }}>
              {error === "expired"
                ? "Votre compte Deriv est créé ? Parfait : cliquez ci-dessous et connectez-vous avec l'email et le mot de passe de votre compte Deriv."
                : error}
            </p>
            <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
              <button type="button" className="tf-btn tf-btn--primary tf-btn--lg" onClick={() => startDerivOAuth({ mode: retryMode })}>
                {error === "expired" ? "Continuer avec Deriv" : "Réessayer"}
              </button>
              <button type="button" className="tf-btn tf-btn--lg" onClick={() => navigate(retryMode === "login" ? "/login" : "/dashboard", { replace: true })}>
                {retryMode === "login" ? "Retour à la connexion" : "Retour au tableau de bord"}
              </button>
            </div>
          </>
        ) : (
          <>
            <h1 style={{ fontSize: 18, margin: "0 0 8px" }}>Connexion à votre compte Deriv…</h1>
            <p className="tf-muted" style={{ fontSize: 14 }}>Ne fermez pas cette page.</p>
          </>
        )}
      </div>
    </div>
  );
}
