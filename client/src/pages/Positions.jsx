// src/pages/Positions.jsx — toutes les positions ouvertes (live) + controle du bot
import PageHeader from "../components/PageHeader";
import OpenPositions from "../components/dashboard/OpenPositions";
import AccountCard from "../components/dashboard/AccountCard";

export default function Positions() {
  return (
    <div className="tf-stack">
      <PageHeader title="Positions" subtitle="Positions ouvertes chez Deriv, prix et P&L en direct" />
      <OpenPositions showControls title="Positions ouvertes" />
      <AccountCard />
      <p className="tf-muted" style={{ fontSize: 12, lineHeight: 1.6, margin: 0 }}>
        Chaque position est un contrat Deriv d'environ 1 heure : il se clôture automatiquement à l'échéance (pas de stop loss ni de take profit).
        Mettre le bot en pause n'annule pas les positions déjà ouvertes.
      </p>
    </div>
  );
}
