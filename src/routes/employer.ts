import express, { Response } from 'express';
import { AuthRequest, authenticate, requireRole } from '../middleware/auth';
import { pool } from '../db/connection';
import { createEscrow, mintShiftNFT, finishEscrow } from '../services/xrpl';
import { ValidateShiftRequest } from '../types';

const router = express.Router();

/**
 * GET /employer/shifts
 * Liste les shifts pour validation
 */
router.get(
  '/shifts',
  authenticate,
  requireRole('employer', 'admin'),
  async (req: AuthRequest, res: Response) => {
    try {
      if (!req.userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { status } = req.query;

      let query = `
        SELECT ws.*,
               w.name as worker_name,
               w.xrpl_address as worker_xrpl_address
        FROM work_sessions ws
        JOIN users w ON ws.worker_id = w.id
        WHERE ws.employer_id = $1
      `;
      const params: any[] = [req.userId];

      if (status) {
        query += ' AND ws.status = $2';
        params.push(status);
      }

      query += ' ORDER BY ws.created_at DESC';

      const result = await pool.query(query, params);

      res.json({
        shifts: result.rows.map((row) => ({
          id: row.id,
          worker_name: row.worker_name,
          worker_xrpl_address: row.worker_xrpl_address,
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
      console.error('Get employer shifts error:', error);
      res.status(500).json({ error: 'Failed to get shifts' });
    }
  }
);

/**
 * POST /employer/shifts/:id/validate
 * Valide un shift et crée l'escrow + NFT XRPL
 */
router.post(
  '/shifts/:id/validate',
  authenticate,
  requireRole('employer', 'admin'),
  async (req: AuthRequest, res: Response) => {
    try {
      if (!req.userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { id } = req.params;
      const { hourly_rate, start_time, end_time, adjustments } = req.body as ValidateShiftRequest;

      // Récupérer la session
      const sessionResult = await pool.query(
        'SELECT ws.*, w.xrpl_address as worker_xrpl_address, e.xrpl_address as employer_xrpl_address FROM work_sessions ws JOIN users w ON ws.worker_id = w.id JOIN users e ON ws.employer_id = e.id WHERE ws.id = $1 AND ws.employer_id = $2',
        [id, req.userId]
      );

      if (sessionResult.rows.length === 0) {
        return res.status(404).json({ error: 'Shift not found' });
      }

      const session = sessionResult.rows[0];

      if (session.status !== 'proposed') {
        return res.status(400).json({ error: `Shift is already ${session.status}` });
      }

      // Appliquer les ajustements si fournis
      let finalHourlyRate = hourly_rate || session.hourly_rate || 15;
      let finalStartTime = start_time ? new Date(start_time) : new Date(session.start_time);
      
      // Si end_time n'est pas fourni dans la requête, utiliser celui de la session
      // Si la session n'a pas d'end_time, utiliser l'heure actuelle comme fallback
      let finalEndTime: Date | null = null;
      if (end_time) {
        finalEndTime = new Date(end_time);
      } else if (session.end_time) {
        finalEndTime = new Date(session.end_time);
      } else {
        // Si aucun end_time n'est disponible, utiliser l'heure actuelle
        // Cela permet de valider un shift même si le worker n'a pas fait de check-out
        finalEndTime = new Date();
        console.log('⚠️  Aucun end_time trouvé, utilisation de l\'heure actuelle:', finalEndTime);
      }

      if (!finalEndTime) {
        return res.status(400).json({ 
          error: 'End time is required',
          details: 'Le shift doit avoir une heure de fin. Le worker doit terminer le shift ou vous devez fournir une end_time dans la requête.'
        });
      }

      const finalHours = (finalEndTime.getTime() - finalStartTime.getTime()) / (1000 * 60 * 60);
      // Arrondir à 6 décimales maximum (limite XRPL)
      const finalAmount = Math.round((finalHours * finalHourlyRate) * 1000000) / 1000000;

      // Vérifier que les adresses XRPL existent
      if (!session.worker_xrpl_address || !session.employer_xrpl_address) {
        return res.status(400).json({
          error: 'Worker or employer XRPL address is missing',
        });
      }

      // Pour la démo, utiliser les secrets depuis les variables d'environnement
      // En production, chaque user aurait son propre wallet
      const employerSecret = process.env.XRPL_PLATFORM_SECRET;
      if (!employerSecret) {
        return res.status(500).json({ error: 'XRPL platform secret not configured' });
      }

      try {
        // 1. Créer l'escrow XRPL
        const escrowTx = await createEscrow(
          employerSecret,
          session.worker_xrpl_address,
          finalAmount,
          Math.floor(Date.now() / 1000) + 86400 * 7 // 7 jours
        );

        // 2. Mint le NFT (arrondir le montant pour le NFT aussi)
        const roundedAmountForNFT = Math.round(finalAmount * 1000000) / 1000000;
        const nftId = await mintShiftNFT(employerSecret, {
          shift_id: session.id,
          worker_id: session.worker_id,
          employer_id: session.employer_id,
          hours: Math.round(finalHours * 100) / 100, // Arrondir les heures à 2 décimales
          amount: roundedAmountForNFT,
          job_type: session.llm_structured_json?.job_type,
        });

        // 3. Mettre à jour la DB
        const updateResult = await pool.query(
          `UPDATE work_sessions
           SET hourly_rate = $1,
               start_time = $2,
               end_time = $3,
               hours = $4,
               amount_total = $5,
               status = 'validated',
               xrpl_escrow_tx = $6,
               xrpl_nft_id = $7,
               updated_at = NOW()
           WHERE id = $8
           RETURNING *`,
          [finalHourlyRate, finalStartTime, finalEndTime, finalHours, finalAmount, escrowTx, nftId, id]
        );

        const updatedSession = updateResult.rows[0];

        res.json({
          shift_id: updatedSession.id,
          status: updatedSession.status,
          hours: parseFloat(updatedSession.hours),
          amount_total: parseFloat(updatedSession.amount_total),
          xrpl_escrow_tx: updatedSession.xrpl_escrow_tx,
          xrpl_nft_id: updatedSession.xrpl_nft_id,
          message: `${finalAmount} XRP locked in escrow for this shift`,
        });
      } catch (xrplError: any) {
        console.error('XRPL operation error:', xrplError);
        console.error('Full error:', JSON.stringify(xrplError, null, 2));
        
        let errorMessage = 'Failed to create XRPL escrow/NFT';
        let errorDetails = xrplError.message || 'Unknown error';
        
        // Messages d'erreur plus explicites
        if (errorDetails.includes('insufficient') || errorDetails.includes('tecUNFUNDED')) {
          errorMessage = 'Fonds XRPL insuffisants';
          errorDetails = 'Le wallet XRPL n\'a pas assez de XRP. Obtenez des XRP de test sur: https://xrpl.org/xrp-testnet-faucet.html';
        } else if (errorDetails.includes('connection') || errorDetails.includes('ECONNREFUSED')) {
          errorMessage = 'Connexion XRPL échouée';
          errorDetails = 'Impossible de se connecter au réseau XRPL testnet. Vérifiez votre connexion internet.';
        } else if (errorDetails.includes('secret') || errorDetails.includes('invalid')) {
          errorMessage = 'Secret XRPL invalide';
          errorDetails = 'Le secret XRPL dans .env est invalide. Vérifiez XRPL_PLATFORM_SECRET.';
        }
        
        res.status(500).json({
          error: errorMessage,
          details: errorDetails,
          xrpl_error: xrplError.message,
        });
      }
    } catch (error) {
      console.error('Validate shift error:', error);
      res.status(500).json({ error: 'Failed to validate shift' });
    }
  }
);

/**
 * POST /employer/shifts/:id/refuse
 * Refuse un shift
 */
router.post(
  '/shifts/:id/refuse',
  authenticate,
  requireRole('employer', 'admin'),
  async (req: AuthRequest, res: Response) => {
    try {
      if (!req.userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { id } = req.params;

      const result = await pool.query(
        `UPDATE work_sessions
         SET status = 'refused', updated_at = NOW()
         WHERE id = $1 AND employer_id = $2 AND status = 'proposed'
         RETURNING *`,
        [id, req.userId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Shift not found or cannot be refused' });
      }

      res.json({
        shift_id: result.rows[0].id,
        status: result.rows[0].status,
      });
    } catch (error) {
      console.error('Refuse shift error:', error);
      res.status(500).json({ error: 'Failed to refuse shift' });
    }
  }
);

export default router;

