// src/context/AppData.jsx
// Source de donnees unique des pages connectees : un seul polling pour toute
// l'app (pas un par composant), suspendu quand l'onglet est cache.
//   /api/me          toutes les 5 s  (compte, bot, formule)
//   /api/stats       toutes les 30 s (KPI + courbe, periode reglable)
//   /api/inbox/status toutes les 20 s (badges)
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api";
import { confirmDialog, notify } from "../components/Dialog";

const Ctx = createContext(null);
export const useAppData = () => useContext(Ctx);

function usePolling(fn, ms, deps = []) {
  const saved = useRef(fn);
  saved.current = fn;
  useEffect(() => {
    let timer;
    let first = true;
    // Premier chargement toujours ; ensuite on saute les passages onglet cache
    const tick = async () => {
      if (first || !document.hidden) await saved.current();
      first = false;
      timer = setTimeout(tick, ms);
    };
    tick();
    const onVisible = () => { if (!document.hidden) saved.current(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearTimeout(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
}

export function AppDataProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [recent, setRecent]   = useState([]);
  const [meError, setMeError] = useState(null);
  const [stats, setStats]     = useState(null);
  const [series, setSeries]   = useState([]);
  const [days, setDays]       = useState(30);
  const [inbox, setInbox]     = useState({ unread: 0, newAnnouncements: 0, unreadNotifications: 0, uploads: false });
  const [togglingEA, setTogglingEA] = useState(false);

  const loadMe = useCallback(async () => {
    try {
      const { user, trades } = await api.me();
      setUser(user);
      setRecent(trades);
      setMeError(null);
    } catch (err) {
      setMeError(err.message);
    }
  }, []);

  const loadStats = useCallback(async () => {
    try {
      const r = await api.stats(days);
      setStats(r.stats);
      setSeries(r.series);
    } catch { /* KPI conserves, nouvel essai au prochain passage */ }
  }, [days]);

  const loadInbox = useCallback(async () => {
    try { setInbox(await api.inboxStatus()); } catch { /* badges conserves */ }
  }, []);

  usePolling(loadMe, 5000);
  usePolling(loadStats, 30000, [days]);
  usePolling(loadInbox, 20000);

  const refresh = useCallback(() => Promise.all([loadMe(), loadStats(), loadInbox()]), [loadMe, loadStats, loadInbox]);

  // Activer / mettre en pause le bot (confirmation avant la pause)
  const toggleEA = useCallback(async () => {
    if (togglingEA || !user) return;
    if (user.ea_active) {
      const ok = await confirmDialog({
        title: "Mettre le bot en pause ?",
        message: "TrendRider ne prendra plus de nouveaux trades. Les positions déjà ouvertes chez Deriv iront jusqu'à leur échéance.",
        confirmLabel: "Mettre en pause",
        danger: true,
      });
      if (!ok) return;
    }
    setTogglingEA(true);
    try {
      const { ea_active } = await api.toggleEA();
      setUser((u) => ({ ...u, ea_active }));
      notify(ea_active ? "Bot activé" : "Bot en pause");
      loadInbox();
    } catch (err) {
      notify(err.message, "error");
    } finally {
      setTogglingEA(false);
    }
  }, [togglingEA, user, loadInbox]);

  const badgeCount = inbox.unread + inbox.unreadNotifications + (inbox.newAnnouncements > 0 ? 1 : 0);

  const value = useMemo(() => ({
    user, recent, meError, stats, series, days, setDays, inbox, badgeCount,
    refresh, loadMe, loadInbox, toggleEA, togglingEA,
  }), [user, recent, meError, stats, series, days, inbox, badgeCount, refresh, loadMe, loadInbox, toggleEA, togglingEA]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// Positions ouvertes avec prix / P&L en direct (uniquement quand affichees)
export function useLivePositions(enabled = true) {
  const [data, setData]   = useState({ positions: [], connected: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  usePolling(async () => {
    if (!enabled) return;
    try {
      setData(await api.livePositions());
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, 10000, [enabled]);
  return { ...data, loading, error };
}

// Analyse IA du marche (cache serveur 15 min)
export function useMarketAnalysis() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  usePolling(async () => {
    try {
      setData(await api.marketAnalysis());
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, 5 * 60 * 1000);
  return { data, error };
}
