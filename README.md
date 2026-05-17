# 🎫 Ticketcorner Monitor — David Guetta / Venoge Festival

Surveillance automatique 24/7 des billets David Guetta au Venoge Festival sur Ticketcorner, avec alertes multi-canaux dès qu'un billet apparaît (remise en vente incluse).

## Ce qu'il fait

- ✅ Vérifie Ticketcorner **toutes les ~40 secondes** (6 checks par run cron, runs toutes les 5 min)
- ✅ Détecte « disponible » via plusieurs signaux (boutons d'achat, JSON-LD, etc.)
- ✅ **Notifie immédiatement** sur Telegram + WhatsApp (CallMeBot) + appel Twilio (optionnel)
- ✅ **Renotifie** jusqu'à 6 fois consécutives tant que ça reste dispo (~30 min)
- ✅ **Dashboard web** avec statut temps réel, historique et prix détectés
- ✅ **Bouton démarrer / arrêter** via `config.json`
- ✅ Sauvegarde l'historique complet (heure, statut, prix)
- ✅ Tourne 24/7 gratuitement via GitHub Actions

## Architecture

```
GitHub Actions (cron */5 min)
  └─ scripts/check.mjs   → fetch Ticketcorner + analyse HTML
       └─ scripts/notify.mjs → Telegram + CallMeBot + Twilio en parallèle
  └─ commit docs/status.json + docs/history.json
       └─ GitHub Pages sert le dashboard
```

## Installation

👉 **Voir le guide pas-à-pas : [SETUP.md](SETUP.md)**

## Stack

- Node.js 20 (pas de dépendances externes — uniquement `fetch` natif)
- GitHub Actions (cron + commit)
- GitHub Pages (dashboard statique)
- Telegram Bot API
- CallMeBot (WhatsApp gratuit)
- Twilio (optionnel, vrais appels)

## Limites connues

- **Intervalle réel ~40s à ~5 min** (limites de GitHub Actions). Pour du vrai temps réel < 30s, il faudrait un VPS.
- **Pas de bypass anti-bot**. Si Ticketcorner active Cloudflare strict, il faudra passer à Playwright.
- **CallMeBot envoie des messages WhatsApp**, pas de vrais appels. Pour de vrais appels téléphoniques, configure Twilio.
