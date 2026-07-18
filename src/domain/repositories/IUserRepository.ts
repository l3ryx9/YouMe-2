/**
 * Interface Repository : Utilisateurs
 * Définit le contrat pour l'accès aux données utilisateur.
 */
import type { User, UserProfile, CreateUserDTO, UpdateUserDTO } from '../entities/User';

export interface IUserRepository {
  /** id est obligatoire (uid Firebase). publicKeyB64 facultatif (E2E). */
  createUser(data: CreateUserDTO): Promise<User>;
  getUserById(id: string): Promise<User | null>;
  getUserByUsername(username: string): Promise<UserProfile | null>;
  updateUser(id: string, data: UpdateUserDTO): Promise<User>;
  deleteUser(id: string): Promise<void>;
  isUsernameAvailable(username: string): Promise<boolean>;
  updateOnlineStatus(id: string, isOnline: boolean): Promise<void>;
  updateFcmToken(id: string, token: string): Promise<void>;
  updateAiEnabled(id: string, enabled: boolean): Promise<void>;
  searchUsersByUsername(query: string): Promise<UserProfile[]>;
}
