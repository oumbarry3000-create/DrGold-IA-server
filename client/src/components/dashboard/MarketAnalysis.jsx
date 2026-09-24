// src/components/dashboard/MarketAnalysis.jsx
// Analyse XAUUSD H1 : indicateurs reels (bougies Deriv) interpretes par l'IA.
// Sans donnees : etat "Analyse indisponible" (jamais de prediction inventee).
import { BrainCircuit, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { useMarketAnalysis } from "../../context/AppData";

const BIAS = {
  bullish: { pill: "tf-pill--green", label: "Haussier", Icon: TrendingUp },
  bearish: { pill: "tf-pill--red",   label: "Baissier", Icon: TrendingDown },
  neutral: { pill: "tf-pill--gold",  label: "Neutre",   Icon: Minus },
};

export default function MarketAnalysis() {
  const { data, error } = useMarketAnalysis();
  const ok = data?.status === "ok";
  const bias = BIAS[data?.bias] || BIAS.neutral;
  const conf = ok ? data.confidence : 0;

  return (
    <section className="tf-card" aria-labelledby="ai-title">
      <div className="tf-card__head">
        <h2 id="ai-title" className="tf-card__title"><BrainCircuit size={17} aria-hidden="true" /> IA Market Analysis</h2>
        {ok && <span className={`tf-pill ${bias.pill}`}><bias.Icon size={13} aria-hidden="true" /> {bias.label}</span>}
      </div>

      {!data && !error ? (
        <div className="tf-skeleton" style={{ height: 160 }} aria-label="Chargement de l'analyse" />
      ) : !ok ? (
        <div className="tf-empty"><BrainCircuit size={32} aria-hidden="true" />Analyse indisponible pour le moment</div>
      ) : (
        <>
          <p style={{ fontWeight: 800, margin: "0 0 10px", display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
            XAUUSD — {data.timeframe}
            <span className="tf-muted tf-num" style={{ fontWeight: 600, fontSize: 13 }}>
              {Number(data.indicators.price).toLocaleString("fr-FR", { minimumFractionDigits: 2 })} $
              {!data.market_open && " · marché fermé"}
            </span>
          </p>
          <div className="tf-analysis">
            <div className="tf-analysis__row"><span>Tendance</span><span>{data.trend}</span></div>
            <div className="tf-analysis__row"><span>Momentum</span><span>{data.momentum}</span></div>
            <div className="tf-analysis__row"><span>Structure</span><span>{data.structure}</span></div>
            <div className="tf-analysis__row"><span>Zone clé</span><span className="tf-num">{data.key_zone}</span></div>
            <div className="tf-analysis__row"><span>Signal</span><span>{data.signal}</span></div>
            <div className="tf-analysis__row"><span>RSI 14 · EMA 20/50</span><span className="tf-num">{data.indicators.rsi14} · {Math.round(data.indicators.ema20)}/{Math.round(data.indicators.ema50)}</span></div>
          </div>
          <div style={{ marginTop: 12 }}>
            <div className="tf-analysis__row" style={{ fontSize: 13, marginBottom: 6 }}>
              <span className="tf-muted">Confiance {data.source === "ia" ? "IA" : "(calcul technique)"}</span><strong>{conf}%</strong>
            </div>
            <div className="tf-progress" role="progressbar" aria-valuenow={conf} aria-valuemin={0} aria-valuemax={100} aria-label="Confiance de l'analyse">
              <span style={{ width: `${conf}%`, background: conf >= 65 ? "var(--green)" : conf >= 45 ? "var(--gold)" : "var(--red)" }} />
            </div>
          </div>
          <p className="tf-muted" style={{ fontSize: 11, margin: "10px 0 0", lineHeight: 1.5 }}>
            {data.stale ? "Données en cache · " : ""}Mise à jour {new Date(data.generated_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}. {data.disclaimer}
          </p>
        </>
      )}
    </section>
  );
}
