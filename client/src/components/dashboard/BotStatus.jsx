// src/components/dashboard/BotStatus.jsx — etat du bot + bouton pause / reprise
import { Pause, Play, Bot } from "lucide-react";
import { useAppData } from "../../context/AppData";

export default function BotStatus({ big = false }) {
  const { user, toggleEA, togglingEA } = useAppData();
  if (!user) return null;
  const on = user.ea_active;
  const canRun = user.has_deriv_access && user.approved && !(user.deriv_reauth_needed && !user.has_token);

  let state = on ? (user.deriv_connected ? "Bot actif — surveille XAUUSD" : "Bot actif — connexion à Deriv…") : "Bot en pause";
  if (!canRun && !on) state = user.deriv_reauth_needed ? "Reconnexion Deriv requise" : "Connectez Deriv pour démarrer";

  return (
    <div className="tf-bot-row">
      <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, color: on ? "var(--green)" : "var(--text-2)" }}>
        <Bot size={17} aria-hidden="true" /> {state}
      </span>
      <button type="button" className={`tf-btn ${on ? "tf-btn--danger" : "tf-btn--primary"}${big ? " tf-btn--lg" : ""}`}
        onClick={toggleEA} disabled={togglingEA || (!on && !canRun)} aria-pressed={on}>
        {on ? <><Pause size={16} aria-hidden="true" /> Mettre le bot en pause</> : <><Play size={16} aria-hidden="true" /> Activer le bot</>}
      </button>
    </div>
  );
}
