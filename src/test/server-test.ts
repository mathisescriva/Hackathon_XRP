/**
 * Test du serveur - vérifie que le serveur peut démarrer et répondre
 */

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Test route
app.get('/test', (req, res) => {
  res.json({ status: 'ok', message: 'Server is working!' });
});

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
  console.log(`✅ Test server started on port ${PORT}`);
  
  // Test la route
  fetch(`http://localhost:${PORT}/test`)
    .then(res => res.json())
    .then(data => {
      console.log('✅ Server response:', data);
      server.close();
      process.exit(0);
    })
    .catch(err => {
      console.error('❌ Server test failed:', err);
      server.close();
      process.exit(1);
    });
});

// Timeout après 5 secondes
setTimeout(() => {
  console.log('⏱️  Test timeout');
  server.close();
  process.exit(1);
}, 5000);

