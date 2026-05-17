# 🚀 Guide d'installation — Ticketcorner Monitor

> **TL;DR** — 4 raccourcis ont été créés sur ton Bureau :
> - 🎫 **Dashboard Tickets Guetta** → ouvre l'interface visuelle
> - 🔴 **LIVE Surveillance Tickets (local)** → lance la surveillance locale en continu
> - ▶️ **Test Surveillance Tickets** → fait UN check pour vérifier que ça marche
> - ⚙️ **Setup Surveillance Tickets** → te guide pas-à-pas pour configurer les notifs
>
> **Le plus rapide pour commencer** : double-clique sur ⚙️ Setup, suis les étapes,
> puis double-clique sur 🔴 LIVE. Ça surveille immédiatement (tant que ton Mac est allumé).
>
> **Pour du H24 vrai même Mac éteint** → continue avec les étapes ci-dessous.

---

## 1️⃣ Créer le repo GitHub

1. Va sur https://github.com/new
2. Nom : `ticketcorner-monitor` (ou ce que tu veux)
3. **Public** (obligatoire pour GitHub Pages gratuit + Actions illimitées)
4. Coche **Add a README** → **Create repository**
5. Sur ton Mac, ouvre le terminal et lance :

```bash
cd "/Users/vanjavandenhombergh/Claude site/ticketcorner-monitor"
git init
git add .
git commit -m "init: ticketcorner monitor"
git branch -M main
git remote add origin https://github.com/TON-USER/ticketcorner-monitor.git
git push -u origin main
```

Remplace `TON-USER` par ton vrai username GitHub.

---

## 2️⃣ Activer GitHub Pages (pour le dashboard)

1. Va sur `https://github.com/TON-USER/ticketcorner-monitor/settings/pages`
2. **Source** → `Deploy from a branch`
3. **Branch** → `main`, dossier `/docs`
4. Clique **Save**
5. Après ~1 min, ton dashboard sera dispo à :
   `https://TON-USER.github.io/ticketcorner-monitor/`

---

## 3️⃣ Récupérer l'URL Ticketcorner

1. Va sur https://www.ticketcorner.ch
2. Cherche **Venoge Festival** puis **David Guetta**
3. Copie l'URL complète de la page (ex: `https://www.ticketcorner.ch/event/david-guetta-...`)
4. Garde-la sous le coude pour l'étape 5

---

## 4️⃣ Créer / retrouver ton bot Telegram

### Si tu ne sais plus si tu en as un :

Ouvre Telegram → cherche `@BotFather` (le vrai, avec ✓ bleu) → tape `/mybots`. Tu verras la liste de tes bots existants.

### Pour en créer un nouveau :

1. Dans Telegram, ouvre `@BotFather`
2. Tape `/newbot`
3. Donne-lui un nom (ex: `Mes alertes Ticketcorner`)
4. Donne-lui un username unique terminant par `bot` (ex: `vanja_tickets_bot`)
5. BotFather te renvoie un **token** qui ressemble à :
   `7891234567:AAGxyzABC123defGHIjklMNOpqrSTUvwx`
   → **Copie-le, c'est ton `TELEGRAM_BOT_TOKEN`**

### Récupérer ton `TELEGRAM_CHAT_ID`

