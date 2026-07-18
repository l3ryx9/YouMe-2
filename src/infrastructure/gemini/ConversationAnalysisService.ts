/**
 * Analyse de conversation (scores, red/green flags, résumé, conseils) via Gemini,
 * en remplacement de l'ancien LLM local (Qwen 0.5B on-device, src/ai/analysis/).
 * Appelle Gemini via la Edge Function `gemini-proxy` — jamais de clé côté client.
 */
import { appellerGeminiProxy, appellerGeminiProxyJSON } from '@infrastructure/gemini/GeminiProxyClient';

export interface AnalysisFlag {
  texte: string;
  severite?: string;
  contexte: string;
}

export interface AnalysisResult {
  isAI: boolean;
  scores: {
    global: number;
    respect: number;
    empathie: number;
    honnetete: number;
    limites: number;
    positivite: number;
  };
  redFlags: AnalysisFlag[];
  greenFlags: AnalysisFlag[];
  resume: string;
}

interface AnalysisInputMessage {
  content?: string;
  senderId: string;
}

function formaterMessages(messages: AnalysisInputMessage[], userId: string): string {
  return messages
    .filter((m) => (m.content ?? '').trim())
    .map((m) => `${m.senderId === userId ? 'Utilisateur' : 'Partenaire'}: ${m.content}`)
    .join('\n');
}

const PROMPT_ANALYSE = `Tu analyses une conversation de couple de façon factuelle et nuancée. Ne pose jamais de diagnostic clinique, décris des comportements observables.

Messages :
{messages}

Réponds UNIQUEMENT en JSON, au format exact :
{
  "scores": {"global": 0, "respect": 0, "empathie": 0, "honnetete": 0, "limites": 0, "positivite": 0},
  "redFlags": [{"texte": "...", "severite": "faible|modéré|élevé", "contexte": "..."}],
  "greenFlags": [{"texte": "...", "contexte": "..."}],
  "resume": "résumé factuel en 2-3 phrases"
}
Tous les scores sont entre 0 et 100.`;

export async function analyzeConversation(
  messages: AnalysisInputMessage[],
  userId: string
): Promise<AnalysisResult> {
  const prompt = PROMPT_ANALYSE.replace('{messages}', formaterMessages(messages, userId));
  const data = await appellerGeminiProxyJSON<Omit<AnalysisResult, 'isAI'>>(prompt, {
    generationConfig: { temperature: 0.3 },
  });
  return { ...data, isAI: true };
}

const PROMPT_CONSEILS = `Tu es un assistant bienveillant qui aide un couple à mieux communiquer. À partir de cette conversation, donne 3 à 5 conseils concrets et bienveillants pour améliorer la communication — jamais de jugement sur l'une ou l'autre personne, uniquement des pistes constructives.

Messages :
{messages}

Réponds en texte simple (pas de JSON), en français, sous forme de conseils courts et actionnables.`;

export async function analyzeConflict(
  messages: AnalysisInputMessage[],
  userId: string
): Promise<string> {
  const prompt = PROMPT_CONSEILS.replace('{messages}', formaterMessages(messages, userId));
  return appellerGeminiProxy(prompt, { generationConfig: { temperature: 0.5 } });
}
