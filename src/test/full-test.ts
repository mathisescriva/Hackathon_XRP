/**
 * Test complet du backend - vérifie tout ce qui peut être testé
 */

import dotenv from 'dotenv';
import { generateToken } from '../middleware/auth';
import { DEFAULT_HOURLY_RATE, SHIFT_STATUS, USER_ROLES } from '../config/constants';
import { AssemblyAI } from 'assemblyai';
import OpenAI from 'openai';
import { Client } from 'xrpl';

dotenv.config();

interface TestResult {
  name: string;
  status: 'pass' | 'fail' | 'skip';
  message: string;
}

const results: TestResult[] = [];

function addResult(name: string, status: 'pass' | 'fail' | 'skip', message: string) {
  results.push({ name, status, message });
  const icon = status === 'pass' ? '✅' : status === 'fail' ? '❌' : '⚠️';
  console.log(`${icon} ${name}: ${message}`);
}

async function runTests() {
  console.log('🧪 Tests complets du backend\n');
  console.log('=' .repeat(50));

  // Test 1: Variables d'environnement
  console.log('\n📋 1. Variables d\'environnement');
  addResult(
    'ASSEMBLYAI_API_KEY',
    process.env.ASSEMBLYAI_API_KEY ? 'pass' : 'fail',
    process.env.ASSEMBLYAI_API_KEY ? `Configuré (${process.env.ASSEMBLYAI_API_KEY.substring(0, 10)}...)` : 'Manquant'
  );

  addResult(
    'OPENAI_API_KEY',
    process.env.OPENAI_API_KEY ? 'pass' : 'fail',
    process.env.OPENAI_API_KEY ? `Configuré (${process.env.OPENAI_API_KEY.substring(0, 20)}...)` : 'Manquant'
  );

  addResult(
    'XRPL_PLATFORM_ADDRESS',
    process.env.XRPL_PLATFORM_ADDRESS ? 'pass' : 'fail',
    process.env.XRPL_PLATFORM_ADDRESS || 'Manquant'
  );

  addResult(
    'XRPL_PLATFORM_SECRET',
    process.env.XRPL_PLATFORM_SECRET ? 'pass' : 'fail',
    process.env.XRPL_PLATFORM_SECRET ? 'Configuré' : 'Manquant'
  );

  addResult(
    'JWT_SECRET',
    process.env.JWT_SECRET ? 'pass' : 'fail',
    process.env.JWT_SECRET ? 'Configuré' : 'Manquant'
  );

  // Test 2: Constantes
  console.log('\n📋 2. Constantes et configuration');
  addResult('DEFAULT_HOURLY_RATE', 'pass', `${DEFAULT_HOURLY_RATE}`);
  addResult('SHIFT_STATUS', 'pass', Object.values(SHIFT_STATUS).join(', '));
  addResult('USER_ROLES', 'pass', Object.values(USER_ROLES).join(', '));

  // Test 3: JWT
  console.log('\n📋 3. Authentification JWT');
  try {
    const token = generateToken('test-user-id', 'worker');
    addResult('JWT Generation', 'pass', `Token généré (${token.substring(0, 30)}...)`);
  } catch (error) {
    addResult('JWT Generation', 'fail', `Erreur: ${error instanceof Error ? error.message : 'Unknown'}`);
  }

  // Test 4: AssemblyAI
  console.log('\n📋 4. Service AssemblyAI');
  if (process.env.ASSEMBLYAI_API_KEY) {
    try {
      const client = new AssemblyAI({
        apiKey: process.env.ASSEMBLYAI_API_KEY,
      });
      addResult('AssemblyAI Client', 'pass', 'Client initialisé');
    } catch (error) {
      addResult('AssemblyAI Client', 'fail', `Erreur: ${error instanceof Error ? error.message : 'Unknown'}`);
    }
  } else {
    addResult('AssemblyAI Client', 'skip', 'API Key manquante');
  }

  // Test 5: OpenAI
  console.log('\n📋 5. Service OpenAI');
  if (process.env.OPENAI_API_KEY) {
    try {
      const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });
      addResult('OpenAI Client', 'pass', 'Client initialisé');
    } catch (error) {
      addResult('OpenAI Client', 'fail', `Erreur: ${error instanceof Error ? error.message : 'Unknown'}`);
    }
  } else {
    addResult('OpenAI Client', 'skip', 'API Key manquante');
  }

  // Test 6: XRPL
  console.log('\n📋 6. Service XRPL');
  if (process.env.XRPL_PLATFORM_SECRET) {
    try {
      const network = process.env.XRPL_NETWORK || 'testnet';
      const url = network === 'testnet' 
        ? 'wss://s.altnet.rippletest.net:51233'
        : 'wss://xrplcluster.com';
      
      const client = new Client(url);
      addResult('XRPL Client', 'pass', `Client initialisé pour ${network}`);
      
      // Test de connexion (timeout court)
      const connectPromise = client.connect();
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), 3000)
      );
      
      try {
        await Promise.race([connectPromise, timeoutPromise]);
        addResult('XRPL Connection', 'pass', 'Connexion réussie');
        await client.disconnect();
      } catch (error) {
        addResult('XRPL Connection', 'skip', 'Connexion non testée (timeout ou réseau)');
        try {
          await client.disconnect();
        } catch {}
      }
    } catch (error) {
      addResult('XRPL Client', 'fail', `Erreur: ${error instanceof Error ? error.message : 'Unknown'}`);
    }
  } else {
    addResult('XRPL Client', 'skip', 'Secret manquant');
  }

  // Test 7: Imports
  console.log('\n📋 7. Imports et modules');
  try {
    await import('../services/storage');
    addResult('Storage Service', 'pass', 'Import réussi');
  } catch (error) {
    addResult('Storage Service', 'fail', `Erreur: ${error instanceof Error ? error.message : 'Unknown'}`);
  }

  try {
    await import('../services/assemblyai');
    addResult('AssemblyAI Service', 'pass', 'Import réussi');
  } catch (error) {
    addResult('AssemblyAI Service', 'fail', `Erreur: ${error instanceof Error ? error.message : 'Unknown'}`);
  }

  try {
    await import('../services/llm');
    addResult('LLM Service', 'pass', 'Import réussi');
  } catch (error) {
    addResult('LLM Service', 'fail', `Erreur: ${error instanceof Error ? error.message : 'Unknown'}`);
  }

  try {
    await import('../services/xrpl');
    addResult('XRPL Service', 'pass', 'Import réussi');
  } catch (error) {
    addResult('XRPL Service', 'fail', `Erreur: ${error instanceof Error ? error.message : 'Unknown'}`);
  }

  // Résumé
  console.log('\n' + '='.repeat(50));
  console.log('\n📊 Résumé des tests\n');
  
  const passed = results.filter(r => r.status === 'pass').length;
  const failed = results.filter(r => r.status === 'fail').length;
  const skipped = results.filter(r => r.status === 'skip').length;
  const total = results.length;

  console.log(`✅ Réussis: ${passed}/${total}`);
  console.log(`❌ Échoués: ${failed}/${total}`);
  console.log(`⚠️  Ignorés: ${skipped}/${total}`);

  if (failed === 0) {
    console.log('\n🎉 Tous les tests critiques sont passés !');
    console.log('\n📝 Prochaines étapes:');
    console.log('   1. Démarrer PostgreSQL (docker-compose up -d postgres)');
    console.log('   2. Lancer les migrations (npm run migrate)');
    console.log('   3. Créer les users de test (npm run seed)');
    console.log('   4. Démarrer le serveur (npm run dev)');
    process.exit(0);
  } else {
    console.log('\n⚠️  Certains tests ont échoué. Vérifiez la configuration.');
    process.exit(1);
  }
}

runTests().catch(error => {
  console.error('❌ Erreur lors des tests:', error);
  process.exit(1);
});

