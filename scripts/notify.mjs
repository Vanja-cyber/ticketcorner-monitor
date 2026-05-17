#!/usr/bin/env node
// Envoie des alertes multi-canaux : Telegram, CallMeBot WhatsApp, Twilio (appel).
// Configuration via variables d'environnement (voir .env.example).

const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TG_CHAT = process.env.TELEGRAM_CHAT_ID;

// CallMeBot WhatsApp — gratuit, 1 numéro
const CMB_PHONE = process.env.CALLMEBOT_PHONE;       // ex: 41791234567 (sans + ni espaces)
const CMB_APIKEY = process.env.CALLMEBOT_APIKEY;     // fourni après activation

// CallMeBot WhatsApp — 2e numéro optionnel
const CMB_PHONE_2 = process.env.CALLMEBOT_PHONE_2;
const CMB_APIKEY_2 = process.env.CALLMEBOT_APIKEY_2;

// Twilio (optionnel, payant, pour vrai appel téléphonique)
const TW_SID = process.env.TWILIO_ACCOUNT_SID;
const TW_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TW_FROM = process.env.TWILIO_FROM_NUMBER;
const TW_TO = process.env.TWILIO_TO_NUMBER;
const TW_TO_2 = process.env.TWILIO_TO_NUMBER_2;

// Resend (email) — gratuit jusqu'à 100/jour
const RESEND_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM || "Claude Ticketcorner <onboarding@resend.dev>";
const EMAIL_RECIPIENTS = (process.env.EMAIL_RECIPIENTS || "")
  .split(",")
  .map((e) => e.trim())
  .filter(Boolean);

function buildMessage({ label, url, prices, detectedAt, isFirstDetection, attempt }) {
  const priceLine =
    prices && prices.length
      ? `\n💰 Prix détectés : ${prices.map((p) => `CHF ${p}`).join(", ")}`
      : "";
  const header = isFirstDetection
    ? "🚨🚨🚨 BILLETS DISPONIBLES 🚨🚨🚨"
    : `🔁 Rappel #${attempt} — toujours dispo`;
  return (
    `${header}\n\n` +
    `🎫 ${label}\n` +
    `🕒 Détecté à : ${new Date(detectedAt).toLocaleString("fr-CH", { timeZone: "Europe/Zurich" })}` +
    priceLine +
    `\n\n👉 ${url}\n\n` +
    `— Claude (surveillance Ticketcorner)`
  );
}

async function sendTelegram(text) {
  if (!TG_TOKEN || !TG_CHAT) return { skipped: "telegram (token/chat manquant)" };
  try {
    const url = `https://api.telegram.org/bot${TG_TOKEN}/sendMessage`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TG_CHAT,
        text,
        disable_web_page_preview: false,
        disable_notification: false,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) {
      return { error: `telegram: ${res.status} ${JSON.stringify(data)}` };
    }
    return { ok: "telegram envoyé" };
  } catch (e) {
    return { error: `telegram exception: ${e.message}` };
  }
}

async function sendCallMeBot(phone, apikey, text, tag) {
  if (!phone || !apikey) return { skipped: `${tag} (phone/apikey manquant)` };
  try {
    const url =
      `https://api.callmebot.com/whatsapp.php` +
      `?phone=${encodeURIComponent(phone)}` +
      `&text=${encodeURIComponent(text)}` +
      `&apikey=${encodeURIComponent(apikey)}`;
    const res = await fetch(url);
    const body = await res.text();
    // CallMeBot renvoie "Message queued" / "Message Sent" en succès
    if (res.ok && /sent|queued/i.test(body)) {
      return { ok: `${tag} envoyé` };
    }
    return { error: `${tag}: HTTP ${res.status} — ${body.slice(0, 200)}` };
  } catch (e) {
    return { error: `${tag} exception: ${e.message}` };
  }
}

async function callTwilio(to, message, tag) {
  if (!TW_SID || !TW_TOKEN || !TW_FROM || !to) {
    return { skipped: `${tag} (twilio non configuré)` };
  }
  try {
    // Génère un appel TwiML inline qui dit le message en français
    const twiml = `<Response><Say voice="alice" language="fr-FR">${
      escapeXml(message).slice(0, 400)
    }</Say><Pause length="1"/><Say voice="alice" language="fr-FR">${
      escapeXml(message).slice(0, 400)
    }</Say></Response>`;
    const url = `https://api.twilio.com/2010-04-01/Accounts/${TW_SID}/Calls.json`;
    const body = new URLSearchParams({
      To: to,
      From: TW_FROM,
      Twiml: twiml,
    });
    const auth = Buffer.from(`${TW_SID}:${TW_TOKEN}`).toString("base64");
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { error: `${tag}: HTTP ${res.status} — ${JSON.stringify(data).slice(0, 200)}` };
    return { ok: `${tag} déclenché (sid ${data.sid})` };
  } catch (e) {
    return { error: `${tag} exception: ${e.message}` };
  }
}

