# DrGold IA — Guide de déploiement complet

## Architecture
```
client/   → React + Vite → Firebase Hosting
server/   → Node.js     → Railway
DB        → Firestore   → drgold-ia
```

---

## ÉTAPE 1 — Préparer Firebase

### 1.1 Activer Authentication
- Console Firebase → Authentication → Sign-in method
- Activer **Email/Password**

### 1.2 Créer Firestore
- Console Firebase → Firestore Database → Créer en mode production
- Région : `eur3` (Europe) ou `us-central1`

### 1.3 Déployer les règles Firestore
```bash
firebase deploy --only firestore:rules
```

### 1.4 Générer le Service Account (pour le serveur)
- Console Firebase → Paramètres projet → Comptes de service
- Cliquer "Générer une nouvelle clé privée"
- Télécharger le fichier JSON

---

## ÉTAPE 2 — Déployer le serveur Railway

### 2.1 Créer un compte Railway
https://railway.app → Sign up avec GitHub

### 2.2 Créer un nouveau projet
- New Project → Deploy from GitHub repo → sélectionner le repo (dossier `server/`)
- Ou : New Project → Empty Project → puis Railway CLI

### 2.3 Variables d'environnement Railway
Dans Railway → ton service → Variables, ajouter :

```
ENCRYPTION_KEY = [générer avec la commande ci-dessous]
FIREBASE_SERVICE_ACCOUNT = [contenu JSON du service account en une seule ligne]
```

**Générer la clé de chiffrement :**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Mettre le service account en une ligne :**
```bash
cat serviceAccount.json | tr -d '\n'
```

### 2.4 Noter l'URL Railway
Ex: `https://drgold-server-production.up.railway.app`

---

## ÉTAPE 3 — Configurer et déployer le client React

### 3.1 Copier le .env
```bash
cd client
cp .env.example .env
```

### 3.2 Remplir le .env
Aller dans Console Firebase → Paramètres projet → Vos applications → Ajouter une app Web

```env
VITE_FIREBASE_API_KEY=xxx
VITE_FIREBASE_AUTH_DOMAIN=drgold-ia.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=drgold-ia
VITE_FIREBASE_STORAGE_BUCKET=drgold-ia.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=xxx
VITE_FIREBASE_APP_ID=xxx
VITE_SERVER_URL=https://drgold-server-production.up.railway.app
```

### 3.3 Build et deploy
```bash
cd client
npm install
npm run build
firebase deploy --only hosting
```

---

## ÉTAPE 4 — Token Deriv

### Obtenir un token API Deriv
1. Aller sur https://app.deriv.com/account/api-token
2. Créer un token avec les droits : **Trade** + **Read** + **Payments**
3. Copier le token

### Note sur l'App ID
Le serveur utilise l'App ID `1089` (app de démo Deriv). Pour la production :
- Créer ta propre app sur https://developers.deriv.com
- Remplacer `1089` dans `server/src/engine/derivClient.js`

---

## ÉTAPE 5 — Premier démarrage

1. Ouvrir l'app web (Firebase Hosting URL)
2. Créer un compte avec ton email + token Deriv
3. Aller dans ⚙️ Paramètres → configurer les paramètres EA
4. Dashboard → toggle **EA Actif**
5. Le serveur Railway détecte l'activation en max 10s
6. Connexion WebSocket Deriv ouverte → EA commence à trader

---

## Structure Firestore générée automatiquement

```
users/
  {uid}/
    email: "..."
    token_encrypted: "iv:encryptedHex"
    ea_active: true/false
    params: { stratMode, candleCount, initialLot, ... }
    created_at: timestamp
    trades/
      {contractId}/
        symbol: "frxXAUUSD"
        direction: "BUY" | "SELL"
        lots: 0.01
        entry: 1234.56
        exit: 1235.00
        pnl: +4.40
        status: "open" | "closed"
        grid_level: 0
        opened_at: timestamp
        closed_at: timestamp
```

---

## Commandes utiles

```bash
# Installer les dépendances serveur
cd server && npm install

# Lancer le serveur en local (avec .env rempli)
cd server && npm run dev

# Installer les dépendances client
cd client && npm install

# Lancer le client en local
cd client && npm run dev
```

---

## ⚠️ Important pour la production Deriv

- Utiliser un **compte réel Deriv** avec suffisamment de fonds
- Tester d'abord sur compte **DÉMO** Deriv
- Le contrat par défaut est CALL/PUT durée 1h — ajustable dans `derivClient.js`
- Les montants sont calculés : `lots * 10` USD par ordre
