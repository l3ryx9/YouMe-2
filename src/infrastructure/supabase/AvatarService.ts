/**
 * Service d'avatars — Supabase Storage
 * Remplace src/infrastructure/firebase/AvatarService.ts
 *
 * Bucket : `avatars` (public, accès authentifié)
 * Chemin : avatars/{userId}/avatar.jpg
 *
 * FIX : les règles RLS Supabase Storage exigent que le premier segment
 * du chemin (storage.foldername(name)[1]) soit égal à auth.uid(). Or le
 * chemin utilisé ici était `${userId}.jpg`, SANS "/" — donc
 * storage.foldername() renvoyait un tableau vide et la policy ne
 * matchait jamais, d'où l'erreur "Vérifiez vos règles Supabase
 * Storage." à chaque upload. Le chemin doit être `{userId}/avatar.jpg`.
 */
import { supabase, BUCKETS, TABLES } from './config';
import * as FileSystem from 'expo-file-system';

class SupabaseAvatarService {
  /**
   * Upload ou remplace l'avatar d'un utilisateur.
   * @param userId   ID de l'utilisateur
   * @param localUri URI locale du fichier image
   * @returns URL publique de l'avatar
   */
  async uploadAvatar(userId: string, localUri: string): Promise<string> {
    // Lire le fichier local comme base64
    const base64 = await FileSystem.readAsStringAsync(localUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    // Décoder en binaire
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const filePath = `${userId}/avatar.jpg`;

    // Upload (upsert pour remplacer si déjà présent)
    const { error } = await supabase.storage
      .from(BUCKETS.AVATARS)
      .upload(filePath, bytes.buffer as ArrayBuffer, {
        contentType: 'image/jpeg',
        upsert: true,
      });

    if (error) throw new Error(`Erreur upload avatar : ${error.message}`);

    // Récupérer l'URL publique
    const { data } = supabase.storage.from(BUCKETS.AVATARS).getPublicUrl(filePath);
    const publicUrl = `${data.publicUrl}?t=${Date.now()}`; // cache-bust

    // Mettre à jour le profil utilisateur
    await supabase.from(TABLES.USERS).update({
      photo_url: publicUrl,
      updated_at: new Date().toISOString(),
    }).eq('id', userId);

    await supabase.from(TABLES.PUBLIC_PROFILES).update({
      photo_url: publicUrl,
    }).eq('id', userId);

    return publicUrl;
  }

  /**
   * Supprime l'avatar d'un utilisateur.
   */
  async deleteAvatar(userId: string): Promise<void> {
    await supabase.storage.from(BUCKETS.AVATARS).remove([`${userId}/avatar.jpg`]);
    await supabase.from(TABLES.USERS).update({
      photo_url: null,
      updated_at: new Date().toISOString(),
    }).eq('id', userId);
    await supabase.from(TABLES.PUBLIC_PROFILES).update({
      photo_url: null,
    }).eq('id', userId);
  }

  /**
   * Retourne l'URL publique de l'avatar d'un utilisateur.
   */
  getAvatarUrl(userId: string): string {
    const { data } = supabase.storage
      .from(BUCKETS.AVATARS)
      .getPublicUrl(`${userId}/avatar.jpg`);
    return data.publicUrl;
  }
}

export const avatarService = new SupabaseAvatarService();

/**
 * Export nommé pour les imports directs depuis les écrans.
 * Délègue à avatarService.uploadAvatar().
 */
export async function uploadAvatar(userId: string, localUri: string): Promise<string> {
  return avatarService.uploadAvatar(userId, localUri);
}
