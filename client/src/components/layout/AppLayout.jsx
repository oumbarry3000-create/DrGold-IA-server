// src/components/layout/AppLayout.jsx
// Cadre des pages connectees : sidebar (desktop/tablette), en-tetes, barre
// mobile et assistant. Le hamburger reduit la sidebar (desktop) ou la
// deploie par-dessus le contenu (tablette).
import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";
import Header from "./Header";
import MobileNavigation from "./MobileNavigation";
import { AssistantButton } from "../assistant/TradingAssistant";

const COLLAPSE_KEY = "tf_sidebar_collapsed";

export default function AppLayout() {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem(COLLAPSE_KEY) === "1"; } catch { return false; } });
  const [open, setOpen] = useState(false); // tablette : menu deploye

  useEffect(() => { setOpen(false); window.scrollTo(0, 0); }, [location.pathname]);

  function onMenu() {
    if (window.innerWidth < 1200) return setOpen((o) => !o);
    setCollapsed((c) => {
      try { localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1"); } catch { /* preference non sauvegardee */ }
      return !c;
    });
  }

  return (
    <div className={`tf-app${collapsed ? " is-collapsed" : ""}${open ? " is-open" : ""}`}>
      <Sidebar onNavigate={() => setOpen(false)} />
      {open && <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 45, background: "rgba(0,0,0,.4)" }} aria-hidden="true" />}
      <div className="tf-main">
        <Header onMenu={onMenu} />
        <main className="tf-content" id="contenu">
          <Outlet />
        </main>
      </div>
      <MobileNavigation />
      <AssistantButton />
    </div>
  );
}
