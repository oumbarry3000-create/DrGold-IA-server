// server/src/strategy/telegram.js
const fetch = require("node-fetch");

async function sendTelegram(botToken, chatID, msg, miniAppURL = "") {
  if (!botToken || !chatID) return;
  let text = msg;
  if (miniAppURL) text += `\n\n🔗 ${miniAppURL}`;

  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatID, text, parse_mode: "HTML" }),
    });
  } catch (err) {
    console.error("Telegram error:", err.message);
  }
}

module.exports = { sendTelegram };
