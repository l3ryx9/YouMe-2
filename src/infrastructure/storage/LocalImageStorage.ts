/**
 * Stockage local des images ET vidéos de chat
 * Les fichiers sont stockés UNIQUEMENT sur l'appareil de l'expéditeur.
 *
 * FIX BUG — L'ancienne version sauvegardait toujours en .jpg même pour les vidéos.
 * Le fichier était copié sous img_XXXXX.jpg alors que son contenu était une vidéo .mp4.
 * Maintenant l'extension originale est préservée.
 */
import * as FileSystem from 'expo-file-system';

export interface ImageFileInfo {
  localPath: string;
  size: number;
}

class LocalImageStorage {
  private readonly baseDir = `${FileSystem.documentDirectory}chat_images/`;

  private async ensureDir(): Promise<void> {
    const info = await FileSystem.getInfoAsync(this.baseDir);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(this.baseDir, { intermediates: true });
    }
  }

  async save(sourceUri: string): Promise<ImageFileInfo> {
    await this.ensureDir();

    // FIX : extraire l'extension réelle de l'URI source
    // Ex : content://media/external/video/1234 → fallback 'mp4'
    // Ex : file:///...photo.jpg → 'jpg'
    // Ex : file:///...video.mov → 'mov'
    const extMatch = sourceUri.match(/\.([a-zA-Z0-9]+)(?:\?.*)?$/);
    const ext = extMatch ? extMatch[1].toLowerCase() : 'jpg';

    const filename = `media_${Date.now()}.${ext}`;
    const localPath = `${this.baseDir}${filename}`;
    await FileSystem.copyAsync({ from: sourceUri, to: localPath });
    const info = await FileSystem.getInfoAsync(localPath, { size: true });
    return { localPath, size: (info as any).size ?? 0 };
  }

  async exists(localPath: string): Promise<boolean> {
    const info = await FileSystem.getInfoAsync(localPath);
    return info.exists;
  }

  async delete(localPath: string): Promise<void> {
    await FileSystem.deleteAsync(localPath, { idempotent: true });
  }
}

export const localImageStorage = new LocalImageStorage();
