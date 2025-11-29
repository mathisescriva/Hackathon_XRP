/**
 * Script pour créer un shift de test
 */

import { pool } from './connection';
import dotenv from 'dotenv';

dotenv.config();

async function createTestShift() {
  try {
    console.log('🧪 Création d\'un shift de test...');

    // Récupérer le worker (Alice)
    const workerResult = await pool.query(
      "SELECT id FROM users WHERE email = 'alice@test.com' AND role = 'worker'"
    );
    
    if (workerResult.rows.length === 0) {
      console.error('❌ Worker alice@test.com non trouvé');
      process.exit(1);
    }
    const workerId = workerResult.rows[0].id;

    // Récupérer l'employer (Bob)
    const employerResult = await pool.query(
      "SELECT id FROM users WHERE email = 'bob@test.com' AND role = 'employer'"
    );
    
    if (employerResult.rows.length === 0) {
      console.error('❌ Employer bob@test.com non trouvé');
      process.exit(1);
    }
    const employerId = employerResult.rows[0].id;

    // Créer un shift de test
    const startTime = new Date();
    startTime.setHours(9, 0, 0, 0); // 9h00
    
    const endTime = new Date();
    endTime.setHours(17, 0, 0, 0); // 17h00
    
    const hours = 8;
    const hourlyRate = 15;
    const amountTotal = hours * hourlyRate;

    const result = await pool.query(
      `INSERT INTO work_sessions (
        worker_id, employer_id, start_time, end_time,
        stt_start_text, stt_end_text,
        llm_structured_json, hours, hourly_rate, amount_total, status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'proposed')
      RETURNING id, start_time, end_time, hours, amount_total, status`,
      [
        workerId,
        employerId,
        startTime,
        endTime,
        'Bonjour, je commence mon shift de garde d\'enfants',
        'Je termine mon shift, j\'ai gardé 2 enfants aujourd\'hui',
        JSON.stringify({
          job_type: 'childcare',
          notes: 'Shift de test - garde d\'enfants',
          issues: [],
          risk_flags: [],
          legal_flags: [],
          confidence: 0.9
        }),
        hours,
        hourlyRate,
        amountTotal
      ]
    );

    const shift = result.rows[0];
    console.log('✅ Shift de test créé !');
    console.log(`   ID: ${shift.id}`);
    console.log(`   Heures: ${shift.hours}h`);
    console.log(`   Montant: ${shift.amount_total} XRP`);
    console.log(`   Statut: ${shift.status}`);
    console.log('');
    console.log('🎯 Vous pouvez maintenant :');
    console.log('   1. Recharger la page employer');
    console.log('   2. Cliquer sur "Actualiser"');
    console.log('   3. Vous verrez le shift à valider !');

    await pool.end();
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Erreur:', error.message);
    process.exit(1);
  }
}

createTestShift();

