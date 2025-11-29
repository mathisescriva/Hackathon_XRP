import { pool } from '../db/connection';
import dotenv from 'dotenv';

dotenv.config();

async function testConnection() {
  try {
    console.log('🔍 Test de connexion à la base de données...');
    console.log('DATABASE_URL:', process.env.DATABASE_URL?.replace(/:[^:@]+@/, ':****@'));
    
    const result = await pool.query('SELECT NOW(), current_database()');
    console.log('✅ Connexion réussie !');
    console.log('   Base de données:', result.rows[0].current_database);
    console.log('   Heure serveur:', result.rows[0].now);
    
    // Vérifier les tables
    const tables = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    console.log('\n📋 Tables trouvées:');
    tables.rows.forEach(row => console.log('   -', row.table_name));
    
    // Vérifier les users
    const users = await pool.query('SELECT id, name, email, role FROM users LIMIT 5');
    console.log('\n👥 Users trouvés:', users.rows.length);
    users.rows.forEach(user => console.log(`   - ${user.name} (${user.email}) - ${user.role}`));
    
    await pool.end();
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Erreur de connexion:', error.message);
    console.error('   Code:', error.code);
    process.exit(1);
  }
}

testConnection();

