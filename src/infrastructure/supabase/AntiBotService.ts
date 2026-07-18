/**
 * AntiBotService
 *
 * Client léger pour la Edge Function `anti-bot-guard`. Envoie les
 * signaux collectés côté formulaire (honeypot, délai de remplissage)
 * et retourne la décision prise côté serveur.
 *
 * Politique de repli : si l'appel réseau échoue (function down, pas de
 * connexion), on n'empêche pas un utilisateur légitime de s'inscrire
 * ou de se connecter — on journalise et on laisse passer. Le rate
 * limiting et le honeypot restent des mesures de réduction du bruit,
 * pas la seule ligne de défense du compte (mot de passe + vérification
 * email restent obligatoires).
 */
import { supabase } from './config';
import { logError, logInfo } from '@shared/utils/logger';

export type AntiBotAction = 'register' | 'login';

export interface AntiBotCheckParams {
  action: AntiBotAction;
  email: string;
  /** Valeur du champ honeypot — doit être vide pour un utilisateur humain. */
  honeypot: string;
  /** Heure d'ouverture du formulaire (ms epoch), voir getFormOpenedAt(). */
  formOpenedAt: number;
}

export interface AntiBotResult {
  allowed: boolean;
  decision: 'allow' | 'verify' | 'block';
  reason: string;
}

const FAIL_OPEN_RESULT: AntiBotResult = { allowed: true, decision: 'allow', reason: 'guard_unavailable' };

class AntiBotService {
  async check(params: AntiBotCheckParams): Promise<AntiBotResult> {
    try {
      const { data, error } = await supabase.functions.invoke('anti-bot-guard', {
        body: params,
      });

      if (error) {
        logError('AntiBotService.check', error);
        return FAIL_OPEN_RESULT;
      }

      const result = data as AntiBotResult;
      logInfo('AntiBotService.check:✓', { action: params.action, decision: result.decision });
      return result;
    } catch (err: any) {
      logError('AntiBotService.check', err);
      return FAIL_OPEN_RESULT;
    }
  }
}

export const antiBotService = new AntiBotService();
