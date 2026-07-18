/**
 * Analyse un message individuel (émotion, résumé, sujets, entités) via Gemini,
 * en remplacement de l'ancien AIOrchestrator (src/ai/memory/, IA locale supprimée).
 * Appelle Gemini via la Edge Function `gemini-proxy` — jamais de clé côté client.
 *
 * LIMITATION ACTUELLE : `gemini-proxy` n'accepte aujourd'hui qu'un prompt texte
 * (voir supabase/functions/gemini-proxy/index.ts, ProxyRequest.prompt: string).
 * Les messages vocaux ne sont donc PAS transcrits/analysés ici pour l'instant —
 * il faudrait étendre le proxy pour accepter un inlineData audio (base64) en plus
 * du prompt texte, comme fait côté backend Node.js dans lib/gemini.js /
 * appelerGeminiAvecAudio. Pas fait ici pour ne pas modifier une Edge Function
 * déployée sans validation explicite de votre part.
 */
import { appellerGeminiProxyJSON } from '@infrastructure/gemini/GeminiProxyClient';
import type { Message, AIAnalysisResult } from '@domain/entities/Message';

const PROMPT_ANALYSE_MESSAGE = `Analyse ce message de façon factuelle et nuancée, sans jugement.

Message : "{content}"

Réponds UNIQUEMENT en JSON, au format exact :
{
  "emotions": {"primary": "joy|sadness|anger|fear|surprise|disgust|neutral|love|optimism|pessimism", "primaryScore": 0.0, "label": "libellé court en français", "secondary": [{"emotion": "...", "score": 0.0}]},
  "summary": "résumé en une phrase, ou omis si le message est trop court",
  "topics": ["sujet1", "sujet2"],
  "entities": {
    "tasks": [{"value": "...", "citation": "...", "confidence": 0.0}],
    "persons": [{"value": "...", "citation": "...", "confidence": 0.0}]
  }
}
N'invente rien : si un champ ne s'applique pas (pas de tâche, pas de personne citée), renvoie un tableau vide.`;

export const aiMessageAnalyzer = {
  async analyzeMessageAsync(msg: Message, aiEnabled: boolean): Promise<AIAnalysisResult | null> {
    if (!aiEnabled) return null;

    // Messages vocaux : non gérés ici pour l'instant (voir limitation en tête de fichier).
    if (msg.type !== 'text' || !msg.content?.trim()) return null;

    try {
      const prompt = PROMPT_ANALYSE_MESSAGE.replace('{content}', msg.content);
      const data = await appellerGeminiProxyJSON<Omit<AIAnalysisResult, 'processedAt'>>(prompt, {
        generationConfig: { temperature: 0.2 },
      });
      return { ...data, processedAt: new Date() };
    } catch (err) {
      console.warn('[aiMessageAnalyzer] Analyse Gemini échouée :', err);
      return null;
    }
  },
};
