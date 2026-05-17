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
