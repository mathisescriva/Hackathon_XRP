import { Client, Wallet } from 'xrpl';
import dotenv from 'dotenv';

dotenv.config();

const TEST_SEED = 'sEd7D9xhHkVVLX3CYhZCZxHe3gnGwxj';

async function testWallet() {
  console.log('🔍 Test du wallet avec le seed fourni...\n');

  try {
    // Créer le wallet depuis le seed
    const wallet = Wallet.fromSecret(TEST_SEED);
    console.log('✅ Wallet créé avec succès');
    console.log('   Adresse:', wallet.address);
    console.log('   Seed:', TEST_SEED.substring(0, 10) + '...');

    // Se connecter au testnet
    const client = new Client('wss://s.altnet.rippletest.net:51233');
    await client.connect();
    console.log('\n✅ Connecté au XRPL testnet');

    // Vérifier le solde
    try {
      const accountInfo = await client.request({
        command: 'account_info',
        account: wallet.address,
      });

      const balance = parseFloat(accountInfo.result.account_data.Balance) / 1000000;
      console.log('\n💰 Solde du wallet:');
      console.log('   Balance:', balance, 'XRP');
      console.log('   Sequence:', accountInfo.result.account_data.Sequence);

      if (balance < 10) {
        console.log('\n⚠️  ATTENTION: Solde insuffisant (< 10 XRP)');
        console.log('   Obtenez des XRP de test sur: https://xrpl.org/xrp-testnet-faucet.html');
        console.log('   Adresse à utiliser:', wallet.address);
      } else {
        console.log('\n✅ Solde suffisant pour les opérations');
      }
    } catch (error: any) {
      if (error.message.includes('actNotFound') || error.message.includes('not found')) {
        console.log('\n⚠️  Compte non activé (pas encore de transactions)');
        console.log('   Obtenez des XRP de test sur: https://xrpl.org/xrp-testnet-faucet.html');
        console.log('   Adresse à utiliser:', wallet.address);
      } else {
        throw error;
      }
    }

    // Vérifier sur l'explorer
    console.log('\n🔗 Voir sur l\'explorer:');
    console.log(`   https://testnet.xrpl.org/accounts/${wallet.address}`);

    await client.disconnect();
    console.log('\n✅ Test terminé avec succès');

    // Afficher la configuration à ajouter dans .env
    console.log('\n📝 Configuration à ajouter dans .env:');
    console.log(`XRPL_PLATFORM_SECRET=${TEST_SEED}`);
    console.log(`XRPL_PLATFORM_ADDRESS=${wallet.address}`);

  } catch (error: any) {
    console.error('\n❌ Erreur:', error.message);
    process.exit(1);
  }
}

testWallet();

