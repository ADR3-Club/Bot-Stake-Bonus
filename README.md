# 🎁 Bot Discord - Stake Bonus Codes (Edition Avancée)

Bot Discord qui détecte automatiquement les codes bonus Stake depuis Telegram et les publie sur Discord avec détection OCR avancée.

## 📋 Fonctionnalités

### Détection Avancée
- ✅ **Détection OCR** : Extrait automatiquement les codes depuis les images et vidéos
- ✅ **Spoilers Telegram** : Détecte les codes masqués dans les spoilers (ex: @StakecomDailyDrops)
- ✅ **Cache RainsTEAM** : Gère les canaux qui envoient conditions puis code séparément
- ✅ **URLs playstake.club** : Détection classique des URLs avec paramètre `?code=`

### Publication Discord
- ✅ **Deux boutons** : Stake.bet ET Stake.com pour chaque bonus
- ✅ **Conditions dynamiques** : Affichage automatique des conditions du bonus
- ✅ **Formats multiples** : Format simple (VIP Notices) ou complet (Drops)
- ✅ **Embed stylisé** : Image personnalisable, couleurs, footer

### Gestion Intelligente
- ✅ **Déduplication** : Base de données SQLite pour éviter les doublons
- ✅ **Cache mémoire** : Évite le retraitement des mêmes images/vidéos
- ✅ **Mode debug** : Logs détaillés pour le débogage
- ✅ **Health ping** : Message de confirmation au démarrage

### Types de Bonus Détectés
- ✅ Weekly, Monthly, Pre-Monthly, Post-Monthly, Top Players

## 🚀 Installation

### Prérequis

- **Node.js 16.9.0+** (pour Tesseract.js)
- **FFmpeg** installé sur le système (pour traitement vidéo)
- Un bot Discord
- Des credentials Telegram API

### 1. Installer FFmpeg

#### Windows:
```bash
# Télécharger depuis https://ffmpeg.org/download.html
# Ajouter FFmpeg au PATH système
```

#### Linux (Debian/Ubuntu):
```bash
sudo apt update
sudo apt install ffmpeg
```

#### macOS:
```bash
brew install ffmpeg
```

### 2. Cloner et installer

```bash
git clone https://github.com/ADR3-Club/Bot-Stake-Bonus.git
cd Bot-Stake-Bonus
npm install
```

### 3. Configuration

Copier le fichier `.env.example` en `.env` et remplir les valeurs :

```bash
cp .env.example .env
```

#### Variables obligatoires :

```env
# Discord
DISCORD_TOKEN=<votre_token_discord>
CHANNEL_ID=<id_du_channel>

# Telegram
TG_API_ID=<api_id_telegram>
TG_API_HASH=<api_hash_telegram>
TG_CHANNELS=<canaux_a_surveiller>
```

#### Obtenir les credentials Telegram :

1. Aller sur https://my.telegram.org
2. Se connecter avec son numéro de téléphone
3. Cliquer sur "API development tools"
4. Créer une nouvelle application
5. Copier l'`API ID` et l'`API Hash`

#### Variables optionnelles :

```env
# Telegram Session (généré au 1er lancement)
TG_STRING_SESSION=

# Discord Ping
PING_ROLE_ID=<id_du_role>

# Personnalisation
BONUS_IMAGE_URL=<url_image_embed>
BUTTON_LABEL_TEXT=🎁 Lien du code

# Debug
DEBUG_TELEGRAM=0
TG_HEALTH_PING=1
```

### 4. Premier lancement

Au premier lancement, le bot vous demandera :
- Votre numéro de téléphone
- Le code de vérification reçu par SMS/Telegram
- Votre mot de passe 2FA (si activé)

Une fois connecté, une `TG_STRING_SESSION` sera générée et affichée. **Copiez-la dans votre `.env`** pour ne plus avoir à vous reconnecter.

## 📦 Utilisation

### Lancer le bot

```bash
npm start
```

### Lister les canaux Telegram accessibles

```bash
npm run list-channels
```

### En production (avec PM2)

```bash
pm2 start index.js --name stake-bonus-bot
pm2 save
pm2 startup
```

## 🎯 Types de Canaux Supportés

Le bot supporte **3 types de canaux** Telegram :

### 1. Canaux avec code dans spoiler (ex: @StakecomDailyDrops)
- Le code est masqué dans un spoiler
- Les conditions sont dans le texte du message
- Détection automatique instantanée

