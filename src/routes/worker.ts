import express, { Response } from 'express';
import multer from 'multer';
import { AuthRequest, authenticate } from '../middleware/auth';
import { pool } from '../db/connection';
import { saveAudioFile } from '../services/storage';
import { transcribeAudio } from '../services/assemblyai';
import { analyseStartShift, analyseShift } from '../services/llm';
import { StartShiftRequest, EndShiftRequest } from '../types';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

/**
 * POST /worker/transcribe
 * Transcrit un audio sans créer de shift (pour preview)
 */
router.post(
  '/transcribe',
  authenticate,
  upload.single('audio'),
  async (req: AuthRequest, res: Response) => {
    try {
      if (!req.userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const audioFile = req.file;

      if (!audioFile) {
        return res.status(400).json({ error: 'Audio file is required' });
      }

      console.log('🎤 [Transcribe] Début transcription pour preview...');
      console.log('📦 [Transcribe] Taille audio:', audioFile.buffer.length, 'bytes');

      // Transcription AssemblyAI
      const transcript = await transcribeAudio(audioFile.buffer);

      console.log('✅ [Transcribe] Transcription terminée:', transcript);

      res.json({
        transcript,
        stt_text: transcript, // Alias pour compatibilité
        length: transcript.length,
      });
    } catch (error) {
      console.error('Transcribe error:', error);
      res.status(500).json({ error: 'Failed to transcribe audio' });
    }
  }
);

/**
 * POST /worker/shifts/start
 * Démarre un shift avec enregistrement audio
 */
router.post(
  '/shifts/start',
  authenticate,
  upload.single('audio'),
  async (req: AuthRequest, res: Response) => {
    try {
      if (!req.userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { employer_id, job_type, transcript: existingTranscript } = req.body as StartShiftRequest & { transcript?: string };
      const audioFile = req.file;

      if (!employer_id) {
        return res.status(400).json({ error: 'employer_id is required' });
      }

      // Vérifier que l'employeur existe
      const employerCheck = await pool.query('SELECT id FROM users WHERE id = $1 AND role = $2', [
        employer_id,
        'employer',
      ]);

      if (employerCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Employer not found' });
      }

      // Si on a déjà une transcription, on l'utilise, sinon on transcrit
      let transcript: string;
      let audioUrl: string | null = null;
      
      if (existingTranscript && existingTranscript.trim().length > 0) {
        console.log('✅ Utilisation de la transcription existante');
        transcript = existingTranscript;
        // Si on a un fichier audio, on le sauvegarde quand même
        if (audioFile) {
          audioUrl = await saveAudioFile(audioFile.buffer, audioFile.originalname);
        }
      } else if (audioFile) {
        // 1. Sauvegarder l'audio
        audioUrl = await saveAudioFile(audioFile.buffer, audioFile.originalname);

        // 2. Transcription AssemblyAI
        console.log('🎤 Début transcription AssemblyAI...');
        console.log('📦 Taille audio:', audioFile.buffer.length, 'bytes');
        transcript = await transcribeAudio(audioFile.buffer);
        console.log('✅ Transcription AssemblyAI terminée:', transcript);
        console.log('📝 Longueur transcription:', transcript.length, 'caractères');
      } else {
        return res.status(400).json({ error: 'Audio file or transcript is required' });
      }

      // 3. Analyse LLM
      console.log('🤖 Début analyse LLM...');
      const llmAnalysis = await analyseStartShift(transcript);
      console.log('✅ Analyse LLM terminée:', JSON.stringify(llmAnalysis, null, 2));

      // 4. Créer la work_session
      const startTime = new Date();
      
      const result = await pool.query(
        `INSERT INTO work_sessions (
          worker_id, employer_id, start_time, 
          raw_audio_start_url, stt_start_text, 
          llm_structured_json, status
        )
        VALUES ($1, $2, $3, $4, $5, $6, 'proposed')
        RETURNING id, start_time, status`,
        [
          req.userId,
          employer_id,
          startTime,
          audioUrl,
          transcript,
          JSON.stringify({
            ...llmAnalysis,
            job_type: job_type || llmAnalysis.job_type,
          }),
        ]
      );

      const workSession = result.rows[0];

      res.status(201).json({
        work_session_id: workSession.id,
        start_time: workSession.start_time,
        status: workSession.status,
        transcript,
        stt_start_text: transcript, // Alias pour compatibilité frontend
        analysis: llmAnalysis,
      });
    } catch (error) {
      console.error('Start shift error:', error);
      res.status(500).json({ error: 'Failed to start shift' });
    }
  }
);

/**
 * POST /worker/shifts/end
 * Termine un shift avec enregistrement audio
 */
router.post(
  '/shifts/end',
  authenticate,
  upload.single('audio'),
  async (req: AuthRequest, res: Response) => {
    try {
      if (!req.userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { work_session_id } = req.body as EndShiftRequest;
      const audioFile = req.file;

      if (!work_session_id) {
        return res.status(400).json({ error: 'work_session_id is required' });
      }

      if (!audioFile) {
        return res.status(400).json({ error: 'Audio file is required' });
      }

      // Récupérer la session
      const sessionResult = await pool.query(
        'SELECT * FROM work_sessions WHERE id = $1 AND worker_id = $2',
        [work_session_id, req.userId]
      );

      if (sessionResult.rows.length === 0) {
        return res.status(404).json({ error: 'Work session not found' });
      }

      const session = sessionResult.rows[0];

      if (session.end_time) {
        return res.status(400).json({ error: 'Shift already ended' });
      }

      // 1. Sauvegarder l'audio
      const audioUrl = await saveAudioFile(audioFile.buffer, audioFile.originalname);

      // 2. Transcription AssemblyAI
      console.log('🎤 Début transcription AssemblyAI (check-out)...');
      console.log('📦 Taille audio:', audioFile.buffer.length, 'bytes');
      const transcriptEnd = await transcribeAudio(audioFile.buffer);
      console.log('✅ Transcription AssemblyAI terminée:', transcriptEnd);
      console.log('📝 Longueur transcription:', transcriptEnd.length, 'caractères');

      // 3. Analyse LLM complète
      const endTime = new Date();
      const hours = (endTime.getTime() - new Date(session.start_time).getTime()) / (1000 * 60 * 60);

      const llmAnalysis = await analyseShift({
        startTime: session.start_time,
        endTime: endTime.toISOString(),
        startTranscript: session.stt_start_text || '',
        endTranscript: transcriptEnd,
        policy: {
          max_hours_per_day: 12,
          min_hourly_rate: 10,
        },
      });

      // Récupérer le taux horaire (par défaut ou depuis l'employeur)
      const employerResult = await pool.query('SELECT * FROM users WHERE id = $1', [
        session.employer_id,
      ]);
      const { DEFAULT_HOURLY_RATE } = await import('../config/constants');
      const hourlyRate = DEFAULT_HOURLY_RATE; // Par défaut, peut être configuré par employeur
      const amountTotal = hours * hourlyRate;

      // 4. Mettre à jour la work_session
      const updateResult = await pool.query(
        `UPDATE work_sessions
         SET end_time = $1,
             raw_audio_end_url = $2,
             stt_end_text = $3,
             llm_structured_json = $4,
             hours = $5,
             hourly_rate = $6,
             amount_total = $7,
             status = 'proposed',
             updated_at = NOW()
         WHERE id = $8
         RETURNING *`,
        [
          endTime,
          audioUrl,
          transcriptEnd,
          JSON.stringify(llmAnalysis),
          hours,
          hourlyRate,
          amountTotal,
          work_session_id,
        ]
      );

      const updatedSession = updateResult.rows[0];

      res.json({
        work_session_id: updatedSession.id,
        start_time: updatedSession.start_time,
        end_time: updatedSession.end_time,
        hours: parseFloat(updatedSession.hours),
        hourly_rate: parseFloat(updatedSession.hourly_rate),
        amount_total: parseFloat(updatedSession.amount_total),
        status: updatedSession.status,
        stt_end_text: transcriptEnd, // Ajouter la transcription
        transcript: transcriptEnd, // Alias pour compatibilité
        analysis: llmAnalysis,
      });
    } catch (error) {
      console.error('End shift error:', error);
      res.status(500).json({ error: 'Failed to end shift' });
    }
  }
);

/**
 * GET /worker/shifts
 * Liste tous les shifts du worker
 */
router.get('/shifts', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const result = await pool.query(
      `SELECT ws.*, e.name as employer_name
       FROM work_sessions ws
       JOIN users e ON ws.employer_id = e.id
       WHERE ws.worker_id = $1
       ORDER BY ws.created_at DESC`,
      [req.userId]
    );

    res.json({
      shifts: result.rows.map((row) => ({
        id: row.id,
        employer_id: row.employer_id,
        employer_name: row.employer_name,
        start_time: row.start_time,
        end_time: row.end_time,
        hours: row.hours ? parseFloat(row.hours) : null,
        hourly_rate: row.hourly_rate ? parseFloat(row.hourly_rate) : null,
        amount_total: row.amount_total ? parseFloat(row.amount_total) : null,
        status: row.status,
        stt_start_text: row.stt_start_text,
        stt_end_text: row.stt_end_text,
        llm_structured_json: row.llm_structured_json,
        xrpl_nft_id: row.xrpl_nft_id,
        xrpl_escrow_tx: row.xrpl_escrow_tx,
        xrpl_payment_tx: row.xrpl_payment_tx,
        created_at: row.created_at,
      })),
    });
  } catch (error) {
    console.error('Get shifts error:', error);
    res.status(500).json({ error: 'Failed to get shifts' });
  }
});

/**
 * GET /worker/employers
 * Liste tous les employers disponibles
 */
router.get(
  '/employers',
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      if (!req.userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const result = await pool.query(
        `SELECT id, name, email, xrpl_address
         FROM users
         WHERE role = 'employer'
         ORDER BY name ASC`
      );

      res.json({
        employers: result.rows.map((row) => ({
          id: row.id,
          name: row.name,
          email: row.email,
          xrpl_address: row.xrpl_address,
        })),
      });
    } catch (error) {
      console.error('Get employers error:', error);
      res.status(500).json({ error: 'Failed to get employers' });
    }
  }
);

export default router;
