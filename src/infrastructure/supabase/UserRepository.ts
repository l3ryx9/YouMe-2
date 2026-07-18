/**
 * Repository utilisateurs — Supabase Postgres
 * Remplace src/infrastructure/firebase/UserRepository.ts
 */
import { supabase, TABLES } from './config';
import type { User, UserProfile, CreateUserDTO, UpdateUserDTO } from '@domain/entities/User';
import { logInfo, logError } from '@shared/utils/logger';

const CTX = 'UserRepository';

function rowToUser(row: any): User {
  return {
    id: row.id,
    email: row.email,
    username: row.username,
    displayName: row.display_name,
    photoURL: row.photo_url ?? undefined,
    bio: row.bio ?? undefined,
    isOnline: row.is_online ?? false,
    lastSeen: row.last_seen ? new Date(row.last_seen) : new Date(row.created_at),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    isEmailVerified: row.is_email_verified ?? false,
    aiEnabled: row.ai_enabled ?? true,
    fcmToken: row.fcm_token ?? undefined,
    e2ePublicKey: row.e2e_public_key ?? undefined,
  };
}

function rowToUserProfile(row: any): UserProfile {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    photoURL: row.photo_url ?? undefined,
    bio: row.bio ?? undefined,
    isOnline: row.is_online ?? false,
    lastSeen: row.last_seen ? new Date(row.last_seen) : new Date(),
  };
}

class SupabaseUserRepository {
  /**
   * Vérifie si un username est disponible (table `usernames`, lecture publique).
   */
  async isUsernameAvailable(username: string): Promise<boolean> {
    logInfo(`${CTX}.isUsernameAvailable`, { username });
    try {
      const { data, error } = await supabase
        .from(TABLES.USERNAMES)
        .select('username')
        .eq('username', username.toLowerCase())
        .maybeSingle();
      if (error) throw new Error(`Erreur vérification username : ${error.message}`);
      const available = data === null;
      logInfo(`${CTX}.isUsernameAvailable:✓`, { username, available });
      return available;
    } catch (err: any) {
      logError(`${CTX}.isUsernameAvailable`, err);
      throw err;
    }
  }

  /**
   * Crée le profil applicatif d'un utilisateur, juste après l'inscription
   * Supabase Auth (voir useAuth.ts:register). Écrit dans 3 tables :
   *  - users            : profil complet (privé, RLS auth.uid() = id)
   *  - usernames        : réservation d'unicité du username
   *  - public_profiles  : vue dénormalisée lisible par tous les
   *                       utilisateurs authentifiés (recherche de contacts)
   */
  async createUser(dto: CreateUserDTO): Promise<User> {
    logInfo(`${CTX}.createUser`, { id: dto.id, username: dto.username });
    try {
      const now = new Date().toISOString();
      const usernameLower = dto.username.toLowerCase();

      const { data: userRow, error: userError } = await supabase
        .from(TABLES.USERS)
        .insert({
          id: dto.id,
          email: dto.email,
          username: usernameLower,
          display_name: dto.displayName,
          is_online: true,
          last_seen: now,
          is_email_verified: false,
          ai_enabled: true,
          e2e_public_key: dto.publicKeyB64 ?? null,
          created_at: now,
          updated_at: now,
        })
        .select()
        .single();
      if (userError) {
        // Préserve le code/message d'origine (ex: violation RLS 42501) au
        // lieu de le re-wrapper dans un nouvel Error — indispensable pour
        // que formatErrorForUser() (voir useAuth.ts) puisse afficher le
        // vrai code de diagnostic plutôt que "unknown".
        logError(`${CTX}.createUser:users`, userError);
        throw userError;
      }

      const { error: usernameError } = await supabase
        .from(TABLES.USERNAMES)
        .insert({ username: usernameLower, uid: dto.id });
      if (usernameError) {
        logError(`${CTX}.createUser:usernames`, usernameError);
        throw usernameError;
      }

      const { error: profileError } = await supabase
        .from(TABLES.PUBLIC_PROFILES)
        .insert({
          id: dto.id,
          username: usernameLower,
          display_name: dto.displayName,
          is_online: true,
          last_seen: now,
          e2e_public_key: dto.publicKeyB64 ?? null,
        });
      if (profileError) {
        logError(`${CTX}.createUser:public_profiles`, profileError);
        throw profileError;
      }

      logInfo(`${CTX}.createUser:✓`, { id: dto.id });
      return rowToUser(userRow);
    } catch (err: any) {
      logError(`${CTX}.createUser`, err);
      throw err;
    }
  }

