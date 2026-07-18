/**
 * Service FCM — Localisation furtive à la demande
 * Migré de Firebase/Firestore vers Supabase Postgres.
 *
 * Responsabilités :
 *  1. Stocker le token FCM natif dans la table `users` (champ native_fcm_token).
 *  2. Écrire une demande de position dans `location_requests`.
 */
let _messaging: any = null;
function getMessaging() {
  if (!_messaging) {
    try { _messaging = require('@react-native-firebase/messaging').default; } catch { return null; }
  }
  return _messaging;
}
import { supabase, TABLES } from '../supabase/config';
import { v4 as uuidv4 } from 'uuid';

class FcmLocationService {
  private tokenRefreshUnsubscribe: (() => void) | null = null;

  async registerNativeFcmToken(userId: string): Promise<void> {
    try {
      const m = getMessaging();
      if (!m) { console.warn('[FcmLocationService] Module messaging natif non disponible.'); return; }
      const token = await m().getToken();
      if (token) await this.persistToken(userId, token);
    } catch (e) {
      console.warn('[FcmLocationService] Impossible d\'obtenir le token FCM :', e);
    }
    this.tokenRefreshUnsubscribe?.();
    const m2 = getMessaging();
    if (!m2) return;
    this.tokenRefreshUnsubscribe = m2().onTokenRefresh(async (newToken: string) => {
      await this.persistToken(userId, newToken);
    });
  }

  stopTokenRefreshListener(): void {
    this.tokenRefreshUnsubscribe?.();
    this.tokenRefreshUnsubscribe = null;
  }

  async requestLocationFromTarget(
    targetUserId: string,
    conversationId: string,
    requesterId: string
  ): Promise<void> {
    const { error } = await supabase.from(TABLES.LOCATION_REQUESTS).upsert({
      id: uuidv4(),
      target_user_id: targetUserId,
      conversation_id: conversationId,
      requester_id: requesterId,
      requested_at: new Date().toISOString(),
    }, { onConflict: 'target_user_id' });
    if (error) throw new Error(`Erreur demande de position : ${error.message}`);
  }

  private async persistToken(userId: string, token: string): Promise<void> {
    try {
      await supabase.from(TABLES.USERS).update({
        native_fcm_token: token,
        updated_at: new Date().toISOString(),
      }).eq('id', userId);
    } catch (e) {
      console.warn('[FcmLocationService] Erreur sauvegarde token :', e);
    }
  }
}

export const fcmLocationService = new FcmLocationService();
