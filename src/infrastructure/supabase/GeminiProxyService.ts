/**
 * GeminiProxyService
 *
 * Client léger pour la Edge Function `gemini-proxy`. Remplace les appels
 * directs des modules IA vers l'API Gemini (generativelanguage.googleapis.com)
 * qui embarquaient la clé API dans le bundle client via
 * `EXPO_PUBLIC_GEMINI_API_KEY` — extractible par quiconque décompile l'app.
 *
 * La clé et le choix du modèle vivent désormais uniquement côté serveur
 * (voir supabase/functions/gemini-proxy). Le client n'envoie qu'un prompt
 * et une config de génération, et reçoit la réponse brute de l'API Gemini
 * en retour (même forme qu'avant), pour que le parsing existant dans
 * chaque module IA (candidates[0].content.parts[0].text) reste inchangé.
 *
 * Politique de repli : si l'appel échoue (function down, pas de session,
 * quota dépassé), on retourne null — chaque module IA appelant sait déjà
 * basculer sur son fallback local/heuristique dans ce cas.
 */
import { supabase } from './config';
import { logError } from '@shared/utils/logger';

export interface GeminiGenerateParams {
  prompt: string;
  generationConfig?: Record<string, unknown>;
  safetySettings?: Array<{ category: string; threshold: string }>;
}

/** Forme de la réponse brute de l'API Gemini (generateContent). */
export interface GeminiRawResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
}

class GeminiProxyService {
  /**
   * Appelle Gemini via l'Edge Function serveur.
   * Retourne null si indisponible (session absente, fonction en panne,
   * rate limit serveur dépassé, erreur API) — jamais d'exception propagée.
   */
  async generateContent(params: GeminiGenerateParams): Promise<GeminiRawResponse | null> {
    try {
      const { data, error } = await supabase.functions.invoke('gemini-proxy', {
        body: params,
      });

      if (error) {
        logError('GeminiProxyService.generateContent', error);
        return null;
      }

      if (data?.error) {
        // Erreur structurée renvoyée par la fonction (ex: rate_limited,
        // gemini_error) — pas une exception réseau, mais pas un succès non plus.
        logError('GeminiProxyService.generateContent', new Error(String(data.error)));
        return null;
      }

      return data as GeminiRawResponse;
    } catch (err: any) {
      logError('GeminiProxyService.generateContent', err);
      return null;
    }
  }
}

export const geminiProxyService = new GeminiProxyService();
