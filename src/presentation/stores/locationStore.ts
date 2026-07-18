import { create } from 'zustand';
import type { LiveLocationData } from '@infrastructure/location/LocationService';

interface LocationState {
  // Partage de ma position
  isSharing: boolean;
  sharingConversationId: string | null;
  // Position du partenaire (temps réel)
  partnerLocation: LiveLocationData | null;
  // Mode furtif (contrôle parental)
  stealthActive: boolean;
  stealthTargetId: string | null;
  // Compteur de taps pour l'activation (5 taps rapides)
  tapCount: number;
  lastTapTime: number;

  setSharing: (sharing: boolean, conversationId?: string) => void;
  setPartnerLocation: (loc: LiveLocationData | null) => void;
  setStealthActive: (active: boolean, targetId?: string) => void;
  registerTap: () => number; // retourne le nombre de taps actuels
  resetTaps: () => void;
}

const TAP_WINDOW_MS = 2000; // 2 secondes pour 5 taps

export const useLocationStore = create<LocationState>((set, get) => ({
  isSharing: false,
  sharingConversationId: null,
  partnerLocation: null,
  stealthActive: false,
  stealthTargetId: null,
  tapCount: 0,
  lastTapTime: 0,

  setSharing: (isSharing, sharingConversationId) =>
    set({ isSharing, sharingConversationId: sharingConversationId ?? null }),

  setPartnerLocation: (partnerLocation) => set({ partnerLocation }),

  setStealthActive: (stealthActive, stealthTargetId) =>
    set({ stealthActive, stealthTargetId: stealthTargetId ?? null }),

  registerTap: () => {
    const now = Date.now();
    const { tapCount, lastTapTime } = get();
    const newCount = now - lastTapTime < TAP_WINDOW_MS ? tapCount + 1 : 1;
    set({ tapCount: newCount, lastTapTime: now });
    return newCount;
  },

  resetTaps: () => set({ tapCount: 0, lastTapTime: 0 }),
}));
