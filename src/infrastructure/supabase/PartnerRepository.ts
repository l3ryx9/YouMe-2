/**
 * Repository partenaires / demandes — Supabase Postgres + Realtime
 * Remplace src/infrastructure/firebase/PartnerRepository.ts
 */
import { supabase, TABLES } from './config';
import type { Partner, PartnerRequest } from '@domain/entities/Partner';
import { v4 as uuidv4 } from 'uuid';
import { logInfo, logError, logWarn } from '@shared/utils/logger';

const CTX = 'PartnerRepository';

function rowToPartner(row: any): Partner {
  return {
    userId: row.user_id,
    partnerId: row.partner_id,
    partnerUsername: row.partner_username,
    partnerDisplayName: row.partner_display_name,
    partnerPhotoURL: row.partner_photo_url ?? undefined,
    partnerIsOnline: row.partner_is_online ?? false,
    partnerLastSeen: row.partner_last_seen ? new Date(row.partner_last_seen) : new Date(row.created_at),
    conversationId: row.conversation_id,
    createdAt: new Date(row.created_at),
  };
}

function rowToRequest(row: any): PartnerRequest {
  return {
    id: row.id,
    senderId: row.sender_id,
    senderUsername: row.sender_username,
    senderDisplayName: row.sender_display_name,
    senderPhotoURL: row.sender_photo_url ?? undefined,
    receiverId: row.receiver_id,
    status: row.status as 'pending' | 'accepted' | 'rejected',
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

class SupabasePartnerRepository {
  /**
   * Envoie une demande de partenariat.
   * Résout automatiquement le profil du sender et l'ID du receiver.
   */
  async sendPartnerRequest(params: {
    senderId: string;
    receiverUsername: string;
  }): Promise<void> {
    logInfo(`${CTX}.sendPartnerRequest`, { senderId: params.senderId, receiverUsername: params.receiverUsername });
    try {
      // 1. Récupérer le profil du sender
      const { data: senderRow, error: senderError } = await supabase
        .from(TABLES.USERS)
        .select('username, display_name, photo_url')
        .eq('id', params.senderId)
        .maybeSingle();
      if (senderError || !senderRow) {
        throw new Error('Impossible de récupérer votre profil');
      }

      // 2. Récupérer l'ID du receiver par username
      const { data: receiverRow, error: receiverError } = await supabase
        .from(TABLES.PUBLIC_PROFILES)
        .select('id')
        .eq('username', params.receiverUsername.toLowerCase())
        .maybeSingle();
      if (receiverError || !receiverRow) {
        throw new Error(`Utilisateur @${params.receiverUsername} introuvable`);
      }

      // 3. Si déjà partenaires, inutile d'envoyer une demande
      const alreadyPartners = await this.arePartners(params.senderId, receiverRow.id);
      if (alreadyPartners) {
        throw new Error(`Vous êtes déjà partenaire avec @${params.receiverUsername}`);
      }

      // 4. Vérifier qu'une demande en attente n'existe pas déjà
      const { data: existingReq } = await supabase
        .from(TABLES.PARTNER_REQUESTS)
        .select('id, status')
        .eq('sender_id', params.senderId)
        .eq('receiver_id', receiverRow.id)
        .maybeSingle();
      if (existingReq?.status === 'pending') {
        throw new Error(`Une demande est déjà en attente pour @${params.receiverUsername}`);
      }

      // 5. Créer la demande. S'il existe déjà une ancienne ligne
      //    (refusée / déjà traitée) pour ce couple sender/receiver, il
      //    faut la supprimer avant de réinsérer : la contrainte UNIQUE
      //    (sender_id, receiver_id) l'exige, et on ne peut pas faire un
      //    simple upsert ici, car la policy RLS "partner_requests_update"
      //    n'autorise QUE le destinataire à modifier une ligne existante
      //    (c'est volontaire : seul lui doit pouvoir accepter/refuser).
      //    L'expéditeur, lui, a le droit de supprimer ses propres
      //    demandes (policy "partner_requests_delete"), donc on repart
      //    d'une ligne propre.
      if (existingReq) {
        const { error: delErr } = await supabase
          .from(TABLES.PARTNER_REQUESTS)
          .delete()
          .eq('id', existingReq.id);
        if (delErr) throw new Error(`Erreur nettoyage ancienne demande : ${delErr.message}`);
      }

      const now = new Date().toISOString();
      const { error } = await supabase.from(TABLES.PARTNER_REQUESTS).insert({
        id: uuidv4(),
        sender_id: params.senderId,
        sender_username: senderRow.username,
        sender_display_name: senderRow.display_name,
        sender_photo_url: senderRow.photo_url ?? null,
        receiver_id: receiverRow.id,
        status: 'pending',
        created_at: now,
        updated_at: now,
      });
      if (error) throw new Error(`Erreur envoi demande : ${error.message}`);
      logInfo(`${CTX}.sendPartnerRequest:✓`, { senderId: params.senderId, receiverUsername: params.receiverUsername });
    } catch (err: any) {
      logError(`${CTX}.sendPartnerRequest`, err);
      throw err;
    }
  }

  /**
   * Récupère les demandes reçues en attente pour un utilisateur.
   */
  async getReceivedRequests(userId: string): Promise<PartnerRequest[]> {
    logInfo(`${CTX}.getReceivedRequests`, { userId });
    try {
      const { data, error } = await supabase
        .from(TABLES.PARTNER_REQUESTS)
        .select('*')
        .eq('receiver_id', userId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      if (error) throw new Error(`Erreur lecture demandes : ${error.message}`);
      const requests = (data ?? []).map(rowToRequest);
      logInfo(`${CTX}.getReceivedRequests:✓`, { userId, count: requests.length });
      return requests;
    } catch (err: any) {
      logError(`${CTX}.getReceivedRequests`, err);
      throw err;
    }
  }

  /**
   * Accepte une demande — délègue tout (statut, conversation, relations
   * partners dans les deux sens) à la fonction RPC SECURITY DEFINER
   * `accept_partner_request`, qui contourne la RLS de façon contrôlée
   * (l'utilisateur courant doit être le receiver de la demande).
   */
  async acceptPartnerRequest(requestId: string): Promise<void> {
    logInfo(`${CTX}.acceptPartnerRequest`, { requestId });
    try {
      const { data, error } = await supabase
        .rpc('accept_partner_request', { p_request_id: requestId })
        .maybeSingle();

      if (error) throw new Error(`Erreur acceptation demande : ${error.message}`);
      if (!data) throw new Error('Erreur acceptation demande : réponse vide');

      const conversationId = (data as { conversation_id: string }).conversation_id;
      logInfo(`${CTX}.acceptPartnerRequest:✓`, { requestId, conversationId });
    } catch (err: any) {
      logError(`${CTX}.acceptPartnerRequest`, err);
      throw err;
    }
  }

  /**
   * Rejette une demande de partenariat.
   */
  async rejectPartnerRequest(requestId: string): Promise<void> {
    logInfo(`${CTX}.rejectPartnerRequest`, { requestId });
    try {
      const { error } = await supabase.from(TABLES.PARTNER_REQUESTS).update({
        status: 'rejected',
        updated_at: new Date().toISOString(),
      }).eq('id', requestId);
      if (error) throw new Error(`Erreur rejet demande : ${error.message}`);
      logInfo(`${CTX}.rejectPartnerRequest:✓`, { requestId });
    } catch (err: any) {
      logError(`${CTX}.rejectPartnerRequest`, err);
      throw err;
    }
  }

  /** @deprecated Utiliser rejectPartnerRequest */
  async rejectRequest(requestId: string): Promise<void> {
    return this.rejectPartnerRequest(requestId);
  }

  /**
   * Récupère tous les partenaires d'un utilisateur.
   */
  async getPartners(userId: string): Promise<Partner[]> {
    logInfo(`${CTX}.getPartners`, { userId });
    try {
      const { data, error } = await supabase
        .from(TABLES.PARTNERS)
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      if (error) throw new Error(`Erreur lecture partenaires : ${error.message}`);
      const partners = (data ?? []).map(rowToPartner);
      logInfo(`${CTX}.getPartners:✓`, { userId, count: partners.length });
      return partners;
    } catch (err: any) {
      logError(`${CTX}.getPartners`, err);
      throw err;
    }
  }

  /**
   * Supprime une relation partenaire dans les deux sens, et nettoie tout
   * ce qui pourrait bloquer un ré-ajout ultérieur ou laisser des traces
   * visibles ailleurs dans l'app :
   *  1. Les deux lignes `partners` (A→B et B→A), supprimées explicitement
   *     une par une plutôt qu'avec un seul filtre .or() combiné — plus
   *     simple à déboguer et évite toute ambiguïté de parsing PostgREST
   *     sur les policies RLS.
   *  2. L'éventuelle ancienne ligne `partner_requests` (statut 'accepted')
   *     entre les deux utilisateurs, dans les deux sens — sinon la
   *     contrainte UNIQUE(sender_id, receiver_id) peut entrer en conflit
   *     lors d'un nouvel envoi de demande.
   *  3. La conversation partagée est vidée (messages + last_message) via
   *     clearConversation — sans quoi elle resterait visible dans l'onglet
   *     Messages et dans l'Analyse IA alors que le contact a été supprimé.
   */
  async removePartner(userId: string, partnerId: string): Promise<void> {
    logInfo(`${CTX}.removePartner`, { userId, partnerId });
    try {
      // 0. Récupérer la conversation partagée avant de supprimer les lignes
      //    partners (qui la référencent) — on en aura besoin à l'étape 3.
      const { data: partnerRow } = await supabase
        .from(TABLES.PARTNERS)
        .select('conversation_id')
        .eq('user_id', userId)
        .eq('partner_id', partnerId)
        .maybeSingle();
      const conversationId = partnerRow?.conversation_id as string | undefined;

      // 1. Supprimer les deux lignes partners, explicitement.
      const { error: err1 } = await supabase.from(TABLES.PARTNERS)
        .delete()
        .eq('user_id', userId)
        .eq('partner_id', partnerId);
      if (err1) throw new Error(`Erreur suppression partenaire (1/2) : ${err1.message}`);

      const { error: err2 } = await supabase.from(TABLES.PARTNERS)
        .delete()
        .eq('user_id', partnerId)
        .eq('partner_id', userId);
      if (err2) throw new Error(`Erreur suppression partenaire (2/2) : ${err2.message}`);

      // 2. Nettoyer les anciennes demandes (dans les deux sens), pour ne
      //    pas bloquer un futur envoi de demande sur la contrainte UNIQUE.
      await supabase.from(TABLES.PARTNER_REQUESTS)
        .delete()
        .eq('sender_id', userId)
        .eq('receiver_id', partnerId);
      await supabase.from(TABLES.PARTNER_REQUESTS)
        .delete()
        .eq('sender_id', partnerId)
        .eq('receiver_id', userId);

      // 3. Vider la conversation partagée (messages + last_message), pour
      //    qu'elle disparaisse des écrans Messages et Analyse IA.
      if (conversationId) {
        const { messageRepository } = await import('./MessageRepository');
        await messageRepository.clearConversation(conversationId).catch((err: any) => {
          logWarn(`${CTX}.removePartner:clearConversation`, { error: err?.message, conversationId });
        });
      }

      logInfo(`${CTX}.removePartner:✓`, { userId, partnerId });
    } catch (err: any) {
      logError(`${CTX}.removePartner`, err);
      throw err;
    }
  }

  /**
   * Vérifie si deux utilisateurs sont déjà partenaires.
   */
  async arePartners(userId1: string, userId2: string): Promise<boolean> {
    logInfo(`${CTX}.arePartners`, { userId1, userId2 });
    try {
      const { data, error } = await supabase
        .from(TABLES.PARTNERS)
        .select('user_id')
        .eq('user_id', userId1)
        .eq('partner_id', userId2)
        .maybeSingle();
      if (error) throw new Error(`Erreur arePartners : ${error.message}`);
      const result = data !== null;
      logInfo(`${CTX}.arePartners:✓`, { userId1, userId2, result });
      return result;
    } catch (err: any) {
      logError(`${CTX}.arePartners`, err);
      throw err;
    }
  }

  /**
   * Vérifie si une demande est déjà en attente entre deux utilisateurs.
   */
  async hasPendingRequest(senderId: string, receiverId: string): Promise<boolean> {
    logInfo(`${CTX}.hasPendingRequest`, { senderId, receiverId });
    try {
      const { data, error } = await supabase
        .from(TABLES.PARTNER_REQUESTS)
        .select('id')
        .eq('sender_id', senderId)
        .eq('receiver_id', receiverId)
        .eq('status', 'pending')
        .maybeSingle();
      if (error) throw new Error(`Erreur hasPendingRequest : ${error.message}`);
      const result = data !== null;
      logInfo(`${CTX}.hasPendingRequest:✓`, { senderId, receiverId, result });
      return result;
    } catch (err: any) {
      logError(`${CTX}.hasPendingRequest`, err);
      throw err;
    }
  }

  /**
   * S'abonne en temps réel aux demandes reçues.
   * Charge les demandes initiales immédiatement puis réémet à chaque changement.
   */
  subscribeToRequests(
    userId: string,
    onRequests: (requests: PartnerRequest[]) => void
  ): () => void {
    logInfo(`${CTX}.subscribeToRequests:start`, { userId });

    this.getReceivedRequests(userId)
      .then((reqs) => {
        logInfo(`${CTX}.subscribeToRequests:initial`, { userId, count: reqs.length });
        onRequests(reqs);
      })
      .catch((err) => logError(`${CTX}.subscribeToRequests:initial`, err));

    const channel = supabase
      .channel(`partner_requests:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: TABLES.PARTNER_REQUESTS,
          filter: `receiver_id=eq.${userId}`,
        },
        async (payload) => {
          logInfo(`${CTX}.subscribeToRequests:event`, { userId, event: payload.eventType });
          try {
            const reqs = await this.getReceivedRequests(userId);
            logInfo(`${CTX}.subscribeToRequests:reload`, { userId, count: reqs.length });
            onRequests(reqs);
          } catch (err: any) {
            logError(`${CTX}.subscribeToRequests:reload`, err);
          }
        }
      )
      .subscribe((status, err) => {
        if (err) logError(`${CTX}.subscribeToRequests:channel`, err);
        else logInfo(`${CTX}.subscribeToRequests:channel`, { status });
      });

    return () => {
      logInfo(`${CTX}.subscribeToRequests:unsub`, { userId });
      supabase.removeChannel(channel);
    };
  }

  /**
   * S'abonne aux changements de présence (is_online / last_seen) des partenaires.
   *
   * Écoute la table public_profiles sans filtre (Supabase Realtime ne supporte
   * pas les filtres IN) et filtre côté JS sur les IDs passés en paramètre.
   * À rappeler dès que la liste de partenaires change (IDs différents).
   */
  subscribeToPartnersPresence(
    partnerIds: string[],
    onPresenceChange: (partnerId: string, isOnline: boolean, lastSeen: Date | null) => void
  ): () => void {
    if (partnerIds.length === 0) return () => {};

    const channel = supabase
      .channel('partners-presence')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: TABLES.PUBLIC_PROFILES },
        (payload) => {
          const data = payload.new as any;
          if (partnerIds.includes(data.id)) {
            onPresenceChange(
              data.id,
              data.is_online ?? false,
              data.last_seen ? new Date(data.last_seen) : null
            );
          }
        }
      )
      .subscribe((status, err) => {
        if (err) logError(`${CTX}.subscribeToPartnersPresence:channel`, err);
      });

    return () => { supabase.removeChannel(channel); };
  }

  /**
   * S'abonne aux changements de la liste des partenaires.
   */
  subscribeToPartners(
    userId: string,
    onChange: (partners: Partner[]) => void
  ): () => void {
    logInfo(`${CTX}.subscribeToPartners:start`, { userId });

    // FIX : contrairement à subscribeToRequests, cette méthode ne chargeait
    // jamais la liste initiale — la liste de contacts restait vide au
    // démarrage de l'app tant qu'aucun événement temps réel (ajout/suppression)
    // ne survenait pendant la session.
    this.getPartners(userId)
      .then((partners) => {
        logInfo(`${CTX}.subscribeToPartners:initial`, { userId, count: partners.length });
        onChange(partners);
      })
      .catch((err) => logError(`${CTX}.subscribeToPartners:initial`, err));

    const channel = supabase
      .channel(`partners:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: TABLES.PARTNERS,
          filter: `user_id=eq.${userId}`,
        },
        async (payload) => {
          logInfo(`${CTX}.subscribeToPartners:event`, { userId, event: payload.eventType });
          try {
            const partners = await this.getPartners(userId);
            logInfo(`${CTX}.subscribeToPartners:reload`, { userId, count: partners.length });
            onChange(partners);
          } catch (err: any) {
            logError(`${CTX}.subscribeToPartners:reload`, err);
          }
        }
      )
      .subscribe((status, err) => {
        if (err) logError(`${CTX}.subscribeToPartners:channel`, err);
        else logInfo(`${CTX}.subscribeToPartners:channel`, { status });
      });

    return () => {
      logInfo(`${CTX}.subscribeToPartners:unsub`, { userId });
      supabase.removeChannel(channel);
    };
  }
}

export const partnerRepository = new SupabasePartnerRepository();
