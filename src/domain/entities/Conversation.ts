/**
 * Entité domaine : Conversation
 * Représente une conversation 1-to-1 entre deux utilisateurs.
 */
import type { Message } from './Message';

export interface Conversation {
  id: string;
  participantIds: [string, string];
  lastMessage?: Pick<Message, 'id' | 'type' | 'content' | 'senderId' | 'createdAt' | 'status'>;
  unreadCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ConversationWithPartner extends Conversation {
  partnerId: string;
  partnerUsername: string;
  partnerDisplayName: string;
  partnerPhotoURL?: string;
  partnerIsOnline: boolean;
  partnerLastSeen: Date;
}
