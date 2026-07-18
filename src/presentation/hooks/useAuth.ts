/**
 * Hook useAuth
 * Gère l'état d'authentification et les opérations d'auth.
 * Migré de Firebase vers Supabase.
 */
import { useCallback } from 'react';
import { router } from 'expo-router';
import { useAuthStore } from '../stores/authStore';
import { authService } from '@infrastructure/supabase/AuthService';
import { userRepository } from '@infrastructure/supabase/UserRepository';
import { antiBotService, type AntiBotAction } from '@infrastructure/supabase/AntiBotService';
import { e2eCryptoService } from '@infrastructure/crypto/E2ECryptoService';
import { KeyStorage } from '@infrastructure/crypto/KeyStorage';
import type { RegisterFormData, LoginFormData } from '@shared/validators/authValidators';
import { logError, logInfo, formatErrorForUser } from '@shared/utils/logger';

/** Signaux anti-bot collectés côté formulaire (honeypot + délai de remplissage). */
export interface AntiBotSignals {
  honeypot: string;
  formOpenedAt: number;
}

async function assertNotBot(action: AntiBotAction, email: string, signals: AntiBotSignals): Promise<void> {
  const result = await antiBotService.check({ action, email, ...signals });
  if (!result.allowed) {
    throw new Error('Trop de tentatives ou activité suspecte détectée. Veuillez réessayer dans quelques minutes.');
  }
}

const LOGIN_TIMEOUT_MS = 15000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(
        () => reject(new Error(`${label} a pris plus de ${ms / 1000}s. Vérifiez votre connexion internet.`)),
        ms
      )
    ),
  ]);
}

