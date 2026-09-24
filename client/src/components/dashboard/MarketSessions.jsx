// src/components/dashboard/MarketSessions.jsx — sessions Tokyo / Londres / New York
import { useEffect, useState } from "react";
import { Globe2 } from "lucide-react";
import { SESSIONS, sessionState, goldMarketOpen, goldBreakLabel } from "../../lib/marketSessions";

const PILL = { open: "tf-pill--green", soon: "tf-pill--gold", closed: "tf-pill--muted" };

export default function MarketSessions() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const goldOpen = goldMarketOpen(now);

  return (
    <section className="tf-card" aria-labelledby="sess-title">
      <div className="tf-card__head">
        <h2 id="sess-title" className="tf-card__title"><Globe2 size={17} aria-hidden="true" /> Sessions de marché</h2>
      </div>
      {SESSIONS.map((s) => {
        const st = sessionState(s, now);
        return (
          <div key={s.id} className="tf-session">
            <span className="tf-session__icon" style={{ background: st.status === "open" ? s.color : "transparent", border: `2px solid ${s.color}` }} aria-hidden="true" />
            <div>
              <div className="tf-session__name">{s.name}</div>
              <div className="tf-session__hours tf-num">{st.hours}</div>
              {st.status === "open" && (
                <div className="tf-progress" style={{ marginTop: 5, height: 4 }} aria-hidden="true"><span style={{ width: `${st.progress}%`, background: s.color }} /></div>
              )}
            </div>
            <span className={`tf-pill ${PILL[st.status]}`} style={{ fontSize: 11 }}>
              {st.label}{st.detail ? ` · ${st.detail}` : ""}
            </span>
          </div>
        );
      })}
      <p className="tf-muted" style={{ fontSize: 11, margin: "8px 0 0", lineHeight: 1.5 }}>
        Or (Deriv) : {goldOpen ? <span className="tf-pos">ouvert</span> : <span className="tf-neg">fermé</span>} · pause quotidienne {goldBreakLabel()} et le week-end. Heures : {tz}.
      </p>
    </section>
  );
}
