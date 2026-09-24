// src/components/messages/MessageList.jsx — notifications filtrables + "tout marquer lu"
import { useCallback, useEffect, useState } from "react";
import { BellOff, CheckCheck } from "lucide-react";
import { api } from "../../lib/api";
import { notify } from "../Dialog";
import { useAppData } from "../../context/AppData";
import MessageCard, { CATEGORY_LABEL } from "./MessageCard";

const FILTERS = [["", "Tous"], ...Object.entries(CATEGORY_LABEL)];

export default function MessageList() {
  const { loadInbox } = useAppData();
  const [category, setCategory] = useState("");
  const [items, setItems]       = useState(null);
  const [unread, setUnread]     = useState(0);
  const [error, setError]       = useState(null);

  const load = useCallback(async () => {
    try {
      const r = await api.notifications(category || undefined);
      setItems(r.notifications);
      setUnread(r.unread);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, [category]);

  useEffect(() => {
    setItems(null);
    load();
    const t = setInterval(() => { if (!document.hidden) load(); }, 20000);
    return () => clearInterval(t);
  }, [load]);

  const markRead = useCallback(async (id) => {
    setItems((list) => list?.map((n) => (n.id === id ? { ...n, read: true } : n)));
    setUnread((u) => Math.max(0, u - 1));
    try { await api.readNotification(id); loadInbox(); } catch (err) { notify(err.message, "error"); load(); }
  }, [load, loadInbox]);

  async function markAll() {
    try {
      await api.readAllNotifications();
      setItems((list) => list?.map((n) => ({ ...n, read: true })));
      setUnread(0);
      loadInbox();
      notify("Toutes les notifications sont lues");
    } catch (err) {
      notify(err.message, "error");
    }
  }

  return (
    <div className="tf-stack">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <div className="tf-tabs" role="tablist" aria-label="Catégories de notifications">
          {FILTERS.map(([k, label]) => (
            <button key={k || "all"} type="button" role="tab" aria-selected={category === k} className={`tf-chip${category === k ? " is-active" : ""}`} onClick={() => setCategory(k)}>
              {label}
            </button>
          ))}
        </div>
        {unread > 0 && <button type="button" className="tf-btn" onClick={markAll}><CheckCheck size={16} aria-hidden="true" /> Tout marquer lu ({unread})</button>}
      </div>

      {error ? <div className="tf-alert tf-alert--danger">Notifications indisponibles : {error}</div>
        : items === null ? <div className="tf-skeleton" style={{ height: 160 }} aria-label="Chargement" />
        : items.length === 0 ? <div className="tf-card"><div className="tf-empty"><BellOff size={32} aria-hidden="true" />Aucune notification{category ? " dans cette catégorie" : ""}</div></div>
        : items.map((n) => <MessageCard key={n.id} n={n} onRead={markRead} />)}
    </div>
  );
}
