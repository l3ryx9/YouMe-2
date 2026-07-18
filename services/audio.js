import { appelerGeminiAvecAudio } from '../lib/gemini.js';
import { supabaseAdmin } from '../lib/supabaseAdmin.js';

// Devine le mimeType Gemini à partir de l'extension du fichier stocké
function mimeTypeDepuisExtension(extension) {
  const map = {
    mp3: 'audio/mp3', m4a: 'audio/mp4', wav: 'audio/wav',
    ogg: 'audio/ogg', aac: 'audio/aac', webm: 'audio/webm',
  };
  return map[(extension || '').toLowerCase()] || 'audio/mp4';
}

// Télécharge l'audio depuis storage_url (Supabase Storage) et le convertit en base64
async function telechargerAudioEnBase64(storageUrl) {
  const reponse = await fetch(storageUrl);
  const buffer = await reponse.arrayBuffer();
  return Buffer.from(buffer).toString('base64');
}

// Transcrit un message vocal ET analyse son ton émotionnel, à partir d'un message existant
// messageId : id du message dans la table "messages" (type = 'voice')
export async function analyserMessageVocal(messageId) {
  const { data: message } = await supabaseAdmin
    .from('messages')
    .select('id, conversation_id, sender_id, storage_url, extension')
    .eq('id', messageId)
    .single();

  if (!message?.storage_url) return null;

  const audioBase64 = await telechargerAudioEnBase64(message.storage_url);
  const mimeType = mimeTypeDepuisExtension(message.extension);

  const prompt = `Transcris ce message audio.
Analyse aussi le ton émotionnel (calme, énervé, triste, joyeux, etc.)
et l'intensité perçue dans la voix.
Réponds en JSON avec: transcription, emotion, intensite (1-10), notes.`;

  const analyse = await appelerGeminiAvecAudio(audioBase64, mimeType, prompt);

  // On réutilise la colonne ai_analysis déjà présente sur "messages"
  await supabaseAdmin
    .from('messages')
    .update({ ai_analysis: analyse })
    .eq('id', messageId);

  await enregistrerEmotion(message.conversation_id, message.sender_id, analyse);

  return analyse;
}

// Ajoute l'émotion détectée à l'historique du profil de personnalité
async function enregistrerEmotion(conversationId, personneId, resultatAnalyse) {
  const { data: profil } = await supabaseAdmin
    .from('profils_personnalite')
    .select('historique_emotions')
    .eq('conversation_id', conversationId)
    .eq('personne_id', personneId)
    .maybeSingle();

  const historique = profil?.historique_emotions || [];
  historique.push({
    emotion: resultatAnalyse.emotion,
    intensite: resultatAnalyse.intensite,
    date: new Date().toISOString(),
  });

  await supabaseAdmin
    .from('profils_personnalite')
    .upsert({
      conversation_id: conversationId,
      personne_id: personneId,
      historique_emotions: historique,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'conversation_id,personne_id' });
}
