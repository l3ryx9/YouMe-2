/**
 * Interface Repository : Messages
 * Définit le contrat pour l'accès aux données de messagerie.
 */
import type { Message, SendMessageDTO, AIAnalysisResult, MessageStatus } from '../entities/Message';

export interface IMessageRepository {
  sendMessage(data: SendMessageDTO): Promise<Message>;
  getMessageById(id: string): Promise<Message | null>;
  getConversationMessages(conversationId: string, limit?: number, before?: Date): Promise<Message[]>;
  updateMessageStatus(id: string, status: MessageStatus): Promise<void>;
  updateMessageAIAnalysis(id: string, analysis: AIAnalysisResult): Promise<void>;
  deleteMessage(id: string): Promise<void>;
  searchMessages(conversationId: string, query: string): Promise<Message[]>;
  markMessagesAsRead(conversationId: string, userId: string): Promise<void>;
  subscribeToMessages(
    conversationId: string,
    callback: (messages: Message[]) => void
  ): () => void;
}
