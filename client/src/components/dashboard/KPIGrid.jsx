// src/components/dashboard/KPIGrid.jsx — indicateurs calcules par le serveur sur TOUS les trades
import { useAppData } from "../../context/AppData";
import { money, pct } from "../../lib/format";

export default function KPIGrid() {
  const { stats } = useAppData();
  const s = stats;
  const items = [
    { label: "P&L total",          value: s ? money(s.pnl, { sign: true }) : null, cls: s && s.pnl < 0 ? "tf-neg" : "tf-pos" },
    { label: "Win rate",           value: s ? pct(s.win_rate) : null, cls: "tf-gold" },
    { label: "Trades fermés",      value: s ? s.closed : null, style: { color: "#60a5fa" } },
    { label: "Positions ouvertes", value: s ? s.open : null, style: { color: "#a78bfa" } },
    { label: "Gains",              value: s ? `+${money(s.gains)}` : null, cls: "tf-pos" },
    { label: "Pertes",             value: s ? `-${money(s.loss_sum)}` : null, cls: "tf-neg" },
  ];
  return (
    <section className="tf-kpis" aria-label="Indicateurs de performance">
      {items.map((k) => (
        <div key={k.label} className="tf-kpi">
          <p className="tf-label">{k.label}</p>
          {k.value == null
            ? <div className="tf-skeleton" style={{ height: 24, width: "70%" }} aria-label="Chargement" />
            : <p className={`tf-kpi__value tf-num ${k.cls || ""}`} style={k.style}>{k.value}</p>}
        </div>
      ))}
    </section>
  );
}
