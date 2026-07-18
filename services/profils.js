import { supabaseAdmin } from '../lib/supabaseAdmin.js';
import { model, appelerGeminiJSON } from '../lib/gemini.js';

// Récupère les profils de personnalité connus pour une conversation
export async function getProfils(conversationId) {
  const { data, error } = await supabaseAdmin
    .from('profils_personnalite')
    .select('*')
    .eq('conversation_id', conversationId);

  if (error) throw error;
  return data;
}

// Génère une réponse de l'agent en tenant compte des profils connus
export async function genererReponse(conversationId, historique) {
  const profils = await getProfils(conversationId);
  const contexte = `Profils connus des participants: ${JSON.stringify(profils)}`;

  const result = await model.generateContent({
    contents: [
      { role: 'user', parts: [{ text: contexte }] },
      ...historique,
    ],
  });

  return result.response.candidates[0].content.parts[0].text;
}

// Met à jour le profil de personnalité d'une personne après un nouveau message texte
// messageId : id du message dans la table "messages"
export async function mettreAJourProfil(messageId) {
  const { data: message } = await supabaseAdmin
    .from('messages')
    .select('conversation_id, sender_id, content')
    .eq('id', messageId)
    .single();

  if (!message?.content) return null; // rien à analyser (message vocal/image sans texte)

  const { conversation_id, sender_id, content } = message;

  const { data: profilActuel } = await supabaseAdmin
    .from('profils_personnalite')
    .select('*')
    .eq('conversation_id', conversation_id)
    .eq('personne_id', sender_id)
    .maybeSingle();

  const prompt = `Profil actuel: ${JSON.stringify(profilActuel || {})}
Nouveau message: "${content}"
Renvoie UNIQUEMENT un JSON mis à jour avec: traits, ton, sujets_recurrents.`;

  const nouveauProfil = await appelerGeminiJSON(prompt);

  const { error } = await supabaseAdmin
    .from('profils_personnalite')
    .upsert({
      conversation_id,
      personne_id: sender_id,
      traits: nouveauProfil.traits,
      ton: nouveauProfil.ton,
      sujets_recurrents: nouveauProfil.sujets_recurrents,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'conversation_id,personne_id' });

  if (error) throw error;
  return nouveauProfil;
}
