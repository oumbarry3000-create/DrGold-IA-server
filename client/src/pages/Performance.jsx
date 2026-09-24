// src/pages/Performance.jsx — statistiques detaillees (donnees reelles du serveur)
import { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid } from "recharts";
import { CalendarDays } from "lucide-react";
import PageHeader from "../components/PageHeader";
import KPIGrid from "../components/dashboard/KPIGrid";
import PnLChart from "../components/dashboard/PnLChart";
import { useAppData } from "../context/AppData";
import { money, pct } from "../lib/format";

function Stat({ label, value, cls }) {
  return (
    <div className="tf-kpi">
      <p className="tf-label">{label}</p>
      <p className={`tf-kpi__value tf-num ${cls || ""}`} style={{ fontSize: 18 }}>{value}</p>
    </div>
  );
}

export default function Performance() {
  const { stats: s, series } = useAppData();
  const daily = useMemo(() => series.map((p) => ({ ...p, label: new Date(p.day + "T00:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) })), [series]);
  const avg = s && s.closed ? s.pnl / s.closed : 0;
  // Win rate d'equilibre = perte moyenne / (gain moyen + perte moyenne)
  const avgWin  = s && s.wins ? s.gains / s.wins : 0;
  const avgLoss = s && s.losses ? s.loss_sum / s.losses : 0;
  const breakEven = avgWin > 0 && avgLoss > 0 ? Math.round((avgLoss / (avgWin + avgLoss)) * 100) : null;

  return (
    <div className="tf-stack">
      <PageHeader title="Performance" subtitle="Calculée sur tous vos trades fermés" />
      <KPIGrid />
      {s && (
        <section className="tf-kpis" aria-label="Statistiques détaillées">
          <Stat label="P&L aujourd'hui" value={money(s.pnl_today, { sign: true })} cls={s.pnl_today < 0 ? "tf-neg" : "tf-pos"} />
          <Stat label="Moyenne / trade" value={money(avg, { sign: true })} cls={avg < 0 ? "tf-neg" : "tf-pos"} />
          <Stat label="Meilleur trade" value={money(s.best, { sign: true })} cls="tf-pos" />
          <Stat label="Pire trade" value={money(s.worst, { sign: true })} cls="tf-neg" />
          <Stat label="Win rate BUY" value={s.buys ? `${pct((s.buy_wins / s.buys) * 100)} (${s.buys})` : "—"} />
          <Stat label="Win rate SELL" value={s.sells ? `${pct((s.sell_wins / s.sells) * 100)} (${s.sells})` : "—"} />
        </section>
      )}
      <PnLChart height={260} />
      <section className="tf-card" aria-labelledby="daily-title">
        <div className="tf-card__head"><h2 id="daily-title" className="tf-card__title"><CalendarDays size={17} aria-hidden="true" /> P&amp;L par jour</h2></div>
        {daily.length === 0 ? <div className="tf-empty">Aucun trade fermé sur la période</div> : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={daily} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid stroke="#1a2941" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" stroke="#24375a" tick={{ fill: "#647792", fontSize: 11 }} tickLine={false} minTickGap={16} />
              <YAxis stroke="#24375a" tick={{ fill: "#647792", fontSize: 11 }} tickLine={false} axisLine={false} width={52} tickFormatter={(v) => `$${v}`} />
              <Tooltip contentStyle={{ background: "#0c1626", border: "1px solid #24375a", borderRadius: 8, fontSize: 12 }} labelStyle={{ color: "#a3b2c9" }}
                formatter={(v, n, p) => [`${money(v, { sign: true })} · ${p.payload.trades} trade(s)`, "P&L"]} cursor={{ fill: "rgba(47,123,255,.08)" }} />
              <Bar dataKey="pnl" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                {daily.map((d) => <Cell key={d.day} fill={d.pnl >= 0 ? "#22c55e" : "#ef4444"} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </section>
      {breakEven != null && s.closed > 0 && (
        <p className="tf-muted" style={{ fontSize: 12, lineHeight: 1.6, margin: 0 }}>
          Avec le gain moyen et la perte moyenne actuels, le bot doit gagner environ <strong style={{ color: "var(--text)" }}>{breakEven}%</strong> de ses trades pour être à l'équilibre
          (actuel : {pct(s.win_rate)} sur {s.closed} trades). Les performances passées ne garantissent pas les résultats futurs.
        </p>
      )}
    </div>
  );
}
