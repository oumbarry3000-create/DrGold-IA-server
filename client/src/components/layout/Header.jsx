// src/components/layout/Header.jsx — en-tete desktop / tablette + en-tete mobile
import { Link } from "react-router-dom";
import { Menu, MessageSquare, Settings, LogOut, Bell } from "lucide-react";
import TradifyLogo from "../brand/TradifyLogo";
import { useAppData } from "../../context/AppData";
import { auth } from "../../lib/firebase";
import { confirmDialog } from "../Dialog";
import { initials, displayName } from "../../lib/format";

async function logout() {
  const ok = await confirmDialog({ title: "Se déconnecter ?", message: "Le bot continue de trader même quand vous êtes déconnecté.", confirmLabel: "Se déconnecter" });
  if (ok) await auth.signOut();
}

export function EABadge() {
  const { user, toggleEA, togglingEA } = useAppData();
  if (!user) return null;
  const canRun = user.has_deriv_access && user.approved;
  const on = user.ea_active;
  return (
    <button type="button" className={`tf-pill ${on ? "tf-pill--green" : "tf-pill--muted"}`} onClick={toggleEA}
      disabled={togglingEA || (!on && !canRun)} aria-pressed={on}
      title={on ? "Cliquer pour mettre le bot en pause" : canRun ? "Cliquer pour activer le bot" : "Connectez Deriv pour activer le bot"}
      style={{ minHeight: 34, padding: "0 12px" }}>
      <span className="tf-led" aria-hidden="true" /> {on ? "EA Actif" : "EA en pause"}
    </button>
  );
}

export default function Header({ onMenu }) {
  const { user, badgeCount } = useAppData();
  return (
    <>
      <header className="tf-header">
        <button type="button" className="tf-btn tf-btn--ghost tf-icon-btn" onClick={onMenu} aria-label="Afficher ou réduire le menu">
          <Menu size={20} />
        </button>
        <div className="tf-header__symbol">
          <strong>XAUUSD</strong>
          <span>TrendRider • M1 → contrats 1 h</span>
        </div>
        <div className="tf-header__actions">
          <Link to="/messages" className="tf-btn" aria-label={`Messages${badgeCount ? `, ${badgeCount} non lus` : ""}`}>
            <MessageSquare size={16} aria-hidden="true" /><span className="tf-header__label">Messages</span>
            {badgeCount > 0 && <span className="tf-dot-badge">{badgeCount}</span>}
          </Link>
          <Link to="/settings" className="tf-btn" aria-label="Paramètres">
            <Settings size={16} aria-hidden="true" /><span className="tf-header__label">Paramètres</span>
          </Link>
          <button type="button" className="tf-btn" onClick={logout} aria-label="Déconnexion">
            <LogOut size={16} aria-hidden="true" /><span className="tf-header__label">Déconnexion</span>
          </button>
          <EABadge />
          {user && (
            <Link to="/settings" className="tf-profile" aria-label="Mon profil">
              <span className="tf-avatar" aria-hidden="true">{initials(user)}</span>
              <span className="tf-profile__name tf-header__label">{displayName(user)}</span>
            </Link>
          )}
        </div>
      </header>

      <header className="tf-mobile-header">
        <Link to="/dashboard" style={{ textDecoration: "none", minWidth: 0 }} aria-label="Tradify, tableau de bord">
          <TradifyLogo size={40} withName />
        </Link>
        <div className="tf-mobile-header__actions">
          <Link to="/messages?tab=notifications" className="tf-btn tf-btn--ghost tf-icon-btn" aria-label={`Notifications${badgeCount ? `, ${badgeCount} non lues` : ""}`}>
            <Bell size={20} />
            {badgeCount > 0 && <span className="tf-dot-badge">{badgeCount}</span>}
          </Link>
          {user && <Link to="/settings" className="tf-avatar" style={{ textDecoration: "none" }} aria-label="Mon profil">{initials(user)}</Link>}
        </div>
      </header>
    </>
  );
}
