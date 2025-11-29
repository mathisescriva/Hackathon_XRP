// XRPL Wallet Integration
// Utilise le backend API pour les opérations XRPL

const API_BASE_URL = 'http://localhost:3000';

let connectedWallet = null;

// Connecter avec XUMM (nécessite l'extension)
async function connectXumm() {
    try {
        if (typeof window.xumm === 'undefined') {
            showMessage('XUMM n\'est pas installé. Installez l\'extension XUMM.', 'error');
            return;
        }

        const xumm = window.xumm;
        const payload = await xumm.payload.create({
            txjson: {
                TransactionType: 'SignIn'
            }
        });

        if (payload.uuid) {
            showMessage('Scannez le QR code avec XUMM', 'info');
            // Attendre la signature
            xumm.payload.on(payload.uuid, (event) => {
                if (event.signed) {
                    // Récupérer l'adresse depuis XUMM et vérifier via le backend
                    checkWalletBalance(event.account).then(() => {
                        handleWalletConnected(event.account, 'xumm');
                    });
                }
            });
        }
    } catch (error) {
        showMessage('Erreur XUMM: ' + error.message, 'error');
    }
}

// Connecter avec GemWallet (nécessite l'extension)
async function connectGemWallet() {
    try {
        if (typeof window.gemWallet === 'undefined') {
            showMessage('GemWallet n\'est pas installé. Installez l\'extension GemWallet.', 'error');
            return;
        }

        const response = await window.gemWallet.connect();
        if (response.address) {
            // Vérifier via le backend
            checkWalletBalance(response.address).then(() => {
                handleWalletConnected(response.address, 'gemwallet');
            });
        }
    } catch (error) {
        showMessage('Erreur GemWallet: ' + error.message, 'error');
    }
}

// Afficher le formulaire de connexion avec seed
function connectSeed() {
    document.getElementById('seedConnection').style.display = 'block';
}

// Connecter avec un seed (via le backend)
async function connectWithSeed() {
    const seed = document.getElementById('seedInput').value.trim();
    
    if (!seed || !seed.startsWith('s')) {
        showMessage('Seed invalide. Doit commencer par "s"', 'error');
        return;
    }

    try {
        showMessage('Connexion en cours...', 'info');
        
        // Appeler le backend pour connecter le wallet
        const response = await fetch(`${API_BASE_URL}/wallet/connect`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ seed })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Erreur de connexion');
        }

        if (!data.success) {
            throw new Error('Échec de la connexion');
        }

        // Sauvegarder le seed localement (pour les transactions)
        connectedWallet = {
            address: data.address,
            method: 'seed',
            seed: seed, // Stocké localement, jamais envoyé au serveur après la connexion
            balance: data.balance,
            activated: data.activated
        };

        await handleWalletConnected(data.address, 'seed', null, data);
        showMessage('Wallet connecté avec succès !', 'success');
    } catch (error) {
        showMessage('Erreur: ' + error.message, 'error');
        console.error('Connection error:', error);
    }
}

// Gérer la connexion du wallet
async function handleWalletConnected(address, method, wallet = null, walletData = null) {
    if (!connectedWallet) {
        connectedWallet = { address, method, wallet };
    }
    
    // Sauvegarder dans localStorage (sans le seed pour la sécurité)
    localStorage.setItem('xrpl_wallet_address', address);
    localStorage.setItem('xrpl_wallet_method', method);
    
    // Afficher les infos
    document.getElementById('walletSection').style.display = 'none';
    document.getElementById('walletActions').style.display = 'block';
    document.getElementById('appIntegration').style.display = 'block';
    document.getElementById('walletInfo').style.display = 'flex';
    
    document.getElementById('connectedAddress').textContent = address;
    document.getElementById('walletAddress').textContent = address.substring(0, 10) + '...';
    
    // Mettre à jour le lien explorer
    if (walletData && walletData.explorer_url) {
        document.getElementById('explorerLink').href = walletData.explorer_url;
    } else {
        document.getElementById('explorerLink').href = `https://testnet.xrpl.org/accounts/${address}`;
    }
    
    // Récupérer le solde
    await updateBalance();
}

