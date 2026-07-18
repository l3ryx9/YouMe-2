/**
 * Interface Repository : Partenaires
 * Définit le contrat pour la gestion des partenaires.
 */
import type { Partner, PartnerRequest, SendPartnerRequestDTO } from '../entities/Partner';

export interface IPartnerRepository {
  sendPartnerRequest(data: SendPartnerRequestDTO): Promise<PartnerRequest>;
  acceptPartnerRequest(requestId: string): Promise<void>;
  rejectPartnerRequest(requestId: string): Promise<void>;
  getPartners(userId: string): Promise<Partner[]>;
  getPendingRequests(userId: string): Promise<PartnerRequest[]>;
  getSentRequests(userId: string): Promise<PartnerRequest[]>;
  removePartner(userId: string, partnerId: string): Promise<void>;
  isPartner(userId: string, partnerId: string): Promise<boolean>;
  subscribeToPartners(userId: string, callback: (partners: Partner[]) => void): () => void;
  subscribeToRequests(userId: string, callback: (requests: PartnerRequest[]) => void): () => void;
}
