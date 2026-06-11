// src/App.jsx
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./hooks/useAuth";
import Login     from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Settings  from "./pages/Settings";

function PrivateRoute({ children }) {
  const { user } = useAuth();
  if (user === undefined) return <div style={{ color: "#475569", padding: 40, fontFamily: "Inter, sans-serif" }}>Chargement...</div>;
  return user ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login"     element={<Login />} />
        <Route path="/dashboard" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
        <Route path="/settings"  element={<PrivateRoute><Settings /></PrivateRoute>} />
        <Route path="*"          element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
