// src/components/dashboard/AccountCard.jsx — capital Deriv + etat du bot
import { Wallet } from "lucide-react";
import { useAppData } from "../../context/AppData";
import { isDemoAccount } from "../../lib/format";
import BotStatus from "./BotStatus";

export default function AccountCard() {
  const { user } = useAppData();
  if (!user) return null;
  const id = user.deriv_loginid;
  const connected = user.deriv_connected;

  return (
    <section className="tf-card" aria-labelledby="acct-title">
      <div className="tf-card__head">
        <h2 id="acct-title" className="tf-card__title">
          <Wallet size={17} color="var(--gold)" aria-hidden="true" /> Capital Deriv
          <span className="tf-deriv" aria-label="Deriv">deriv</span>
        </h2>
        <span className={`tf-pill ${connected ? "tf-pill--green" : "tf-pill--red"}`} role="status">
          <span className="tf-led" aria-hidden="true" /> {connected ? "Connecté" : "Déconnecté"}
        </span>
      </div>
      <div className="tf-account">
        <div>
          <p className="tf-label">Solde</p>
          <p className="tf-account__balance tf-num">
            {user.deriv_balance != null ? `${Number(user.deriv_balance).toFixed(2)} ${user.deriv_currency || "USD"}` : "—"}
          </p>
        </div>
        <div>
          <p className="tf-label">Compte Deriv</p>
          <p className="tf-account__id tf-num">
            {id || "—"}
            {id && <span className={`tf-pill ${isDemoAccount(id) ? "tf-pill--blue" : "tf-pill--gold"}`} style={{ fontSize: 10, padding: "2px 8px" }}>{isDemoAccount(id) ? "DÉMO" : "RÉEL"}</span>}
          </p>
        </div>
      </div>
      <BotStatus />
    </section>
  );
}
