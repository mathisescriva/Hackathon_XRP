import { Client, Wallet, xrpToDrops, EscrowCreate, EscrowFinish, NFTokenMint, convertStringToHex, Payment } from 'xrpl';
import dotenv from 'dotenv';

dotenv.config();

import { XRPL_NETWORKS, XRPL_TESTNET_URL, XRPL_MAINNET_URL } from '../config/constants';

const NETWORK = process.env.XRPL_NETWORK || 'testnet';
const XRPL_NETWORKS_MAP = {
  testnet: XRPL_TESTNET_URL,
  mainnet: XRPL_MAINNET_URL,
};

let client: Client | null = null;

/**
 * Initialise la connexion XRPL
 */
export async function initXRPL(): Promise<Client> {
  if (client && client.isConnected()) {
    return client;
  }

  client = new Client(XRPL_NETWORKS_MAP[NETWORK as keyof typeof XRPL_NETWORKS_MAP] || XRPL_TESTNET_URL);
  await client.connect();
  console.log(`✅ Connected to XRPL ${NETWORK}`);
  return client;
}

/**
 * Crée un wallet depuis une seed
 */
export function getWalletFromSecret(secret: string): Wallet {
  return Wallet.fromSecret(secret);
}

/**
 * Active un compte XRPL en lui envoyant 10 XRP (minimum requis)
 */
export async function activateAccount(fromSecret: string, toAddress: string): Promise<void> {
  const xrplClient = await initXRPL();
  const wallet = getWalletFromSecret(fromSecret);

  try {
    // Vérifier si le compte existe déjà
    const accountInfo = await xrplClient.request({
      command: 'account_info',
      account: toAddress,
    });
    
    // Le compte existe, pas besoin d'activation
    console.log(`✅ Compte ${toAddress} déjà activé`);
    return;
  } catch (error: any) {
    // Si l'erreur est "actNotFound", le compte n'existe pas, on doit l'activer
    if (!error.message.includes('actNotFound') && !error.message.includes('not found')) {
      throw error;
    }
  }

  // Activer le compte en envoyant 10 XRP
  console.log(`🔧 Activation du compte ${toAddress}...`);
  
  const payment: Payment = {
    TransactionType: 'Payment',
    Account: wallet.address,
    Destination: toAddress,
    Amount: xrpToDrops(10), // 10 XRP pour activer
  };

  const prepared = await xrplClient.autofill(payment);
  const signed = wallet.sign(prepared);
  const result = await xrplClient.submitAndWait(signed.tx_blob);

  const transactionResult = typeof result.result.meta === 'object' && result.result.meta !== null
    ? (result.result.meta as any).TransactionResult
    : null;

  if (transactionResult !== 'tesSUCCESS') {
    throw new Error(`Account activation failed: ${transactionResult}`);
  }

  console.log(`✅ Compte ${toAddress} activé avec 10 XRP`);
}

/**
 * Crée un escrow pour un shift
 */
