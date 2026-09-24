// src/pages/Payment.jsx
// Retour du checkout CinetPay : on verifie le paiement aupres du serveur
// (qui reinterroge CinetPay) jusqu'a confirmation ou echec.
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { ui, fmtXof, fmtUsd } from "../lib/ui";

export default function Payment() {
  const navigate = useNavigate();
  const id = new URLSearchParams(window.location.search).get("id");
  const [payment, setPayment] = useState(null);
  const [error, setError]     = useState(null);

  useEffect(() => {
    if (!id) { setError("Paiement introuvable."); return; }
    let tries = 0;
    let timer;
    async function check() {
      try {
        const p = await api.paymentStatus(id);
        setPayment(p);
        if (p.status === "pending" && ++tries < 40) timer = setTimeout(check, 4000);
      } catch (err) {
        setError(err.message);
        if (++tries < 40) timer = setTimeout(check, 6000);
      }
    }
    check();
    return () => clearTimeout(timer);
  }, [id]);

  const status = payment?.status;
  return (
    <div style={ui.center}>
      <div style={{ ...ui.box, maxWidth: 440, textAlign: "center" }}>
        {status === "paid" ? (
          <>
            <p style={{ fontSize: 36, margin: 0 }}>🎉</p>
            <h2 style={ui.h2}>Formule Pro activée</h2>
            <p style={ui.muted}>
              Paiement de {fmtXof(payment.amount)}{payment.amount_usd ? ` (${fmtUsd(payment.amount_usd)})` : ""} confirmé : {payment.days} jours de Pro ajoutés.
              Vous pouvez maintenant passer votre bot sur votre compte réel.
            </p>
          </>
        ) : status === "failed" ? (
          <>
            <p style={{ fontSize: 36, margin: 0 }}>❌</p>
            <h2 style={ui.h2}>Paiement non abouti</h2>
            <p style={ui.muted}>Aucun montant n'a été validé. Vous pouvez réessayer depuis le tableau de bord.</p>
          </>
        ) : (
          <>
            <p style={{ fontSize: 36, margin: 0 }}>⏳</p>
            <h2 style={ui.h2}>Vérification du paiement…</h2>
            <p style={ui.muted}>
              Validez le paiement sur votre téléphone si ce n'est pas encore fait. Cette page se met à jour toute seule.
            </p>
            {error && <div style={ui.error}>{error}</div>}
          </>
        )}
        <button style={ui.btnGold} onClick={() => navigate("/dashboard", { replace: true })}>Tableau de bord</button>
      </div>
    </div>
  );
}
