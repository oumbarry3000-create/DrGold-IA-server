// src/components/dashboard/OpenPositions.jsx
// Positions ouvertes avec prix actuel et P&L en cours lus chez Deriv.
// Desktop : tableau ; mobile : cartes. Les contrats Deriv utilises (CALL/PUT
// 1 h) n'ont ni SL ni TP : on affiche la mise, l'echeance et le gain possible.
import { Link } from "react-router-dom";
import { Target, ArrowRight } from "lucide-react";
import { useLivePositions } from "../../context/AppData";
import { money, price, countdown } from "../../lib/format";
import BotStatus from "./BotStatus";

function Side({ d }) {
  return <span className={`tf-side ${d === "BUY" ? "tf-side--buy" : "tf-side--sell"}`}>{d}</span>;
}

function Pnl({ p }) {
  if (p.profit == null) return <span className="tf-muted" title="En attente des données Deriv">—</span>;
  return <strong className={`tf-num ${p.profit >= 0 ? "tf-pos" : "tf-neg"}`}>{money(p.profit, { sign: true })}</strong>;
}

export default function OpenPositions({ limit, showControls = false, title = "Positions ouvertes" }) {
  const { positions, loading, error, connected } = useLivePositions(true);
  const list = limit ? positions.slice(0, limit) : positions;
  const compact = !!limit; // carte du dashboard : colonnes essentielles

  return (
    <section className="tf-card" aria-labelledby="pos-title">
      <div className="tf-card__head">
        <h2 id="pos-title" className="tf-card__title">
          <Target size={17} aria-hidden="true" /> {title}
          {positions.length > 0 && <span className="tf-pill tf-pill--muted" style={{ fontSize: 11, padding: "1px 8px" }}>{positions.length}</span>}
        </h2>
        {limit && positions.length > 0 && <Link to="/positions" className="tf-link">Voir toutes <ArrowRight size={14} aria-hidden="true" /></Link>}
      </div>

      {loading ? (
        <div className="tf-skeleton" style={{ height: 90 }} aria-label="Chargement" />
      ) : error ? (
        <div className="tf-alert tf-alert--danger">Positions indisponibles : {error}</div>
      ) : list.length === 0 ? (
        <div className="tf-empty"><Target size={32} aria-hidden="true" />Aucune position ouverte</div>
      ) : (
        <>
          <div className="tf-table-wrap tf-only-desktop">
            <table className="tf-table">
              <caption className="sr-only">Positions ouvertes</caption>
              <thead>
                <tr><th scope="col">#</th><th scope="col">Symbole</th><th scope="col">Type</th>{!compact && <th scope="col">Mise</th>}<th scope="col">Entrée</th><th scope="col">Prix actuel</th><th scope="col">Échéance</th><th scope="col">P&amp;L</th></tr>
              </thead>
              <tbody>
                {list.map((p, i) => (
                  <tr key={p.contract_id}>
                    <td>{i + 1}</td>
                    <td><strong>XAUUSD</strong></td>
                    <td><Side d={p.direction} /></td>
                    {!compact && <td className="tf-num">{money(p.stake)}</td>}
                    <td className="tf-num">{price(p.entry_spot)}</td>
                    <td className="tf-num">{price(p.current_spot)}</td>
                    <td className="tf-num">{countdown(p.expires_at)}</td>
                    <td><Pnl p={p} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="tf-only-mobile" style={{ display: undefined }}>
            <div className="tf-stack" style={{ gap: 10 }}>
              {list.map((p) => (
                <article key={p.contract_id} className="tf-pos-card" aria-label={`Position ${p.direction} XAUUSD`}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span className={`tf-pill ${p.direction === "BUY" ? "tf-pill--green" : "tf-pill--red"}`} style={{ fontSize: 13 }}>{p.direction}</span>
                    <div style={{ lineHeight: 1.3 }}>
                      <strong>XAUUSD</strong>
                      <div className="tf-muted" style={{ fontSize: 12 }}>Mise {money(p.stake)} · échéance {countdown(p.expires_at)}</div>
                    </div>
                    <div style={{ marginLeft: "auto", textAlign: "right" }}>
                      <div className="tf-label" style={{ margin: 0 }}>P&amp;L</div>
                      <Pnl p={p} />
                    </div>
                  </div>
                  <div className="tf-pos-card__grid">
                    <div><p className="tf-label">Entrée</p><strong className="tf-num">{price(p.entry_spot)}</strong></div>
                    <div><p className="tf-label">Prix actuel</p><strong className="tf-num">{price(p.current_spot)}</strong></div>
                    <div><p className="tf-label">Gain possible</p><strong className="tf-num tf-pos">{p.payout != null ? money(p.payout - p.stake, { sign: true }) : "—"}</strong></div>
                  </div>
                </article>
              ))}
            </div>
          </div>
          {!connected && <p className="tf-muted" style={{ fontSize: 12, margin: "10px 0 0" }}>Prix en direct indisponibles tant que le bot n'est pas connecté à Deriv.</p>}
        </>
      )}
      {showControls && <BotStatus big />}
    </section>
  );
}
