import express, { Response } from 'express';
import { AuthRequest, authenticate } from '../middleware/auth';
import { pool } from '../db/connection';
import { finishEscrow, getEscrowInfo } from '../services/xrpl';

const router = express.Router();

/**
 * POST /shifts/:id/release
 * Release le paiement (consomme l'escrow)
 */
router.post('/:id/release', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { id } = req.params;

    // Récupérer la session
    const sessionResult = await pool.query(
      `SELECT ws.*, e.xrpl_address as employer_xrpl_address
       FROM work_sessions ws
       JOIN users e ON ws.employer_id = e.id
       WHERE ws.id = $1`,
      [id]
    );

    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Shift not found' });
    }

    const session = sessionResult.rows[0];

    // Vérifier que l'utilisateur est l'employeur ou le worker
    if (session.employer_id !== req.userId && session.worker_id !== req.userId) {
      return res.status(403).json({ error: 'Not authorized to release this shift' });
    }

    if (session.status !== 'validated') {
      return res.status(400).json({ error: `Shift must be validated, current status: ${session.status}` });
    }

    if (!session.xrpl_escrow_tx) {
      return res.status(400).json({ error: 'No escrow transaction found' });
    }

    // Pour la démo, utiliser le secret de la plateforme
    // En production, utiliser le wallet de l'employeur
    const employerSecret = process.env.XRPL_PLATFORM_SECRET;
    if (!employerSecret) {
      return res.status(500).json({ error: 'XRPL platform secret not configured' });
    }

    // L'escrow a été créé par le wallet de la plateforme, pas par l'employeur
    // Il faut utiliser l'adresse du wallet de la plateforme pour récupérer l'escrow
    const { getWalletFromSecret } = await import('../services/xrpl');
    const platformWallet = getWalletFromSecret(employerSecret);
    const platformAddress = platformWallet.address;

    try {
      // Pour EscrowFinish, OfferSequence doit être le Sequence de la transaction EscrowCreate
      // Récupérons d'abord la transaction de création pour obtenir son Sequence
      const { initXRPL } = await import('../services/xrpl');
      const xrplClient = await initXRPL();
      
      console.log('🔍 Récupération de la transaction escrow:', session.xrpl_escrow_tx);
      
      // Récupérer la transaction de création de l'escrow
      const txResponse = await xrplClient.request({
        command: 'tx',
        transaction: session.xrpl_escrow_tx,
      });
      
      if (!txResponse.result) {
        return res.status(404).json({ 
          error: 'Escrow transaction not found',
          details: `Transaction ${session.xrpl_escrow_tx} non trouvée ou invalide sur XRPL`
        });
      }
      
      // L'adresse du compte qui a créé l'escrow (Account de la transaction EscrowCreate)
      const escrowOwner = txResponse.result.Account;
      
      console.log('✅ Transaction trouvée:');
      console.log('   Account (créateur):', escrowOwner);
      console.log('   Platform address:', platformAddress);
      console.log('   Platform secret:', employerSecret ? 'présent' : 'absent');

      // Vérifier que c'est bien le compte de la plateforme
      if (escrowOwner !== platformAddress) {
        console.error('❌ Mismatch: L\'escrow a été créé par', escrowOwner, 'mais on essaie de le finaliser avec', platformAddress);
        return res.status(400).json({
          error: 'Escrow owner mismatch',
          details: `L'escrow a été créé par ${escrowOwner} mais le wallet de la plateforme est ${platformAddress}. Vérifiez XRPL_PLATFORM_SECRET.`
        });
      }

      // Pour EscrowFinish, OfferSequence doit être le Sequence de la transaction EscrowCreate
      // C'est le Sequence du compte au moment où l'escrow a été créé
      // Ce n'est PAS l'index de l'objet escrow, mais le Sequence de la transaction elle-même
      
      console.log('🔍 Transaction EscrowCreate complète:', JSON.stringify(txResponse.result, null, 2));
      
      // Le Sequence de la transaction est le Sequence du compte au moment de la création
      let escrowSequence: number | undefined;
      
      if (txResponse.result.Sequence !== undefined && txResponse.result.Sequence !== null) {
        escrowSequence = typeof txResponse.result.Sequence === 'string' ? parseInt(txResponse.result.Sequence, 10) : Number(txResponse.result.Sequence);
        if (!isNaN(escrowSequence) && escrowSequence > 0) {
          console.log('✅ Utilisation du Sequence de la transaction EscrowCreate:', escrowSequence);
        } else {
          escrowSequence = undefined;
        }
      }
      
      if (escrowSequence === undefined || isNaN(escrowSequence) || escrowSequence <= 0) {
        console.error('❌ Impossible de déterminer escrowSequence depuis la transaction');
        console.error('   Transaction result:', JSON.stringify(txResponse.result, null, 2));
        return res.status(400).json({
          error: 'Could not determine escrow sequence',
          details: 'Impossible de déterminer le sequence de l\'escrow depuis la transaction EscrowCreate'
        });
      }
      
      // Vérifier que l'escrow existe toujours (optionnel, pour info seulement)
      const { getEscrowInfo } = await import('../services/xrpl');
      const escrows = await getEscrowInfo(platformAddress);
      const escrow = escrows.find((e: any) => e.PreviousTxnID === session.xrpl_escrow_tx);
      
      if (!escrow) {
        console.warn('⚠️  Escrow non trouvé dans account_objects - peut-être déjà finalisé ou annulé');
        console.warn('   PreviousTxnID recherché:', session.xrpl_escrow_tx);
        console.warn('   Escrows disponibles:', escrows.length);
        // On continue quand même, car l'escrow peut avoir été finalisé entre-temps
        // ou peut-être que le sequence est correct mais l'escrow n'est plus dans account_objects
      } else {
        console.log('✅ Escrow trouvé dans account_objects');
        console.log('   Escrow index:', escrow.index);
        console.log('   Escrow LedgerIndex:', escrow.LedgerIndex);
      }

      // S'assurer que c'est bien un nombre avant de passer à finishEscrow
      const finalSequence = typeof escrowSequence === 'string' ? parseInt(escrowSequence, 10) : Number(escrowSequence);
      
      if (isNaN(finalSequence) || finalSequence <= 0) {
        console.error('❌ escrowSequence invalide après conversion:', finalSequence, '(original:', escrowSequence, ')');
        return res.status(400).json({
          error: 'Invalid escrow sequence',
          details: `Le sequence de l'escrow est invalide: ${escrowSequence}`
        });
      }

      console.log('✅ Sequence final validé:', finalSequence, '(type:', typeof finalSequence, ')');

      // Utiliser le secret de la plateforme et l'adresse du créateur (qui doit être la même)
      const paymentTx = await finishEscrow(
        employerSecret,
        platformAddress, // Doit correspondre au wallet dérivé de employerSecret
        finalSequence
      );

      // Mettre à jour la DB
      const updateResult = await pool.query(
        `UPDATE work_sessions
         SET status = 'paid',
             xrpl_payment_tx = $1,
             updated_at = NOW()
         WHERE id = $2
         RETURNING *`,
        [paymentTx, id]
      );

      res.json({
        shift_id: updateResult.rows[0].id,
        status: updateResult.rows[0].status,
        xrpl_payment_tx: updateResult.rows[0].xrpl_payment_tx,
        message: 'Payment released successfully',
      });
    } catch (xrplError: any) {
      console.error('XRPL release error:', xrplError);
      res.status(500).json({
        error: 'Failed to release escrow',
        details: xrplError.message,
      });
    }
  } catch (error) {
    console.error('Release shift error:', error);
    res.status(500).json({ error: 'Failed to release shift' });
  }
});

