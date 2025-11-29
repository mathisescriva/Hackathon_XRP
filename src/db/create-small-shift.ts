/**
 * Créer un shift de test avec un petit montant (pour tester avec le solde actuel)
 */

import { pool } from './connection';
import dotenv from 'dotenv';

dotenv.config();

async function createSmallShift() {
  try {
    console.log('🧪 Création d\'un shift de test (petit montant)...');

    const workerResult = await pool.query(
      "SELECT id FROM users WHERE email = 'alice@test.com' AND role = 'worker'"
    );
    const workerId = workerResult.rows[0].id;

    const employerResult = await pool.query(
      "SELECT id FROM users WHERE email = 'bob@test.com' AND role = 'employer'"
    );
    const employerId = employerResult.rows[0].id;

    // Shift de 2 heures seulement (30 XRP au lieu de 120)
    const startTime = new Date();
    startTime.setHours(9, 0, 0, 0);
    
    const endTime = new Date();
    endTime.setHours(11, 0, 0, 0); // 2 heures
    
    const hours = 2;
    const hourlyRate = 15;
    const amountTotal = hours * hourlyRate; // 30 XRP

    const result = await pool.query(
      `INSERT INTO work_sessions (
        worker_id, employer_id, start_time, end_time,
        stt_start_text, stt_end_text,
        llm_structured_json, hours, hourly_rate, amount_total, status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'proposed')
      RETURNING id, hours, amount_total, status`,
      [
        workerId,
        employerId,
        startTime,
        endTime,
        'Bonjour, je commence mon shift',
        'Je termine mon shift',
        JSON.stringify({
          job_type: 'childcare',
          notes: 'Shift de test - 2 heures',
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
    console.log(`   Montant: ${shift.amount_total} XRP (au lieu de 120)`);
    console.log(`   Statut: ${shift.status}`);
    console.log('');
    console.log('💡 Ce shift nécessite seulement ~45 XRP (30 escrow + 10 activation + 5 frais)');
    console.log('   Votre solde actuel (~90 XRP) est suffisant !');

    await pool.end();
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Erreur:', error.message);
    process.exit(1);
  }
}

createSmallShift();

