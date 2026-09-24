// server/src/botSettings.js
// Parametres du bot (strategie, risque, grille, objectifs, filtres, perte max
// par jour) : UNE configuration globale, modifiable par l'admin seulement,
// appliquee a tous les traders. Chaque trader garde ses reglages personnels :
// notifications Telegram (TG_KEYS).
const { pool } = require("./db");

const DEFAULT_EA_PARAMS = {
  stratMode: "CONTINUATION",
  candleCount: 3,
  initialLot: 0.01,
  martingaleMult: 1.5,
  maxGridLevels: 3,
  gridMode: "FIXE",
  gridDistancePips: 50,
  gridATRMult: 1.5,
  globalTPMoney: 10,
  globalSLMoney: 20,
  breakEvenMoney: 5,
  dailyLossLimit: 20,
  useDailyFilters: false,
  emaPeriod: 200,
  useRSI: false,
  rsiPeriod: 14,
  rsiLevelHigh: 70,
  rsiLevelLow: 30,
  atrPeriod: 14,
  tgBotToken: "",
  tgChatID: "",
  tgMiniAppURL: "",
  magicNumber: 990011,
};

const TG_KEYS = ["tgBotToken", "tgChatID", "tgMiniAppURL"];
const BOT_KEYS = Object.keys(DEFAULT_EA_PARAMS).filter((k) => !TG_KEYS.includes(k));

const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => obj && obj[k] !== undefined).map((k) => [k, obj[k]]));

let cache = null;
let cachedAt = 0;

async function getBotParams() {
  if (cache && Date.now() - cachedAt < 10_000) return cache;
  const { rows } = await pool.query("SELECT value FROM app_settings WHERE key = 'bot_params'");
  cache = { ...pick(DEFAULT_EA_PARAMS, BOT_KEYS), ...pick(rows[0]?.value || {}, BOT_KEYS) };
  cachedAt = Date.now();
  return cache;
}

async function setBotParams(params) {
  const value = { ...(await getBotParams()), ...pick(params, BOT_KEYS) };
  await pool.query(
    `INSERT INTO app_settings (key, value, updated_at) VALUES ('bot_params', $1, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [JSON.stringify(value)]
  );
  cache = value;
  cachedAt = Date.now();
  return value;
}

// Parametres effectifs d'un trader : config globale + ses reglages Telegram
async function effectiveParams(userParams) {
  return { ...(await getBotParams()), ...pick(userParams || {}, TG_KEYS) };
}

module.exports = { DEFAULT_EA_PARAMS, TG_KEYS, BOT_KEYS, pick, getBotParams, setBotParams, effectiveParams };
