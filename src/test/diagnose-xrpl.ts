import { Client, Wallet } from 'xrpl';
import dotenv from 'dotenv';

dotenv.config();

async function diagnoseXRPL() {
  console.log('🔍 Diagnostic XRPL...\n');

  try {
    // 1. Vérifier la configuration
    const secret = process.env.XRPL_PLATFORM_SECRET;
    if (!secret) {
      console.error('❌ XRPL_PLATFORM_SECRET non défini dans .env');
      return;
    }
    console.log('✅ XRPL_PLATFORM_SECRET trouvé');

    const network = process.env.XRPL_NETWORK || 'testnet';
    const url = network === 'testnet' 
      ? 'wss://s.altnet.rippletest.net:51233'
      : 'wss://xrplcluster.com';
    
    console.log(`📍 Réseau: ${network}`);
    console.log(`📍 URL: ${url}\n`);

    // 2. Créer le wallet
    let wallet: Wallet;
    try {
      wallet = Wallet.fromSecret(secret);
      console.log('✅ Wallet créé avec succès');
      console.log(`   Adresse: ${wallet.address}\n`);
    } catch (error: any) {
      console.error('❌ Erreur création wallet:', error.message);
      console.error('   Vérifiez que XRPL_PLATFORM_SECRET est un seed valide');
      return;
    }

    // 3. Se connecter au réseau
    console.log('🔌 Connexion au réseau XRPL...');
    const client = new Client(url);
    
    try {
      await client.connect();
      console.log('✅ Connecté au réseau XRPL\n');
    } catch (error: any) {
      console.error('❌ Erreur de connexion:', error.message);
      console.error('   Vérifiez votre connexion internet');
      return;
    }

    // 4. Vérifier le solde
    console.log('💰 Vérification du solde...');
    try {
      const accountInfo = await client.request({
        command: 'account_info',
        account: wallet.address,
      });

      const balance = parseFloat(accountInfo.result.account_data.Balance) / 1000000;
      const sequence = accountInfo.result.account_data.Sequence;
      
      console.log(`✅ Compte activé`);
      console.log(`   Solde: ${balance} XRP`);
      console.log(`   Sequence: ${sequence}\n`);

      // Vérifier si le solde est suffisant
      if (balance < 20) {
        console.log('⚠️  ATTENTION: Solde insuffisant !');
        console.log(`   Vous avez ${balance} XRP, mais il faut au moins 20 XRP pour créer des escrows`);
        console.log('   (10 XRP pour activer un compte worker + montant escrow + frais)\n');
        console.log('💡 Obtenez des XRP de test sur:');
        console.log('   https://xrpl.org/xrp-testnet-faucet.html');
        console.log(`   Adresse: ${wallet.address}\n`);
      } else {
        console.log('✅ Solde suffisant pour créer des escrows\n');
      }
    } catch (error: any) {
      if (error.message.includes('actNotFound') || error.message.includes('not found')) {
        console.log('⚠️  Compte non activé (pas encore de transactions)');
        console.log('   Obtenez des XRP de test sur: https://xrpl.org/xrp-testnet-faucet.html');
        console.log(`   Adresse: ${wallet.address}\n`);
      } else {
        throw error;
      }
    }

    // 5. Vérifier les paramètres réseau
    console.log('🌐 Vérification des paramètres réseau...');
    try {
      const serverInfo = await client.request({
        command: 'server_info',
      });
      console.log('✅ Serveur XRPL accessible');
      console.log(`   Ledger: ${serverInfo.result.info.validated_ledger?.seq || 'N/A'}\n`);
    } catch (error: any) {
      console.error('⚠️  Erreur récupération infos serveur:', error.message);
    }

    await client.disconnect();
    console.log('✅ Diagnostic terminé\n');

    // 6. Résumé
    console.log('📋 Résumé:');
    console.log('   1. Vérifiez que le wallet a assez de XRP (≥ 20 XRP recommandé)');
    console.log('   2. Vérifiez que les workers ont des adresses XRPL valides');
    console.log('   3. Vérifiez votre connexion internet');
    console.log(`   4. Voir le wallet sur l'explorer: https://testnet.xrpl.org/accounts/${wallet.address}\n`);

  } catch (error: any) {
    console.error('❌ Erreur lors du diagnostic:', error.message);
    console.error('   Stack:', error.stack);
  }
}

diagnoseXRPL();