export function useAuth() {
  const {
    user, isLoading, isAuthenticated, error,
    setUser, setLoading, setError, clearError, reset,
  } = useAuthStore();

  const register = useCallback(
    async (data: RegisterFormData, antiBot: AntiBotSignals): Promise<void> => {
      setLoading(true);
      clearError();
      try {
        // 0. Protection anti-bot (honeypot, délai, rate limiting, score de risque)
        await assertNotBot('register', data.email, antiBot);

        // 1. Vérification de la disponibilité du username
        const isAvailable = await userRepository.isUsernameAvailable(data.username);
        if (!isAvailable) {
          throw new Error('Ce username est déjà utilisé. Choisissez-en un autre.');
        }

        // 2. Inscription Supabase Auth
        const authResult = await authService.register(data.email, data.password);

        // 3. Génération de la paire de clés E2E
        let publicKeyB64: string | undefined;
        try {
          const kp = e2eCryptoService.generateKeyPair();
          publicKeyB64 = kp.publicKeyB64;
          await KeyStorage.savePrivateKey(authResult.uid, kp.privateKeyB64);
          await e2eCryptoService.initialize(authResult.uid);
        } catch (e2eErr) {
          console.warn('[useAuth.register] Génération clé E2E échouée :', e2eErr);
        }

        // 4. Création du profil Supabase
        let newUser;
        try {
          newUser = await userRepository.createUser({
            id: authResult.uid,
            email: data.email,
            username: data.username,
            displayName: data.displayName,
            publicKeyB64,
          });
        } catch (e: any) {
          logError('register.createUser', { authUid: authResult.uid, message: e?.message ?? '' });
          throw new Error(formatErrorForUser(e, 'Impossible de créer votre profil. Vérifiez votre connexion et réessayez.'));
        }

        setUser(newUser);
      } catch (err: any) {
        logError('register', err);
        const formatted = formatErrorForUser(err, err.message ?? "Erreur lors de l'inscription");
        setError(formatted);
        throw new Error(formatted);
      } finally {
        setLoading(false);
      }
    },
    [setLoading, clearError, setUser, setError]
  );

  const login = useCallback(
    async (data: LoginFormData, antiBot: AntiBotSignals): Promise<void> => {
      setLoading(true);
      clearError();
      try {
        // 0. Protection anti-bot (honeypot, délai, rate limiting, score de risque)
        await assertNotBot('login', data.email, antiBot);

        await withTimeout(
          (async () => {
            // 1. Authentification Supabase
            const authResult = await authService.login(data.email, data.password);

            // 2. Lecture du profil Supabase
            let dbUser;
            try {
              dbUser = await userRepository.getUserById(authResult.uid);
            } catch (dbErr: any) {
              await authService.logout().catch(() => {});
              throw new Error('Impossible de charger votre profil. Vérifiez votre connexion internet et réessayez.');
            }

            if (!dbUser) {
              await authService.logout().catch(() => {});
              throw new Error("Votre profil est introuvable. Votre inscription est peut-être incomplète.\n\nVeuillez vous réinscrire avec le même email.");
            }

            setUser(dbUser);
            logInfo('login.success', { uid: authResult.uid });
            router.replace('/(app)/(tabs)/');

            // Statut en ligne — non bloquant
            userRepository.updateOnlineStatus(authResult.uid, true).catch((e) => {
              console.warn('[useAuth.login] updateOnlineStatus échoué :', e);
            });

            // Initialisation E2E — non bloquant
            e2eCryptoService.initialize(authResult.uid).then(async (initialized) => {
              if (!initialized) {
                try {
                  const kp = e2eCryptoService.generateKeyPair();
                  await KeyStorage.savePrivateKey(authResult.uid, kp.privateKeyB64);
                  await e2eCryptoService.initialize(authResult.uid);
                  await userRepository.publishE2EPublicKey(authResult.uid, kp.publicKeyB64);
                } catch (kpErr) {
                  console.warn('[useAuth.login] Régénération clé E2E échouée :', kpErr);
                }
              }
            }).catch((e2eErr) => {
              console.warn('[useAuth.login] Initialisation E2E échouée :', e2eErr);
            });
          })(),
          LOGIN_TIMEOUT_MS,
          'La connexion'
        );
      } catch (err: any) {
        logError('login', err);
        const formatted = formatErrorForUser(err, err.message ?? 'Erreur lors de la connexion');
        setError(formatted);
        throw new Error(formatted);
      } finally {
        setLoading(false);
      }
    },
    [setLoading, clearError, setUser, setError]
  );

  const logout = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      if (user) {
        await userRepository.updateOnlineStatus(user.id, false);
      }
      e2eCryptoService.clearSession();
      await authService.logout();
      reset();
    } catch (err: any) {
      logError('logout', err);
      setError(formatErrorForUser(err, err.message ?? 'Erreur lors de la déconnexion'));
    } finally {
      setLoading(false);
    }
  }, [user, setLoading, setError, reset]);

  const deleteAccount = useCallback(
    async (password: string): Promise<void> => {
      setLoading(true);
      try {
        if (user) {
          await userRepository.deleteUser(user.id);
          await KeyStorage.deletePrivateKey(user.id);
        }
        e2eCryptoService.clearSession();
        await authService.deleteAccount(password);
        reset();
      } catch (err: any) {
        logError('deleteAccount', err);
        const formatted = formatErrorForUser(err, err.message ?? 'Erreur lors de la suppression du compte');
        setError(formatted);
        throw new Error(formatted);
      } finally {
        setLoading(false);
      }
    },
    [user, setLoading, setError, reset]
  );

  const sendPasswordReset = useCallback(
    async (email: string): Promise<void> => {
      setLoading(true);
      clearError();
      try {
        await authService.sendPasswordReset(email);
      } catch (err: any) {
        logError('sendPasswordReset', err);
        const formatted = formatErrorForUser(err, err.message ?? "Erreur lors de l'envoi de l'email");
        setError(formatted);
        throw new Error(formatted);
      } finally {
        setLoading(false);
      }
    },
    [setLoading, clearError, setError]
  );

  const updatePassword = useCallback(
    async (newPassword: string): Promise<void> => {
      setLoading(true);
      clearError();
      try {
        await authService.updatePassword(newPassword);
        // Fin du flux de récupération : la redirection normale
        // (vers l'app ou le login) peut reprendre son cours.
        useAuthStore.getState().setPasswordRecovery(false);
      } catch (err: any) {
        logError('updatePassword', err);
        const formatted = formatErrorForUser(err, err.message ?? 'Erreur lors du changement de mot de passe');
        setError(formatted);
        throw new Error(formatted);
      } finally {
        setLoading(false);
      }
    },
    [setLoading, clearError, setError]
  );

  return {
    user, isLoading, isAuthenticated, error,
    register, login, logout, deleteAccount, sendPasswordReset, updatePassword, clearError,
  };
    }