/**
 * GET /shifts/:id
 * Détails d'un shift
 */
router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { id } = req.params;

    const result = await pool.query(
      `SELECT ws.*,
              w.name as worker_name,
              w.xrpl_address as worker_xrpl_address,
              e.name as employer_name,
              e.xrpl_address as employer_xrpl_address
       FROM work_sessions ws
       JOIN users w ON ws.worker_id = w.id
       JOIN users e ON ws.employer_id = e.id
       WHERE ws.id = $1
       AND (ws.worker_id = $2 OR ws.employer_id = $2)`,
      [id, req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Shift not found' });
    }

    const shift = result.rows[0];

    res.json({
      id: shift.id,
      worker_name: shift.worker_name,
      worker_xrpl_address: shift.worker_xrpl_address,
      employer_name: shift.employer_name,
      employer_xrpl_address: shift.employer_xrpl_address,
      start_time: shift.start_time,
      end_time: shift.end_time,
      hours: shift.hours ? parseFloat(shift.hours) : null,
      hourly_rate: shift.hourly_rate ? parseFloat(shift.hourly_rate) : null,
      amount_total: shift.amount_total ? parseFloat(shift.amount_total) : null,
      status: shift.status,
      stt_start_text: shift.stt_start_text,
      stt_end_text: shift.stt_end_text,
      llm_structured_json: shift.llm_structured_json,
      xrpl_proposal_tx: shift.xrpl_proposal_tx,
      xrpl_nft_id: shift.xrpl_nft_id,
      xrpl_escrow_tx: shift.xrpl_escrow_tx,
      xrpl_payment_tx: shift.xrpl_payment_tx,
      created_at: shift.created_at,
      updated_at: shift.updated_at,
    });
  } catch (error) {
    console.error('Get shift error:', error);
    res.status(500).json({ error: 'Failed to get shift' });
  }
});

export default router;

