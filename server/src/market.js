// server/src/market.js
// Analyse IA du marche XAUUSD (H1) pour la carte "IA Market Analysis".
// 1. Vraies bougies H1 depuis le WebSocket public Deriv.
// 2. Indicateurs calcules ici (EMA20/50, RSI14, ATR14, supports/resistances).
// 3. Gemini interprete ces chiffres (JSON). Sans IA disponible, on renvoie
//    l'analyse technique calculee (source "calcul"). Jamais de donnees
//    inventees : sans bougies, l'analyse est "indisponible".
// Resultat partage par tous les traders, rafraichi toutes les 15 minutes.
const express = require("express");
const WebSocket = require("ws");
const OpenAIModule = require("openai");
const router = express.Router();
const { requireAuth } = require("./auth");

const PUBLIC_WS = "wss://api.derivws.com/trading/v1/options/ws/public";
const SYMBOL    = "frxXAUUSD";
const TTL_MS    = 15 * 60 * 1000;

const OpenAI  = OpenAIModule.default || OpenAIModule;
const API_KEY = process.env.AI_API_KEY || "";
const MODELS  = [process.env.AI_MODEL || "gemini-3.6-flash",
  ...(process.env.AI_FALLBACK_MODELS || "").split(",").map((m) => m.trim()).filter(Boolean)];
const ai = API_KEY ? new OpenAI({ apiKey: API_KEY, baseURL: process.env.AI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta/openai/", maxRetries: 1 }) : null;

let cache = null;      // { data, at }
let pending = null;    // calcul en cours (evite les appels paralleles)

function fetchCandles(symbol = SYMBOL, granularity = 3600, count = 200) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(PUBLIC_WS);
    const timer = setTimeout(() => { ws.terminate(); reject(new Error("délai dépassé")); }, 15000);
    ws.on("open", () => ws.send(JSON.stringify({ ticks_history: symbol, count, end: "latest", style: "candles", granularity })));
    ws.on("message", (raw) => {
      clearTimeout(timer);
      ws.close();
      const msg = JSON.parse(raw);
      if (msg.error) return reject(new Error(msg.error.message));
      resolve((msg.candles || []).map((c) => ({ t: c.epoch, o: +c.open, h: +c.high, l: +c.low, c: +c.close })));
    });
    ws.on("error", (err) => { clearTimeout(timer); reject(err); });
  });
}

const ema = (vals, n) => {
  const k = 2 / (n + 1);
  return vals.reduce((acc, v, i) => (i === 0 ? [v] : [...acc, v * k + acc[i - 1] * (1 - k)]), []);
};

function rsi(closes, n = 14) {
  let gain = 0, loss = 0;
  for (let i = 1; i <= n; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) gain += d; else loss -= d;
  }
  gain /= n; loss /= n;
  for (let i = n + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    gain = (gain * (n - 1) + Math.max(d, 0)) / n;
    loss = (loss * (n - 1) + Math.max(-d, 0)) / n;
  }
  return loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
}

function atr(candles, n = 14) {
  const tr = candles.slice(1).map((c, i) => Math.max(c.h - c.l, Math.abs(c.h - candles[i].c), Math.abs(c.l - candles[i].c)));
  return tr.slice(-n).reduce((a, b) => a + b, 0) / Math.min(n, tr.length);
}

const r2 = (x) => Math.round(x * 100) / 100;

function technicals(candles) {
  const closes = candles.map((c) => c.c);
  const last   = candles[candles.length - 1];
  const e20 = ema(closes, 20).pop();
  const e50 = ema(closes, 50).pop();
  const recent = candles.slice(-24);
  const support    = Math.min(...recent.map((c) => c.l));
  const resistance = Math.max(...recent.map((c) => c.h));
  const change24 = ((last.c - candles[Math.max(0, candles.length - 25)].c) / candles[Math.max(0, candles.length - 25)].c) * 100;
  const r = rsi(closes);
  const trend = last.c > e20 && e20 > e50 ? "haussiere" : last.c < e20 && e20 < e50 ? "baissiere" : "neutre";
  return {
    price: r2(last.c), last_candle: new Date(last.t * 1000).toISOString(),
    ema20: r2(e20), ema50: r2(e50), rsi14: r2(r), atr14: r2(atr(candles)),
    support_24h: r2(support), resistance_24h: r2(resistance), change_24h_pct: r2(change24), trend,
  };
}

