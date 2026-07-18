/**
 * Service d'upload/download de médias — Supabase Storage
 * Remplace src/infrastructure/firebase/MediaUploadService.ts
 *
 * Modèle de transit :
 *  - L'expéditeur upload dans temp-media/{uuid}.{ext}
 *  - L'URL publique (storageUrl) est stockée dans le message
 *  - Le destinataire télécharge localement PUIS confirme la réception
 *  - Le fichier n'est supprimé de Storage QU'APRÈS confirmation du cache local
 *  - Les avatars (avatars/{userId}.jpg) ne passent PAS par ce service
 */
import { supabase, BUCKETS } from './config';
import * as FileSystem from 'expo-file-system';
import { v4 as uuidv4 } from 'uuid';

const MEDIA_CACHE_DIR = `${FileSystem.documentDirectory}media_cache/`;

async function ensureCacheDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(MEDIA_CACHE_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(MEDIA_CACHE_DIR, { intermediates: true });
  }
}

const MIME_MAP: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  m4a: 'audio/m4a',
  wav: 'audio/wav',
  aac: 'audio/aac',
};

/**
 * Upload un fichier local vers Supabase Storage (bucket temp-media).
 * Retourne l'URL publique de téléchargement.
 *
 * Méthode React Native fiable : FormData + fetch direct vers l'API REST Supabase Storage.
 * - fetch(localUri) échoue sur Android ("Network request failed")
 * - supabase.storage.upload(blob) échoue sur Android (ArrayBuffer non supporté)
 * - FormData avec { uri, name, type } est le seul moyen fiable sur Android ET iOS
 */
export async function uploadMedia(localUri: string, ext: string): Promise<string> {
  const filename = `${uuidv4()}.${ext}`;
  const contentType = MIME_MAP[ext.toLowerCase()] ?? 'application/octet-stream';

  // Récupérer le token de session pour autoriser l'upload
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Non authentifié — veuillez vous reconnecter.');

  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) throw new Error('EXPO_PUBLIC_SUPABASE_URL manquant dans .env');

  // FormData avec URI local : React Native (Android + iOS) lit le fichier nativement
  const formData = new FormData();
  formData.append('file', {
    uri: localUri,
    name: filename,
    type: contentType,
  } as any);

  const response = await fetch(
    `${supabaseUrl}/storage/v1/object/${BUCKETS.TEMP_MEDIA}/${filename}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'x-upsert': 'false',
      },
      body: formData,
    }
  );

  if (!response.ok) {
    const body = await response.text().catch(() => `HTTP ${response.status}`);
    if (response.status === 401 || response.status === 403) {
      throw new Error(
        "Envoi refusé par Supabase Storage. Vérifiez que le bucket 'temp-media' " +
        "existe et que les politiques RLS autorisent l'upload pour les utilisateurs authentifiés."
      );
    }
    throw new Error(`Erreur upload média : ${body}`);
  }

  const { data } = supabase.storage.from(BUCKETS.TEMP_MEDIA).getPublicUrl(filename);
  return data.publicUrl;
}

/**
 * Télécharge un média depuis Supabase Storage vers le cache local.
 * Idempotent : si le fichier est déjà en cache, retourne le chemin existant.
 */
export async function downloadAndCacheMedia(
  storageUrl: string,
  messageId: string,
  ext: string
): Promise<string> {
  await ensureCacheDir();
  const localPath = `${MEDIA_CACHE_DIR}${messageId}.${ext}`;

  const info = await FileSystem.getInfoAsync(localPath);
  if (info.exists) return localPath;

  const result = await FileSystem.downloadAsync(storageUrl, localPath);
  if (result.status !== 200) throw new Error(`Téléchargement échoué : HTTP ${result.status}`);

  const finalInfo = await FileSystem.getInfoAsync(localPath);
  if (!finalInfo.exists) throw new Error('Fichier introuvable après téléchargement.');

  return localPath;
}

/**
 * Extrait le chemin Supabase Storage depuis une URL publique.
 * Format : https://{project}.supabase.co/storage/v1/object/public/{bucket}/{path}
 */
function storagePathFromUrl(publicUrl: string): { bucket: string; path: string } | null {
  try {
    const url = new URL(publicUrl);
    // /storage/v1/object/public/{bucket}/{path...}
    const match = url.pathname.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/);
    if (!match) return null;
    return { bucket: match[1], path: match[2] };
  } catch {
    return null;
  }
}

/**
 * Supprime un fichier du relay Supabase Storage.
 * À appeler UNIQUEMENT après avoir confirmé que le cache local est valide.
 * Silencieux si le fichier n'existe plus.
 */
export async function deleteMediaFromStorage(storageUrl: string): Promise<void> {
  try {
    const parsed = storagePathFromUrl(storageUrl);
    if (!parsed) return;
    await supabase.storage.from(parsed.bucket).remove([parsed.path]);
  } catch {
    // Silencieux : déjà supprimé ou URL invalide
  }
}
