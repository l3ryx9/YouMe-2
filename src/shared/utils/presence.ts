/**
 * Utilitaires de présence (statut en ligne).
 *
 * Problème résolu : `is_online` était mis à jour uniquement sur les
 * événements AppState (premier plan / arrière-plan). Si l'app est tuée
 * de force (swipe depuis les apps récentes) ou si le réseau coupe
 * brutalement, aucun événement JS ne se déclenche côté client pour
 * repasser l'utilisateur hors ligne — la ligne reste bloquée à
 * `is_online = true` indéfiniment.
 *
 * Solution : ne plus jamais faire confiance au flag `is_online` seul.
 * On le combine avec la fraîcheur de `last_seen` : si aucun heartbeat
 * n'a été reçu depuis plus de `PRESENCE_STALE_MS`, on considère la
 * personne hors ligne même si `is_online` dit encore `true`.
 *
 * Ça suppose qu'un heartbeat régulier est envoyé tant que l'app est
 * active (voir `PRESENCE_HEARTBEAT_MS` et son usage dans app/_layout.tsx).
 */

/** Intervalle d'envoi du heartbeat tant que l'app est au premier plan. */
export const PRESENCE_HEARTBEAT_MS = 25_000;

/**
 * Durée après laquelle on considère un `last_seen` comme périmé.
 * Doit être significativement plus grand que PRESENCE_HEARTBEAT_MS
 * pour tolérer une perte de heartbeat ponctuelle (réseau instable).
 */
export const PRESENCE_STALE_MS = 45_000;

/**
 * Détermine si un utilisateur doit être affiché comme "en ligne",
 * en tenant compte à la fois du flag `isOnline` ET de la fraîcheur
 * de `lastSeen`. Ne JAMAIS afficher "en ligne" sur la seule base du
 * flag brut — voir explication en tête de fichier.
 */
export function isEffectivelyOnline(
  isOnline: boolean | null | undefined,
  lastSeen: Date | string | null | undefined,
  staleMs: number = PRESENCE_STALE_MS
): boolean {
  if (!isOnline) return false;
  if (!lastSeen) return false;
  const lastSeenMs = lastSeen instanceof Date ? lastSeen.getTime() : new Date(lastSeen).getTime();
  if (Number.isNaN(lastSeenMs)) return false;
  return Date.now() - lastSeenMs < staleMs;
}
