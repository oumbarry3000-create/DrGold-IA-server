// server/src/strategy/trendRider.js
// Port de TrendRiderEA_v2.mq5 — logique identique

/**
 * Calcule EMA sur un tableau de closes
 */
function calcEMA(closes, period) {
  if (closes.length < period) return null;
  const k = 2 / (period + 1);
  let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k);
  }
  return ema;
}

/**
 * Calcule RSI
 */
function calcRSI(closes, period) {
  if (closes.length < period + 1) return null;
  const slice = closes.slice(closes.length - period - 1);
  let gains = 0, losses = 0;
  for (let i = 1; i < slice.length; i++) {
    const diff = slice[i] - slice[i - 1];
    if (diff > 0) gains += diff;
    else losses += Math.abs(diff);
  }
  if (losses === 0) return 100;
  const rs = gains / losses;
  return 100 - 100 / (1 + rs);
}

/**
 * Alignement des bougies (comme GetCandleAlignment)
 * candles = [{open, close}] du plus ancien au plus récent
 * Retourne: 1=bullish, -1=bearish, 0=neutre
 */
function getCandleAlignment(candles, count) {
  const recent = candles.slice(-count);
  if (recent.length < count) return 0;
  const allBullish = recent.every((c) => c.close > c.open);
  const allBearish = recent.every((c) => c.close < c.open);
  if (allBullish) return 1;
  if (allBearish) return -1;
  return 0;
}

/**
 * Filtre daily EMA + RSI (comme CheckDailyTrendFilters)
 * dailyCloses : array de closes daily (du plus ancien au plus récent)
 */
function checkDailyFilters(alignment, dailyCloses, params) {
  if (!params.useDailyFilters) return true;

  const ema = calcEMA(dailyCloses, params.emaPeriod);
  if (ema === null) return false;

  const lastClose = dailyCloses[dailyCloses.length - 1];
  let rsi = 50; // neutre si RSI désactivé

  if (params.useRSI) {
    rsi = calcRSI(dailyCloses, params.rsiPeriod);
    if (rsi === null) return false;
  }

  if (params.stratMode === "CONTINUATION") {
    if (alignment === 1) {
      if (lastClose < ema) return false;
      if (params.useRSI && rsi < params.rsiLevelHigh) return false;
    }
    if (alignment === -1) {
      if (lastClose > ema) return false;
      if (params.useRSI && rsi > params.rsiLevelLow) return false;
    }
  } else if (params.stratMode === "RETOURNEMENT") {
    if (alignment === 1 && lastClose > ema) return false;
    if (alignment === -1 && lastClose < ema) return false;
  }

  return true;
}

/**
 * Retourne la direction du signal ou null
 * @param {Array} candles   - bougies H1/M15 récentes [{open,close}]
 * @param {Array} dailyCloses - closes daily
 * @param {Object} params   - EA params
 * @returns {"BUY"|"SELL"|null}
 */
function getSignal(candles, dailyCloses, params) {
  const alignment = getCandleAlignment(candles, params.candleCount);
  if (alignment === 0) return null;

  if (!checkDailyFilters(alignment, dailyCloses, params)) return null;

  // Mode continuation
  if (params.stratMode === "CONTINUATION") {
    if (alignment === 1) return "BUY";
    if (alignment === -1) return "SELL";
  }
  // Mode retournement
  if (params.stratMode === "RETOURNEMENT") {
    if (alignment === 1) return "SELL";
    if (alignment === -1) return "BUY";
  }

  return null;
}

/**
 * Calcule le lot de la grille martingale pour le niveau donné
 */
function calcGridLot(initialLot, mult, level) {
  let lot = initialLot;
  for (let i = 0; i < level; i++) lot *= mult;
  return Math.round(lot * 100) / 100;
}

module.exports = { getSignal, calcGridLot, calcEMA, calcRSI };
