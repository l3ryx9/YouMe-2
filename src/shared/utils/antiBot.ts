/**
 * Utilitaires anti-bot côté client (honeypot + délai de soumission).
 *
 * Ces signaux sont collectés côté client puis envoyés à la Edge
 * Function `anti-bot-guard`, qui prend la décision finale côté
 * serveur (le client ne peut pas être fiable pour appliquer une
 * règle de sécurité — il ne fait que fournir les signaux bruts).
 *
 * Voir `src/infrastructure/supabase/AntiBotService.ts` pour l'appel
 * réseau et `supabase/functions/anti-bot-guard/index.ts` pour la
 * logique de décision (honeypot, timing, rate limiting, score de
 * risque, journalisation).
 */
import type { StyleProp, ViewStyle } from 'react-native';

/** Nom du champ honeypot — doit rester vide pour un utilisateur humain. */
export const HONEYPOT_FIELD_NAME = 'website';

/**
 * Style rendant le champ honeypot invisible et inaccessible au
 * clavier/lecteur d'écran pour un utilisateur humain, tout en restant
 * présent dans le DOM/l'arbre de rendu pour que les bots naïfs
 * (qui remplissent tous les champs d'un formulaire) le renseignent.
 */
export const honeypotFieldStyle: StyleProp<ViewStyle> = {
  position: 'absolute',
  width: 1,
  height: 1,
  opacity: 0,
  left: -9999,
};

/** Capture l'heure d'ouverture du formulaire, en ms epoch. */
export function getFormOpenedAt(): number {
  return Date.now();
}
