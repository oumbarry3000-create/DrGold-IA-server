// src/lib/defaultParams.js
// Correspond exactement aux inputs de TrendRiderEA_v2.mq5

export const DEFAULT_EA_PARAMS = {
  // Stratégie
  stratMode:        "CONTINUATION",   // CONTINUATION | RETOURNEMENT
  candleCount:      3,

  // Gestion du risque & Grille
  initialLot:       0.01,
  martingaleMult:   1.2,
  maxGridLevels:    2,
  gridMode:         "FIXE",           // FIXE | ATR
  gridDistancePips: 20,
  gridATRMult:      1.0,

  // Objectifs
  globalTPMoney:    5.0,
  globalSLMoney:    15.0,
  breakEvenMoney:   1.0,

  // Filtres Daily
  useDailyFilters:  true,
  emaPeriod:        200,
  useRSI:           true,
  rsiPeriod:        7,
  rsiLevelHigh:     60.0,
  rsiLevelLow:      40.0,
  atrPeriod:        14,

  // Telegram
  tgBotToken:       "",
  tgChatID:         "",
  tgMiniAppURL:     "",

  // Magic
  magicNumber:      882026,
};
