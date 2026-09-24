// src/components/messages/MessageCard.jsx — une notification du bot
import { memo } from "react";
import { CheckCircle2, AlertTriangle, Info, OctagonAlert, Check } from "lucide-react";
import { dateTime } from "../../lib/format";

const LEVEL = {
  success: { Icon: CheckCircle2, color: "var(--green)", bg: "var(--green-soft)" },
  warning: { Icon: AlertTriangle, color: "var(--gold)", bg: "var(--gold-soft)" },
  info:    { Icon: Info,          color: "#60a5fa",     bg: "var(--blue-soft)" },
  danger:  { Icon: OctagonAlert,  color: "var(--red)",  bg: "var(--red-soft)" },
};
export const CATEGORY_LABEL = { trading: "Trading", bot: "Bot", compte: "Compte", systeme: "Système" };

function MessageCard({ n, onRead }) {
  const { Icon, color, bg } = LEVEL[n.level] || LEVEL.info;
  return (
    <article className={`tf-notif${n.read ? "" : " is-unread"}`} aria-label={`${n.read ? "" : "Non lu : "}${n.title}`}>
      <div className="tf-notif__icon" style={{ background: bg, color }}><Icon size={18} aria-hidden="true" /></div>
      <div style={{ minWidth: 0 }}>
        <p className="tf-notif__title">
          {n.title}
          <span className="tf-pill tf-pill--muted" style={{ fontSize: 10, padding: "1px 8px" }}>{CATEGORY_LABEL[n.category] || n.category}</span>
          {!n.read && <span className="tf-pill tf-pill--blue" style={{ fontSize: 10, padding: "1px 8px" }}>Nouveau</span>}
        </p>
        {n.body && <p className="tf-notif__body">{n.body}</p>}
        <div className="tf-notif__meta">{dateTime(n.created_at)}</div>
      </div>
      {!n.read ? (
        <button type="button" className="tf-btn tf-btn--ghost" style={{ minHeight: 32, fontSize: 12 }} onClick={() => onRead(n.id)} aria-label={`Marquer « ${n.title} » comme lu`}>
          <Check size={14} aria-hidden="true" /> Marquer lu
        </button>
      ) : <span />}
    </article>
  );
}

export default memo(MessageCard);
