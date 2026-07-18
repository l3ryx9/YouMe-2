import { supabaseAdmin } from '../lib/supabaseAdmin.js';
import { appelerGeminiJSON } from '../lib/gemini.js';
import { peutAnalyser } from './consentement.js';

const PROMPT_ANALYSE = `Tu analyses les 10 derniers messages d'une personne dans une conversation de couple/relation.

RÈGLES STRICTES :
- Base-toi UNIQUEMENT sur ce qui est écrit, jamais sur des suppositions
- N'invente jamais d'intention non exprimée
- Un désaccord, une émotion négative ou un ton direct n'est PAS automatiquement un "red flag"
- Distingue un comportement ponctuel (contexte, fatigue, stress) d'un pattern répété
- Si les données sont insuffisantes pour conclure, dis-le plutôt que d'inventer
- N'utilise jamais de vocabulaire clinique/diagnostic (pas de "narcissique", "toxique", "manipulateur") — décris des comportements observables, pas des étiquettes de personnalité

Messages à analyser :
{messages}

Réponds en JSON :
{
  "comportements_positifs": [{"categorie": "...", "description": "...", "extrait": "...", "confiance": "faible|moyenne|forte"}],
  "comportements_negatifs": [{"categorie": "...", "description": "...", "extrait": "...", "confiance": "faible|moyenne|forte"}],
  "score_redflag_delta": -5,
  "score_greenflag_delta": 5,
  "resume_court": "1-2 phrases factuelles"
}`;

// Appelée après l'insertion d'un nouveau message (par votre code d'envoi de message existant)
// messageId : id du message qui vient d'être inséré dans la table "messages"
export async function onNouveauMessage(messageId) {
  const { data: message } = await supabaseAdmin
    .from('messages')
    .select('conversation_id, sender_id, receiver_id')
    .eq('id', messageId)
    .single();

  if (!message) return;

  const { conversation_id, sender_id, receiver_id } = message;

  const { data: compteur } = await supabaseAdmin
    .from('compteurs_conversation')
    .upsert({ conversation_id }, { onConflict: 'conversation_id' })
    .select()
    .single();

  const nouveauTotal = (compteur?.total_messages || 0) + 1;
  await supabaseAdmin
    .from('compteurs_conversation')
    .update({ total_messages: nouveauTotal })
    .eq('conversation_id', conversation_id);

  if (nouveauTotal % 10 === 0) {
    const consentementOk = await peutAnalyser(sender_id, receiver_id);
    if (consentementOk) {
      await analyserEtMettreAJourScore(conversation_id, sender_id);
    }
  }
}

async function analyserEtMettreAJourScore(conversationId, personneId) {
  const { data: derniersMessages } = await supabaseAdmin
    .from('messages')
    .select('content')
    .eq('conversation_id', conversationId)
    .eq('sender_id', personneId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: false })
    .limit(10);

  const texteMessages = derniersMessages.map(m => m.content).filter(Boolean).join('\n');
  if (!texteMessages) return; // rien à analyser (que des messages vocaux/images sans texte)

  const prompt = PROMPT_ANALYSE.replace('{messages}', texteMessages);
  const analyse = await appelerGeminiJSON(prompt);

  const nouveauxComportements = [
    ...analyse.comportements_positifs.map(c => ({ ...c, type: 'positif' })),
    ...analyse.comportements_negatifs.map(c => ({ ...c, type: 'negatif' })),
  ].map(c => ({
    conversation_id: conversationId,
    personne_id: personneId,
    type: c.type,
    categorie: c.categorie,
    description: c.description,
    extrait_message: c.extrait,
    confiance: c.confiance,
  }));

  if (nouveauxComportements.length > 0) {
    await supabaseAdmin.from('comportements').insert(nouveauxComportements);
  }

  const { data: scoreActuel } = await supabaseAdmin
    .from('scores_relationnels')
    .select('*')
    .eq('conversation_id', conversationId)
    .eq('personne_id', personneId)
    .maybeSingle();

  const nouveauRedflag = Math.max(0, Math.min(100,
    (scoreActuel?.score_redflag || 0) + analyse.score_redflag_delta));
  const nouveauGreenflag = Math.max(0, Math.min(100,
    (scoreActuel?.score_greenflag || 0) + analyse.score_greenflag_delta));

  await supabaseAdmin.from('scores_relationnels').upsert({
    conversation_id: conversationId,
    personne_id: personneId,
    score_redflag: nouveauRedflag,
    score_greenflag: nouveauGreenflag,
    resume: analyse.resume_court,
    nb_messages_analyses: (scoreActuel?.nb_messages_analyses || 0) + 10,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'conversation_id,personne_id' });
}

// Pour l'onglet IA : récupère toutes les données d'analyse d'une conversation
export async function getAnalysePsychologique(conversationId) {
  const { data: scores } = await supabaseAdmin
    .from('scores_relationnels')
    .select('*')
    .eq('conversation_id', conversationId);

  const { data: comportements } = await supabaseAdmin
    .from('comportements')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(50);

  return { scores, comportements };
}