// Analyse de repli sans IA : regles simples et transparentes sur les indicateurs
function ruleBased(t) {
  const trend = { haussiere: "Haussière", baissiere: "Baissière", neutre: "Neutre" }[t.trend];
  const momentum = t.rsi14 >= 65 ? "Fort (suracheté)" : t.rsi14 >= 55 ? "Modéré haussier" : t.rsi14 <= 35 ? "Fort (survendu)" : t.rsi14 <= 45 ? "Modéré baissier" : "Faible";
  const signal = t.trend === "haussiere" ? (t.rsi14 > 70 ? "Attendre (suracheté)" : "Achat (pullback)")
    : t.trend === "baissiere" ? (t.rsi14 < 30 ? "Attendre (survendu)" : "Vente (rebond)") : "Neutre";
  return {
    bias: t.trend === "haussiere" ? "bullish" : t.trend === "baissiere" ? "bearish" : "neutral",
    trend, momentum,
    structure: t.trend === "neutre" ? "Range entre support et résistance" : `Prix ${t.trend === "haussiere" ? "au-dessus" : "en dessous"} des EMA 20/50`,
    key_zone: `${Math.round(t.support_24h)} – ${Math.round(t.resistance_24h)}`,
    signal,
    confidence: t.trend === "neutre" ? 40 : 55,
    summary: `Prix ${t.price} ; EMA20 ${t.ema20}, EMA50 ${t.ema50}, RSI ${t.rsi14}.`,
  };
}

