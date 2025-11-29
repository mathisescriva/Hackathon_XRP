import { AssemblyAI } from 'assemblyai';
import dotenv from 'dotenv';

dotenv.config();

const client = new AssemblyAI({
  apiKey: process.env.ASSEMBLYAI_API_KEY || '',
});

/**
 * Transcrit un fichier audio en texte
 */
export async function transcribeAudio(fileBuffer: Buffer): Promise<string> {
  try {
    console.log('📤 [AssemblyAI] Upload fichier...');
    console.log('📦 [AssemblyAI] Taille buffer:', fileBuffer.length, 'bytes');
    
    // Upload du fichier
    const uploadUrl = await client.files.upload(fileBuffer);
    console.log('✅ [AssemblyAI] Fichier uploadé:', uploadUrl);
    
    // Créer la transcription
    console.log('🔄 [AssemblyAI] Création transcription...');
    const transcript = await client.transcripts.create({
      audio_url: uploadUrl,
      language_code: 'fr', // Français par défaut, peut être configuré
    });
    console.log('📋 [AssemblyAI] Transcript ID:', transcript.id);
    console.log('📊 [AssemblyAI] Status initial:', transcript.status);
    
    // Poller jusqu'à ce que la transcription soit terminée
    let transcriptResult = await client.transcripts.get(transcript.id);
    let pollCount = 0;
    const maxPolls = 60; // Maximum 60 secondes
    
    while ((transcriptResult.status === 'queued' || transcriptResult.status === 'processing') && pollCount < maxPolls) {
      pollCount++;
      console.log(`⏳ [AssemblyAI] Polling (${pollCount}/${maxPolls})... Status: ${transcriptResult.status}`);
      await new Promise(resolve => setTimeout(resolve, 1000)); // Attendre 1 seconde
      transcriptResult = await client.transcripts.get(transcript.id);
    }
    
    console.log('📊 [AssemblyAI] Status final:', transcriptResult.status);
    
    if (transcriptResult.status === 'error') {
      console.error('❌ [AssemblyAI] Erreur:', transcriptResult.error);
      throw new Error(`Transcription failed: ${transcriptResult.error}`);
    }
    
    if (pollCount >= maxPolls) {
      console.warn('⚠️ [AssemblyAI] Timeout après', maxPolls, 'secondes');
      throw new Error('Transcription timeout');
    }
    
    const transcriptionText = transcriptResult.text || '';
    console.log('✅ [AssemblyAI] Transcription complète !');
    console.log('📝 [AssemblyAI] Texte:', transcriptionText);
    console.log('📏 [AssemblyAI] Longueur:', transcriptionText.length, 'caractères');
    
    if (!transcriptionText || transcriptionText.trim().length === 0) {
      console.warn('⚠️ [AssemblyAI] ATTENTION: Transcription vide !');
      console.warn('⚠️ [AssemblyAI] Status:', transcriptResult.status);
      console.warn('⚠️ [AssemblyAI] Résultat complet:', JSON.stringify(transcriptResult, null, 2));
    }
    
    return transcriptionText;
  } catch (error) {
    console.error('❌ [AssemblyAI] Erreur complète:', error);
    console.error('❌ [AssemblyAI] Stack:', error instanceof Error ? error.stack : 'N/A');
    throw new Error(`Failed to transcribe audio: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
