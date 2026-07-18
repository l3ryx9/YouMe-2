/**
 * Chat libre avec Gemini — pour le bouton "IA" flottant du chat (poser une
 * question quelconque, indépendamment de l'analyse de la conversation).
 * Éphémère : pas de persistance en base, l'historique ne vit que dans la
 * fenêtre ouverte (React state), au contraire des analyses automatiques
 * (flags, profil psychologique) qui elles sont sauvegardées.
 */
import { appellerGeminiProxy } from './GeminiProxyClient';

export interface GeminiChatTurn {
  role: 'user' | 'assistant';
  text: string;
}

const SYSTEM_PROMPT = `Tu es un assistant bienveillant intégré à une application de couple (YouMe). Réponds de façon claire, concise et chaleureuse, en français. Tu peux aider sur toutes sortes de questions (conseils de couple, organisation, culture générale, etc.). Reste toujours respectueux et évite tout jugement.`;

/**
 * Envoie une question à Gemini avec l'historique de la fenêtre en contexte.
 * `appellerGeminiProxy` ne prend qu'un prompt texte unique (pas de vrai
 * multi-tour côté API) : on reconstruit donc l'historique sous forme de
 * texte à chaque appel — suffisant pour une fenêtre de questions/réponses
 * courte comme celle-ci.
 */
export async function poserQuestionGemini(historique: GeminiChatTurn[], question: string): Promise<string> {
  const contexte = historique
    .map((t) => `${t.role === 'user' ? 'Utilisateur' : 'Assistant'} : ${t.text}`)
    .join('\n');

  const prompt = contexte
    ? `${SYSTEM_PROMPT}\n\nConversation précédente :\n${contexte}\n\nNouvelle question de l'utilisateur : ${question}\n\nRéponds uniquement à cette nouvelle question, en tenant compte du contexte ci-dessus.`
    : `${SYSTEM_PROMPT}\n\nQuestion de l'utilisateur : ${question}`;

  return appellerGeminiProxy(prompt);
}
