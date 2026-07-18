/**
 * Service de Localisation
 * Gère le partage de position en temps réel et en fond de tâche.
 * Migré de Firebase/Firestore vers Supabase Postgres + Realtime.
 */
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { AppState, AppStateStatus } from 'react-native';
import { MMKV } from 'react-native-mmkv';
import { supabase, TABLES } from '../supabase/config';
import { detectMockLocation, resetMockDetector } from './MockLocationDetector';
import type { LocationData } from '@domain/entities/Message';

export const BACKGROUND_LOCATION_TASK = 'YOUME_BACKGROUND_LOCATION';

const bgStore = new MMKV({ id: 'youme-location-bg' });
const BG_CONV_KEY = 'bgConversationId';
const BG_USER_KEY = 'bgUserId';

let bgConversationId: string | null = null;
let bgUserId: string | null = null;

function persistBgContext(conversationId: string, userId: string): void {
  bgConversationId = conversationId;
  bgUserId = userId;
  try {
    bgStore.set(BG_CONV_KEY, conversationId);
    bgStore.set(BG_USER_KEY, userId);
  } catch {}
}

function clearBgContext(): void {
  bgConversationId = null;
  bgUserId = null;
  try {
    bgStore.delete(BG_CONV_KEY);
    bgStore.delete(BG_USER_KEY);
  } catch {}
}

function resolveBgContext(): { conversationId: string | null; userId: string | null } {
  if (bgConversationId && bgUserId) {
    return { conversationId: bgConversationId, userId: bgUserId };
  }
  try {
    const conversationId = bgStore.getString(BG_CONV_KEY) ?? null;
    const userId = bgStore.getString(BG_USER_KEY) ?? null;
    bgConversationId = conversationId;
    bgUserId = userId;
    return { conversationId, userId };
  } catch {
    return { conversationId: null, userId: null };
  }
}

// Tâche background — publie la position vers Supabase quand l'écran est verrouillé
try {
  TaskManager.defineTask(BACKGROUND_LOCATION_TASK, (event: any) => {
    const { data, error } = event;
    if (error) {
      console.warn('[LocationService BG]', error.message);
      return;
    }
    const locations: Location.LocationObject[] = data?.locations ?? [];
    if (!locations.length) return;

    const { conversationId, userId } = resolveBgContext();
    if (!conversationId || !userId) return;

    const location = locations[0];
    const mockResult = detectMockLocation(location);
    if (mockResult.shouldBlock) {
      console.warn('[LocationService BG] Position fictive bloquée (score:', mockResult.score, ')');
      return;
    }
    if (AppState.currentState !== 'active') {
      supabase.from(TABLES.LOCATION_SHARES).upsert({
        user_id: userId,
        conversation_id: conversationId,
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracy: location.coords.accuracy ?? null,
        speed: location.coords.speed ?? null,
        is_mocked: mockResult.isMocked,
        is_stealth_update: false,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'conversation_id' }).then(() => {}, () => {});
    }
  });
} catch (e) {
  console.warn('[LocationService] TaskManager non disponible dans ce build :', e);
}

export interface LiveLocationData extends LocationData {
  userId: string;
  conversationId: string;
}

class LocationService {
  private appStateSubscription: any = null;

  async requestPermissions(): Promise<boolean> {
    const { status: fg } = await Location.requestForegroundPermissionsAsync();
    if (fg !== 'granted') return false;
    const { status: bg } = await Location.requestBackgroundPermissionsAsync();
    return bg === 'granted';
  }

  async hasForegroundPermission(): Promise<boolean> {
    const fg = await Location.getForegroundPermissionsAsync();
    return fg.status === 'granted';
  }

  async hasBackgroundPermission(): Promise<boolean> {
    const bg = await Location.getBackgroundPermissionsAsync();
    return bg.status === 'granted';
  }

