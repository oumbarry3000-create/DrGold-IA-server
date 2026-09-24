// src/components/layout/Sidebar.jsx — navigation laterale (desktop / tablette)
import { NavLink, Link } from "react-router-dom";
import { Crown, Check } from "lucide-react";
import TradifyLogo from "../brand/TradifyLogo";
import { NAV_ITEMS, ADMIN_ITEM } from "./navItems";
import { useAppData } from "../../context/AppData";
import { fmtXof, fmtUsd, fmtDate } from "../../lib/ui";

export default function Sidebar({ onNavigate }) {
  const { user, stats, badgeCount } = useAppData();
  const badges = { messages: badgeCount, positions: stats?.open || 0 };
  const items = user?.is_admin ? [...NAV_ITEMS, ADMIN_ITEM] : NAV_ITEMS;

  return (
    <aside className="tf-sidebar" aria-label="Navigation principale">
      <Link to="/dashboard" className="tf-sidebar__brand" onClick={onNavigate} aria-label="Tradify, tableau de bord">
        <TradifyLogo size={40} />
        <span className="tf-hide-collapsed">
          <span className="tf-brand__name">Trad<span>ify</span></span>
          <span className="tf-brand__sub" style={{ display: "block" }}>XAUUSD • TrendRider</span>
        </span>
      </Link>

      <nav className="tf-nav">
        {items.map(({ to, label, icon: Icon, badge, gold }) => {
          const count = badge ? badges[badge] : 0;
          return (
            <NavLink key={to} to={to} onClick={onNavigate} title={label}
              className={({ isActive }) => `tf-nav__item${isActive ? " is-active" : ""}`}>
              <Icon size={19} aria-hidden="true" color={gold ? "var(--gold)" : undefined} />
              <span className="tf-hide-collapsed">{label}</span>
              {count > 0 && (
                <span className={`tf-nav__badge${badge === "positions" ? " is-neutral" : ""}`} aria-label={`${count} ${badge === "messages" ? "non lus" : "ouvertes"}`}>
                  {count}
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>

      <div className="tf-sidebar__foot tf-hide-collapsed">
        {user && (user.pro_active ? (
          <div className="tf-promo">
            <div className="tf-promo__title"><Crown size={18} aria-hidden="true" /> PRO actif</div>
            <div className="tf-promo__price">Jusqu'au {fmtDate(user.plan_expires_at)}</div>
            <Link to="/abonnement" className="tf-btn tf-btn--gold tf-btn--block" onClick={onNavigate}>Prolonger</Link>
          </div>
        ) : (
          <div className="tf-promo">
            <div className="tf-promo__title"><Crown size={18} aria-hidden="true" /> PRO</div>
            <div className="tf-promo__price">
              {fmtUsd(user.pro_price_usd)} / {user.pro_days} jours
              <span className="tf-muted" style={{ display: "block", fontSize: 11 }}>≈ {fmtXof(user.pro_price_xof)}</span>
            </div>
            <ul>
              <li><Check size={14} color="var(--gold)" aria-hidden="true" /> Trading sur compte réel</li>
              <li><Check size={14} color="var(--gold)" aria-hidden="true" /> Toutes les fonctionnalités</li>
              <li><Check size={14} color="var(--gold)" aria-hidden="true" /> Support prioritaire</li>
            </ul>
            <Link to="/abonnement" className="tf-btn tf-btn--gold tf-btn--block" onClick={onNavigate}>Passer Pro</Link>
          </div>
        ))}
        <div className="tf-version">Tradify v1.0<br />Un produit de Barry&amp;Co</div>
      </div>
    </aside>
  );
}