// Mettre à jour le solde (via le backend)
async function updateBalance() {
    if (!connectedWallet) return;

    try {
        const response = await fetch(`${API_BASE_URL}/wallet/balance/${connectedWallet.address}`);
        const data = await response.json();

        if (data.success) {
            const balance = data.balance || 0;
            document.getElementById('connectedBalance').textContent = balance.toFixed(6);
            document.getElementById('walletBalance').textContent = balance.toFixed(2) + ' XRP';
            
            // Mettre à jour connectedWallet
            if (connectedWallet) {
                connectedWallet.balance = balance;
                connectedWallet.activated = data.activated;
            }
        }
    } catch (error) {
        console.error('Erreur récupération solde:', error);
    }
}

// Vérifier le solde d'une adresse (utilisé par XUMM/GemWallet)
async function checkWalletBalance(address) {
    try {
        const response = await fetch(`${API_BASE_URL}/wallet/balance/${address}`);
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Erreur vérification solde:', error);
        throw error;
    }
}

// Envoyer XRP (via le backend)
async function sendXRP() {
    const toAddress = document.getElementById('sendToAddress').value.trim();
    const amount = parseFloat(document.getElementById('sendAmount').value);

    if (!toAddress || !amount || amount <= 0) {
        showMessage('Veuillez remplir tous les champs', 'error');
        return;
    }

    if (!connectedWallet || !connectedWallet.seed) {
        showMessage('Impossible d\'envoyer sans seed. Reconnectez-vous avec un seed.', 'error');
        return;
    }

    try {
        showMessage('Envoi en cours...', 'info');

        const response = await fetch(`${API_BASE_URL}/wallet/send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                seed: connectedWallet.seed,
                to_address: toAddress,
                amount: amount
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Erreur lors de l\'envoi');
        }

        if (data.success) {
            showMessage(`✅ ${amount} XRP envoyés ! TX: ${data.tx_hash}`, 'success');
            document.getElementById('sendToAddress').value = '';
            document.getElementById('sendAmount').value = '';
            await updateBalance();
        } else {
            throw new Error('Transaction échouée');
        }
    } catch (error) {
        showMessage('Erreur: ' + error.message, 'error');
        console.error('Send XRP error:', error);
    }
}

// Déconnecter le wallet
function disconnectWallet() {
    connectedWallet = null;
    localStorage.removeItem('xrpl_wallet_address');
    localStorage.removeItem('xrpl_wallet_method');
    
    document.getElementById('walletSection').style.display = 'block';
    document.getElementById('walletActions').style.display = 'none';
    document.getElementById('appIntegration').style.display = 'none';
    document.getElementById('walletInfo').style.display = 'none';
    
    showMessage('Wallet déconnecté', 'info');
}

// Vérifier si un wallet est déjà connecté
async function checkExistingWallet() {
    const address = localStorage.getItem('xrpl_wallet_address');
    const method = localStorage.getItem('xrpl_wallet_method');
    
    if (address) {
        // Vérifier le solde via le backend
        try {
            const data = await checkWalletBalance(address);
            connectedWallet = {
                address: address,
                method: method || 'seed',
                balance: data.balance,
                activated: data.activated
            };
            await handleWalletConnected(address, method || 'seed', null, data);
        } catch (error) {
            console.error('Erreur vérification wallet existant:', error);
            // Continuer quand même avec l'adresse stockée
            connectedWallet = { address, method: method || 'seed' };
            await handleWalletConnected(address, method || 'seed');
        }
    }
}

// Utility
function showMessage(text, type = 'info') {
    const messageDiv = document.getElementById('message');
    messageDiv.textContent = text;
    messageDiv.className = `message ${type}`;
    messageDiv.style.display = 'block';

    setTimeout(() => {
        messageDiv.style.display = 'none';
    }, 5000);
}

// Exporter les fonctions pour utilisation dans l'app principale
window.getConnectedXRPLAddress = () => {
    return localStorage.getItem('xrpl_wallet_address') || null;
};

window.isWalletConnected = () => {
    return !!localStorage.getItem('xrpl_wallet_address');
};

// Initialisation
document.addEventListener('DOMContentLoaded', () => {
    checkExistingWallet();
    
    // Mettre à jour le solde toutes les 30 secondes
    if (connectedWallet) {
        setInterval(updateBalance, 30000);
    }
});

