/**
 * Entité domaine : Message
 * Représente un message dans une conversation YouMe V2.
 */
export type MessageType = 'text' | 'voice' | 'system' | 'location' | 'image' | 'video';

export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed';

/**
 * Données de position partagées dans un message de localisation
 * ou dans un partage en direct (locationShares).
 */
export interface LocationData {
  latitude: number;
  longitude: number;
  accuracy?: number;
  speed?: number;
  isMocked?: boolean;
  timestamp?: Date;
}

export interface AIAnalysisResult {
  emotions: EmotionResult;
  summary?: string;
  topics?: string[];
  entities?: ExtractedEntities;
  transcription?: string;
  language?: string;
  audioDuration?: number;
  processedAt: Date;
}

export interface EmotionResult {
  primary: string;
  primaryScore: number;
  secondary: EmotionScore[];
  label: string;
}

export interface EmotionScore {
  emotion: string;
  score: number;
}

export interface ExtractedEntities {
  persons: EntityWithCitation[];
  locations: EntityWithCitation[];
  events: EntityWithCitation[];
  dates: EntityWithCitation[];
  topics: EntityWithCitation[];
  preferences: EntityWithCitation[];
  concerns: EntityWithCitation[];
  goals: EntityWithCitation[];
  tasks: EntityWithCitation[];
  projects: EntityWithCitation[];
  important: EntityWithCitation[];
}

export interface EntityWithCitation {
  value: string;
  citation: string;
  confidence: number;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  receiverId: string;
  type: MessageType;
  content: string;
  /** Vrai si le contenu est chiffré E2E (XSalsa20-Poly1305 via X25519) */
  encrypted?: boolean;
  /** Nonce base64 utilisé lors du chiffrement (24 octets, unique par message) */
  nonce?: string;
  voiceLocalPath?: string;
  voiceDuration?: number;
  imageLocalPath?: string;
  videoLocalPath?: string;
  /** URL Firebase Storage (relay de transit, supprimée après téléchargement) */
  storageUrl?: string;
  location?: LocationData;
  status: MessageStatus;
  aiAnalysis?: AIAnalysisResult;
  /** Réactions emoji : { [userId]: emoji } — ex: { "uid123": "❤️" } */
  reactions?: Record<string, string>;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type SendMessageDTO = {
  conversationId: string;
  senderId: string;
  receiverId: string;
  type: MessageType;
  content: string;
  voiceLocalPath?: string;
  voiceDuration?: number;
  imageLocalPath?: string;
  videoLocalPath?: string;
  storageUrl?: string;
  location?: LocationData;
};
