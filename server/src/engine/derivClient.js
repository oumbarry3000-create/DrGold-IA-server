// server/src/engine/derivClient.js
const WebSocket = require("ws");
const { pool }                   = require("../db");
const { getSignal, calcGridLot } = require("../strategy/trendRider");
const { sendTelegram }           = require("../strategy/telegram");
const { refreshOAuth }           = require("../derivApi");

// Nouvelle API Deriv (tokens "pat_...") : l'ancien WS ws.binaryws.com renvoie
// 520. Flux : REST (Bearer PAT + Deriv-App-ID) -> liste des comptes -> OTP ->
// WebSocket deja authentifie (plus de message "authorize").
const DERIV_API    = "https://api.derivws.com/trading/v1/options";
const DERIV_APP_ID = process.env.DERIV_APP_ID;
const SYMBOL       = "frxXAUUSD";
const MIN_STAKE    = 0.5; // mise minimale Deriv (USD)
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

  async _derivRest(method, path, retried = false) {
    const headers = { Authorization: `Bearer ${this.derivToken}`, "Content-Type": "application/json" };
    if (this.authKind !== "oauth") headers["Deriv-App-ID"] = DERIV_APP_ID || ""; // requis pour les PAT
    const res = await fetch(DERIV_API + path, { method, headers });
    if (res.status === 401 && this.authKind === "oauth" && !retried) {
      await this._onOAuthExpired();
      return this._derivRest(method, path, true);
    }
    const text = await res.text();
    let body;
    try { body = JSON.parse(text); } catch { body = null; }
    if (!res.ok) {
      const msg = body?.errors?.[0]?.message || body?.error?.message || body?.message || text.slice(0, 200);
      const err = new Error(`HTTP ${res.status} ${method} ${path}: ${msg}`);
      err.status = res.status;
      throw err;
    }
    return body;
  }

  // Jeton OAuth expire : renouvellement si Deriv a fourni un refresh token,
  // sinon le client doit se reconnecter (le moteur coupe alors ce bot).
  async _onOAuthExpired() {
    const { encrypt } = require("../routes");
    if (this.refreshToken) {
      try {
        const t = await refreshOAuth(this.refreshToken);
        this.derivToken   = t.accessToken;
        if (t.refreshToken) this.refreshToken = t.refreshToken;
        const encAccess   = encrypt(t.accessToken);
        this.tokenEncrypted = encAccess; // evite une reconnexion inutile par le moteur
        await pool.query(
          `UPDATE users SET oauth_access_encrypted = $1, oauth_expires_at = $2,
             oauth_refresh_encrypted = COALESCE($3, oauth_refresh_encrypted) WHERE uid = $4`,
          [encAccess, t.expiresAt, t.refreshToken ? encrypt(t.refreshToken) : null, this.uid]
        );
        console.log(`[${this.uid}] Jeton OAuth renouvele`);
        return;
      } catch (err) {
        console.error(`[${this.uid}] Renouvellement OAuth impossible:`, err.message);
      }
    }
    console.log(`[${this.uid}] Connexion Deriv expiree : le client doit se reconnecter`);
    this.running = false;
    await pool.query("UPDATE users SET deriv_reauth_needed = true, deriv_connected = false WHERE uid = $1", [this.uid]).catch(() => {});
    this._tg("⚠️ <b>Tradify en pause</b>\nVotre connexion Deriv a expiré. Ouvrez l'application et cliquez sur « Reconnecter Deriv ».");
    throw new Error("connexion Deriv expiree (reconnexion requise)");
  }

  // Choisit le compte : demo par defaut, reel seulement si params.derivAccountType === "real"
  _pickAccount(accounts) {
    const isDemo = (a) =>
      a.account_type === "demo" || a.type === "demo" || a.is_virtual === true || a.is_virtual === 1 ||
      /^(VRT|DOT)/i.test(a.account_id || a.accountId || a.loginid || "");
    const wantReal = this.params.derivAccountType === "real";
    return accounts.find((a) => (wantReal ? !isDemo(a) : isDemo(a)));
  }

  async start() {
    if (!this.running) return;
    console.log(`[${this.uid}] Connexion Deriv...`);
    let wsUrl;
    try {
      if (!DERIV_APP_ID) throw new Error("DERIV_APP_ID manquant dans les variables d'environnement du serveur");
      const list = await this._derivRest("GET", "/accounts");
      const accounts = Array.isArray(list?.data) ? list.data : Array.isArray(list) ? list : (list?.data?.accounts || []);
      console.log(`[${this.uid}] Comptes Deriv:`, JSON.stringify(accounts.map((a) => {
        const { balance, ...rest } = a; return rest;
      })).slice(0, 400));
      // Comptes lies par token (sans OAuth) : on memorise la liste pour l'admin
      pool.query(
        "UPDATE users SET deriv_accounts = $1 WHERE uid = $2 AND deriv_accounts IS NULL",
        [JSON.stringify(accounts.map((a) => ({ account_id: a.account_id, account_type: a.account_type, currency: a.currency || null }))), this.uid]
      ).catch(() => {});
      const account = this._pickAccount(accounts);
      if (!account) throw new Error(`aucun compte ${this.params.derivAccountType === "real" ? "reel" : "demo"} trouve`);
      this.accountId = account.account_id || account.accountId || account.loginid || account.id;
      this.accountCurrency = account.currency || "USD";
      const otp = await this._derivRest("POST", `/accounts/${this.accountId}/otp`);
      wsUrl = otp?.data?.url || otp?.url;
      if (!wsUrl) throw new Error("reponse OTP sans url");
    } catch (err) {
      console.error(`[${this.uid}] Deriv REST error:`, err.message);
      this._updateUserDoc({ deriv_connected: false });
      if (this.running) this.retryTimer = setTimeout(() => this.start(), 30000);
      return;
    }
    if (!this.running) return;

    this.ws = new WebSocket(wsUrl);

    this.ws.on("open", () => {
      // Le WS est deja authentifie par l'OTP : on demande le solde puis on
      // demarre les abonnements (equivalent de l'ancien "authorize").
      this._send({ balance: 1, subscribe: 1 });
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
        this.retryTimer = setTimeout(() => this.start(), 5000); // reconnect (nouvel OTP)
      }
    });

    this.ws.on("error", (err) => {
      console.error(`[${this.uid}] WS error:`, err.message);
    });
  }

  stop() {
    this.running = false;
    clearTimeout(this.retryTimer);
    if (this.ws) this.ws.close();
  }

  _send(obj) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(obj));
    }
  }

  _handleMessage(msg) {
    if (msg.error) {
      console.error(`[${this.uid}] Deriv error (${msg.msg_type || Object.keys(msg.echo_req || {})[0]}):`, msg.error.message);
      if (!this.authorized) this._updateUserDoc({ deriv_connected: false });
      return;
    }

    switch (msg.msg_type) {
      case "balance":
        if (!msg.balance) break;
        if (!this.authorized) {
          this.authorized = true;
          const loginid = msg.balance.loginid || this.accountId;
          console.log(`[${this.uid}] Connecté Deriv: ${loginid} | solde ${msg.balance.balance} ${msg.balance.currency || ""}`);
          this._updateUserDoc({
            deriv_balance:   msg.balance.balance,
            deriv_loginid:   loginid,
            deriv_currency:  msg.balance.currency || this.accountCurrency,
            deriv_connected: true,
          });
          this._subscribeCandles();
          this._subscribeDailyCandles();
          this._subscribeOpenContracts();
          this._tg(`🟢 <b>Tradify Démarré</b>\n📊 ${SYMBOL}\n💰 Balance: $${msg.balance.balance}`);
        } else {
          this._updateUserDoc({ deriv_balance: msg.balance.balance });
        }
        break;

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
        this._tg(`🟢 <b>Tradify Démarré</b>\n📊 ${SYMBOL}\n💰 Balance: $${msg.authorize.balance}`);
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
    this._send({ proposal_open_contract: 1, subscribe: 1 });
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
    // Mise = lots x 10 USD, avec le minimum Deriv de 0.50 USD
    const stake = Math.max(MIN_STAKE, Math.round(lots * 10 * 100) / 100);
    this._send({
      buy: 1,
      price: stake,
      parameters: {
        amount: stake,
        basis: "stake",
        contract_type: contractType,
        currency: "USD",
        duration: 1,
        duration_unit: "h",
        underlying_symbol: SYMBOL, // nouvelle API : "symbol" n est plus accepte
      },
    });

    console.log(`[${this.uid}] Order ${direction} | lots=${lots} | mise=${stake}$ | level=${this.gridLevel}`);
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

    // Écrire dans Postgres (Neon)
    pool.query(
      `INSERT INTO trades (contract_id, uid, symbol, direction, lots, entry, exit, pnl, status, grid_level, opened_at, closed_at, account_id)
       VALUES ($1, $2, $3, $4, $5, $6, NULL, NULL, 'open', $7, now(), NULL, $8)`,
      [String(contract.contract_id), this.uid, SYMBOL, direction, lots, contract.buy_price, this.gridLevel - 1, this.accountId || null]
    ).catch((err) => console.error(`[${this.uid}] insert trade error:`, err.message));
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

    // Update Postgres
    pool.query(
      `UPDATE trades SET exit = $1, pnl = $2, status = 'closed', closed_at = now() WHERE contract_id = $3`,
      [tx.price || 0, profit, trade.tradeDbId]
    ).catch((err) => console.error(`[${this.uid}] update trade error:`, err.message));

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
    const cols = Object.keys(data);
    if (cols.length === 0) return;
    const setClause = cols.map((c, i) => `${c} = $${i + 1}`).join(", ");
    const values = cols.map((c) => data[c]);
    pool.query(
      `UPDATE users SET ${setClause} WHERE uid = $${cols.length + 1}`,
      [...values, this.uid]
    ).catch((err) => {
      console.error(`[${this.uid}] update user error:`, err.message);
    });
  }

  _tg(msg) {
    if (this.params.tgBotToken && this.params.tgChatID) {
      sendTelegram(this.params.tgBotToken, this.params.tgChatID, msg, this.params.tgMiniAppURL);
    }
  }
}

module.exports = DerivClient;
