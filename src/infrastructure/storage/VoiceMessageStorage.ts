/**
 * Couche abstraite de stockage des messages vocaux
 * Les fichiers audio sont stockés UNIQUEMENT localement (jamais Firebase Storage).
 * Cette couche est remplaçable par toute autre implémentation de stockage local.
 */
import * as FileSystem from 'expo-file-system';
import { v4 as uuidv4 } from 'uuid';

export interface VoiceFileInfo {
  id: string;
  localPath: string;
  duration: number;
  size: number;
  createdAt: Date;
}

export interface IVoiceStorage {
  save(sourceUri: string, duration: number): Promise<VoiceFileInfo>;
  delete(localPath: string): Promise<void>;
  exists(localPath: string): Promise<boolean>;
  getInfo(localPath: string): Promise<{ size: number; exists: boolean }>;
  clearAll(): Promise<void>;
}

/**
 * Implémentation Expo FileSystem
 * Stocke les fichiers dans le répertoire document de l'application.
 */
export class ExpoVoiceStorage implements IVoiceStorage {
  private readonly baseDir: string;

  constructor() {
    this.baseDir = `${FileSystem.documentDirectory}voice_messages/`;
  }

  /**
   * Assure que le répertoire de stockage existe.
   */
  private async ensureDir(): Promise<void> {
    const info = await FileSystem.getInfoAsync(this.baseDir);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(this.baseDir, { intermediates: true });
    }
  }

  /**
   * Sauvegarde un fichier audio depuis l'URI temporaire d'enregistrement.
   * Retourne les informations du fichier sauvegardé.
   */
  async save(sourceUri: string, duration: number): Promise<VoiceFileInfo> {
    await this.ensureDir();
    const id = uuidv4();
    const extMatch = sourceUri.match(/\.([a-zA-Z0-9]+)$/);
    const ext = extMatch ? extMatch[1] : 'wav';
    const localPath = `${this.baseDir}${id}.${ext}`;

    await FileSystem.copyAsync({ from: sourceUri, to: localPath });
    const info = await FileSystem.getInfoAsync(localPath);

    return {
      id,
      localPath,
      duration,
      size: info.exists ? (info as any).size ?? 0 : 0,
      createdAt: new Date(),
    };
  }

  /**
   * Supprime un fichier audio local.
   */
  async delete(localPath: string): Promise<void> {
    const info = await FileSystem.getInfoAsync(localPath);
    if (info.exists) {
      await FileSystem.deleteAsync(localPath, { idempotent: true });
    }
  }

  /**
   * Vérifie si un fichier existe.
   */
  async exists(localPath: string): Promise<boolean> {
    const info = await FileSystem.getInfoAsync(localPath);
    return info.exists;
  }

  /**
   * Retourne les informations d'un fichier.
   */
  async getInfo(localPath: string): Promise<{ size: number; exists: boolean }> {
    const info = await FileSystem.getInfoAsync(localPath);
    if (!info.exists) return { size: 0, exists: false };
    return { size: (info as any).size ?? 0, exists: true };
  }

  /**
   * Supprime tous les fichiers vocaux (nettoyage complet).
   */
  async clearAll(): Promise<void> {
    const info = await FileSystem.getInfoAsync(this.baseDir);
    if (info.exists) {
      await FileSystem.deleteAsync(this.baseDir, { idempotent: true });
    }
  }

  /**
   * Retourne la liste de tous les fichiers vocaux.
   */
  async listAll(): Promise<string[]> {
    await this.ensureDir();
    const files = await FileSystem.readDirectoryAsync(this.baseDir);
    return files.map((f) => `${this.baseDir}${f}`);
  }

  /**
   * Calcule la taille totale du stockage vocal.
   */
  async getTotalSize(): Promise<number> {
    const files = await this.listAll();
    let total = 0;
    for (const file of files) {
      const info = await FileSystem.getInfoAsync(file);
      if (info.exists) total += (info as any).size ?? 0;
    }
    return total;
  }
}

export const voiceStorage = new ExpoVoiceStorage();