1. Toujours dans Telegram, ouvre ton bot tout neuf
2. Tape `/start` (ou n'importe quel message)
3. Dans ton navigateur, ouvre :
   `https://api.telegram.org/bot<TON-TOKEN>/getUpdates`
4. Cherche `"chat":{"id":123456789` → c'est ton **chat_id**

⚙️ **Conseil mobile** : dans Telegram → ouvre la conversation avec ton bot → tap sur le nom du bot en haut → `Notifications` → règle un son distinctif + active **Importance: élevée** pour bypasser le mode silencieux.

---

## 5️⃣ Activer CallMeBot WhatsApp (gratuit, pour les appels)

Pour chaque numéro de téléphone (max 2 dans la config par défaut) :

1. Ajoute `+34 644 51 95 23` dans tes contacts WhatsApp sous le nom **« Claude 🚨 Tickets »** (comme ça l'alerte affichera ce nom !)
2. Depuis WhatsApp, envoie ce message exact à ce contact :
   ```
   I allow callmebot to send me messages
   ```
3. Tu reçois en réponse une **API key** (chiffres) — c'est ton `CALLMEBOT_APIKEY`
4. Ton `CALLMEBOT_PHONE` = ton numéro au format international **sans `+` ni espaces**
   - Suisse : `41791234567`
   - France : `33612345678`

Répète pour le 2e numéro si besoin (variables `CALLMEBOT_PHONE_2` / `CALLMEBOT_APIKEY_2`).

> **À noter :** CallMeBot envoie des **messages WhatsApp**, pas de vrais appels téléphoniques. Mais les notifications WhatsApp en mode urgent passent à travers le mode silencieux et sonnent fort. Pour de vrais appels, voir étape 7 (Twilio).

---

## 6️⃣ Configurer les secrets sur GitHub

1. Va sur `https://github.com/TON-USER/ticketcorner-monitor/settings/secrets/actions`
2. Clique **New repository secret** et ajoute ces secrets un par un :

| Nom du secret | Valeur |
|---|---|
| `TICKETCORNER_URL` | L'URL copiée à l'étape 3 |
| `TELEGRAM_BOT_TOKEN` | Le token de l'étape 4 |
| `TELEGRAM_CHAT_ID` | Le chat_id de l'étape 4 |
| `CALLMEBOT_PHONE` | Ton numéro (ex: `41791234567`) |
| `CALLMEBOT_APIKEY` | L'API key reçue de CallMeBot |
| `CALLMEBOT_PHONE_2` | (optionnel) 2e numéro |
| `CALLMEBOT_APIKEY_2` | (optionnel) 2e API key |

---

## 7️⃣ (Optionnel) Twilio pour de vrais appels téléphoniques

Si tu veux vraiment sonner le téléphone (pas juste WhatsApp) :

1. Crée un compte sur https://twilio.com (essai gratuit avec crédit ~15$)
2. Achète un numéro Twilio (~1$/mois)
3. Ajoute ces secrets :
   - `TWILIO_ACCOUNT_SID`
   - `TWILIO_AUTH_TOKEN`
   - `TWILIO_FROM_NUMBER` (au format `+41...`)
   - `TWILIO_TO_NUMBER` (ton numéro, au format `+41...`)
   - `TWILIO_TO_NUMBER_2` (numéro #2, optionnel)

Le script appelle automatiquement et lit un message en français quand un billet apparaît.

---

## 8️⃣ Tester !

### Test des notifications uniquement (sans toucher Ticketcorner) :

1. Va sur `https://github.com/TON-USER/ticketcorner-monitor/actions`
2. Tu devrais voir le workflow **Ticketcorner Monitor**
3. Clique **Run workflow** → **Run workflow** pour le déclencher manuellement
4. Au bout de ~5 min, le workflow tourne et le dashboard se met à jour

### Test local des notifications :

```bash
cd "/Users/vanjavandenhombergh/Claude site/ticketcorner-monitor"
cp .env.example .env.local
# Édite .env.local avec tes vraies valeurs
node --env-file=.env.local scripts/notify.mjs --test
```

Tu devrais recevoir une notif Telegram + WhatsApp en quelques secondes.

---

## 9️⃣ Démarrer / arrêter la surveillance

### Pour **mettre en pause** sans tout supprimer :

Édite `config.json` sur GitHub → mets `"monitoring": false` → commit.
Le bouton **« Activer/désactiver la surveillance »** sur le dashboard t'amène direct au bon fichier.

### Pour **arrêter complètement** :

`Settings → Actions → General → Disable Actions`

### Pour **reprendre** :

Remets `"monitoring": true` dans `config.json` et le cron repart au prochain quart d'heure.

---

## 🔧 Dépannage

- **Le workflow ne tourne pas toutes les 5 min** → c'est normal, GitHub Actions met parfois 10-15 min en cas de charge. Pour un check plus rapide, lance manuellement via **Run workflow**.
- **Telegram ne reçoit rien** → vérifie que tu as bien envoyé `/start` à ton bot AVANT de récupérer le `chat_id`.
- **Page Ticketcorner détectée comme « confiance: low »** → le site a peut-être changé sa structure. Les motifs de détection sont dans [scripts/check.mjs](scripts/check.mjs) (constantes `SOLD_OUT_PATTERNS` et `AVAILABLE_PATTERNS`).
- **CallMeBot ne répond pas** → vérifie que le message d'activation est exactement `I allow callmebot to send me messages` (en anglais).
- **Erreur HTTP 403/429 sur Ticketcorner** → tu te fais bloquer. Espace les checks (édite la cron dans `monitor.yml`).

---

## ⚠️ Important

- L'intervalle minimum réel de GitHub Actions est **~5 min** (parfois 10-15 sous charge). Chaque run fait **6 checks internes espacés de 40s** pour s'approcher d'un check toutes les 30s.
- Reste poli avec Ticketcorner : si tu réduis encore l'intervalle ou ajoutes plus de checks, tu risques le blocage IP.
- Le script ne contourne aucune protection (pas de bypass Captcha, pas de Cloudflare bypass). Si Ticketcorner serre fort la sécurité, il faudra peut-être passer à Playwright (plus lourd).
