import { supabaseAdmin } from '../lib/supabaseAdmin.js';

// Enregistre le consentement au moment de l'inscription (appelé côté serveur)
export async function enregistrerConsentement(userId, consentementIA) {
  if (!consentementIA) {
    throw new Error('Consentement IA requis pour créer un compte.');
  }

  const { error } = await supabaseAdmin.from('profiles').insert({
    id: userId,
    consentement_ia: true,
    consentement_ia_date: new Date().toISOString(),
  });

  if (error) throw error;
}

// Vérifie que les deux personnes ont toujours un consentement actif
// avant de lancer une analyse (à appeler avant chaque generation/analyse)
export async function peutAnalyser(personne1Id, personne2Id) {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id, consentement_ia, consentement_retire_le')
    .in('id', [personne1Id, personne2Id]);

  if (error) throw error;

  return data.every(p => p.consentement_ia === true && !p.consentement_retire_le);
}

// Permet à un utilisateur de retirer son consentement (RGPD)
export async function retirerConsentement(userId) {
  const { error } = await supabaseAdmin
    .from('profiles')
    .update({ consentement_retire_le: new Date().toISOString() })
    .eq('id', userId);

  if (error) throw error;
}
