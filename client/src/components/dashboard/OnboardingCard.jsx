// src/components/dashboard/OnboardingCard.jsx
// Etats a traiter avant le dashboard : Deriv non connecte, reconnexion
// requise, compte suspendu, token 24h/24 bientot expire.
import { Link } from "react-router-dom";
import { Link2, RefreshCw, Ban, Clock } from "lucide-react";
import { startDerivOAuth } from "../../lib/derivOAuth";
import { useAppData } from "../../context/AppData";

export default function OnboardingCard() {
  const { user } = useAppData();
  if (!user) return null;

  if (!user.has_deriv_access) {
    return (
      <section className="tf-card" style={{ borderColor: "rgba(47,123,255,.5)" }} aria-labelledby="onb-title">
        <h2 id="onb-title" className="tf-card__title"><Link2 size={17} aria-hidden="true" /> Connectez votre compte Deriv pour activer le bot</h2>
        <p className="tf-muted" style={{ fontSize: 14, lineHeight: 1.6, margin: "8px 0 14px" }}>
          Pas encore de compte Deriv ? Créez-le avec notre bouton : c'est gratuit et <strong style={{ color: "var(--text)" }}>obligatoire</strong> pour
          que votre compte Tradify soit validé. Deriv vous demandera d'autoriser « Tradify » à passer des trades — il n'a jamais accès à vos retraits.
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button type="button" className="tf-btn tf-btn--primary tf-btn--lg" onClick={() => startDerivOAuth({ signup: true })}>Créer mon compte Deriv</button>
          <button type="button" className="tf-btn tf-btn--lg" onClick={() => startDerivOAuth()}>J'ai déjà un compte Deriv</button>
        </div>
      </section>
    );
  }

  if (!user.approved) {
    return (
      <div className="tf-alert tf-alert--danger" role="alert">
        <Ban size={20} aria-hidden="true" />
        <div><strong>Compte suspendu.</strong> Votre compte a été suspendu par l'équipe Tradify. <Link to="/messages?tab=support">Contactez le support</Link>.</div>
      </div>
    );
  }

  if (user.deriv_reauth_needed && !user.has_token) {
    return (
      <div className="tf-alert tf-alert--warn" role="alert" style={{ alignItems: "center", flexWrap: "wrap" }}>
        <RefreshCw size={20} aria-hidden="true" />
        <div style={{ flex: 1, minWidth: 200 }}><strong>Reconnectez votre compte Deriv.</strong> La connexion a expiré : le bot est en pause. Un clic suffit, puis réactivez le bot.</div>
        <button type="button" className="tf-btn tf-btn--gold" onClick={() => startDerivOAuth()}>Reconnecter Deriv</button>
      </div>
    );
  }

  if (user.has_token && user.token_age_days >= 80) {
    return (
      <div className="tf-alert tf-alert--warn" role="status">
        <Clock size={20} aria-hidden="true" />
        <div>Votre token Deriv (mode 24h/24) a {user.token_age_days} jours et expire bientôt : remplacez-le dans <Link to="/settings">Paramètres</Link>.</div>
      </div>
    );
  }
  return null;
}
