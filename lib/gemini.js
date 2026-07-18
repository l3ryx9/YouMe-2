// ============================================
// INSTRUCTIONS DE CONFIGURATION
// ============================================
// 1. Créez votre clé sur https://aistudio.google.com/apikey (compte Google, aucun
//    projet GCP à configurer manuellement, aucun service account).
// 2. Définissez-la selon votre environnement :
//      - Node.js/Next.js  → dans .env.local : GEMINI_API_KEY=votre_cle
//      - Supabase Edge Function (Deno) → `supabase secrets set GEMINI_API_KEY=votre_cle`
// 3. Rien d'autre à installer : ce fichier utilise fetch() nativement,
//    disponible aussi bien en Node.js (18+) qu'en Deno.
// ============================================

const GEMINI_API_KEY =
  (typeof process !== 'undefined' && process.env?.GEMINI_API_KEY) ||
  (typeof Deno !== 'undefined' && Deno.env.get('GEMINI_API_KEY'));

if (!GEMINI_API_KEY) {
  throw new Error('GEMINI_API_KEY manquante — voir les instructions en haut de lib/gemini.js');
}

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

const lireVariable = (nom) =>
  (typeof process !== 'undefined' && process.env?.[nom]) ||
  (typeof Deno !== 'undefined' && Deno.env.get(nom));

export const NOMS_MODELES = {
  principal: lireVariable('GEMINI_MODEL_PRINCIPAL') || 'gemini-3.5-flash',
  leger: lireVariable('GEMINI_MODEL_LEGER') || 'gemini-3.1-flash-lite',
};

// Appel brut à l'API Gemini — retourne la réponse complète (utile pour le function calling)
async function appelerModele(nomModele, contents, tools) {
  const url = `${BASE_URL}/${nomModele}:generateContent?key=${GEMINI_API_KEY}`;
  const body = tools ? { contents, tools } : { contents };

  const reponse = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!reponse.ok) {
    throw new Error(`Erreur Gemini API (${reponse.status}): ${await reponse.text()}`);
  }
  return reponse.json();
}

// Génère du texte à partir d'un contenu multi-tours déjà construit
// (utile quand vous avez besoin de garder l'accès aux candidates bruts, ex: function calling)
export async function genererDepuisContenus(contents, nomModele = NOMS_MODELES.principal, tools) {
  return appelerModele(nomModele, contents, tools);
}

// Génère du texte simple à partir d'un prompt unique
export async function genererTexte(prompt, nomModele = NOMS_MODELES.principal) {
  const data = await appelerModele(nomModele, [{ role: 'user', parts: [{ text: prompt }] }]);
  return data.candidates[0].content.parts.map(p => p.text).join('');
}

// Génère du texte et parse directement le JSON attendu
export async function appelerGeminiJSON(prompt, nomModele = NOMS_MODELES.principal) {
  const texte = await genererTexte(prompt, nomModele);
  return JSON.parse(texte);
}

// Envoie un audio + un prompt, parse la réponse JSON attendue (transcription + émotion)
export async function appelerGeminiAvecAudio(audioBase64, mimeType, promptTexte, nomModele = NOMS_MODELES.principal) {
  const data = await appelerModele(nomModele, [{
    role: 'user',
    parts: [
      { inlineData: { mimeType, data: audioBase64 } },
      { text: promptTexte },
    ],
  }]);
  const texte = data.candidates[0].content.parts.map(p => p.text).join('');
  return JSON.parse(texte);
}
