// src/pages/History.jsx — historique des trades fermes (pagine)
import { useCallback, useEffect, useState } from "react";
import { History as HistoryIcon } from "lucide-react";
import PageHeader from "../components/PageHeader";
import { api } from "../lib/api";
import { money, price, dateTime, isDemoAccount } from "../lib/format";

const PAGE = 50;

export default function History() {
  const [trades, setTrades] = useState(null);
  const [total, setTotal]   = useState(0);
  const [side, setSide]     = useState("ALL");
  const [error, setError]   = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(async (offset = 0) => {
    try {
      const r = await api.trades({ status: "closed", limit: PAGE, offset });
      setTrades((prev) => (offset ? [...(prev || []), ...r.trades] : r.trades));
      setTotal(r.total);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => { load(0); }, [load]);

  async function more() {
    setLoadingMore(true);
    await load(trades.length);
    setLoadingMore(false);
  }

  const shown = (trades || []).filter((t) => side === "ALL" || t.direction === side);

  return (
    <div className="tf-stack">
      <PageHeader title="Historique" subtitle={trades ? `${total} trade${total > 1 ? "s" : ""} fermé${total > 1 ? "s" : ""}` : "Trades fermés"} />
      <div className="tf-tabs" role="tablist" aria-label="Filtrer par sens">
        {[["ALL", "Tous"], ["BUY", "Achats (BUY)"], ["SELL", "Ventes (SELL)"]].map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={side === k} className={`tf-chip${side === k ? " is-active" : ""}`} onClick={() => setSide(k)}>{l}</button>
        ))}
      </div>

      <section className="tf-card">
        {error ? <div className="tf-alert tf-alert--danger">Historique indisponible : {error}</div>
          : trades === null ? <div className="tf-skeleton" style={{ height: 200 }} aria-label="Chargement" />
          : shown.length === 0 ? <div className="tf-empty"><HistoryIcon size={32} aria-hidden="true" />Aucun trade fermé pour le moment</div>
          : (
            <>
              <div className="tf-table-wrap tf-only-desktop">
                <table className="tf-table">
                  <caption className="sr-only">Historique des trades fermés</caption>
                  <thead><tr><th scope="col">Fermé le</th><th scope="col">Symbole</th><th scope="col">Type</th><th scope="col">Lots</th><th scope="col">Entrée</th><th scope="col">Sortie</th><th scope="col">Compte</th><th scope="col">P&amp;L</th></tr></thead>
                  <tbody>
                    {shown.map((t) => (
                      <tr key={t.contract_id}>
                        <td>{dateTime(t.closed_at)}</td>
                        <td><strong>XAUUSD</strong></td>
                        <td><span className={`tf-side ${t.direction === "BUY" ? "tf-side--buy" : "tf-side--sell"}`}>{t.direction}</span></td>
                        <td className="tf-num">{Number(t.lots).toFixed(2)}</td>
                        <td className="tf-num">{price(t.entry)}</td>
                        <td className="tf-num">{price(t.exit)}</td>
                        <td>{t.account_id ? <span className={`tf-pill ${isDemoAccount(t.account_id) ? "tf-pill--blue" : "tf-pill--gold"}`} style={{ fontSize: 10, padding: "1px 7px" }}>{isDemoAccount(t.account_id) ? "Démo" : "Réel"}</span> : "—"}</td>
                        <td><strong className={`tf-num ${t.pnl >= 0 ? "tf-pos" : "tf-neg"}`}>{money(t.pnl, { sign: true })}</strong></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="tf-only-mobile">
                <div className="tf-stack" style={{ gap: 8 }}>
                  {shown.map((t) => (
                    <article key={t.contract_id} className="tf-pos-card" style={{ gridTemplateColumns: "auto 1fr auto", display: "grid", alignItems: "center", gap: 10 }}>
                      <span className={`tf-pill ${t.direction === "BUY" ? "tf-pill--green" : "tf-pill--red"}`}>{t.direction}</span>
                      <div style={{ lineHeight: 1.35, minWidth: 0 }}>
                        <strong>XAUUSD</strong>
                        <div className="tf-muted tf-num" style={{ fontSize: 12 }}>{dateTime(t.closed_at)} · {price(t.entry)} → {price(t.exit)}</div>
                      </div>
                      <strong className={`tf-num ${t.pnl >= 0 ? "tf-pos" : "tf-neg"}`}>{money(t.pnl, { sign: true })}</strong>
                    </article>
                  ))}
                </div>
              </div>
              {trades.length < total && (
                <div style={{ textAlign: "center", marginTop: 14 }}>
                  <button type="button" className="tf-btn" onClick={more} disabled={loadingMore}>{loadingMore ? "Chargement…" : `Afficher plus (${total - trades.length} restants)`}</button>
                </div>
              )}
            </>
          )}
      </section>
    </div>
  );
}
