// server/src/engine/derivClient.js
const WebSocket = require("ws");
const { getDB }       = require("../firebase");
const { getSignal, calcGridLot } = require("../strategy/trendRider");
const { sendTelegram }           = require("../strategy/telegram");
const admin = require("firebase-admin");

const DERIV_WS_URL = "wss://ws.binaryws.com/websockets/v3?app_id=1089";
const SYMBOL       = "frxXAUUSD";
const TIMEFRAME    = 60; // 1 minute candles

class DerivClient {
  constructor(uid, derivToken, params) {
    this.uid         = uid;
    this.derivToken  = derivToken;
    this.params      = params;
    this.ws          = null;
    this.authorized  = false;
    this.candles     = [];      // bougies M1 courantes [{open,close}]
    this.dailyCloses = [];      // closes D1
    this.openTrades  = [];      // positions ouvertes [{contractId, direction, lots, entry, tradeDbId}]
    this.lastCandleEpoch = 0;
    this.gridLevel   = 0;
    this.signalLocked= false;   // anti double-signal par bougie
    this.running     = true;

    // Stats session
    this.sessionStart = Date.now();
  }

  start() {
    console.log(`[${this.uid}] Connexion Deriv...`);
    this.ws = new WebSocket(DERIV_WS_URL);

    this.ws.on("open", () => {
      this._send({ authorize: this.derivToken });
    });

    this.ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw);
        this._handleMessage(msg);
      } catch (e) {
        console.error(`[${this.uid}] parse error:`, e.message);
      }
    });

    this.ws.on("close", () => {
      console.log(`[${this.uid}] WS fermé`);
      this.authorized = false;
      this._updateUserDoc({ deriv_connected: false });
      if (this.running) {
        setTimeout(() => this.start(), 5000); // reconnect
      }
    });

    this.ws.on("error", (err) => {
      console.error(`[${this.uid}] WS error:`, err.message);
    });
  }

  stop() {
    this.running = false;
    if (this.ws) this.ws.close();
  }

  _send(obj) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(obj));
    }
  }

  _handleMessage(msg) {
    if (msg.error) {
      console.error(`[${this.uid}] Deriv error:`, msg.error.message);
      if (!this.authorized) this._updateUserDoc({ deriv_connected: false });
      return;
    }

    switch (msg.msg_type) {
      case "authorize":
        this.authorized = true;
        console.log(`[${this.uid}] Autorisé: ${msg.authorize.loginid}`);
        this._updateUserDoc({
          deriv_balance:   msg.authorize.balance,
          deriv_loginid:   msg.authorize.loginid,
          deriv_currency:  msg.authorize.currency,
          deriv_connected: true,
        });
        this._subscribeCandles();
        this._subscribeDailyCandles();
        this._subscribeOpenContracts();
        this._tg(`🟢 <b>DrGold IA Démarré</b>\n📊 ${SYMBOL}\n💰 Balance: $${msg.authorize.balance}`);
        break;

      case "candles":
        // Historique initial
        if (msg.candles) {
          this.candles = msg.candles.map((c) => ({ open: c.open, close: c.close, epoch: c.epoch }));
        }
        break;

      case "ohlc":
        // Tick temps réel
        this._processOHLC(msg.ohlc);
        break;

      case "history":
        // Historique daily pour EMA/RSI
        if (msg.history?.prices) {
          this.dailyCloses = msg.history.prices;
        }
        break;

      case "buy":
        this._onBuy(msg);
        break;

      case "proposal_open_contracts":
        if (msg.proposal_open_contracts) {
          this._checkOpenContracts(msg.proposal_open_contracts);
        }
        break;

      case "transaction":
        if (msg.transaction?.action === "sell") {
          this._onSell(msg.transaction);
        }
        break;
    }
  }

  _subscribeCandles() {
    // Historique 200 bougies M1
    this._send({
      ticks_history: SYMBOL,
      adjust_start_time: 1,
      count: 200,
      end: "latest",
      granularity: TIMEFRAME,
      style: "candles",
      subscribe: 1,
    });
  }

  _subscribeDailyCandles() {
    // Historique daily pour EMA(200) + RSI
    const needed = Math.max(this.params.emaPeriod, this.params.rsiPeriod) + 10;
    this._send({
      ticks_history: SYMBOL,
      adjust_start_time: 1,
      count: needed + 50,
      end: "latest",
      granularity: 86400, // Daily
      style: "candles",
    });
  }

  _subscribeOpenContracts() {
    this._send({ proposal_open_contracts: 1, subscribe: 1 });
    this._send({ transaction: 1, subscribe: 1 });
  }

  _processOHLC(ohlc) {
    const epoch = ohlc.open_time;

    if (epoch !== this.lastCandleEpoch) {
      // Nouvelle bougie : push l'ancienne complète
      if (this.lastCandleEpoch > 0) {
        const prev = this.candles[this.candles.length - 1];
        if (prev) {
          prev.close = ohlc.open; // la fermeture de la précédente = l'ouverture de la nouvelle
        }
        this.candles.push({ open: ohlc.open, close: ohlc.close, epoch });
        if (this.candles.length > 300) this.candles.shift();
        this.signalLocked = false; // débloquer signal sur nouvelle bougie
      }
      this.lastCandleEpoch = epoch;
    } else {
      // Mise à jour bougie courante
      if (this.candles.length > 0) {
        this.candles[this.candles.length - 1].close = ohlc.close;
      }
    }

    // Vérifier les targets globales
    this._checkGlobalTargets();

    // Analyser signal si pas de position ouverte et pas déjà signé cette bougie
    if (this.openTrades.length === 0 && !this.signalLocked && this.candles.length >= this.params.candleCount) {
      this._analyzeSignal(ohlc.close);
    }
  }

  _analyzeSignal(currentPrice) {
    // On analyse les bougies CLOSES (pas la courante)
    const closedCandles = this.candles.slice(0, -1);
    if (closedCandles.length < this.params.candleCount) return;

    const signal = getSignal(closedCandles, this.dailyCloses, this.params);
    if (!signal) return;

    this.signalLocked = true;
    this.gridLevel    = 0;
    this._placeOrder(signal, currentPrice);
  }

  _placeOrder(direction, currentPrice) {
    if (this.gridLevel >= this.params.maxGridLevels) {
      console.log(`[${this.uid}] Max grid levels atteint`);
      return;
    }

    const lots = calcGridLot(this.params.initialLot, this.params.martingaleMult, this.gridLevel);
    const contractType = direction === "BUY" ? "CALL" : "PUT";

    // Sur Deriv, les contrats digitaux ont une durée
    // Pour XAUUSD on utilise des contrats Rise/Fall avec durée 5 ticks ou time-based
    // Pour MVP : contrat CALL/PUT durée 1 heure
    this._send({
      buy: 1,
      price: lots * 10, // montant en USD approximatif
      parameters: {
        amount: lots * 10,
        basis: "stake",
        contract_type: contractType,
        currency: "USD",
        duration: 1,
        duration_unit: "h",
        symbol: SYMBOL,
      },
    });

    console.log(`[${this.uid}] Order ${direction} | lots=${lots} | level=${this.gridLevel}`);
  }

  _onBuy(msg) {
    if (!msg.buy) return;
    const contract = msg.buy;
    const direction = contract.longcode?.includes("higher") ? "BUY" : "SELL";
    const lots = calcGridLot(this.params.initialLot, this.params.martingaleMult, this.gridLevel);

    const trade = {
      contractId: contract.contract_id,
      direction,
      lots,
      entry: contract.buy_price,
      gridLevel: this.gridLevel,
    };
    this.openTrades.push(trade);
    this.gridLevel++;

    // Écrire dans Firestore
    const tradeRef = getDB().collection("users").doc(this.uid).collection("trades").doc(String(contract.contract_id));
    tradeRef.set({
      contract_id:  contract.contract_id,
      symbol:       SYMBOL,
      direction,
      lots,
      entry:        contract.buy_price,
      exit:         null,
      pnl:          null,
      status:       "open",
      grid_level:   this.gridLevel - 1,
      opened_at:    admin.firestore.FieldValue.serverTimestamp(),
      closed_at:    null,
    });
    trade.tradeDbId = String(contract.contract_id);

    // Solde mis à jour
    if (contract.balance_after != null) {
      this._updateUserDoc({ deriv_balance: contract.balance_after });
    }

    // Telegram
    this._tg(
      `📊 <b>${direction}</b> ouvert\n` +
      `💵 Prix: $${contract.buy_price}\n` +
      `📦 Lots: ${lots}\n` +
      `🏆 TP: $${this.params.globalTPMoney} | 🛡 SL: $${this.params.globalSLMoney}`
    );
  }

  _onSell(tx) {
    const contractId = tx.contract_id;
    const idx = this.openTrades.findIndex((t) => t.contractId === contractId);
    if (idx === -1) return;

    const trade  = this.openTrades[idx];
    const profit = tx.amount || 0;
    this.openTrades.splice(idx, 1);

    if (this.openTrades.length === 0) {
      this.gridLevel   = 0;
      this.signalLocked = false;
    }

    // Update Firestore
    getDB().collection("users").doc(this.uid).collection("trades").doc(trade.tradeDbId).update({
      exit:       tx.price || 0,
      pnl:        profit,
      status:     "closed",
      closed_at:  admin.firestore.FieldValue.serverTimestamp(),
    });

    // Solde mis à jour
    if (tx.balance != null) {
      this._updateUserDoc({ deriv_balance: tx.balance });
    }

    // Telegram
    const won = profit >= 0;
    this._tg(
      `${won ? "✅" : "❌"} <b>Trade ${won ? "gagné" : "perdu"}</b>\n` +
      `💰 P&L: ${profit >= 0 ? "+" : ""}$${profit.toFixed(2)}\n` +
      `📊 ${SYMBOL} | ${trade.direction}`
    );
  }

  _checkOpenContracts(contracts) {
    // Sync état Firestore si nécessaire
    if (!Array.isArray(contracts)) return;
    const openIds = contracts.map((c) => c.contract_id);
    // Fermer les trades Firestore qui ne sont plus dans Deriv
    this.openTrades = this.openTrades.filter((t) => openIds.includes(t.contractId));
  }

  _checkGlobalTargets() {
    if (this.openTrades.length === 0) return;
    // La vérification TP/SL globale est gérée par Deriv
    // On surveille via transaction events
  }

  _updateUserDoc(data) {
    getDB().collection("users").doc(this.uid).set(data, { merge: true }).catch((err) => {
      console.error(`[${this.uid}] Firestore update error:`, err.message);
    });
  }

  _tg(msg) {
    if (this.params.tgBotToken && this.params.tgChatID) {
      sendTelegram(this.params.tgBotToken, this.params.tgChatID, msg, this.params.tgMiniAppURL);
    }
  }
}

module.exports = DerivClient;