export async function createEscrow(
  fromSecret: string,
  toAddress: string,
  amountXRP: number,
  finishAfter?: number
): Promise<string> {
  const xrplClient = await initXRPL();
  const wallet = getWalletFromSecret(fromSecret);

  // Arrondir le montant à 6 décimales maximum (limite XRPL)
  const roundedAmount = Math.round(amountXRP * 1000000) / 1000000;
  if (roundedAmount !== amountXRP) {
    console.log(`⚠️  Montant arrondi de ${amountXRP} à ${roundedAmount} XRP (limite 6 décimales)`);
  }

  // Vérifier le solde avant toute opération
  const accountInfo = await xrplClient.request({
    command: 'account_info',
    account: wallet.address,
  });
  const balance = parseFloat(accountInfo.result.account_data.Balance) / 1000000;
  console.log(`💰 Solde actuel: ${balance} XRP`);

  // Activer le compte destination s'il n'est pas activé
  let activationNeeded = false;
  try {
    await xrplClient.request({
      command: 'account_info',
      account: toAddress,
    });
    console.log(`✅ Compte ${toAddress} déjà activé`);
  } catch (error: any) {
    if (error.message.includes('actNotFound') || error.message.includes('not found')) {
      activationNeeded = true;
      console.log(`🔧 Compte ${toAddress} doit être activé`);
    }
  }

  // Vérifier qu'on a assez de fonds (montant + activation si nécessaire + frais)
  const required = roundedAmount + (activationNeeded ? 10 : 0) + 5; // +5 pour frais
  if (balance < required) {
    throw new Error(`Insufficient XRP balance. Have: ${balance} XRP, Need: ${required} XRP (${roundedAmount} escrow + ${activationNeeded ? '10 activation + ' : ''}5 fees). Get test XRP from: https://xrpl.org/xrp-testnet-faucet.html`);
  }

  // Activer le compte si nécessaire
  if (activationNeeded) {
    try {
      await activateAccount(fromSecret, toAddress);
    } catch (error: any) {
      console.warn('⚠️  Impossible d\'activer le compte, continuons quand même:', error.message);
      // On continue, peut-être que le compte est déjà activé maintenant
    }
  }

  const finishAfterTime = finishAfter || Math.floor(Date.now() / 1000) + 86400; // 24h par défaut

  const escrowCreate: EscrowCreate = {
    TransactionType: 'EscrowCreate',
    Account: wallet.address,
    Amount: xrpToDrops(roundedAmount),
    Destination: toAddress,
    FinishAfter: finishAfterTime,
  };

  try {
    console.log('🔍 Création escrow XRPL...');
    console.log('   From:', wallet.address);
    console.log('   To:', toAddress);
    console.log('   Amount:', roundedAmount, 'XRP');
    
    const prepared = await xrplClient.autofill(escrowCreate);
    const signed = wallet.sign(prepared);
    const result = await xrplClient.submitAndWait(signed.tx_blob);

    const transactionResult = typeof result.result.meta === 'object' && result.result.meta !== null
      ? (result.result.meta as any).TransactionResult
      : null;

    if (transactionResult !== 'tesSUCCESS') {
      const errorCode = transactionResult || 'Unknown';
      console.error('❌ Escrow failed:', errorCode);
      console.error('   Full result:', JSON.stringify(result.result, null, 2));
      
      let errorMsg = `Escrow creation failed: ${errorCode}`;
      
      if (errorCode.includes('tecUNFUNDED') || errorCode.includes('insufficient')) {
        errorMsg = 'Insufficient XRP balance. Get test XRP from: https://xrpl.org/xrp-testnet-faucet.html';
      } else if (errorCode.includes('tecDST_TAG_NEEDED')) {
        errorMsg = 'Destination tag required for this address';
      } else if (errorCode.includes('tecNO_DST')) {
        errorMsg = 'Destination account does not exist or is not activated';
      }
      
      throw new Error(errorMsg);
    }
    
    console.log('✅ Escrow créé:', result.result.hash);
    return result.result.hash || '';
  } catch (error: any) {
    console.error('❌ Erreur création escrow:', error);
    if (error.message.includes('Insufficient') || error.message.includes('tecUNFUNDED')) {
      throw new Error('Insufficient XRP balance. Get test XRP from: https://xrpl.org/xrp-testnet-faucet.html');
    }
    throw error;
  }
}

/**
 * Finalise un escrow (release du paiement)
 */
export async function finishEscrow(
  ownerSecret: string,
  ownerAddress: string,
  escrowSequence: number
): Promise<string> {
  const xrplClient = await initXRPL();
  const wallet = getWalletFromSecret(ownerSecret);

  // Vérifier que le wallet correspond au owner
  if (wallet.address !== ownerAddress) {
    throw new Error(`Wallet address mismatch: wallet is ${wallet.address} but owner is ${ownerAddress}`);
  }

  // S'assurer que escrowSequence est un nombre
  const sequenceNumber = typeof escrowSequence === 'string' ? parseInt(escrowSequence, 10) : Number(escrowSequence);
  
  if (isNaN(sequenceNumber) || sequenceNumber <= 0) {
    throw new Error(`Invalid escrow sequence: ${escrowSequence} (type: ${typeof escrowSequence})`);
  }

  console.log('🔍 Finalisation escrow:');
  console.log('   Account (qui signe):', wallet.address);
  console.log('   Owner (créateur escrow):', ownerAddress);
  console.log('   OfferSequence (original):', escrowSequence, '(type:', typeof escrowSequence, ')');
  console.log('   OfferSequence (converted):', sequenceNumber, '(type:', typeof sequenceNumber, ')');
  
  // Pour EscrowFinish:
  // - Account: le compte qui signe la transaction (doit être le créateur de l'escrow)
  // - Owner: optionnel si Account == Owner, mais on le met pour être explicite
  // - OfferSequence: le Sequence de la transaction EscrowCreate
  const escrowFinish: EscrowFinish = {
    TransactionType: 'EscrowFinish',
    Account: wallet.address, // Le compte qui signe (doit être le créateur)
    Owner: wallet.address,  // Doit être exactement le même que Account
    OfferSequence: sequenceNumber, // S'assurer que c'est un nombre
  };

  const prepared = await xrplClient.autofill(escrowFinish);
  const signed = wallet.sign(prepared);
  const result = await xrplClient.submitAndWait(signed.tx_blob);

  const transactionResult = typeof result.result.meta === 'object' && result.result.meta !== null
    ? (result.result.meta as any).TransactionResult
    : null;

  if (transactionResult !== 'tesSUCCESS') {
    const errorCode = transactionResult || 'Unknown error';
    console.error('❌ Escrow finish failed:', errorCode);
    console.error('   Full result:', JSON.stringify(result.result, null, 2));
    
    let errorMsg = `Escrow finish failed: ${errorCode}`;
    
    if (errorCode.includes('tecNO_TARGET')) {
      errorMsg = 'Escrow not found. Le sequence fourni est incorrect ou l\'escrow a déjà été finalisé.';
    } else if (errorCode.includes('tecNO_PERMISSION')) {
      errorMsg = 'Permission denied. Vous n\'avez pas le droit de finaliser cet escrow.';
    } else if (errorCode.includes('tecNO_ENTRY')) {
      errorMsg = 'Escrow entry not found. L\'escrow n\'existe plus ou a été annulé.';
    }
    
    throw new Error(errorMsg);
  }

  return result.result.hash || '';
}

