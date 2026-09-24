// src/components/brand/TradifyLogo.jsx
// Logo unique de l'app (robot trader). Taille reglable ; "withName" ajoute
// le nom Tradify et le sous-titre.
import logo from "../../assets/logo.png";

export default function TradifyLogo({ size = 40, withName = false, subtitle = "XAUUSD • TrendRider", nameClassName = "" }) {
  const img = (
    <img src={logo} alt={withName ? "" : "Tradify"} width={size} height={size}
      style={{ width: size, height: size, objectFit: "contain", flexShrink: 0, display: "block" }} />
  );
  if (!withName) return img;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 10, minWidth: 0 }}>
      {img}
      <span className={nameClassName} style={{ minWidth: 0 }}>
        <span className="tf-brand__name">Trad<span>ify</span></span>
        {subtitle && <span className="tf-brand__sub" style={{ display: "block" }}>{subtitle}</span>}
      </span>
    </span>
  );
}
