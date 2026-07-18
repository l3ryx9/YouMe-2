/**
 * Repository messages — Supabase Postgres + Realtime
 * Remplace src/infrastructure/firebase/MessageRepository.ts
 *
 * Modèle de données :
 *  - Une table `conversations` avec participant_ids (array)
 *  - Une table `messages` avec conversation_id (FK)
 *  - Supabase Realtime pour les subscriptions temps-réel
 */
import { supabase, TABLES } from './config';
import type { Message, MessageType, MessageStatus, SendMessageDTO } from '@domain/entities/Message';
import type { Json } from './database.types';
import type { Conversation } from '@domain/entities/Conversation';
import { v4 as uuidv4 } from 'uuid';
import { logInfo, logError, logWarn } from '@shared/utils/logger';

const CTX = 'MessageRepository';

function rowToMessage(row: any): Message {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    receiverId: row.receiver_id,
    type: row.type as MessageType,
    content: row.content ?? undefined,
    voiceLocalPath: row.voice_local_path ?? undefined,
    voiceDuration: row.voice_duration ?? undefined,
    imageLocalPath: row.image_local_path ?? undefined,
    videoLocalPath: row.video_local_path ?? undefined,
    storageUrl: row.storage_url ?? undefined,
    status: row.status as MessageStatus,
    isDeleted: row.is_deleted ?? false,
    aiAnalysis: row.ai_analysis ?? undefined,
    reactions: row.reactions ?? undefined,
    // FIX : voir sendMessage() — sans cette ligne, message.location
    // restait toujours undefined et LocationBubble ne s'affichait jamais.
    location: row.location ?? undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function rowToConversation(row: any): Conversation {
  return {
    id: row.id,
    participantIds: row.participant_ids ?? [],
    lastMessage: row.last_message ?? undefined,
    unreadCount: row.unread_count ?? 0,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

class SupabaseMessageRepository {
  /**
   * Crée ou récupère une conversation entre deux utilisateurs.
   */
  async getOrCreateConversation(userId1: string, userId2: string): Promise<Conversation> {
    logInfo(`${CTX}.getOrCreateConversation`, { userId1, userId2 });
    try {
      const { data: existing, error: findErr } = await supabase
        .from(TABLES.CONVERSATIONS)
        .select('*')
        .contains('participant_ids', [userId1, userId2])
        .maybeSingle();
      if (findErr) throw new Error(`Erreur recherche conversation : ${findErr.message}`);

      if (existing) {
        logInfo(`${CTX}.getOrCreateConversation:found`, { conversationId: existing.id });
        return rowToConversation(existing);
      }

      const now = new Date().toISOString();
      const newConv = {
        id: uuidv4(),
        participant_ids: [userId1, userId2],
        last_message: null,
        unread_count: 0,
        created_at: now,
        updated_at: now,
      };

      const { data, error } = await supabase
        .from(TABLES.CONVERSATIONS)
        .insert(newConv)
        .select()
        .single();
      if (error) throw new Error(`Erreur création conversation : ${error.message}`);
      logInfo(`${CTX}.getOrCreateConversation:created`, { conversationId: data.id });
      return rowToConversation(data);
    } catch (err: any) {
      logError(`${CTX}.getOrCreateConversation`, err);
      throw err;
    }
  }

  /**
   * Récupère une conversation par son ID.
   */
  async getConversationById(conversationId: string): Promise<Conversation | null> {
    logInfo(`${CTX}.getConversationById`, { conversationId });
    try {
      const { data, error } = await supabase
        .from(TABLES.CONVERSATIONS)
        .select('*')
        .eq('id', conversationId)
        .maybeSingle();
      if (error) throw new Error(`Erreur lecture conversation : ${error.message}`);
      if (!data) {
        logWarn(`${CTX}.getConversationById:notFound`, { conversationId });
        return null;
      }
      logInfo(`${CTX}.getConversationById:✓`, { conversationId });
      return rowToConversation(data);
    } catch (err: any) {
      logError(`${CTX}.getConversationById`, err);
      throw err;
    }
  }

  /**
   * Envoie un message dans une conversation.
   */
  async sendMessage(
    message: SendMessageDTO & Partial<Pick<Message, 'id' | 'status' | 'aiAnalysis' | 'reactions'>>
  ): Promise<Message> {
    logInfo(`${CTX}.sendMessage`, {
      conversationId: message.conversationId,
      type: message.type,
      senderId: message.senderId,
    });
    try {
      const now = new Date().toISOString();
      const row = {
        id: message.id ?? uuidv4(),
        conversation_id: message.conversationId,
        sender_id: message.senderId,
        receiver_id: message.receiverId,
        type: message.type,
        content: message.content ?? null,
        voice_local_path: message.voiceLocalPath ?? null,
        voice_duration: message.voiceDuration ?? null,
        image_local_path: message.imageLocalPath ?? null,
        video_local_path: message.videoLocalPath ?? null,
        storage_url: message.storageUrl ?? null,
        status: message.status ?? 'sent',
        is_deleted: false,
        ai_analysis: (message.aiAnalysis as unknown as Json) ?? null,
        reactions: (message.reactions as unknown as Json) ?? null,
        // FIX : ce champ n'était jamais transmis à l'insertion — les
        // messages de type 'location' étaient enregistrés sans aucune
        // coordonnée, donc jamais affichés avec la mini-carte au retour.
        location: (message.location as unknown as Json) ?? null,
        created_at: now,
        updated_at: now,
      };

      const { data, error } = await supabase
        .from(TABLES.MESSAGES)
        .insert(row)
        .select()
        .single();
      if (error) throw new Error(`Erreur envoi message : ${error.message}`);

      // Mettre à jour le dernier message + timestamp de la conversation
      const lastMsg = {
        id: row.id,
        type: row.type,
        content: row.content,
        senderId: row.sender_id,
        createdAt: now,
      };
      const { error: convErr } = await supabase.from(TABLES.CONVERSATIONS).update({
        last_message: lastMsg,
        updated_at: now,
      }).eq('id', message.conversationId);
      if (convErr) {
        logWarn(`${CTX}.sendMessage:updateConversation`, { error: convErr.message, conversationId: message.conversationId });
      }

      logInfo(`${CTX}.sendMessage:✓`, { messageId: data.id, conversationId: message.conversationId });
      return rowToMessage(data);
    } catch (err: any) {
      logError(`${CTX}.sendMessage`, err);
      throw err;
    }
  }

  /**
   * Récupère les N derniers messages d'une conversation.
   */
  async getMessages(conversationId: string, limit = 50): Promise<Message[]> {
    logInfo(`${CTX}.getMessages`, { conversationId, limit });
    try {
      const { data, error } = await supabase
        .from(TABLES.MESSAGES)
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw new Error(`Erreur lecture messages : ${error.message}`);
      const messages = (data ?? []).reverse().map(rowToMessage);
      logInfo(`${CTX}.getMessages:✓`, { conversationId, count: messages.length });
      return messages;
    } catch (err: any) {
      logError(`${CTX}.getMessages`, err);
      throw err;
    }
  }

  /**
   * Met à jour le statut d'un message (ex : 'delivered', 'read').
   */
  async updateMessageStatus(messageId: string, status: MessageStatus): Promise<void> {
    logInfo(`${CTX}.updateMessageStatus`, { messageId, status });
    try {
      const { error } = await supabase
        .from(TABLES.MESSAGES)
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', messageId);
      if (error) throw new Error(`Erreur mise à jour statut : ${error.message}`);
      logInfo(`${CTX}.updateMessageStatus:✓`, { messageId, status });
    } catch (err: any) {
      logError(`${CTX}.updateMessageStatus`, err);
      throw err;
    }
  }

  /**
   * Supprime un message (soft delete — remplace le contenu par un marqueur).
   */
  async deleteMessage(messageId: string): Promise<void> {
    logInfo(`${CTX}.deleteMessage`, { messageId });
    try {
      const { error } = await supabase
        .from(TABLES.MESSAGES)
        .update({
          is_deleted: true,
          content: null,
          storage_url: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', messageId);
      if (error) throw new Error(`Erreur suppression message : ${error.message}`);
      logInfo(`${CTX}.deleteMessage:✓`, { messageId });
    } catch (err: any) {
      logError(`${CTX}.deleteMessage`, err);
      throw err;
    }
  }

  /**
   * Met à jour l'analyse IA d'un message.
   */
  async updateMessageAiAnalysis(messageId: string, analysis: object): Promise<void> {
    logInfo(`${CTX}.updateMessageAiAnalysis`, { messageId });
    try {
      const { error } = await supabase
        .from(TABLES.MESSAGES)
        .update({ ai_analysis: analysis as unknown as Json, updated_at: new Date().toISOString() })
        .eq('id', messageId);
      if (error) throw new Error(`Erreur updateMessageAiAnalysis : ${error.message}`);
      logInfo(`${CTX}.updateMessageAiAnalysis:✓`, { messageId });
    } catch (err: any) {
      logError(`${CTX}.updateMessageAiAnalysis`, err);
      throw err;
    }
  }

  /**
   * Met à jour l'URL de stockage d'un message média.
   */
  async updateMessageStorageUrl(messageId: string, storageUrl: string): Promise<void> {
    logInfo(`${CTX}.updateMessageStorageUrl`, { messageId, storageUrl: storageUrl ? '[set]' : '[cleared]' });
    try {
      const { error } = await supabase
        .from(TABLES.MESSAGES)
        .update({ storage_url: storageUrl, updated_at: new Date().toISOString() })
        .eq('id', messageId);
      if (error) throw new Error(`Erreur updateMessageStorageUrl : ${error.message}`);
      logInfo(`${CTX}.updateMessageStorageUrl:✓`, { messageId });
    } catch (err: any) {
      logError(`${CTX}.updateMessageStorageUrl`, err);
      throw err;
    }
  }

  /**
   * Ajoute ou retire une réaction à un message.
   * Compatible avec les deux signatures :
   *   toggleReaction(messageId, userId, emoji)              → 3 args
   *   toggleReaction(conversationId, messageId, userId, emoji) → 4 args (chat screen)
   */
  async toggleReaction(
    conversationIdOrMessageId: string,
    messageIdOrUserId: string,
    userIdOrEmoji: string,
    emojiOrUndefined?: string
  ): Promise<void> {
    const messageId = emojiOrUndefined !== undefined ? messageIdOrUserId : conversationIdOrMessageId;
    const userId    = emojiOrUndefined !== undefined ? userIdOrEmoji    : messageIdOrUserId;
    const emoji     = emojiOrUndefined !== undefined ? emojiOrUndefined : userIdOrEmoji;
    logInfo(`${CTX}.toggleReaction`, { messageId, userId, emoji });
    try {
      await this._toggleReaction(messageId, userId, emoji);
      logInfo(`${CTX}.toggleReaction:✓`, { messageId, emoji });
    } catch (err: any) {
      logError(`${CTX}.toggleReaction`, err);
      throw err;
    }
  }

  private async _toggleReaction(messageId: string, userId: string, emoji: string): Promise<void> {
    const { data, error: fetchErr } = await supabase
      .from(TABLES.MESSAGES)
      .select('reactions')
      .eq('id', messageId)
      .maybeSingle();
    if (fetchErr) throw new Error(`Erreur lecture réactions : ${fetchErr.message}`);
    if (!data) throw new Error(`Message ${messageId} introuvable`);

    // FIX : le format stocké ici était { [emoji]: userId[] }, mais le
    // domaine (Message.reactions) et l'UI (MessageBubble/ReactionRow)
    // attendent { [userId]: emoji }. Résultat : la réaction était bien
    // enregistrée en base mais ne s'affichait jamais (mauvaise forme lue
    // côté client). On uniformise sur { [userId]: emoji } partout.
    const reactions: Record<string, string> = { ...((data?.reactions as Record<string, string> | null) ?? {}) };
    if (reactions[userId] === emoji) {
      // Même emoji déjà posé par cet utilisateur → on la retire (toggle off).
      delete reactions[userId];
    } else {
      // Nouvelle réaction, ou remplacement de l'ancienne réaction de cet utilisateur.
      reactions[userId] = emoji;
    }

    const { error: updateErr } = await supabase
      .from(TABLES.MESSAGES)
      .update({ reactions, updated_at: new Date().toISOString() })
      .eq('id', messageId);
    if (updateErr) throw new Error(`Erreur mise à jour réactions : ${updateErr.message}`);
  }

  /**
   * S'abonne aux messages d'une conversation en temps réel.
   * Charge les messages initiaux immédiatement et réémet le tableau complet à chaque changement.
   */
  subscribeToMessages(
    conversationId: string,
    onMessages: (messages: Message[]) => void,
    _currentUserId?: string
  ): () => void {
    logInfo(`${CTX}.subscribeToMessages:start`, { conversationId });

    // Chargement initial
    this.getMessages(conversationId)
      .then((msgs) => {
        logInfo(`${CTX}.subscribeToMessages:initial`, { conversationId, count: msgs.length });
        onMessages(msgs);
      })
      .catch((err) => logError(`${CTX}.subscribeToMessages:initial`, err));

    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: TABLES.MESSAGES,
          filter: `conversation_id=eq.${conversationId}`,
        },
        async (payload) => {
          logInfo(`${CTX}.subscribeToMessages:INSERT`, { conversationId, newId: (payload.new as any)?.id });
          try {
            const msgs = await this.getMessages(conversationId);
            logInfo(`${CTX}.subscribeToMessages:reloaded`, { conversationId, count: msgs.length });
            onMessages(msgs);
          } catch (err: any) {
            logError(`${CTX}.subscribeToMessages:reload`, err);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: TABLES.MESSAGES,
          filter: `conversation_id=eq.${conversationId}`,
        },
        async (payload) => {
          logInfo(`${CTX}.subscribeToMessages:UPDATE`, { conversationId, updatedId: (payload.new as any)?.id });
          try {
            const msgs = await this.getMessages(conversationId);
            logInfo(`${CTX}.subscribeToMessages:reloaded`, { conversationId, count: msgs.length });
            onMessages(msgs);
          } catch (err: any) {
            logError(`${CTX}.subscribeToMessages:reload`, err);
          }
        }
      )
      .subscribe((status, err) => {
        if (err) logError(`${CTX}.subscribeToMessages:channel`, err);
        else logInfo(`${CTX}.subscribeToMessages:channel`, { conversationId, status });
      });

    return () => {
      logInfo(`${CTX}.subscribeToMessages:unsub`, { conversationId });
      supabase.removeChannel(channel);
    };
  }

  /**
   * Supprime un message dans une conversation (soft delete).
   */
  async deleteMessageInConversation(conversationId: string, messageId: string): Promise<void> {
    logInfo(`${CTX}.deleteMessageInConversation`, { conversationId, messageId });
    try {
      await this.deleteMessage(messageId);
      logInfo(`${CTX}.deleteMessageInConversation:✓`, { conversationId, messageId });
    } catch (err: any) {
      logError(`${CTX}.deleteMessageInConversation`, err);
      throw err;
    }
  }

  /**
   * Met à jour les champs d'un message dans une conversation.
   */
  async updateMessageInConversation(
    conversationId: string,
    messageId: string,
    updates: Partial<Message>
  ): Promise<void> {
    logInfo(`${CTX}.updateMessageInConversation`, {
      conversationId,
      messageId,
      fields: Object.keys(updates),
    });
    try {
      if (updates.aiAnalysis !== undefined) {
        await this.updateMessageAiAnalysis(messageId, updates.aiAnalysis as object);
      }
      if (updates.storageUrl !== undefined) {
        await this.updateMessageStorageUrl(messageId, updates.storageUrl);
      }
      logInfo(`${CTX}.updateMessageInConversation:✓`, { conversationId, messageId });
    } catch (err: any) {
      logError(`${CTX}.updateMessageInConversation`, err);
      throw err;
    }
  }

  /**
   * Marque tous les messages d'une conversation reçus par un utilisateur comme lus.
   */
  async markMessagesAsRead(conversationId: string, userId: string): Promise<void> {
    logInfo(`${CTX}.markMessagesAsRead`, { conversationId, userId });
    try {
      const { error } = await supabase
        .from(TABLES.MESSAGES)
        .update({ status: 'read', updated_at: new Date().toISOString() })
        .eq('conversation_id', conversationId)
        .neq('sender_id', userId)
        .eq('status', 'delivered');
      if (error) throw new Error(`Erreur markMessagesAsRead : ${error.message}`);
      logInfo(`${CTX}.markMessagesAsRead:✓`, { conversationId, userId });
    } catch (err: any) {
      logError(`${CTX}.markMessagesAsRead`, err);
      throw err;
    }
  }

  /**
   * Acquitte la réception d'un média par le destinataire :
   *  1. Supprime le storageUrl du message (il est en cache local)
   *  2. Supprime le fichier du relay Supabase Storage
   */
  async ackMediaReceived(
    conversationId: string,
    messageId: string,
    storageUrl: string
  ): Promise<void> {
    logInfo(`${CTX}.ackMediaReceived`, { conversationId, messageId });
    try {
      await this.updateMessageStorageUrl(messageId, '');
      const { deleteMediaFromStorage } = require('../supabase/MediaUploadService');
      await deleteMediaFromStorage(storageUrl).catch((err: any) => {
        logWarn(`${CTX}.ackMediaReceived:deleteStorage`, { error: err?.message, storageUrl });
      });
      logInfo(`${CTX}.ackMediaReceived:✓`, { conversationId, messageId });
    } catch (err: any) {
      logError(`${CTX}.ackMediaReceived`, err);
      // Silencieux : l'essentiel est que le fichier soit en cache local
    }
  }
  /**
   * "Supprime" une conversation du point de vue de l'utilisateur, SANS
   * supprimer la ligne `conversations` elle-même ni la relation `partners`
   * qui la référence (celle-ci a `ON DELETE CASCADE` sur conversation_id —
   * un DELETE direct sur `conversations` supprimerait donc aussi le
   * contact, ce qui n'est pas l'intention ici).
   *
   * Concrètement : supprime tous les messages de la conversation et
   * réinitialise last_message/unread_count. Comme l'écran Messages et
   * l'écran Analyse IA filtrent tous les deux sur `last_message IS NOT
   * NULL`, la conversation disparaît de ces deux écrans, et le contact
   * redevient visible dans l'onglet Contacts (qui n'affiche que les
   * partenaires sans conversation active).
   */
  async clearConversation(conversationId: string): Promise<void> {
    logInfo(`${CTX}.clearConversation`, { conversationId });
    try {
      const { error: msgError } = await supabase
        .from(TABLES.MESSAGES)
        .delete()
        .eq('conversation_id', conversationId);
      if (msgError) throw new Error(`Erreur suppression messages : ${msgError.message}`);

      const { error: convError } = await supabase
        .from(TABLES.CONVERSATIONS)
        .update({
          last_message: null,
          unread_count: {},
          updated_at: new Date().toISOString(),
        })
        .eq('id', conversationId);
      if (convError) throw new Error(`Erreur réinitialisation conversation : ${convError.message}`);

      logInfo(`${CTX}.clearConversation:✓`, { conversationId });
    } catch (err: any) {
      logError(`${CTX}.clearConversation`, err);
      throw err;
    }
  }
}

export const messageRepository = new SupabaseMessageRepository();