async function aiAnalysis(t) {
  const system = `Tu es un analyste technique. On te donne des indicateurs RÉELS de l'or (XAUUSD) en H1.
Réponds UNIQUEMENT par un objet JSON en français :
{"bias":"bullish|bearish|neutral","trend":"Haussière|Baissière|Neutre","momentum":"2-3 mots","structure":"5-8 mots (structure de marché)","key_zone":"bas – haut (prix entiers)","signal":"2-4 mots (ex. Achat (pullback), Vente (rebond), Attendre)","confidence":0-100,"summary":"1 phrase factuelle"}
Base-toi strictement sur les chiffres fournis, n'invente aucun niveau hors de ces données. Sois prudent : confiance > 75 seulement si tous les indicateurs concordent.`;
  let lastError;
  for (const model of MODELS) {
    try {
      const base = { model, temperature: 0.2, max_tokens: 1500, messages: [{ role: "system", content: system }, { role: "user", content: JSON.stringify(t) }] };
      const res = await ai.chat.completions.create({ ...base, response_format: { type: "json_object" }, reasoning_effort: "low" })
        .catch((err) => { if (err?.status !== 400) throw err; return ai.chat.completions.create(base); });
      const text = res.choices[0]?.message?.content || "";
      const json = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
      const conf = Math.max(0, Math.min(100, Math.round(Number(json.confidence) || 0)));
      return { ...json, confidence: conf };
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

async function compute() {
  const candles = await fetchCandles();
  if (candles.length < 60) throw new Error("pas assez de bougies");
  const t = technicals(candles);
  let analysis, source = "ia";
  try {
    if (!ai) throw new Error("IA non configurée");
    analysis = await aiAnalysis(t);
  } catch (err) {
    console.warn("[market] IA indisponible, analyse technique :", err.message);
    analysis = ruleBased(t);
    source = "calcul";
  }
  const lastAge = Date.now() - new Date(t.last_candle).getTime();
  return {
    status: "ok", symbol: "XAUUSD", timeframe: "H1", source, generated_at: new Date().toISOString(),
    market_open: lastAge < 2 * 3600 * 1000, indicators: t, ...analysis,
    disclaimer: "Analyse indicative générée automatiquement. Ce n'est pas un conseil en investissement.",
  };
}

// GET /api/market/analysis
router.get("/api/market/analysis", requireAuth, async (req, res) => {
  try {
    if (cache && Date.now() - cache.at < TTL_MS) return res.json(cache.data);
    pending = pending || compute().finally(() => { pending = null; });
    const data = await pending;
    cache = { data, at: Date.now() };
    res.json(data);
  } catch (err) {
    console.error("market analysis error:", err.message);
    if (cache) return res.json({ ...cache.data, stale: true });
    res.json({ status: "unavailable", reason: "Analyse indisponible pour le moment." });
  }
});

// ─── Graphique et cotations (donnees publiques Deriv) ──────────────────────

const TIMEFRAMES = { M15: 900, H1: 3600, H4: 14400 };
const QUOTES = [
  { symbol: "frxXAUUSD", label: "XAUUSD", digits: 2 },
  { symbol: "frxEURUSD", label: "EURUSD", digits: 4 },
  { symbol: "OTC_NDX",   label: "US100",  digits: 1 },
  { symbol: "cryBTCUSD", label: "BTCUSD", digits: 1 },
];
const small = new Map(); // cle -> { data, at }

async function cached(key, ttl, fn) {
  const hit = small.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.data;
  const data = await fn();
  small.set(key, { data, at: Date.now() });
  return data;
}

// GET /api/market/candles?tf=H1 — bougies XAUUSD + EMA 20/50 (cache 30 s)
router.get("/api/market/candles", requireAuth, async (req, res) => {
  const tf = TIMEFRAMES[req.query.tf] ? req.query.tf : "H1";
  try {
    const data = await cached(`candles-${tf}`, 30_000, async () => {
      const all = await fetchCandles(SYMBOL, TIMEFRAMES[tf], 150);
      const closes = all.map((c) => c.c);
      const e20 = ema(closes, 20), e50 = ema(closes, 50);
      const from = Math.max(0, all.length - 80); // 80 bougies affichees, EMA calculees sur 150
      const prevClose = (await fetchCandles(SYMBOL, 86400, 2))[0]?.c;
      const last = all[all.length - 1];
      return {
        symbol: "XAUUSD", tf,
        candles: all.slice(from).map((c) => ({ time: c.t, open: c.o, high: c.h, low: c.l, close: c.c })),
        ema20: all.slice(from).map((c, i) => ({ time: c.t, value: r2(e20[from + i]) })),
        ema50: all.slice(from).map((c, i) => ({ time: c.t, value: r2(e50[from + i]) })),
        last: last?.c ?? null,
        change: prevClose ? r2(last.c - prevClose) : null,
        change_pct: prevClose ? r2(((last.c - prevClose) / prevClose) * 100) : null,
        ema20_last: r2(e20[e20.length - 1]), ema50_last: r2(e50[e50.length - 1]),
      };
    });
    res.json(data);
  } catch (err) {
    console.error("candles error:", err.message);
    res.status(502).json({ error: "Graphique indisponible pour le moment" });
  }
});

// GET /api/market/quotes — XAUUSD, EURUSD, US100, BTCUSD + variation du jour (cache 20 s)
router.get("/api/market/quotes", requireAuth, async (req, res) => {
  try {
    const data = await cached("quotes", 20_000, async () => Promise.all(QUOTES.map(async (q) => {
      try {
        const c = await fetchCandles(q.symbol, 86400, 2);
        const prev = c.length > 1 ? c[0].c : null, last = c[c.length - 1]?.c ?? null;
        return { label: q.label, digits: q.digits, price: last,
          change: prev != null && last != null ? last - prev : null,
          change_pct: prev ? ((last - prev) / prev) * 100 : null };
      } catch {
        return { label: q.label, digits: q.digits, price: null, change: null, change_pct: null };
      }
    })));
    res.json({ quotes: data });
  } catch (err) {
    res.status(502).json({ error: "Cotations indisponibles" });
  }
});

module.exports = router;
