#!/usr/bin/env node
// Mode "boucle locale" : exécute check.mjs toutes les N secondes.
// À utiliser quand on veut surveiller depuis son Mac (l'ordi doit rester allumé).
// Pour du H24 vrai, utiliser GitHub Actions à la place.

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CHECK_SCRIPT = path.join(__dirname, "check.mjs");
const INTERVAL_SEC = parseInt(process.env.WATCH_INTERVAL || "30", 10);

let runCount = 0;
let stopping = false;

function ts() {
  return new Date().toLocaleTimeString("fr-CH", { timeZone: "Europe/Zurich" });
}

async function runOnce() {
  runCount++;
  const banner = `\n━━━━━━━━━━ Check #${runCount} — ${ts()} ━━━━━━━━━━`;
  console.log(banner);
  return new Promise((resolve) => {
    const child = spawn("node", [CHECK_SCRIPT], {
      stdio: "inherit",
      env: process.env,
    });
    child.on("exit", resolve);
  });
}

async function loop() {
  console.log(`👁️  Surveillance LOCALE démarrée — check toutes les ${INTERVAL_SEC}s`);
  console.log(`   URL : ${process.env.TICKETCORNER_URL || "(non configurée)"}`);
  console.log(`   Appuie sur Ctrl+C pour arrêter.\n`);

  while (!stopping) {
    await runOnce();
    if (stopping) break;
    await new Promise((r) => setTimeout(r, INTERVAL_SEC * 1000));
  }
}

process.on("SIGINT", () => {
  console.log("\n\n⏹  Surveillance arrêtée.");
  stopping = true;
  process.exit(0);
});

loop();
