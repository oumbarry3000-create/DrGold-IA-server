// src/App.jsx
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./hooks/useAuth";
import Login       from "./pages/Login";
import Dashboard   from "./pages/Dashboard";
import Positions   from "./pages/Positions";
import History     from "./pages/History";
import Performance from "./pages/Performance";
import Messages    from "./pages/Messages";
import Settings    from "./pages/Settings";
import Subscription from "./pages/Subscription";
import Admin       from "./pages/Admin";
import Payment     from "./pages/Payment";
import DerivCallback from "./pages/DerivCallback";
import { DialogHost } from "./components/Dialog";
import { AppDataProvider } from "./context/AppData";
import AppLayout from "./components/layout/AppLayout";
import TradifyLogo from "./components/brand/TradifyLogo";

function Splash() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12 }} role="status">
      <TradifyLogo size={64} />
      <span className="tf-muted" style={{ fontSize: 13 }}>Chargement…</span>
    </div>
  );
}

// Pages connectees SANS le cadre (retours OAuth / paiement)
function PrivateRoute({ children }) {
  const { user } = useAuth();
  if (user === undefined) return <Splash />;
  return user ? children : <Navigate to="/login" replace />;
}

// Pages connectees AVEC le cadre : une seule source de donnees pour toutes
function PrivateShell() {
  const { user } = useAuth();
  if (user === undefined) return <Splash />;
  if (!user) return <Navigate to="/login" replace />;
  return (
    <AppDataProvider>
      <AppLayout />
    </AppDataProvider>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <DialogHost />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<PrivateShell />}>
          <Route path="/dashboard"   element={<Dashboard />} />
          <Route path="/positions"   element={<Positions />} />
          <Route path="/historique"  element={<History />} />
          <Route path="/performance" element={<Performance />} />
          <Route path="/messages"    element={<Messages />} />
          <Route path="/settings"    element={<Settings />} />
          <Route path="/abonnement"  element={<Subscription />} />
          <Route path="/admin"       element={<Admin />} />
        </Route>
        <Route path="/paiement"       element={<PrivateRoute><Payment /></PrivateRoute>} />
        <Route path="/deriv-callback" element={<DerivCallback />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