  async getCurrentLocation(): Promise<Location.LocationObject | null> {
    try {
      if (!(await this.hasForegroundPermission())) {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return null;
      }
      return await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    } catch {
      return null;
    }
  }

  async getLocationData(): Promise<LocationData | null> {
    const location = await this.getCurrentLocation();
    if (!location) return null;
    const mockResult = detectMockLocation(location);
    if (mockResult.shouldBlock) {
      console.warn('[LocationService] Position fictive bloquée (confidence:', mockResult.confidence, ', score:', mockResult.score, ')');
      return null;
    }
    return {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      accuracy: location.coords.accuracy ?? undefined,
      speed: location.coords.speed ?? undefined,
      isMocked: mockResult.isMocked,
      timestamp: new Date(),
    };
  }

  async startBackgroundSharing(conversationId: string, userId: string): Promise<boolean> {
    persistBgContext(conversationId, userId);
    if (!(await this.hasBackgroundPermission())) {
      const granted = await this.requestPermissions();
      if (!granted) { clearBgContext(); return false; }
    }
    try {
      const isTaskRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_LOCATION_TASK);
      if (!isTaskRegistered) {
        await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 15000,
          distanceInterval: 10,
          showsBackgroundLocationIndicator: false,
          foregroundService: {
            notificationTitle: 'YouMe',
            notificationBody: 'Partage de position actif',
          },
          pausesUpdatesAutomatically: false,
        });
      }
    } catch (e) {
      clearBgContext();
      return false;
    }
    this.appStateSubscription?.remove();
    this.appStateSubscription = AppState.addEventListener('change', this.handleAppStateChange);
    return true;
  }

  async stopBackgroundSharing(): Promise<void> {
    const prevConversationId = bgConversationId ?? bgStore.getString(BG_CONV_KEY) ?? null;
    clearBgContext();
    this.appStateSubscription?.remove();
    this.appStateSubscription = null;
    try {
      const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_LOCATION_TASK);
      if (isRegistered) {
        await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      }
    } catch {}
    if (prevConversationId) {
      await this.clearLocationShare(prevConversationId);
    }
    resetMockDetector();
  }

  private handleAppStateChange = (nextState: AppStateStatus) => {
    if (nextState === 'active') {
      console.log('[LocationService] Écran actif — partage en pause');
    } else if (nextState === 'background') {
      console.log('[LocationService] Écran verrouillé — partage actif');
    }
  };

  /**
   * S'abonne en temps réel à la position partagée dans une conversation.
   * Remplace Firestore onSnapshot par Supabase Realtime.
   */
  subscribeToPartnerLocation(
    conversationId: string,
    callback: (data: LiveLocationData | null) => void
  ): () => void {
    // Charger la donnée initiale
    supabase
      .from(TABLES.LOCATION_SHARES)
      .select('*')
      .eq('conversation_id', conversationId)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) { callback(null); return; }
        callback({
          userId: data.user_id,
          conversationId,
          latitude: data.latitude,
          longitude: data.longitude,
          accuracy: data.accuracy ?? undefined,
          speed: data.speed ?? undefined,
          isMocked: data.is_mocked ?? false,
          timestamp: new Date(data.updated_at),
        });
      });

    // Écouter les mises à jour en temps réel
    const channel = supabase
      .channel(`location:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: TABLES.LOCATION_SHARES,
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            callback(null);
            return;
          }
          const d = payload.new as any;
          callback({
            userId: d.user_id,
            conversationId,
            latitude: d.latitude,
            longitude: d.longitude,
            accuracy: d.accuracy ?? undefined,
            speed: d.speed ?? undefined,
            isMocked: d.is_mocked ?? false,
            timestamp: new Date(d.updated_at),
          });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }

  async clearLocationShare(conversationId: string): Promise<void> {
    try {
      await supabase.from(TABLES.LOCATION_SHARES).delete().eq('conversation_id', conversationId);
    } catch {}
  }
}

export const locationService = new LocationService();
