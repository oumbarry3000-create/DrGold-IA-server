// src/components/dashboard/SubscriptionCard.jsx — formule + choix compte demo / reel
import { useState } from "react";
import { Crown, Lock } from "lucide-react";
import { api } from "../../lib/api";
import { fmtXof, fmtUsd, fmtDate } from "../../lib/ui";
import { confirmDialog, notify } from "../Dialog";
import { useAppData } from "../../context/AppData";

export default function SubscriptionCard() {
  const { user, loadMe } = useAppData();
  const [busy, setBusy] = useState(false);
  if (!user) return null;

  const pro  = user.pro_active;
  const real = user.effective_account_type === "real";
  const expired = !pro && user.plan === "pro";

  async function subscribe() {
    setBusy(true);
    try {
      const { checkoutUrl } = await api.startCheckout();
      window.location.href = checkoutUrl;
    } catch (err) {
      notify(err.message, "error");
      setBusy(false);
    }
  }

  async function switchType(type) {
    if (type === "real") {
      const ok = await confirmDialog({
        title: "Passer sur votre compte RÉEL ?",
        message: "Le bot tradera avec votre argent. Vous pouvez perdre tout ou partie de votre capital. Vérifiez vos paramètres (mise, perte max par jour) avant.",
        confirmLabel: "Oui, trader en réel", danger: true, requireText: "REEL",
      });
      if (!ok) return;
    }
    setBusy(true);
    try {
      await api.setAccountType(type);
      notify(type === "real" ? "Le bot trade maintenant sur votre compte réel" : "Le bot trade maintenant sur votre compte démo");
      await loadMe();
    } catch (err) {
      notify(err.message, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="tf-card" aria-labelledby="plan-title">
      <div className="tf-plan">
        <div>
          <h2 id="plan-title" className="tf-card__title"><Crown size={17} color="var(--gold)" aria-hidden="true" /> Ma formule</h2>
          <p className="tf-plan__name">
            {pro ? "Pro" : "Basique"}
            {pro && <span className="tf-pill tf-pill--blue">Jusqu'au {fmtDate(user.plan_expires_at)}</span>}
            {!pro && !expired && <span className="tf-pill tf-pill--muted">Gratuit · démo</span>}
            {expired && <span className="tf-pill tf-pill--red">Pro expiré</span>}
          </p>
          <p className="tf-plan__desc">
            {pro ? "Compte réel autorisé, statistiques complètes." : "Le bot trade sur votre compte démo. Passez Pro pour trader en réel."}
          </p>
          <p className="tf-plan__fx">
            {fmtUsd(user.pro_price_usd)} / {user.pro_days} jours · payable en FCFA ≈ {fmtXof(user.pro_price_xof)} (1 $ = {user.fx_rate} FCFA)
          </p>
        </div>
        <button type="button" className="tf-btn tf-btn--gold tf-btn--lg" onClick={subscribe} disabled={busy}>
          {pro ? `Prolonger (${fmtUsd(user.pro_price_usd)})` : `Passer Pro (${fmtUsd(user.pro_price_usd)})`}
        </button>
      </div>

      <div className="tf-plan__row">
        <span className="tf-muted" style={{ fontSize: 13, fontWeight: 600 }} id="acct-type-label">Le bot trade sur :</span>
        <div className="tf-segment" role="radiogroup" aria-labelledby="acct-type-label">
          <button type="button" role="radio" aria-checked={!real} className={!real ? "is-active" : ""} disabled={busy} onClick={() => real && switchType("demo")}>
            Compte démo
          </button>
          <button type="button" role="radio" aria-checked={real} className={real ? "is-active is-real" : ""} disabled={busy || !pro}
            onClick={() => !real && switchType("real")} title={!pro ? "Formule Pro requise" : undefined}>
            Compte réel {!pro && <Lock size={13} aria-label="formule Pro requise" />}
          </button>
        </div>
      </div>
    </section>
  );
}
