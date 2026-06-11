// src/pages/Settings.jsx
import { useState, useEffect } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db } from "../lib/firebase";
import { DEFAULT_EA_PARAMS } from "../lib/defaultParams";

export default function Settings() {
  const [params, setParams] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);

  useEffect(() => {
    async function load() {
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      const snap = await getDoc(doc(db, "users", uid));
      const data = snap.data();
      setParams({ ...DEFAULT_EA_PARAMS, ...(data?.params || {}) });
    }
    load();
  }, []);

  function set(key, val) {
    setParams((p) => ({ ...p, [key]: val }));
  }

  async function save() {
    setSaving(true);
    const uid = auth.currentUser?.uid;
    await setDoc(doc(db, "users", uid), { params }, { merge: true });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  if (!params) return <PageWrap><p style={{ color: "#64748b" }}>Chargement...</p></PageWrap>;

  return (
    <PageWrap>
      <div style={s.header}>
        <h2 style={s.title}>⚙️ Paramètres EA</h2>
        <p style={s.subtitle}>Configuration TrendRider — XAUUSD</p>
      </div>

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

      <div style={s.footer}>
        <button style={{ ...s.saveBtn, ...(saving ? s.saveBtnDisabled : {}) }}
          onClick={save} disabled={saving}>
          {saved ? "✅ Paramètres sauvegardés" : saving ? "Sauvegarde..." : "Sauvegarder les paramètres"}
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
  rowLabel:       { color: "#94a3b8", fontSize: 13, flex: 1 },
  rowControl:     { flex: "0 0 auto" },
  numInput:       { background: "#0a1525", border: "1px solid #1e3a5f", borderRadius: 8, padding: "7px 12px", color: "#f1f5f9", fontSize: 14, width: 120, textAlign: "right", outline: "none" },
  textInput:      { background: "#0a1525", border: "1px solid #1e3a5f", borderRadius: 8, padding: "7px 12px", color: "#f1f5f9", fontSize: 13, width: 220, outline: "none" },
  select:         { background: "#0a1525", border: "1px solid #1e3a5f", borderRadius: 8, padding: "7px 12px", color: "#f1f5f9", fontSize: 13, outline: "none", cursor: "pointer" },
  toggle:         { width: 44, height: 24, background: "#1e3a5f", borderRadius: 12, cursor: "pointer", position: "relative", transition: "background 0.2s" },
  toggleOn:       { background: "#f59e0b" },
  toggleKnob:     { position: "absolute", top: 3, left: 3, width: 18, height: 18, borderRadius: "50%", background: "#475569", transition: "all 0.2s" },
  toggleKnobOn:   { left: 23, background: "#060d1a" },
  footer:         { paddingTop: 8 },
  saveBtn:        { background: "linear-gradient(135deg, #f59e0b, #d97706)", color: "#060d1a", border: "none", borderRadius: 10, padding: "14px 0", fontSize: 15, fontWeight: 800, cursor: "pointer", width: "100%" },
  saveBtnDisabled:{ opacity: 0.5, cursor: "not-allowed" },
};