/**
 * Mint un NFT pour un shift
 */
export async function mintShiftNFT(
  ownerSecret: string,
  metadata: {
    shift_id: string;
    worker_id: string;
    employer_id: string;
    hours: number;
    amount: number;
    job_type?: string;
  }
): Promise<string> {
  const xrplClient = await initXRPL();
  const wallet = getWalletFromSecret(ownerSecret);

  // Encoder les métadonnées en JSON (en production, utiliser IPFS)
  const metadataJson = JSON.stringify(metadata);
  const metadataHex = convertStringToHex(metadataJson);

  const nftMint: NFTokenMint = {
    TransactionType: 'NFTokenMint',
    Account: wallet.address,
    NFTokenTaxon: 0, // Taxon pour catégoriser les NFTs
    URI: metadataHex, // Métadonnées encodées (limite 256 bytes, donc utiliser IPFS en production)
    Flags: 8, // Transferable
  };

  try {
    console.log('🔍 Mint NFT XRPL...');
    
    const prepared = await xrplClient.autofill(nftMint);
    const signed = wallet.sign(prepared);
    const result = await xrplClient.submitAndWait(signed.tx_blob);

    const transactionResult = typeof result.result.meta === 'object' && result.result.meta !== null
      ? (result.result.meta as any).TransactionResult
      : null;

    if (transactionResult !== 'tesSUCCESS') {
      const errorCode = transactionResult || 'Unknown';
      console.error('❌ NFT mint failed:', errorCode);
      console.error('   Full result:', JSON.stringify(result.result, null, 2));
      
      let errorMsg = `NFT mint failed: ${errorCode}`;
      
      if (errorCode.includes('tecUNFUNDED') || errorCode.includes('insufficient')) {
        errorMsg = 'Insufficient XRP balance. Get test XRP from: https://xrpl.org/xrp-testnet-faucet.html';
      }
      
      throw new Error(errorMsg);
    }

    // Extraire le NFT ID depuis les métadonnées de la transaction
    const meta = typeof result.result.meta === 'object' && result.result.meta !== null
      ? (result.result.meta as any)
      : {};
    const nftId = meta.nftoken_id || '';
    
    console.log('✅ NFT minté:', nftId);
    return nftId;
  } catch (error: any) {
    console.error('❌ Erreur mint NFT:', error);
    throw error;
  }
}

/**
 * Récupère les informations d'un escrow
 */
export async function getEscrowInfo(ownerAddress: string): Promise<any[]> {
  const xrplClient = await initXRPL();
  
  try {
    // Vérifier d'abord que le compte existe
    await xrplClient.request({
      command: 'account_info',
      account: ownerAddress,
    });
  } catch (error: any) {
    if (error.message.includes('actNotFound') || error.message.includes('not found')) {
      console.error(`❌ Compte ${ownerAddress} non trouvé ou non activé`);
      throw new Error(`Account not found: ${ownerAddress}`);
    }
    throw error;
  }
  
  const response = await xrplClient.request({
    command: 'account_objects',
    account: ownerAddress,
    type: 'escrow',
  });

  const escrows = response.result.account_objects || [];
  console.log('📋 Escrows récupérés:', escrows.length);
  if (escrows.length > 0) {
    console.log('📋 Structure du premier escrow:', JSON.stringify(escrows[0], null, 2));
  }
  
  return escrows;
}

/**
 * Ferme la connexion XRPL
 */
export async function closeXRPL(): Promise<void> {
  if (client && client.isConnected()) {
    await client.disconnect();
    client = null;
  }
}