### 2. Canaux avec messages séparés (ex: @RainsTEAM)
- Message 1 : Annonce avec conditions (ex: "FINAL BONUS DROP INCOMING!")
- Message 2 : Code seul (ex: "bestchat")
- Le bot met en cache les conditions (5 min TTL) puis publie quand le code arrive

### 3. Canaux avec URL playstake.club (VIP Notices)
- URLs complètes avec paramètre `?code=`
- Types : Weekly, Monthly, Pre-Monthly, Post-Monthly, Top Players
- Format simple avec détection automatique du type

### 4. Canaux avec images/vidéos (OCR)
- Le code est affiché visuellement dans l'image ou la fin de la vidéo
- Détection automatique via OCR (Tesseract.js)
- Preprocessing optimisé (crop, contraste, netteté)
- Les conditions sont extraites du caption

## 🔍 Mode Debug

Pour activer les logs détaillés :

```env
DEBUG_TELEGRAM=1
```

Vous verrez alors :
- Texte des messages Telegram
- Entities détectées
- Spoilers trouvés
- Résultats OCR
- Conditions extraites
- Décisions du système de cache

## 📁 Structure du Projet

```
bonus/
├── config/
│   └── types.js          # Configuration des types de bonus
├── detectors/
│   └── telegram.js       # Détecteur Telegram avec 4 systèmes
├── lib/
│   ├── ocr.js            # Module OCR (images/vidéos) 🆕
│   ├── parser.js         # Parser de codes
│   ├── publisher.js      # Publication Discord (2 boutons) 🆕
│   ├── store.js          # Base de données SQLite
│   └── util.js           # Utilitaires
├── scripts/
│   ├── parse-test.js     # Test du parser
│   ├── send-test.js      # Test de publication
│   └── list-channels.js  # Lister canaux Telegram 🆕
├── index.js              # Point d'entrée
├── package.json          # Dépendances (9 packages)
├── seen.db               # Base SQLite (auto-créée)
└── .env                  # Configuration (à créer)
```

## ⚙️ Performance et Optimisation

### OCR
- **Preprocessing intelligent** : Crop du tiers inférieur, niveaux de gris, contraste, netteté
- **Cache mémoire** : Évite le retraitement des mêmes images (TTL: 1h)
- **Vidéos** : Seulement les 2 dernières secondes, 5 fps, ordre inversé

### Cache RainsTEAM
- **TTL : 5 minutes** pour les conditions stockées
- Nettoyage automatique des caches expirés

### Déduplication
- Base SQLite avec index optimisé
- Clés uniques : `tg:{chatId}:{messageId}`

## 🔒 Sécurité

- ⚠️ Ne jamais partager votre fichier `.env`
- ⚠️ Ne jamais commit vos tokens/credentials
- ⚠️ Garder votre `TG_STRING_SESSION` privée
- ⚠️ Le fichier `seen.db` contient l'historique des codes vus

## 🐛 Dépannage

### Erreur "FFmpeg not found"
```bash
# Vérifier l'installation
ffmpeg -version

# Sous Windows, ajouter FFmpeg au PATH
```

### Erreur Tesseract.js
```bash
# Réinstaller les dépendances
npm install tesseract.js --force
```

### Le bot ne détecte pas certains codes
```bash
# Activer le mode debug
DEBUG_TELEGRAM=1

# Vérifier les canaux configurés
npm run list-channels
```

### Problème de connexion Telegram
```bash
# Supprimer la session et se reconnecter
# Dans .env, vider TG_STRING_SESSION=
# Relancer : npm start
```

## 📊 Comparaison avec la version basique

| Fonctionnalité | Version basique | Version avancée |
|----------------|-----------------|-----------------|
| **URLs playstake.club** | ✅ | ✅ |
| **Spoilers Telegram** | ❌ | ✅ |
| **Cache RainsTEAM** | ❌ | ✅ |
| **OCR images** | ❌ | ✅ |
| **OCR vidéos** | ❌ | ✅ |
| **Boutons Discord** | 1 | 2 |
| **Conditions dynamiques** | ❌ | ✅ |
| **Mode debug** | ❌ | ✅ |
| **Documentation** | ❌ | ✅ |

**Résultat** : Capture **2-3x plus de codes bonus** automatiquement !

## 📄 Licence

MIT

## 👤 Auteur

Développé avec Claude Code
