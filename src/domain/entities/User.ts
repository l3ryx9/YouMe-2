/**
 * Entité domaine : Utilisateur
 * Représente un utilisateur de YouMe V2.
 */
export interface User {
  id: string;
  email: string;
  username: string;
  displayName: string;
  photoURL?: string;
  bio?: string;
  isOnline: boolean;
  lastSeen: Date;
  createdAt: Date;
  updatedAt: Date;
  isEmailVerified: boolean;
  aiEnabled: boolean;
  fcmToken?: string;
  /** Clé publique E2E (Base64), publiée pour le chiffrement de bout en bout. */
  e2ePublicKey?: string;
}

export interface UserProfile {
  id: string;
  username: string;
  displayName: string;
  photoURL?: string;
  bio?: string;
  isOnline: boolean;
  lastSeen: Date;
}

export type CreateUserDTO = {
  id: string;
  email: string;
  password?: string;
  username: string;
  displayName: string;
  /** Clé publique E2E (Base64). Incluse dans publicProfiles au moment de la création. */
  publicKeyB64?: string;
};

export type UpdateUserDTO = Partial<Pick<User, 'displayName' | 'photoURL' | 'bio' | 'aiEnabled'>>;
