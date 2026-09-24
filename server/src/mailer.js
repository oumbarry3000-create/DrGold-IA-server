// server/src/mailer.js
// Emails via Resend (meme compte que piTrade). Sans RESEND_API_KEY, les
// envois sont ignores sans erreur : la messagerie dans l'app fonctionne seule.
// Attention : l'expediteur de test onboarding@resend.dev n'envoie qu'a
// l'adresse du proprietaire du compte Resend ; pour ecrire aux clients il
// faut un domaine verifie chez Resend (RESEND_FROM = "Tradify <x@domaine>").
const API_KEY = process.env.RESEND_API_KEY || "";
const FROM    = process.env.RESEND_FROM || "Tradify <onboarding@resend.dev>";
const APP_URL = process.env.FRONTEND_URL || "https://drgold-ia.web.app";

const escapeHtml = (s) => String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function layout(title, text, ctaLabel, ctaPath) {
  return `<div style="font-family:Arial,sans-serif;background:#060d1a;padding:24px">
  <div style="max-width:520px;margin:auto;background:#0d1829;border:1px solid #1e3a5f;border-radius:12px;padding:24px;color:#cbd5e1">
    <h2 style="color:#f59e0b;margin:0 0 12px">${escapeHtml(title)}</h2>
    <p style="white-space:pre-wrap;line-height:1.6;margin:0 0 20px">${escapeHtml(text)}</p>
    <a href="${APP_URL}${ctaPath}" style="display:inline-block;background:#f59e0b;color:#060d1a;font-weight:bold;text-decoration:none;padding:10px 18px;border-radius:8px">${escapeHtml(ctaLabel)}</a>
    <p style="color:#475569;font-size:12px;margin:20px 0 0">Tradify · trading automatisé XAUUSD</p>
  </div></div>`;
}

async function post(path, payload) {
  const res = await fetch(`https://api.resend.com${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

// Un email ; ne leve jamais (la messagerie ne doit pas echouer a cause de l'email)
const isTechnical = (to) => /@deriv\.tradify$/i.test(String(to || ""));

async function sendEmail(to, subject, title, text, ctaLabel = "Ouvrir Tradify", ctaPath = "/dashboard") {
  if (!API_KEY || !to || isTechnical(to)) return false;
  try {
    await post("/emails", { from: FROM, to: [to], subject, html: layout(title, text, ctaLabel, ctaPath) });
    return true;
  } catch (err) {
    console.error("email error:", err.message);
    return false;
  }
}

// Envoi groupe (annonces) par paquets de 100 ; renvoie le nombre d'emails acceptes
async function sendBulk(recipients, subject, title, text, ctaLabel, ctaPath) {
  recipients = recipients.filter((to) => !isTechnical(to));
  if (!API_KEY || recipients.length === 0) return 0;
  let sent = 0;
  for (let i = 0; i < recipients.length; i += 100) {
    const chunk = recipients.slice(i, i + 100).map((to) => ({
      from: FROM, to: [to], subject, html: layout(title, text, ctaLabel, ctaPath),
    }));
    try {
      await post("/emails/batch", chunk);
      sent += chunk.length;
    } catch (err) {
      console.error("bulk email error:", err.message);
    }
  }
  return sent;
}

module.exports = { sendEmail, sendBulk, emailEnabled: () => !!API_KEY };