  /**
   * Récupère un utilisateur par son ID (table `users`, lecture privée —
   * uniquement l'utilisateur lui-même, RLS auth.uid() = id).
   */
  async getUserById(id: string): Promise<User | null> {
    logInfo(`${CTX}.getUserById`, { id });
    try {
      const { data, error } = await supabase
        .from(TABLES.USERS)
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error) throw new Error(`Erreur lecture utilisateur : ${error.message}`);
      if (!data) {
        logInfo(`${CTX}.getUserById:notFound`, { id });
        return null;
      }
      logInfo(`${CTX}.getUserById:✓`, { id });
      return rowToUser(data);
    } catch (err: any) {
      logError(`${CTX}.getUserById`, err);
      throw err;
    }
  }

  /**
   * Recherche des utilisateurs par préfixe de username (table
   * `public_profiles`, lecture pour tous les utilisateurs authentifiés).
   */
  async searchUsersByUsername(query: string, excludeUserId: string): Promise<UserProfile[]> {
    logInfo(`${CTX}.searchUsersByUsername`, { query });
    try {
      const { data, error } = await supabase
        .from(TABLES.PUBLIC_PROFILES)
        .select('*')
        .ilike('username', `${query.toLowerCase()}%`)
        .neq('id', excludeUserId)
        .limit(20);
      if (error) throw new Error(`Erreur recherche utilisateurs : ${error.message}`);
      const results = (data ?? []).map(rowToUserProfile);
      logInfo(`${CTX}.searchUsersByUsername:✓`, { query, count: results.length });
      return results;
    } catch (err: any) {
      logError(`${CTX}.searchUsersByUsername`, err);
      throw err;
    }
  }

  /**
   * Met à jour des champs du profil utilisateur (users + public_profiles,
   * pour les champs partagés entre les deux tables).
   */
  async updateUser(userId: string, updates: UpdateUserDTO): Promise<void> {
    logInfo(`${CTX}.updateUser`, { userId, fields: Object.keys(updates) });
    try {
      const now = new Date().toISOString();
      const usersUpdate: Record<string, unknown> = { updated_at: now };
      const profileUpdate: Record<string, unknown> = {};

      if (updates.displayName !== undefined) {
        usersUpdate.display_name = updates.displayName;
        profileUpdate.display_name = updates.displayName;
      }
      if (updates.photoURL !== undefined) {
        usersUpdate.photo_url = updates.photoURL;
        profileUpdate.photo_url = updates.photoURL;
      }
      if (updates.bio !== undefined) {
        usersUpdate.bio = updates.bio;
        profileUpdate.bio = updates.bio;
      }
      if (updates.aiEnabled !== undefined) {
        usersUpdate.ai_enabled = updates.aiEnabled;
      }

      const { error: userError } = await supabase
        .from(TABLES.USERS)
        .update(usersUpdate)
        .eq('id', userId);
      if (userError) throw new Error(`Erreur mise à jour utilisateur : ${userError.message}`);

      if (Object.keys(profileUpdate).length > 0) {
        const { error: profileError } = await supabase
          .from(TABLES.PUBLIC_PROFILES)
          .update(profileUpdate)
          .eq('id', userId);
        if (profileError) throw new Error(`Erreur mise à jour profil public : ${profileError.message}`);
      }

      logInfo(`${CTX}.updateUser:✓`, { userId });
    } catch (err: any) {
      logError(`${CTX}.updateUser`, err);
      throw err;
    }
  }

  /**
   * Met à jour le statut en ligne / dernière connexion (users + public_profiles).
   */
  async updateOnlineStatus(userId: string, isOnline: boolean): Promise<void> {
    logInfo(`${CTX}.updateOnlineStatus`, { userId, isOnline });
    try {
      const now = new Date().toISOString();
      const payload = { is_online: isOnline, last_seen: now, updated_at: now };

      const { error: userError } = await supabase
        .from(TABLES.USERS)
        .update(payload)
        .eq('id', userId);
      if (userError) throw new Error(`Erreur updateOnlineStatus (users) : ${userError.message}`);

      const { error: profileError } = await supabase
        .from(TABLES.PUBLIC_PROFILES)
        .update({ is_online: isOnline, last_seen: now })
        .eq('id', userId);
      if (profileError) {
        // Non bloquant : le statut "users" est la source de vérité,
        // public_profiles n'est qu'une vue dénormalisée pour la recherche.
        logError(`${CTX}.updateOnlineStatus:public_profiles`, profileError);
      }

      logInfo(`${CTX}.updateOnlineStatus:✓`, { userId, isOnline });
    } catch (err: any) {
      logError(`${CTX}.updateOnlineStatus`, err);
      throw err;
    }
  }

  /**
   * Publie la clé publique E2E (chiffrement de bout en bout) — users + public_profiles.
   */
  async publishE2EPublicKey(userId: string, publicKeyB64: string): Promise<void> {
    logInfo(`${CTX}.publishE2EPublicKey`, { userId });
    try {
      const { error: userError } = await supabase
        .from(TABLES.USERS)
        .update({ e2e_public_key: publicKeyB64, updated_at: new Date().toISOString() })
        .eq('id', userId);
      if (userError) throw new Error(`Erreur publication clé E2E (users) : ${userError.message}`);

      const { error: profileError } = await supabase
        .from(TABLES.PUBLIC_PROFILES)
        .update({ e2e_public_key: publicKeyB64 })
        .eq('id', userId);
      if (profileError) throw new Error(`Erreur publication clé E2E (public_profiles) : ${profileError.message}`);

      logInfo(`${CTX}.publishE2EPublicKey:✓`, { userId });
    } catch (err: any) {
      logError(`${CTX}.publishE2EPublicKey`, err);
      throw err;
    }
  }

  /**
   * Met à jour le token FCM (notifications push).
   */
  async updateFcmToken(userId: string, token: string): Promise<void> {
    logInfo(`${CTX}.updateFcmToken`, { userId });
    try {
      const { error } = await supabase
        .from(TABLES.USERS)
        .update({ fcm_token: token, updated_at: new Date().toISOString() })
        .eq('id', userId);
      if (error) throw new Error(`Erreur mise à jour token FCM : ${error.message}`);
      logInfo(`${CTX}.updateFcmToken:✓`, { userId });
    } catch (err: any) {
      logError(`${CTX}.updateFcmToken`, err);
      throw err;
    }
  }

  /**
   * Supprime la ligne `users` de l'utilisateur (cascade vers usernames et
   * public_profiles via ON DELETE CASCADE, voir schema.sql). La suppression
   * du compte d'authentification lui-même (auth.users) est faite séparément
   * par AuthService.deleteAccount() via la fonction RPC `delete_user`.
   */
  async deleteUser(userId: string): Promise<void> {
    logInfo(`${CTX}.deleteUser`, { userId });
    try {
      const { error } = await supabase
        .from(TABLES.USERS)
        .delete()
        .eq('id', userId);
      if (error) throw new Error(`Erreur suppression utilisateur : ${error.message}`);
      logInfo(`${CTX}.deleteUser:✓`, { userId });
    } catch (err: any) {
      logError(`${CTX}.deleteUser`, err);
      throw err;
    }
  }
}

export const userRepository = new SupabaseUserRepository();
