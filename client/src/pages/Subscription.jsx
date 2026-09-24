// src/pages/Subscription.jsx — formule, prix et conditions
import { Check } from "lucide-react";
import PageHeader from "../components/PageHeader";
import SubscriptionCard from "../components/dashboard/SubscriptionCard";
import { useAppData } from "../context/AppData";
import { fmtUsd, fmtXof } from "../lib/ui";

const Row = ({ children, ok = true }) => (
  <li style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 14, color: ok ? "var(--text-2)" : "var(--muted)" }}>
    <Check size={16} color={ok ? "var(--green)" : "var(--border-2)"} style={{ marginTop: 2, flexShrink: 0 }} aria-hidden="true" />{children}
  </li>
);

export default function Subscription() {
  const { user } = useAppData();
  return (
    <div className="tf-stack">
      <PageHeader title="Abonnement" subtitle="Votre formule Tradify" />
      <SubscriptionCard />
      {user && (
        <div className="tf-grid-2">
          <section className="tf-card">
            <h2 className="tf-card__title" style={{ marginBottom: 12 }}>Basique — gratuit</h2>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
              <Row>Bot TrendRider sur votre compte démo Deriv</Row>
              <Row>Tableau de bord, historique et performance</Row>
              <Row>Assistant IA et support</Row>
              <Row ok={false}>Trading sur compte réel</Row>
            </ul>
          </section>
          <section className="tf-card" style={{ borderColor: "rgba(245,185,26,.4)" }}>
            <h2 className="tf-card__title" style={{ marginBottom: 12, color: "var(--gold)" }}>Pro — {fmtUsd(user.pro_price_usd)} / {user.pro_days} jours</h2>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
              <Row>Tout le Basique</Row>
              <Row>Trading sur votre compte réel Deriv</Row>
              <Row>Support prioritaire</Row>
              <Row>Payable en FCFA (Orange Money, Moov…) : ≈ {fmtXof(user.pro_price_xof)} au taux du jour (1 $ = {user.fx_rate} FCFA)</Row>
            </ul>
          </section>
        </div>
      )}
      <p className="tf-muted" style={{ fontSize: 12, lineHeight: 1.6, margin: 0 }}>
        Prolonger ajoute {user?.pro_days || 30} jours à la date de fin. À l'expiration sans renouvellement, le bot repasse automatiquement sur le compte démo.
        Votre argent reste toujours sur votre compte Deriv. Le trading comporte un risque élevé de perte.
      </p>
    </div>
  );
}
