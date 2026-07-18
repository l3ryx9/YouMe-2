/**
 * Utilitaires de formatage des dates
 * Style WhatsApp : aujourd'hui/hier/date selon le contexte.
 */
import { format, isToday, isYesterday, differenceInDays, formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';

/**
 * Formate une date pour l'affichage dans la liste des conversations.
 * Style WhatsApp : heure si aujourd'hui, "Hier" si hier, date sinon.
 */
export function formatConversationDate(date: Date): string {
  if (isToday(date)) return format(date, 'HH:mm');
  if (isYesterday(date)) return 'Hier';
  if (differenceInDays(new Date(), date) < 7) {
    return format(date, 'EEEE', { locale: fr });
  }
  return format(date, 'dd/MM/yyyy');
}

/**
 * Formate uniquement l'heure au format français 24h.
 */
export function formatMessageTime(date: Date): string {
  return format(date, 'HH:mm');
}

/**
 * Formate l'horodatage d'un message :
 * - Aujourd'hui → "14:32"
 * - Jours précédents → "lun. 07/07 · 14:32"
 */
export function formatMessageTimestamp(date: Date): string {
  if (isToday(date)) return format(date, 'HH:mm');
  if (isYesterday(date)) return `Hier · ${format(date, 'HH:mm')}`;
  return format(date, 'EEE dd/MM · HH:mm', { locale: fr });
}

/**
 * Formate une date pour les séparateurs de jours dans le chat.
 */
export function formatMessageDay(date: Date): string {
  if (isToday(date)) return 'Aujourd\'hui';
  if (isYesterday(date)) return 'Hier';
  if (differenceInDays(new Date(), date) < 7) {
    return format(date, 'EEEE', { locale: fr });
  }
  return format(date, 'dd MMMM yyyy', { locale: fr });
}

/**
 * Formate la durée "il y a X" pour le dernier message.
 */
export function formatLastSeen(date: Date): string {
  return formatDistanceToNow(date, { addSuffix: true, locale: fr });
}

/**
 * Formate la durée d'un message vocal en MM:SS.
 */
export function formatVoiceDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Vérifie si deux dates sont le même jour.
 */
export function isSameDay(d1: Date, d2: Date): boolean {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}
