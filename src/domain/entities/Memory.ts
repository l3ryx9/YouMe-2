/**
 * Entité domaine : Mémoire IA
 * Représente les données mémorisées par le système IA local.
 */
export type MemoryCategory =
  | 'topic'
  | 'person'
  | 'location'
  | 'event'
  | 'date'
  | 'preference'
  | 'concern'
  | 'goal'
  | 'task'
  | 'project'
  | 'important'
  | 'emotion';

export interface MemoryEntry {
  id: string;
  conversationId: string;
  partnerId: string;
  category: MemoryCategory;
  value: string;
  citation: string;
  messageId: string;
  emotion?: string;
  emotionScore?: number;
  embedding?: number[];
  confidence: number;
  timestamp: Date;
  createdAt: Date;
}

export interface ConversationSummary {
  id: string;
  conversationId: string;
  partnerId: string;
  summary: string;
  keyPoints: string[];
  emotions: string[];
  topics: string[];
  fromDate: Date;
  toDate: Date;
  messageCount: number;
  createdAt: Date;
}

export interface InconsistencyRecord {
  id: string;
  conversationId: string;
  partnerId: string;
  statement1: string;
  statement2: string;
  citation1: string;
  citation2: string;
  messageId1: string;
  messageId2: string;
  date1: Date;
  date2: Date;
  inconsistencyType: 'contradiction' | 'version_change' | 'chronological' | 'factual';
  explanation: string;
  coherenceScore: number;
  isReviewed: boolean;
  geminiAnalysis?: GeminiAnalysisResult;
  detectedAt: Date;
}

export interface GeminiAnalysisResult {
  timeline: TimelineEntry[];
  contradictions: ContradictionDetail[];
  emotionalVariations: EmotionalVariation[];
  hypotheses: string[];
  overallCoherenceScore: number;
  deceptionRiskEstimate: number;
  deceptionRiskLabel: string;
  facts: string[];
  interpretations: string[];
  analyzedAt: Date;
}

export interface TimelineEntry {
  date: Date;
  statement: string;
  citation: string;
  emotion?: string;
}

export interface ContradictionDetail {
  subject: string;
  version1: string;
  version2: string;
  citation1: string;
  citation2: string;
  explanation: string;
}

export interface EmotionalVariation {
  date: Date;
  emotion: string;
  score: number;
  context: string;
}

/**
 * Analyse relationnelle « red flags / green flags » (module Gemini).
 */
export type FlagType = 'red' | 'green';
export type FlagSeverity = 'faible' | 'modéré' | 'élevé';

export interface RelationshipFlag {
  type: FlagType;
  category: string;
  severity: FlagSeverity;
  citation: string;
  sender?: string;
  date?: Date;
  explanation: string;
  confidence: number;
}

export interface FlagAnalysisResult {
  redFlags: RelationshipFlag[];
  greenFlags: RelationshipFlag[];
  balanceScore: number;
  climateLabel: string;
  summary: string;
  facts: string[];
  interpretations: string[];
  messageCount: number;
  analyzedAt: Date;
}

export interface SearchResult {
  type: 'memory' | 'message' | 'summary';
  relevanceScore: number;
  citation: string;
  messageId?: string;
  memoryEntry?: MemoryEntry;
  conversationId: string;
  partnerId: string;
  timestamp: Date;
}

// ─── Compteur de green flags par message ─────────────────────────────────────

/** Un green flag détecté sur un message individuel */
export interface MessageGreenFlag {
  category: string;  // ex. "Soutien", "Respect", "Communication ouverte"
  citation: string;  // extrait exact du message
  messageId: string;
  confidence: number;
}

/** Compteur journalier de green flags pour une conversation */
export interface DailyGreenFlagCount {
  id: string;
  conversationId: string;
  partnerId: string;
  /** Format YYYY-MM-DD */
  date: string;
  count: number;
  flags: MessageGreenFlag[];
  updatedAt: Date;
}

// ─── Rapport d'analyse quotidienne (minuit) ───────────────────────────────────

/** Résultat de l'analyse profonde quotidienne : contradictions + émotions + mensonges */
export interface DailyAnalysisReport {
  id: string;
  conversationId: string;
  partnerId: string;
  /** Format YYYY-MM-DD — journée analysée */
  date: string;

  // Cohérence / contradictions
  contradictions: ContradictionDetail[];
  coherenceScore: number; // 0-100

  // Trajectoire émotionnelle de la journée
  emotionalJourney: EmotionalVariation[];
  dominantEmotion: string;
  emotionalSummary: string;

  // Évaluation du risque de tromperie
  deceptionRiskEstimate: number; // 0-1
  deceptionRiskLabel: 'faible' | 'modéré' | 'élevé';
  deceptionIndicators: string[];

  // Synthèse
  summary: string;
  facts: string[];
  interpretations: string[];

  messageCount: number;
  voiceCount: number;
  analyzedAt: Date;
}
