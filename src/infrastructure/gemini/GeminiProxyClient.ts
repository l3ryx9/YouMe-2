/**
 * Client pour la Edge Function `gemini-proxy` (voir supabase/functions/gemini-proxy).
 * Remplace tout appel direct à l'API Gemini depuis le client — la clé API
 * reste côté serveur, jamais dans le bundle Expo.
 */
import { supabase } from '@infrastructure/supabase/config';

interface AppelerGeminiOptions {
  generationConfig?: Record<string, unknown>;
}

/**
 * Envoie un prompt au proxy et retourne le texte généré.
 * Lève une erreur si le proxy répond une erreur (auth, rate limit, Gemini down...).
 */
export async function appellerGeminiProxy(prompt: string, options?: AppelerGeminiOptions): Promise<string> {
  const { data, error } = await supabase.functions.invoke('gemini-proxy', {
    body: {
      prompt,
      generationConfig: options?.generationConfig ?? {},
    },
  });

  if (error) throw error;
  if (data?.error) throw new Error(data.error);

  const texte = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('');
  if (!texte) throw new Error('Réponse Gemini vide ou inattendue.');
  return texte;
}

/** Comme appellerGeminiProxy, mais parse directement la réponse comme JSON. */
export async function appellerGeminiProxyJSON<T = unknown>(prompt: string, options?: AppelerGeminiOptions): Promise<T> {
  const texte = await appellerGeminiProxy(prompt, options);
  // Gemini renvoie parfois le JSON entouré de ```json ... ``` malgré la consigne — on nettoie par sécurité.
  const nettoye = texte.replace(/^```json\s*|```$/g, '').trim();
  return JSON.parse(nettoye) as T;
}

/** Le proxy est toujours "disponible" côté client : la clé vit sur le serveur, pas de config locale requise. */
export function geminiProxyDisponible(): boolean {
  return true;
}
