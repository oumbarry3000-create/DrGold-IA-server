// src/pages/Settings.jsx
import { useState, useEffect } from "react";
import { auth } from "../lib/firebase";
import { api } from "../lib/api";
import { DEFAULT_EA_PARAMS } from "../lib/defaultParams";
import { useNavigate } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import { confirmDialog, notify } from "../components/Dialog";

export default function Settings() {
  const navigate = useNavigate();
  const [params, setParams] = useState(null);
  const [savedParams, setSavedParams] = useState(null); // pour detecter les modifs non enregistrees
  const [loadError, setLoadError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);
  const [derivToken, setDerivToken]   = useState("");
  const [derivLogin, setDerivLogin]   = useState(null);
  const [derivStatus, setDerivStatus] = useState(null); // null | "saving" | "ok" | message d'erreur

  useEffect(() => {
    async function load() {
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      try {
        const { user } = await api.me();
        const p = { ...DEFAULT_EA_PARAMS, ...(user?.params || {}) };
        setParams(p);
        setSavedParams(p);
        setDerivLogin(user?.deriv_loginid || null);
      } catch (err) {
        setLoadError(err.message);
      }
    }
    load();
  }, []);

  function set(key, val) {
    setParams((p) => ({ ...p, [key]: val }));
  }

  const dirty = params && savedParams && JSON.stringify(params) !== JSON.stringify(savedParams);

  // Fermeture de l'onglet avec des modifications non enregistrees
  useEffect(() => {
    if (!dirty) return;
    const warn = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  async function save() {
    setSaving(true);
    try {
      await api.saveSettings(params);
      setSavedParams(params);
      setSaved(true);
      notify("Paramètres enregistrés");
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      notify(`Enregistrement impossible : ${err.message}`, "error");
    } finally {
      setSaving(false);
    }
  }

  async function confirmLeave() {
    if (!dirty) return true;
    return confirmDialog({
      title: "Quitter sans enregistrer ?",
      message: "Vos modifications des paramètres seront perdues.",
      confirmLabel: "Quitter sans enregistrer",
      cancelLabel: "Rester",
      danger: true,
    });
  }

  async function resetDefaults() {
    const ok = await confirmDialog({
      title: "Réinitialiser les paramètres ?",
      message: "Tous les réglages de l'EA reviennent aux valeurs par défaut (vos réglages Telegram sont conservés). Pensez à enregistrer ensuite.",
      confirmLabel: "Réinitialiser",
      danger: true,
    });
    if (!ok) return;
    setParams((p) => ({ ...DEFAULT_EA_PARAMS, tgBotToken: p.tgBotToken, tgChatID: p.tgChatID, tgMiniAppURL: p.tgMiniAppURL }));
    notify("Valeurs par défaut rétablies — cliquez sur Enregistrer");
  }

  async function unlinkDeriv() {
    const ok = await confirmDialog({
      title: "Déconnecter votre compte Deriv ?",
      message: "Le bot sera arrêté et Tradify n'aura plus accès à votre compte Deriv. Les positions déjà ouvertes iront jusqu'à leur échéance. Vous pourrez le reconnecter à tout moment.",
      confirmLabel: "Déconnecter Deriv",
      danger: true,
    });
    if (!ok) return;
    try {
      await api.unlinkDeriv();
      notify("Compte Deriv déconnecté");
      navigate("/dashboard");
    } catch (err) {
      notify(err.message, "error");
    }
  }

  async function logout() {
    if (!(await confirmLeave())) return;
    const ok = await confirmDialog({ title: "Se déconnecter ?", message: "Le bot continue de trader même quand vous êtes déconnecté.", confirmLabel: "Se déconnecter" });
    if (ok) await auth.signOut();
  }

  async function deleteAccount() {
    const ok = await confirmDialog({
      title: "Supprimer définitivement votre compte ?",
      message: "Le bot sera arrêté, et votre compte Tradify, votre historique et vos messages seront effacés. Votre compte Deriv et votre argent chez Deriv ne sont PAS touchés. Cette action est irréversible.",
      confirmLabel: "Supprimer mon compte",
      danger: true,
      requireText: "SUPPRIMER",
    });
    if (!ok) return;
    try {
      await api.deleteAccount();
      await auth.signOut();
      notify("Votre compte a été supprimé");
    } catch (err) {
      notify(err.message, "error");
    }
  }

  async function saveDerivToken() {
    if (!derivToken.trim()) return;
    setDerivStatus("saving");
    try {
      await api.updateDerivToken(derivToken.trim());
      setDerivToken("");
      setDerivStatus("ok");
    } catch (err) {
      setDerivStatus(err.message);
    }
  }

  if (!params) {
    return (
      <PageWrap>
        <PageHeader title="⚙️ Paramètres" />
        <p style={{ color: loadError ? "#fca5a5" : "#64748b" }}>{loadError ? `Chargement impossible : ${loadError}` : "Chargement..."}</p>
      </PageWrap>
    );
  }

  return (
    <PageWrap>
      <PageHeader title="⚙️ Paramètres EA" subtitle="Configuration TrendRider — XAUUSD" onBack={confirmLeave}
        actions={<button style={s.resetBtn} onClick={resetDefaults}>↺ Réinitialiser</button>} />

      <Section title="🎯 Configuration Stratégie">
        <Row label="Mode Stratégie">
          <Select value={params.stratMode} onChange={(v) => set("stratMode", v)}
            options={[["CONTINUATION", "Continuation (suivi de tendance)"], ["RETOURNEMENT", "Retournement (contre-tendance)"]]} />
        </Row>
        <Row label="Nombre de bougies alignées">
          <NumInput value={params.candleCount} min={1} max={20} step={1} onChange={(v) => set("candleCount", v)} />
        </Row>
      </Section>

      <Section title="💰 Gestion du Risque & Grille">
        <Row label="Lot initial">
          <NumInput value={params.initialLot} min={0.01} max={100} step={0.01} onChange={(v) => set("initialLot", v)} />
        </Row>
        <Row label="Multiplicateur Martingale">
          <NumInput value={params.martingaleMult} min={1.0} max={5.0} step={0.1} onChange={(v) => set("martingaleMult", v)} />
        </Row>
        <Row label="Niveaux de Grille max">
          <NumInput value={params.maxGridLevels} min={1} max={10} step={1} onChange={(v) => set("maxGridLevels", v)} />
        </Row>
        <Row label="Mode Distance Grille">
          <Select value={params.gridMode} onChange={(v) => set("gridMode", v)}
            options={[["FIXE", "Distance Fixe (pips)"], ["ATR", "Basée sur ATR"]]} />
        </Row>
        <Row label="Distance Grille (pips)">
          <NumInput value={params.gridDistancePips} min={1} max={500} step={1} onChange={(v) => set("gridDistancePips", v)} />
        </Row>
        <Row label="Multiplicateur ATR Grille">
          <NumInput value={params.gridATRMult} min={0.1} max={10} step={0.1} onChange={(v) => set("gridATRMult", v)} />
        </Row>
      </Section>

      <Section title="🎯 Objectifs">
        <Row label="TP Global ($)">
          <NumInput value={params.globalTPMoney} min={0.1} max={10000} step={0.5} onChange={(v) => set("globalTPMoney", v)} />
        </Row>
        <Row label="SL Global ($)">
          <NumInput value={params.globalSLMoney} min={0.1} max={10000} step={0.5} onChange={(v) => set("globalSLMoney", v)} />
        </Row>
        <Row label="Break Even ($)">
          <NumInput value={params.breakEvenMoney} min={0.1} max={1000} step={0.5} onChange={(v) => set("breakEvenMoney", v)} />
        </Row>
        <Row label="Perte max par jour ($) — 0 = sans limite">
          <NumInput value={params.dailyLossLimit} min={0} max={100000} step={1} onChange={(v) => set("dailyLossLimit", v)} />
        </Row>
      </Section>

      <Section title="📊 Filtres Daily">
        <Row label="Activer les filtres Daily">
          <Toggle value={params.useDailyFilters} onChange={(v) => set("useDailyFilters", v)} />
        </Row>
        <Row label="Période EMA Daily">
          <NumInput value={params.emaPeriod} min={1} max={500} step={1} onChange={(v) => set("emaPeriod", v)} />
        </Row>
        <Row label="Activer filtre RSI">
          <Toggle value={params.useRSI} onChange={(v) => set("useRSI", v)} />
        </Row>
        <Row label="Période RSI">
          <NumInput value={params.rsiPeriod} min={2} max={100} step={1} onChange={(v) => set("rsiPeriod", v)} />
        </Row>
        <Row label="RSI niveau haut (BUY)">
          <NumInput value={params.rsiLevelHigh} min={50} max={100} step={1} onChange={(v) => set("rsiLevelHigh", v)} />
        </Row>
        <Row label="RSI niveau bas (SELL)">
          <NumInput value={params.rsiLevelLow} min={0} max={50} step={1} onChange={(v) => set("rsiLevelLow", v)} />
        </Row>
        <Row label="Période ATR">
          <NumInput value={params.atrPeriod} min={1} max={100} step={1} onChange={(v) => set("atrPeriod", v)} />
        </Row>
      </Section>

      <Section title="🔑 Mode 24h/24 (optionnel)">
        <Row label={derivLogin ? `Compte actuel : ${derivLogin}` : "Aucun compte Deriv connecté"}>
          <input style={s.textInput} type="password" value={derivToken} autoComplete="off"
            onChange={(e) => { setDerivToken(e.target.value); setDerivStatus(null); }}
            placeholder="Nouveau token Deriv (Read + Trade)" />
        </Row>
        <div style={s.derivFooter}>
          <span style={{ ...s.derivHint, ...(derivStatus && derivStatus !== "ok" && derivStatus !== "saving" ? { color: "#fca5a5" } : {}) }}>
            {derivStatus === "ok"
              ? "✅ Token enregistré. Si l'EA est actif, il se reconnecte avec ce token dans les 10 s."
              : derivStatus && derivStatus !== "saving" ? derivStatus
              : "Facultatif : un token Deriv (developers.deriv.com/dashboard → API tokens, Trade, 90 jours) évite d'avoir à reconnecter Deriv. Il est vérifié puis chiffré."}
          </span>
          <button style={{ ...s.derivBtn, ...(!derivToken.trim() || derivStatus === "saving" ? s.saveBtnDisabled : {}) }}
            onClick={saveDerivToken} disabled={!derivToken.trim() || derivStatus === "saving"}>
            {derivStatus === "saving" ? "Enregistrement..." : "Enregistrer le token"}
          </button>
        </div>
      </Section>

      <Section title="📱 Telegram">
        <Row label="Bot Token">
          <TextInput value={params.tgBotToken} onChange={(v) => set("tgBotToken", v)} placeholder="123456:ABC..." />
        </Row>
        <Row label="Chat ID">
          <TextInput value={params.tgChatID} onChange={(v) => set("tgChatID", v)} placeholder="-1001234567890" />
        </Row>
        <Row label="URL MiniApp (optionnel)">
          <TextInput value={params.tgMiniAppURL} onChange={(v) => set("tgMiniAppURL", v)} placeholder="https://..." />
        </Row>
      </Section>

      <Section title="🔧 Avancé">
        <Row label="Magic Number">
          <NumInput value={params.magicNumber} min={1} max={9999999} step={1} onChange={(v) => set("magicNumber", v)} />
        </Row>
      </Section>

      <Section title="👤 Compte">
        <div style={s.accountRow}>
          <div>
            <p style={s.accountTitle}>Compte Deriv</p>
            <p style={s.accountHint}>{derivLogin ? `Connecté (${derivLogin}). Déconnecter arrête le bot.` : "Aucun compte Deriv connecté."}</p>
          </div>
          {derivLogin && <button style={s.dangerOutline} onClick={unlinkDeriv}>Déconnecter Deriv</button>}
        </div>
        <div style={s.accountRow}>
          <div>
            <p style={s.accountTitle}>Session</p>
            <p style={s.accountHint}>Se déconnecter de Tradify sur cet appareil (le bot continue).</p>
          </div>
          <button style={s.neutralBtn} onClick={logout}>Se déconnecter</button>
        </div>
        <div style={{ ...s.accountRow, borderBottom: "none" }}>
          <div>
            <p style={{ ...s.accountTitle, color: "#fca5a5" }}>Supprimer mon compte</p>
            <p style={s.accountHint}>Efface votre compte Tradify. Votre argent chez Deriv n'est pas touché.</p>
          </div>
          <button style={s.dangerBtn} onClick={deleteAccount}>Supprimer</button>
        </div>
      </Section>

      <div style={s.footer}>
        {dirty && !saving && <span style={s.dirtyHint}>● Modifications non enregistrées</span>}
        <button style={{ ...s.saveBtn, ...(saving || (!dirty && !saved) ? s.saveBtnDisabled : {}) }}
          onClick={save} disabled={saving || !dirty}>
          {saved ? "✅ Paramètres enregistrés" : saving ? "Enregistrement..." : "Enregistrer les paramètres"}
        </button>
      </div>
    </PageWrap>
  );
}

function PageWrap({ children }) {
  return <div style={s.page}>{children}</div>;
}

function Section({ title, children }) {
  return (
    <div style={s.section}>
      <h3 style={s.sectionTitle}>{title}</h3>
      <div style={s.sectionBody}>{children}</div>
    </div>
  );
}

function Row({ label, children }) {
  return (
    <div style={s.row}>
      <span style={s.rowLabel}>{label}</span>
      <div style={s.rowControl}>{children}</div>
    </div>
  );
}

function NumInput({ value, min, max, step, onChange }) {
  return (
    <input style={s.numInput} type="number" value={value} min={min} max={max} step={step}
      onChange={(e) => onChange(step < 1 ? parseFloat(e.target.value) : parseInt(e.target.value))} />
  );
}

function TextInput({ value, onChange, placeholder }) {
  return (
    <input style={s.textInput} type="text" value={value}
      onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
  );
}

function Select({ value, options, onChange }) {
  return (
    <select style={s.select} value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
}

function Toggle({ value, onChange }) {
  return (
    <div style={{ ...s.toggle, ...(value ? s.toggleOn : {}) }}
      onClick={() => onChange(!value)}>
      <div style={{ ...s.toggleKnob, ...(value ? s.toggleKnobOn : {}) }} />
    </div>
  );
}

const s = {
  page:           { minHeight: "100vh", background: "#060d1a", padding: "32px 24px", fontFamily: "'Inter', sans-serif", maxWidth: 720, margin: "0 auto" },
  header:         { marginBottom: 32 },
  title:          { color: "#f1f5f9", fontSize: 24, fontWeight: 800, margin: "0 0 6px" },
  subtitle:       { color: "#475569", fontSize: 14, margin: 0 },
  section:        { background: "#0d1829", border: "1px solid #1e3a5f", borderRadius: 14, marginBottom: 20, overflow: "hidden" },
  sectionTitle:   { color: "#f59e0b", fontSize: 13, fontWeight: 700, padding: "14px 20px", borderBottom: "1px solid #1e3a5f", margin: 0, background: "#0a1525" },
  sectionBody:    { padding: "8px 0" },
  row:            { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px", borderBottom: "1px solid #0f2040" },
  derivFooter:    { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", paddingTop: 4 },
  derivHint:      { color: "#64748b", fontSize: 12, flex: 1, minWidth: 200 },
  derivBtn:       { background: "#1e3a5f", color: "#f1f5f9", border: "1px solid #2d4a6f", borderRadius: 8, padding: "9px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  rowLabel:       { color: "#94a3b8", fontSize: 13, flex: 1 },
  rowControl:     { flex: "0 0 auto" },
  numInput:       { background: "#0a1525", border: "1px solid #1e3a5f", borderRadius: 8, padding: "7px 12px", color: "#f1f5f9", fontSize: 14, width: 120, textAlign: "right", outline: "none" },
  textInput:      { background: "#0a1525", border: "1px solid #1e3a5f", borderRadius: 8, padding: "7px 12px", color: "#f1f5f9", fontSize: 13, width: 220, outline: "none" },
  select:         { background: "#0a1525", border: "1px solid #1e3a5f", borderRadius: 8, padding: "7px 12px", color: "#f1f5f9", fontSize: 13, outline: "none", cursor: "pointer" },
  toggle:         { width: 44, height: 24, background: "#1e3a5f", borderRadius: 12, cursor: "pointer", position: "relative", transition: "background 0.2s" },
  toggleOn:       { background: "#f59e0b" },
  toggleKnob:     { position: "absolute", top: 3, left: 3, width: 18, height: 18, borderRadius: "50%", background: "#475569", transition: "all 0.2s" },
  toggleKnobOn:   { left: 23, background: "#060d1a" },
  footer:         { position: "sticky", bottom: 0, background: "#060d1a", padding: "12px 0", display: "flex", flexDirection: "column", gap: 8, zIndex: 5 },
  saveBtn:        { background: "linear-gradient(135deg, #f59e0b, #d97706)", color: "#060d1a", border: "none", borderRadius: 10, padding: "14px 0", fontSize: 15, fontWeight: 800, cursor: "pointer", width: "100%" },
  resetBtn:       { background: "#0d1829", border: "1px solid #1e3a5f", borderRadius: 8, padding: "8px 14px", color: "#94a3b8", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  accountRow:     { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "12px 0", borderBottom: "1px solid #1e3a5f" },
  accountTitle:   { color: "#f1f5f9", fontSize: 14, fontWeight: 700, margin: 0 },
  accountHint:    { color: "#64748b", fontSize: 12, margin: "3px 0 0" },
  neutralBtn:     { background: "#1e3a5f", color: "#f1f5f9", border: "1px solid #2d4a6f", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" },
  dangerOutline:  { background: "transparent", color: "#fca5a5", border: "1px solid #ef444477", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" },
  dangerBtn:      { background: "#dc2626", color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" },
  dirtyHint:      { color: "#f59e0b", fontSize: 13, fontWeight: 600 },
  saveBtnDisabled:{ opacity: 0.5, cursor: "not-allowed" },
};