async function sendEmail(payload) {
  if (!RESEND_KEY || EMAIL_RECIPIENTS.length === 0) {
    return { skipped: "email (RESEND_API_KEY ou EMAIL_RECIPIENTS manquant)" };
  }
  try {
    const { label, url, prices, detectedAt, isFirstDetection, attempt } = payload;
    const priceLine = prices && prices.length
      ? `<p style="font-size:18px;margin:8px 0"><strong>💰 Prix détectés :</strong> ${prices.map((p) => `CHF ${p}`).join(", ")}</p>`
      : "";
    const subject = isFirstDetection
      ? `🚨 BILLETS DISPONIBLES — ${label}`
      : `🔁 Rappel ${attempt} — billets toujours dispo : ${label}`;
    const html = `
<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;background:#0a0a0f;color:#e9e9f1;padding:40px 20px;margin:0">
  <div style="max-width:560px;margin:0 auto;background:linear-gradient(180deg,#14141d 0%,#1d1d2a 100%);border:2px solid #22c55e;border-radius:16px;padding:32px">
    <div style="background:rgba(34,197,94,0.15);color:#22c55e;display:inline-block;padding:6px 12px;border-radius:8px;font-size:12px;font-weight:700;letter-spacing:0.06em;margin-bottom:16px">
      ${isFirstDetection ? "🚨 PREMIÈRE DÉTECTION" : `🔁 RAPPEL #${attempt}`}
    </div>
    <h1 style="margin:0 0 8px;font-size:32px;color:#22c55e;line-height:1.1">BILLETS DISPONIBLES</h1>
    <p style="font-size:18px;margin:8px 0;color:#e9e9f1"><strong>🎫 ${label}</strong></p>
    ${priceLine}
    <p style="font-size:14px;margin:8px 0;color:#8b8ba0">🕒 Détecté à : ${new Date(detectedAt).toLocaleString("fr-CH", { timeZone: "Europe/Zurich" })}</p>
    <div style="margin:32px 0">
      <a href="${url}" style="background:#22c55e;color:#0a1a0d;padding:16px 24px;border-radius:12px;font-weight:700;text-decoration:none;display:inline-block;font-size:16px">🛒 ALLER ACHETER MAINTENANT</a>
    </div>
    <p style="font-size:12px;color:#8b8ba0;margin-top:24px;border-top:1px solid #2a2a3a;padding-top:16px">— Claude (surveillance Ticketcorner)</p>
  </div>
</body></html>`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: EMAIL_RECIPIENTS,
        subject,
        html,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { error: `email: HTTP ${res.status} — ${JSON.stringify(data).slice(0, 200)}` };
    }
    return { ok: `email envoyé à ${EMAIL_RECIPIENTS.length} destinataire(s) (id ${data.id})` };
  } catch (e) {
    return { error: `email exception: ${e.message}` };
  }
}

function escapeXml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function sendAllAlerts(payload) {
  const text = buildMessage(payload);
  const shortText = `🚨 BILLETS DISPO ! ${payload.label} — ${payload.url}`;
  const voiceMessage = `Alerte Claude. Des billets pour ${payload.label} viennent d'être détectés sur Ticketcorner. Connecte-toi immédiatement.`;

  // Lance tous les canaux en parallèle pour vitesse maximale
  const results = await Promise.all([
    sendTelegram(text),
    sendCallMeBot(CMB_PHONE, CMB_APIKEY, shortText, "callmebot#1"),
    sendCallMeBot(CMB_PHONE_2, CMB_APIKEY_2, shortText, "callmebot#2"),
    callTwilio(TW_TO, voiceMessage, "twilio#1"),
    callTwilio(TW_TO_2, voiceMessage, "twilio#2"),
    sendEmail(payload),
  ]);

  for (const r of results) {
    if (r.ok) console.log("  ✅", r.ok);
    else if (r.skipped) console.log("  ⏭️ ", r.skipped);
    else if (r.error) console.warn("  ❌", r.error);
  }
  return results;
}

// Mode test : `node scripts/notify.mjs --test`
if (process.argv.includes("--test")) {
  console.log("Envoi d'une notification de test sur tous les canaux configurés...");
  await sendAllAlerts({
    label: "TEST — David Guetta (Venoge Festival)",
    url: process.env.TICKETCORNER_URL || "https://www.ticketcorner.ch/",
    prices: [89, 129, 189],
    detectedAt: new Date().toISOString(),
    isFirstDetection: true,
    attempt: 1,
  });
}
