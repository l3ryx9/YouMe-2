/**
 * Couleur associée à chaque émotion détectée (par Gemini côté serveur).
 * Remplace l'ancien `emotionService.getEmotionColor` de l'IA locale supprimée.
 */
const EMOTION_COLORS: Record<string, string> = {
  joy: '#F5A623',
  sadness: '#4A90D9',
  anger: '#D0021B',
  fear: '#7B61FF',
  surprise: '#F8E71C',
  disgust: '#417505',
  neutral: '#9B9B9B',
  love: '#E91E63',
  optimism: '#50E3C2',
  pessimism: '#8B6F47',
};

export function getEmotionColor(emotion: string): string {
  return EMOTION_COLORS[emotion] ?? '#9B9B9B';
}
