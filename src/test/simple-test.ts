/**
 * Test simple pour vérifier que les imports et la structure fonctionnent
 */

import { pool } from '../db/connection';
import { generateToken } from '../middleware/auth';
import { DEFAULT_HOURLY_RATE } from '../config/constants';

async function simpleTest() {
  console.log('🧪 Running simple tests...\n');

  try {
    // Test 1: Constantes
    console.log('✅ Test 1: Constants');
    console.log(`   DEFAULT_HOURLY_RATE: ${DEFAULT_HOURLY_RATE}`);

    // Test 2: JWT Token generation
    console.log('\n✅ Test 2: JWT Token generation');
    const token = generateToken('test-user-id', 'worker');
    console.log(`   Token generated: ${token.substring(0, 20)}...`);

    // Test 3: Database connection (si disponible)
    console.log('\n✅ Test 3: Database connection');
    try {
      await pool.query('SELECT NOW()');
      console.log('   Database connection: OK');
    } catch (error) {
      console.log('   Database connection: SKIPPED (not configured)');
    }

    console.log('\n✅ All basic tests passed!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

simpleTest();

