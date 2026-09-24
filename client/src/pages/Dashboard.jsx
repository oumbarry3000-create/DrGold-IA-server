// src/pages/Dashboard.jsx — tableau de bord (desktop, tablette, mobile)
import { useAppData } from "../context/AppData";
import OnboardingCard from "../components/dashboard/OnboardingCard";
import SubscriptionCard from "../components/dashboard/SubscriptionCard";
import AccountCard from "../components/dashboard/AccountCard";
import KPIGrid from "../components/dashboard/KPIGrid";
import PnLChart from "../components/dashboard/PnLChart";
import OpenPositions from "../components/dashboard/OpenPositions";
import MarketAnalysis from "../components/dashboard/MarketAnalysis";
import MarketSessions from "../components/dashboard/MarketSessions";
import { Link } from "react-router-dom";

export default function Dashboard() {
  const { user, meError, inbox } = useAppData();

  if (!user) {
    return meError
      ? <div className="tf-alert tf-alert--danger" role="alert">Impossible de charger votre compte : {meError}. Nouvel essai automatique…</div>
      : <div className="tf-stack">{[120, 150, 80, 260].map((h, i) => <div key={i} className="tf-skeleton" style={{ height: h }} />)}</div>;
  }

  return (
    <div className="tf-stack">
      <h1 className="sr-only">Tableau de bord Tradify</h1>
      {meError && <div className="tf-alert tf-alert--warn" role="status">Connexion au serveur instable : les données affichées peuvent dater de quelques secondes.</div>}
      {inbox.newAnnouncements > 0 && (
        <Link to="/messages?tab=annonces" className="tf-alert tf-alert--info" style={{ textDecoration: "none" }}>
          📢 {inbox.newAnnouncements > 1 ? `${inbox.newAnnouncements} nouvelles annonces` : "Nouvelle annonce"} de Tradify — cliquez pour lire
        </Link>
      )}
      <OnboardingCard />
      <SubscriptionCard />
      <AccountCard />
      <KPIGrid />
      <PnLChart />
      <div className="tf-grid-bottom">
        <OpenPositions limit={5} />
        <MarketAnalysis />
        <MarketSessions />
      </div>
    </div>
  );
}
