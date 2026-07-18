/**
 * Store Zustand — Authentification
 */
import { create } from 'zustand';
import type { User } from '@domain/entities/User';

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isInitialized: boolean; // true après le premier onAuthStateChanged
  error: string | null;
  // true pendant le flux "mot de passe oublié" : une session de
  // récupération est active (voir AuthService.setSessionFromUrl), mais
  // l'utilisateur ne doit PAS être redirigé vers l'app tant qu'il n'a
  // pas choisi un nouveau mot de passe sur l'écran reset-password.
  isPasswordRecovery: boolean;
  setUser: (user: User | null) => void;
  setLoading: (loading: boolean) => void;
  setInitialized: () => void;
  setError: (error: string | null) => void;
  clearError: () => void;
  setPasswordRecovery: (value: boolean) => void;
  reset: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: false,
  isAuthenticated: false,
  isInitialized: false,
  error: null,
  isPasswordRecovery: false,

  setUser: (user) => set({ user, isAuthenticated: user !== null }),
  setLoading: (isLoading) => set({ isLoading }),
  setInitialized: () => set({ isInitialized: true }),
  setError: (error) => set({ error }),
  clearError: () => set({ error: null }),
  setPasswordRecovery: (value) => set({ isPasswordRecovery: value }),
  reset: () => set({ user: null, isAuthenticated: false, isInitialized: false, error: null, isLoading: false, isPasswordRecovery: false }),
}));
