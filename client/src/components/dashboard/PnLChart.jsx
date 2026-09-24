// src/components/dashboard/PnLChart.jsx — courbe du P&L cumule (donnees reelles uniquement)
import { memo, useMemo } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, CartesianGrid } from "recharts";
import { TrendingUp, BarChart3 } from "lucide-react";
import { useAppData } from "../../context/AppData";
import { money } from "../../lib/format";

const RANGES = [["7", "7 jours"], ["30", "30 jours"], ["90", "90 jours"], ["all", "Tout"]];

const Chart = memo(function Chart({ data, height }) {
  const positive = (data[data.length - 1]?.cumulative ?? 0) >= 0;
  const color = positive ? "#22c55e" : "#ef4444";
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <defs>
          <linearGradient id="tfPnl" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.22} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#1a2941" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" stroke="#24375a" tick={{ fill: "#647792", fontSize: 11 }} tickLine={false} minTickGap={24} />
        <YAxis stroke="#24375a" tick={{ fill: "#647792", fontSize: 11 }} tickLine={false} axisLine={false} width={52} tickFormatter={(v) => `$${v}`} />
        <Tooltip contentStyle={{ background: "#0c1626", border: "1px solid #24375a", borderRadius: 8, fontSize: 12 }}
          labelStyle={{ color: "#a3b2c9" }} formatter={(v, name) => [money(v, { sign: true }), name === "cumulative" ? "P&L cumulé" : "Jour"]} />
        <ReferenceLine y={0} stroke="#24375a" />
        <Area type="monotone" dataKey="cumulative" stroke={color} strokeWidth={2} fill="url(#tfPnl)" isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
});

export default function PnLChart({ height = 240 }) {
  const { series, days, setDays, stats } = useAppData();
  const data = useMemo(() => series.map((p) => ({
    ...p, label: new Date(p.day + "T00:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short" }),
  })), [series]);

  return (
    <section className="tf-card" aria-labelledby="pnl-title">
      <div className="tf-card__head">
        <h2 id="pnl-title" className="tf-card__title"><TrendingUp size={17} aria-hidden="true" /> Courbe P&amp;L Cumulé</h2>
        <label className="sr-only" htmlFor="pnl-range">Période</label>
        <select id="pnl-range" className="tf-select" value={String(days)} onChange={(e) => setDays(e.target.value === "all" ? "all" : Number(e.target.value))}>
          {RANGES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      {!stats ? (
        <div className="tf-skeleton" style={{ height }} aria-label="Chargement" />
      ) : data.length < 1 ? (
        <div className="tf-empty" style={{ height: height - 40, justifyContent: "center" }}>
          <BarChart3 size={36} aria-hidden="true" />
          Aucun trade fermé pour le moment
        </div>
      ) : (
        <Chart data={data.length === 1 ? [{ ...data[0], label: "", cumulative: 0 }, ...data] : data} height={height} />
      )}
    </section>
  );
}
