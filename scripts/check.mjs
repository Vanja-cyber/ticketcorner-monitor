#!/usr/bin/env node
// Vérifie la disponibilité des billets sur Ticketcorner et déclenche les alertes.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sendAllAlerts } from "./notify.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DOCS = path.join(ROOT, "docs");
const STATUS_PATH = path.join(DOCS, "status.json");
const HISTORY_PATH = path.join(DOCS, "history.json");
const CONFIG_PATH = path.join(ROOT, "config.json");

const URL = process.env.TICKETCORNER_URL;
const LABEL = process.env.EVENT_LABEL || "David Guetta — Venoge Festival";

// Disponibilité selon Schema.org (source de vérité dans le JSON-LD de Ticketcorner)
const AVAILABLE_SCHEMAS = new Set([
  "InStock",
  "LimitedAvailability",
  "PreOrder",
  "PreSale",
]);
const UNAVAILABLE_SCHEMAS = new Set([
  "OutOfStock",
  "SoldOut",
  "Discontinued",
]);

// Fallback : patterns texte si JSON-LD absent
const FALLBACK_SOLD_OUT = [
  /sold[\s-]?out/i,
  /ausverkauft/i,
  /\bépuisé\b/i,
  /esaurito/i,
  /complet/i,
  /aucun billet/i,
];
const FALLBACK_AVAILABLE = [
  /\bajouter au panier\b/i,
  /\bin den warenkorb\b/i,
  /\baggiungi al carrello\b/i,
];

async function readJson(p, fallback) {
  try {
    return JSON.parse(await fs.readFile(p, "utf8"));
  } catch {
    return fallback;
  }
}

async function writeJson(p, data) {
  await fs.writeFile(p, JSON.stringify(data, null, 2) + "\n", "utf8");
}

async function loadConfig() {
  return await readJson(CONFIG_PATH, { monitoring: true });
}

async function fetchPage(url) {
  // En-têtes réalistes pour limiter le blocage anti-bot
  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 " +
      "(KHTML, like Gecko) Version/17.5 Safari/605.1.15",
    "Accept":
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "fr-CH,fr;q=0.9,en;q=0.8,de;q=0.7",
    "Accept-Encoding": "gzip, deflate, br",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
  };

  const res = await fetch(url, { headers, redirect: "follow" });
  const html = await res.text();
  return { status: res.status, html, finalUrl: res.url };
}

// Récupère tous les blocs JSON-LD du HTML
function extractJsonLd(html) {
  const blocks = [];
  const re = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(m[1].trim());
      blocks.push(parsed);
    } catch {
      // ignore : certains blocs ont des entités HTML cassées
    }
  }
  return blocks;
}

// Extrait toutes les "Offers" Schema.org d'un blob JSON-LD (récursif)
function collectOffers(node, out = []) {
  if (!node || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    for (const item of node) collectOffers(item, out);
    return out;
  }
  const type = node["@type"];
  const isOffer =
    type === "Offer" ||
    type === "AggregateOffer" ||
    (Array.isArray(type) && (type.includes("Offer") || type.includes("AggregateOffer")));
  if (isOffer) out.push(node);
  for (const v of Object.values(node)) collectOffers(v, out);
  return out;
}

