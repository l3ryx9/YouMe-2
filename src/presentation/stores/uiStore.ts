/**
 * Store Zustand — UI et Préférences
 */
import { create } from 'zustand';
import { MMKV } from 'react-native-mmkv';

const storage = new MMKV({ id: 'youme-ui-prefs' });

interface UIState {
  isDarkMode: boolean;
  aiEnabled: boolean;
  notificationsEnabled: boolean;
  notificationPermissionAsked: boolean; // true après la première demande de permission
  isOnboarded: boolean;
  activeTab: string;

  toggleDarkMode: () => void;
  setAiEnabled: (enabled: boolean) => void;
  setNotificationsEnabled: (enabled: boolean) => void;
  setNotificationPermissionAsked: () => void;
  setIsOnboarded: (onboarded: boolean) => void;
  setActiveTab: (tab: string) => void;
  loadPersistedState: () => void;
}

export const useUIStore = create<UIState>((set, get) => ({
  isDarkMode: true,
  aiEnabled: storage.getBoolean('aiEnabled') ?? true,
  notificationsEnabled: storage.getBoolean('notificationsEnabled') ?? true,
  notificationPermissionAsked: storage.getBoolean('notificationPermissionAsked') ?? false,
  isOnboarded: storage.getBoolean('isOnboarded') ?? false,
  activeTab: 'index',

  toggleDarkMode: () => {
    const next = !get().isDarkMode;
    storage.set('isDarkMode', next);
    set({ isDarkMode: next });
  },
  setAiEnabled: (aiEnabled) => {
    storage.set('aiEnabled', aiEnabled);
    set({ aiEnabled });
  },
  setNotificationsEnabled: (notificationsEnabled) => {
    storage.set('notificationsEnabled', notificationsEnabled);
    set({ notificationsEnabled });
  },
  setNotificationPermissionAsked: () => {
    storage.set('notificationPermissionAsked', true);
    set({ notificationPermissionAsked: true });
  },
  setIsOnboarded: (isOnboarded) => {
    storage.set('isOnboarded', isOnboarded);
    set({ isOnboarded });
  },
  setActiveTab: (activeTab) => set({ activeTab }),
  loadPersistedState: () => {
    set({
      isDarkMode: storage.getBoolean('isDarkMode') ?? true,
      aiEnabled: storage.getBoolean('aiEnabled') ?? true,
      notificationsEnabled: storage.getBoolean('notificationsEnabled') ?? true,
      notificationPermissionAsked: storage.getBoolean('notificationPermissionAsked') ?? false,
      isOnboarded: storage.getBoolean('isOnboarded') ?? false,
    });
  },
}));
