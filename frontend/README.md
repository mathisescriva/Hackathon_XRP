# 🎨 Frontend léger - Hackathon XRP

Frontend minimal en HTML/CSS/JavaScript vanilla pour tester le backend.

## 🚀 Démarrage rapide

### 1. Démarrer le backend

```bash
# Dans le dossier racine du projet
npm run dev
```

Le backend doit tourner sur `http://localhost:3000`

### 2. Ouvrir le frontend

**Option 1 : Serveur local simple**

```bash
# Dans le dossier frontend
python3 -m http.server 8080
# Ou
npx serve .
```

Puis ouvrir : `http://localhost:8080`

**Option 2 : Ouvrir directement**

Ouvrez simplement `index.html` dans votre navigateur (certaines fonctionnalités peuvent être limitées à cause de CORS).

**Option 3 : Live Server (VS Code)**

Si vous utilisez VS Code, installez l'extension "Live Server" et cliquez sur "Go Live".

## 🧪 Comment tester

### 1. Créer des comptes de test

Si vous n'avez pas encore lancé le seed :

```bash
# Dans le dossier racine
npm run seed
```

Cela crée :
- Worker : `alice@test.com` / `password123`
- Employer : `bob@test.com` / `password123`

### 2. Tester le flow complet

#### A. En tant que Worker

1. **Se connecter** avec `alice@test.com` / `password123`

2. **Démarrer un shift** :
   - Sélectionner un employeur (pour la démo, vous pouvez utiliser l'ID d'un employer existant)
   - Cliquer sur "🎤 Enregistrer check-in"
   - Parler dans le microphone (ex: "Bonjour, je commence mon shift de garde d'enfants")
   - Cliquer sur "⏹️ Arrêter"
   - Cliquer sur "Démarrer le shift"

3. **Terminer un shift** :
   - Sélectionner le shift actif dans la liste
   - Cliquer sur "🎤 Enregistrer check-out"
   - Parler dans le microphone (ex: "Je termine mon shift, j'ai gardé 2 enfants")
   - Cliquer sur "⏹️ Arrêter"
   - Cliquer sur "Terminer le shift"

4. **Voir ses shifts** :
   - La liste se met à jour automatiquement
   - Vous pouvez voir le statut, les heures, le montant

#### B. En tant qu'Employer

1. **Se connecter** avec `bob@test.com` / `password123`

2. **Voir les shifts à valider** :
   - La liste des shifts "proposed" s'affiche
   - Vous pouvez voir les transcriptions

3. **Valider un shift** :
   - Cliquer sur "✅ Valider"
   - Cela crée l'escrow XRPL et le NFT
   - Le statut passe à "validated"

4. **Libérer le paiement** :
   - Une fois validé, cliquer sur "💰 Libérer paiement"
   - Cela consomme l'escrow et paie le worker
   - Le statut passe à "paid"

## 📋 Fonctionnalités

✅ **Authentification**
- Login / Register
- Gestion du token JWT
- Persistance dans localStorage

✅ **Worker**
- Enregistrement audio (check-in / check-out)
- Upload vers le backend
- Liste des shifts
- Visualisation du statut

✅ **Employer**
- Liste des shifts à valider
- Validation (crée escrow + NFT)
- Refus de shift
- Libération du paiement

✅ **Interface**
- Design moderne et responsive
- Messages de feedback
- Gestion des erreurs

## 🔧 Configuration

Si votre backend tourne sur un autre port, modifiez dans `app.js` :

```javascript
const API_BASE_URL = 'http://localhost:3000'; // Changez ici
```

## ⚠️ Notes importantes

1. **Microphone** : Le navigateur demandera l'autorisation d'accès au microphone
2. **CORS** : Le backend doit avoir CORS activé (déjà fait ✅)
3. **Format audio** : Le navigateur enregistre en WebM, le backend le convertit
4. **Employeur** : Pour la démo, vous devez créer un employer et utiliser son ID

## 🐛 Dépannage

### Le microphone ne fonctionne pas
- Vérifiez les permissions du navigateur
- Utilisez Chrome ou Firefox (meilleur support)

### Erreur CORS
- Vérifiez que le backend tourne sur `http://localhost:3000`
- Vérifiez que CORS est activé dans le backend

### Erreur 401 (Unauthorized)
- Vérifiez que vous êtes bien connecté
- Le token peut avoir expiré, reconnectez-vous

### L'audio ne s'envoie pas
- Vérifiez que vous avez bien enregistré avant de soumettre
- Vérifiez la console du navigateur pour les erreurs

## 🎯 Prochaines étapes

Ce frontend est minimal pour tester. Pour la production, vous pourriez :
- Ajouter un vrai sélecteur d'employeurs
- Améliorer l'UI/UX
- Ajouter des graphiques pour les stats
- Ajouter un système de notifications
- Utiliser un framework (React, Vue, etc.)

## ✅ Tout fonctionne !

Le frontend est prêt à tester votre backend. Bon hackathon ! 🚀