function shortAvailability(uri) {
  if (!uri) return null;
  return String(uri).replace(/^https?:\/\/schema\.org\//i, "");
}

function fallbackTextAnalysis(html) {
  const soldOutHits = FALLBACK_SOLD_OUT.reduce((n, re) => n + ((html.match(re) || []).length), 0);
  const availableHits = FALLBACK_AVAILABLE.reduce((n, re) => n + ((html.match(re) || []).length), 0);
  let available = false;
  let confidence = "low";
  if (availableHits >= 1 && soldOutHits === 0) { available = true; confidence = "medium"; }
  else if (soldOutHits > 0 && availableHits === 0) { available = false; confidence = "medium"; }
  return { available, confidence, soldOutHits, availableHits };
}

function analyse(html) {
  const blocks = extractJsonLd(html);
  const allOffers = [];
  for (const b of blocks) collectOffers(b, allOffers);

  const prices = [...new Set(
    allOffers
      .map((o) => parseFloat(o.price))
      .filter((p) => !Number.isNaN(p) && p > 0)
  )].sort((a, b) => a - b);

  const availabilities = allOffers
    .map((o) => shortAvailability(o.availability))
    .filter(Boolean);

  if (availabilities.length > 0) {
    const availCount = availabilities.filter((a) => AVAILABLE_SCHEMAS.has(a)).length;
    const unavailCount = availabilities.filter((a) => UNAVAILABLE_SCHEMAS.has(a)).length;
    const available = availCount > 0;
    return {
      available,
      confidence: "high",
      source: "schema.org",
      prices,
      availabilities,
      availCount,
      unavailCount,
      offersFound: allOffers.length,
    };
  }

  // Fallback : analyse texte si pas de JSON-LD exploitable
  const txt = fallbackTextAnalysis(html);
  return {
    available: txt.available,
    confidence: txt.confidence,
    source: "fallback-text",
    prices,
    availabilities: [],
    availCount: 0,
    unavailCount: txt.soldOutHits,
    offersFound: 0,
    soldOutHits: txt.soldOutHits,
    availableHits: txt.availableHits,
  };
}

async function appendHistory(entry) {
  const history = await readJson(HISTORY_PATH, { entries: [] });
  history.entries.unshift(entry);
  // Garder les 500 derniers
  history.entries = history.entries.slice(0, 500);
  await writeJson(HISTORY_PATH, history);
}

async function main() {
  if (!URL) {
    console.error("ERREUR : TICKETCORNER_URL manquant dans les variables d'environnement");
    process.exit(1);
  }

  const config = await loadConfig();
  if (config.monitoring === false) {
    console.log("Surveillance désactivée via config.json. Sortie.");
    process.exit(0);
  }

  const prev = await readJson(STATUS_PATH, {
    available: false,
    confidence: "unknown",
    lastCheck: null,
    lastAvailable: null,
    consecutiveAvailableChecks: 0,
  });

  const now = new Date();
  const iso = now.toISOString();

  let result;
  let httpStatus;
  let error = null;

  try {
    const { status, html } = await fetchPage(URL);
    httpStatus = status;
    if (status >= 400) {
      error = `HTTP ${status}`;
      result = { available: false, confidence: "error", source: "error", prices: [], availabilities: [], availCount: 0, unavailCount: 0, offersFound: 0 };
    } else {
      result = analyse(html);
    }
  } catch (e) {
    error = e.message;
    result = { available: false, confidence: "error", source: "error", prices: [], availabilities: [], availCount: 0, unavailCount: 0, offersFound: 0 };
  }

  const statusChanged = prev.available !== result.available;
  const wasUnavailable = prev.available === false;
  const isAvailable = result.available === true;
  const becameAvailable = wasUnavailable && isAvailable;

  const consecutiveAvailableChecks = isAvailable
    ? (prev.consecutiveAvailableChecks || 0) + 1
    : 0;

  const newStatus = {
    available: result.available,
    confidence: result.confidence,
    httpStatus: httpStatus || null,
    error,
    label: LABEL,
    url: URL,
    lastCheck: iso,
    lastAvailable: isAvailable ? iso : prev.lastAvailable,
    consecutiveAvailableChecks,
    source: result.source,
    offersFound: result.offersFound || 0,
    availCount: result.availCount || 0,
    unavailCount: result.unavailCount || 0,
    availabilities: result.availabilities || [],
    prices: result.prices,
  };

  await writeJson(STATUS_PATH, newStatus);
  await appendHistory({
    t: iso,
    available: result.available,
    confidence: result.confidence,
    httpStatus: httpStatus || null,
    error,
    prices: result.prices,
  });

  console.log(JSON.stringify(newStatus, null, 2));

  // Décision d'envoi de notification
  // 1. Toujours notifier au changement vers disponible (premier déclencheur)
  // 2. Re-notifier jusqu'à 6 fois consécutives tant que ça reste disponible (= ~30 min à 5 min d'intervalle)
  //    pour ne pas spammer indéfiniment si l'utilisateur a déjà acheté.
  const shouldNotify =
    isAvailable &&
    result.confidence !== "error" &&
    (becameAvailable || consecutiveAvailableChecks <= 6);

  if (shouldNotify) {
    console.log(
      becameAvailable
        ? "🚨 PREMIÈRE DÉTECTION — envoi des alertes !"
        : `🔁 Rappel ${consecutiveAvailableChecks}/6 — toujours disponible`
    );
    await sendAllAlerts({
      label: LABEL,
      url: URL,
      prices: result.prices,
      detectedAt: iso,
      isFirstDetection: becameAvailable,
      attempt: consecutiveAvailableChecks,
    });
  } else if (statusChanged && !isAvailable && prev.available) {
    console.log("ℹ️ Statut repassé en INDISPONIBLE.");
  } else {
    console.log("Aucune notification à envoyer.");
  }
}

main().catch((e) => {
  console.error("Échec inattendu :", e);
  process.exit(1);
});
