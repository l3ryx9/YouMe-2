/**
 * Entité domaine : Partenaire
 * Représente une relation entre deux utilisateurs de YouMe.
 */
export type PartnerRequestStatus = 'pending' | 'accepted' | 'rejected';

export interface PartnerRequest {
  id: string;
  senderId: string;
  senderUsername: string;
  senderDisplayName: string;
  senderPhotoURL?: string;
  receiverId: string;
  status: PartnerRequestStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface Partner {
  userId: string;
  partnerId: string;
  partnerUsername: string;
  partnerDisplayName: string;
  partnerPhotoURL?: string;
  partnerIsOnline: boolean;
  partnerLastSeen: Date;
  conversationId: string;
  createdAt: Date;
}

export type SendPartnerRequestDTO = {
  senderId: string;
  receiverUsername: string;
};
