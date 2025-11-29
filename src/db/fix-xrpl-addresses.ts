/**
 * Corriger les adresses XRPL invalides dans la base de données
 */

import { pool } from './connection';
import { Wallet } from 'xrpl';
import dotenv from 'dotenv';

dotenv.config();

async function fixXrplAddresses() {
  try {
    console.log('🔧 Correction des adresses XRPL...');

    // Récupérer tous les users sans adresse XRPL valide
    const users = await pool.query(`
      SELECT id, name, email, role, xrpl_address 
      FROM users 
      WHERE xrpl_address IS NULL 
         OR xrpl_address NOT LIKE 'r%'
         OR LENGTH(xrpl_address) < 25
    `);

    console.log(`📋 ${users.rows.length} utilisateur(s) à corriger`);

    for (const user of users.rows) {
      // Générer une nouvelle adresse XRPL
      const wallet = Wallet.generate();
      
      await pool.query(
        'UPDATE users SET xrpl_address = $1 WHERE id = $2',
        [wallet.address, user.id]
      );

      console.log(`✅ ${user.name} (${user.role}): ${wallet.address}`);
      console.log(`   Secret: ${wallet.seed} (à sauvegarder si besoin)`);
    }

    console.log('');
    console.log('✅ Toutes les adresses XRPL ont été corrigées !');
    console.log('');
    console.log('💡 Pour obtenir des XRP de test pour ces adresses :');
    console.log('   https://xrpl.org/xrp-testnet-faucet.html');

    await pool.end();
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Erreur:', error.message);
    process.exit(1);
  }
}

fixXrplAddresses();

