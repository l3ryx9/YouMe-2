/**
 * Hook useMediaPath
 *
 * Résout le chemin local effectif d'un média de message.
 * Ordre de résolution :
 *   1. Chemin local déjà présent sur cet appareil → utilisation directe
 *   2. Cache local (téléchargement précédent) → utilisation directe
 *   3. storageUrl disponible → téléchargement, cache local, puis :
 *      - si isReceiver=true : acquittement (storageUrl → null dans Firestore + suppression Storage)
 *   4. Aucun des deux → erreur
 */
import { useState, useEffect } from 'react';
import * as FileSystem from 'expo-file-system';
import { downloadAndCacheMedia } from '@infrastructure/supabase/MediaUploadService';
import { messageRepository } from '@infrastructure/supabase/MessageRepository';

interface UseMediaPathParams {
  /** Chemin local fourni par le message (valide seulement sur l'appareil expéditeur) */
  localPath?: string;
  /** URL Firebase Storage (relay de transit) */
  storageUrl?: string;
  /** Identifiant stable du message — sert de nom de fichier en cache */
  messageId: string;
  /** Extension du fichier : jpg, m4a, mp4… */
  ext: string;
  /**
   * ID de la conversation — requis pour l'acquittement de réception.
   * Si fourni ET que isReceiver=true, supprime de Storage après téléchargement.
   */
  conversationId?: string;
  /** True si l'utilisateur courant est le destinataire du message */
  isReceiver?: boolean;
}

interface UseMediaPathResult {
  effectivePath: string | null;
  isDownloading: boolean;
  unavailable: boolean;
}

export function useMediaPath({
  localPath,
  storageUrl,
  messageId,
  ext,
  conversationId,
  isReceiver = false,
}: UseMediaPathParams): UseMediaPathResult {
  const [effectivePath, setEffectivePath] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function resolve() {
      // 1. Chemin local fourni — vérifier qu'il existe sur CET appareil
      if (localPath) {
        const info = await FileSystem.getInfoAsync(localPath);
        if (info.exists) {
          if (!cancelled) setEffectivePath(localPath);
          return;
        }
      }

      // 2. Vérifier le cache local (téléchargement précédent)
      const cachePath = `${FileSystem.documentDirectory}media_cache/${messageId}.${ext}`;
      const cached = await FileSystem.getInfoAsync(cachePath);
      if (cached.exists) {
        if (!cancelled) setEffectivePath(cachePath);
        // Si le fichier est déjà en cache mais storageUrl n'a pas encore été
        // acquitté (ex : crash avant l'ack), on relance l'acquittement silencieusement
        if (isReceiver && storageUrl && conversationId) {
          messageRepository.ackMediaReceived(conversationId, messageId, storageUrl).catch(() => {});
        }
        return;
      }

      // 3. Télécharger depuis Firebase Storage
      if (storageUrl) {
        if (!cancelled) setIsDownloading(true);
        try {
          const path = await downloadAndCacheMedia(storageUrl, messageId, ext);
          if (!cancelled) setEffectivePath(path);

          // Acquittement : supprimer Storage + mettre storageUrl à null dans Firestore
          // Seulement si on est le destinataire et qu'on a l'ID de conversation
          if (isReceiver && conversationId) {
            messageRepository
              .ackMediaReceived(conversationId, messageId, storageUrl)
              .catch(() => {
                // Silencieux : si pas de réseau, le fichier est en cache local.
                // Au prochain lancement, l'étape 2 ci-dessus relancera l'ack.
              });
          }
        } catch {
          if (!cancelled) setUnavailable(true);
        } finally {
          if (!cancelled) setIsDownloading(false);
        }
        return;
      }

      // 4. Rien disponible
      if (!cancelled) setUnavailable(true);
    }

    resolve();
    return () => { cancelled = true; };
  }, [localPath, storageUrl, messageId, ext, conversationId, isReceiver]);

  return { effectivePath, isDownloading, unavailable };
}
