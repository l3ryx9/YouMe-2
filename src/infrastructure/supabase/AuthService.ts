/**
 * Service d'authentification — Supabase Auth
 * Remplace src/infrastructure/firebase/AuthService.ts
 */
import { supabase } from './config';
import { logInfo, logError } from '@shared/utils/logger';

export interface AuthResult {
  uid: string;
  email: string;
}

const CTX = 'AuthService';

class SupabaseAuthService {
  /**
   * Crée un compte utilisateur avec email + mot de passe.
   */
  async register(email: string, password: string): Promise<AuthResult> {
    logInfo(`${CTX}.register`, { email });
    try {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) throw new Error(this.mapError(error.message));
      if (!data.user) throw new Error("Échec de la création du compte.");
      const result = { uid: data.user.id, email: data.user.email ?? email };
      logInfo(`${CTX}.register:✓`, { uid: result.uid });
      return result;
    } catch (err: any) {
      logError(`${CTX}.register`, err);
      throw err;
    }
  }

  /**
   * Authentifie l'utilisateur avec email + mot de passe.
   */
  async login(email: string, password: string): Promise<AuthResult> {
    logInfo(`${CTX}.login`, { email });
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw new Error(this.mapError(error.message));
      if (!data.user) throw new Error("Échec de la connexion.");
      const result = { uid: data.user.id, email: data.user.email ?? email };
      logInfo(`${CTX}.login:✓`, { uid: result.uid });
      return result;
    } catch (err: any) {
      logError(`${CTX}.login`, err);
      throw err;
    }
  }

  /**
   * Déconnecte l'utilisateur courant.
   */
  async logout(): Promise<void> {
    logInfo(`${CTX}.logout`);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw new Error(this.mapError(error.message));
      logInfo(`${CTX}.logout:✓`);
    } catch (err: any) {
      logError(`${CTX}.logout`, err);
      throw err;
    }
  }

  /**
   * Re-authentifie et supprime le compte utilisateur.
   */
  async deleteAccount(password: string): Promise<void> {
    logInfo(`${CTX}.deleteAccount`);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const email = sessionData.session?.user?.email;
      if (!email) throw new Error("Aucun utilisateur connecté.");

      const { error: reAuthError } = await supabase.auth.signInWithPassword({ email, password });
      if (reAuthError) throw new Error("Mot de passe incorrect. Impossible de supprimer le compte.");

      const { error } = await supabase.rpc('delete_user');
      if (error) throw new Error(`Erreur lors de la suppression du compte : ${error.message}`);
      logInfo(`${CTX}.deleteAccount:✓`);
    } catch (err: any) {
      logError(`${CTX}.deleteAccount`, err);
      throw err;
    }
  }

  /**
   * Envoie un email de réinitialisation de mot de passe.
   */
  async sendPasswordReset(email: string): Promise<void> {
    logInfo(`${CTX}.sendPasswordReset`, { email });
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: 'youme://reset-password',
      });
      if (error) throw new Error(this.mapError(error.message));
      logInfo(`${CTX}.sendPasswordReset:✓`, { email });
    } catch (err: any) {
      logError(`${CTX}.sendPasswordReset`, err);
      throw err;
    }
  }

  /**
   * Définit un nouveau mot de passe pour l'utilisateur actuellement
   * connecté. Utilisé à la fin du flux "mot de passe oublié" : une
   * fois la session de récupération établie (voir setSessionFromUrl),
   * l'utilisateur est techniquement "connecté" et peut changer son
   * mot de passe sans le saisir.
   */
  async updatePassword(newPassword: string): Promise<void> {
    logInfo(`${CTX}.updatePassword`);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw new Error(this.mapError(error.message));
      logInfo(`${CTX}.updatePassword:✓`);
    } catch (err: any) {
      logError(`${CTX}.updatePassword`, err);
      throw err;
    }
  }

  /**
   * Établit une session à partir des tokens présents dans une URL de
   * deep link (lien "mot de passe oublié" ou confirmation d'email).
   * Nécessaire car `detectSessionInUrl` est désactivé côté client
   * (pas de barre d'URL en React Native) : on parse et on applique
   * la session nous-mêmes.
   *
   * Retourne le "type" du lien ('recovery' | 'signup' | ...) pour
   * permettre au caller de router vers le bon écran, ou null si
   * l'URL ne contient pas de tokens de session exploitables.
   */
  async setSessionFromUrl(url: string): Promise<string | null> {
    try {
      // Les tokens Supabase sont dans le fragment (#access_token=...)
      // pour le flux "implicit", après le premier "#".
      const hashIndex = url.indexOf('#');
      if (hashIndex === -1) return null;

      const params = new URLSearchParams(url.substring(hashIndex + 1));
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');
      const type = params.get('type');

      if (!accessToken || !refreshToken) return null;

      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (error) throw new Error(this.mapError(error.message));

      logInfo(`${CTX}.setSessionFromUrl:✓`, { type: type ?? 'unknown' });
      return type;
    } catch (err: any) {
      logError(`${CTX}.setSessionFromUrl`, err);
      return null;
    }
  }

  /**
   * Retourne l'UID de l'utilisateur actuellement connecté (ou null).
   */
  async getCurrentUserId(): Promise<string | null> {
    try {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id ?? null;
      logInfo(`${CTX}.getCurrentUserId`, { uid: uid ?? 'null' });
      return uid;
    } catch (err: any) {
      logError(`${CTX}.getCurrentUserId`, err);
      return null;
    }
  }

  /**
   * Écoute les changements d'état d'authentification.
   */
  onAuthStateChanged(callback: (userId: string | null) => void): () => void {
    logInfo(`${CTX}.onAuthStateChanged:start`);
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const uid = session?.user?.id ?? null;
      logInfo(`${CTX}.onAuthStateChanged:event`, { event: _event, uid: uid ?? 'null' });
      callback(uid);
    });
    return () => {
      logInfo(`${CTX}.onAuthStateChanged:unsub`);
      subscription.unsubscribe();
    };
  }

  /**
   * Traduit les messages d'erreur Supabase en messages lisibles en français.
   */
  private mapError(message: string): string {
    if (message.includes('Invalid login credentials')) return 'Email ou mot de passe incorrect.';
    if (message.includes('Email not confirmed')) return 'Veuillez vérifier votre email avant de vous connecter.';
    if (message.includes('User already registered')) return 'Un compte existe déjà avec cet email.';
    if (message.includes('Password should be at least')) return 'Le mot de passe doit contenir au moins 6 caractères.';
    if (message.includes('rate limit')) return 'Trop de tentatives. Veuillez patienter quelques minutes.';
    if (message.includes('network')) return 'Erreur réseau. Vérifiez votre connexion internet.';
    return message;
  }
}

export const authService = new SupabaseAuthService();
