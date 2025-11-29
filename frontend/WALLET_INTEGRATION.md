# 🔗 Intégration Wallet XRPL

Cette page permet de connecter un wallet XRPL et de l'utiliser dans l'application.

## 🎯 Fonctionnalités

### Connexion
- **XUMM** : Connexion via l'extension XUMM (mobile/desktop)
- **GemWallet** : Connexion via l'extension GemWallet
- **Seed** : Connexion directe avec une seed (pour tests)

### Actions disponibles
- ✅ Affichage du solde XRP
- ✅ Envoi de XRP
- ✅ Lien vers l'explorer XRPL
- ✅ Intégration automatique avec l'application

## 🚀 Utilisation

### 1. Accéder à la page wallet

Ouvrez : **http://localhost:8080/xrpl-wallet.html**

### 2. Connecter un wallet

#### Option A : XUMM (Recommandé pour production)
1. Installez l'extension XUMM sur votre appareil
2. Cliquez sur "Connecter avec XUMM"
3. Scannez le QR code avec l'app XUMM
4. Approuvez la connexion

#### Option B : GemWallet
1. Installez l'extension GemWallet
2. Cliquez sur "Connecter avec GemWallet"
3. Approuvez la connexion dans l'extension

#### Option C : Seed (Pour tests uniquement)
1. Cliquez sur "Connecter avec Seed"
2. Entrez votre seed (commence par `s...`)
3. ⚠️ **ATTENTION** : Ne partagez jamais votre seed !

### 3. Utiliser dans l'application

Une fois connecté :
- L'adresse XRPL est automatiquement sauvegardée
- Lors de l'inscription, l'adresse sera pré-remplie
- Vous pouvez voir votre solde et envoyer des XRP

## 🔐 Sécurité

- ✅ Les seeds ne sont jamais envoyées au serveur
- ✅ Les transactions sont signées localement
- ✅ Connexion persistante via localStorage (peut être désactivée)

## 📱 Wallets supportés

### XUMM
- **Site** : https://xumm.app
- **Extension** : Disponible sur iOS, Android, Chrome, Firefox
- **Avantages** : Sécurisé, multi-device, QR code

### GemWallet
- **Site** : https://gemwallet.app
- **Extension** : Chrome, Firefox, Edge
- **Avantages** : Open source, léger

### Seed direct
- **Usage** : Tests uniquement
- **Avantages** : Rapide pour développement
- **Inconvénients** : Moins sécurisé

## 🧪 Testnet

Par défaut, l'application utilise le **XRPL Testnet**.

Pour obtenir des XRP de test :
- **Faucet officiel** : https://xrpl.org/xrp-testnet-faucet.html
- Entrez votre adresse XRPL
- Recevez instantanément des XRP de test

## 🔗 Liens utiles

- **XRPL Explorer (Testnet)** : https://testnet.xrpl.org
- **Documentation XRPL** : https://xrpl.org
- **XRPL Commons** : https://xrpl-commons.org

## 🐛 Dépannage

### "XUMM n'est pas installé"
- Installez l'extension XUMM depuis https://xumm.app
- Rechargez la page

### "GemWallet n'est pas installé"
- Installez l'extension GemWallet depuis https://gemwallet.app
- Rechargez la page

### "Erreur de connexion"
- Vérifiez que vous êtes sur le testnet
- Vérifiez votre connexion internet
- Vérifiez la console du navigateur pour plus de détails

### "Solde non affiché"
- Vérifiez que le compte est activé (minimum 10 XRP)
- Utilisez le faucet pour obtenir des XRP de test

## 💡 Intégration avec l'app

L'adresse XRPL connectée est automatiquement utilisée lors de :
- L'inscription d'un nouveau compte
- La création d'un shift (pour le worker)
- La validation d'un shift (pour l'employer)

Pour utiliser une autre adresse, déconnectez-vous et reconnectez un autre wallet.

