/**
 * Analyse red flags / green flags d'une conversation via Gemini
 * (remplace l'ancien src/ai/inconsistency/GeminiFlagAnalysis, supprimé avec l'IA locale).
 * Appelle Gemini via la Edge Function `gemini-proxy` — jamais de clé côté client.
 */
import { appellerGeminiProxyJSON, geminiProxyDisponible } from '@infrastructure/gemini/GeminiProxyClient';
import type { FlagAnalysisResult, RelationshipFlag } from '@domain/entities/Memory';
import type { Message } from '@domain/entities/Message';

const MIN_MESSAGES = 5;

const PROMPT_TEMPLATE = `Tu analyses une conversation entre deux personnes en couple/relation : {userLabel} et {partnerName}.

RÈGLES STRICTES :
- Base-toi UNIQUEMENT sur ce qui est écrit, jamais sur des suppositions
- N'invente jamais d'intention non exprimée
- Un désaccord, une émotion négative ou un ton direct n'est PAS automatiquement un "red flag"
- Distingue un comportement ponctuel (contexte, fatigue, stress) d'un pattern répété
- N'utilise jamais de vocabulaire clinique/diagnostic (pas de "narcissique", "toxique", "manipulateur") — décris des comportements observables
- Chaque flag doit citer un extrait exact du message qui le justifie

Messages (du plus ancien au plus récent) :
{messages}

Réponds UNIQUEMENT en JSON, sans texte autour, au format exact :
{
  "redFlags": [{"category": "...", "severity": "faible|modéré|élevé", "citation": "...", "sender": "...", "explanation": "...", "confidence": 0.0}],
  "greenFlags": [{"category": "...", "severity": "faible|modéré|élevé", "citation": "...", "sender": "...", "explanation": "...", "confidence": 0.0}],
  "balanceScore": 0,
  "climateLabel": "...",
  "summary": "1-2 phrases factuelles",
  "facts": ["..."],
  "interpretations": ["..."]
}`;

function formaterMessages(messages: Message[], userId: string, userLabel: string, partnerName: string): string {
  return messages
    .filter((m) => !m.isDeleted && (m.content ?? '').trim())
    .map((m) => `${m.senderId === userId ? userLabel : partnerName}: ${m.content}`)
    .join('\n');
}

export const geminiFlagModule = {
  isAvailable(): boolean {
    return geminiProxyDisponible();
  },

  async analyzeFlags(
    messages: Message[],
    userId: string,
    partnerName: string
  ): Promise<FlagAnalysisResult | null> {
    const messagesUtilisables = messages.filter((m) => !m.isDeleted && (m.content ?? '').trim());
    if (messagesUtilisables.length < MIN_MESSAGES) return null;

    const prompt = PROMPT_TEMPLATE
      .replace('{userLabel}', 'vous')
      .replace(/{partnerName}/g, partnerName)
      .replace('{messages}', formaterMessages(messagesUtilisables, userId, 'vous', partnerName));

    type ReponseBrute = {
      redFlags: Array<Omit<RelationshipFlag, 'type'>>;
      greenFlags: Array<Omit<RelationshipFlag, 'type'>>;
      balanceScore: number;
      climateLabel: string;
      summary: string;
      facts: string[];
      interpretations: string[];
    };

    const data = await appellerGeminiProxyJSON<ReponseBrute>(prompt, {
      generationConfig: { temperature: 0.3 },
    });

    return {
      redFlags: data.redFlags.map((f) => ({ ...f, type: 'red' as const })),
      greenFlags: data.greenFlags.map((f) => ({ ...f, type: 'green' as const })),
      balanceScore: data.balanceScore,
      climateLabel: data.climateLabel,
      summary: data.summary,
      facts: data.facts ?? [],
      interpretations: data.interpretations ?? [],
      messageCount: messagesUtilisables.length,
      analyzedAt: new Date(),
    };
  },
};
