// src/components/layout/MobileNavigation.jsx — barre fixe en bas (mobile)
import { NavLink } from "react-router-dom";
import { MOBILE_ITEMS } from "./navItems";
import { useAppData } from "../../context/AppData";

export default function MobileNavigation() {
  const { badgeCount, stats } = useAppData();
  const badges = { messages: badgeCount, positions: stats?.open || 0 };
  return (
    <nav className="tf-bottom-nav" aria-label="Navigation mobile">
      {MOBILE_ITEMS.map(({ to, label, icon: Icon, badge }) => {
        const count = badge ? badges[badge] : 0;
        return (
          <NavLink key={to} to={to} className={({ isActive }) => (isActive ? "is-active" : "")}>
            <Icon size={21} aria-hidden="true" />
            {label}
            {count > 0 && <span className={`tf-nav__badge${badge === "positions" ? " is-neutral" : ""}`}>{count}</span>}
          </NavLink>
        );
      })}
    </nav>
  );
}
