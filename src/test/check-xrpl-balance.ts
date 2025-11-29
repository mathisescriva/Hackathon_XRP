/**
 * Vérifier le solde XRPL du wallet
 */

import { Client, Wallet } from 'xrpl';
import dotenv from 'dotenv';

dotenv.config();

async function checkBalance() {
  try {
    const network = process.env.XRPL_NETWORK || 'testnet';
    const url = network === 'testnet' 
      ? 'wss://s.altnet.rippletest.net:51233'
      : 'wss://xrplcluster.com';
    
    const client = new Client(url);
    await client.connect();
    console.log(`✅ Connecté à XRPL ${network}`);

    const secret = process.env.XRPL_PLATFORM_SECRET;
    if (!secret) {
      console.error('❌ XRPL_PLATFORM_SECRET non défini');
      process.exit(1);
    }

    const wallet = Wallet.fromSecret(secret);
    console.log(`📍 Adresse: ${wallet.address}`);

    const response = await client.request({
      command: 'account_info',
      account: wallet.address,
    });

    const balance = parseFloat(response.result.account_data.Balance) / 1000000;
    console.log(`💰 Solde: ${balance} XRP`);

    if (balance < 10) {
      console.log('');
      console.log('⚠️  Solde insuffisant !');
      console.log('💡 Obtenez des XRP de test sur:');
      console.log('   https://xrpl.org/xrp-testnet-faucet.html');
      console.log(`   Adresse: ${wallet.address}`);
    } else {
      console.log('✅ Solde suffisant pour créer des escrows');
    }

    await client.disconnect();
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Erreur:', error.message);
    process.exit(1);
  }
}

checkBalance();

