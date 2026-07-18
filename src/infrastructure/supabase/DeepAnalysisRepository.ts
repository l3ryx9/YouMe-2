/**
 * Lecture des résultats de l'analyse psychologique profonde (Edge Function
 * `daily-psychological-analysis`, tournant chaque nuit à minuit heure de
 * Paris — voir migrations 20260720 et 20260721) : profils par personne,
 * résumés quotidiens, incohérences/contradictions détectées dans le temps.
 *
 * Ce module gère aussi le déclenchement de rattrapage : si l'app était
 * fermée à minuit (ou si pg_cron n'est pas configuré sur le projet
 * Supabase), `isCatchupNeeded` détecte que le cycle 24h manque et
 * `runCatchup` l'exécute (purge puis analyse), en rapportant chaque étape
 * via un callback pour piloter un popup de progression.
 */
import { supabase, TABLES } from '@infrastructure/supabase/config';

export interface ProfilPersonnalite {
  personneId: string;
  traits: Record<string, unknown>;
  ton: string | null;
  sujetsRecurrents: string[];
  conseilsComportementaux: string[];
  updatedAt: Date | null;
}

export interface ResumeQuotidien {
  date: string;
  resume: string;
  variationsHumeur: Array<{ heure?: string; emotion: string; intensite?: number; contexte?: string }>;
  signesPossiblesDeni: string[];
  risqueTromperieEstime: number | null;
  risqueTromperieLabel: 'faible' | 'modéré' | 'élevé' | null;
}

export interface Incoherence {
  id: string;
  personneId: string;
  type: 'contradiction' | 'changement_version' | 'chronologique' | 'factuel';
  citation1: string;
  date1: Date;
  citation2: string;
  date2: Date;
  explication: string;
  gravite: 'faible' | 'modérée' | 'élevée';
}

export const deepAnalysisRepository = {
  async fetchProfiles(conversationId: string): Promise<ProfilPersonnalite[]> {
    const { data, error } = await supabase
      .from(TABLES.PROFILS_PERSONNALITE)
      .select('*')
      .eq('conversation_id', conversationId);
    if (error) throw error;
    return (data ?? []).map((row) => ({
      personneId: row.personne_id,
      traits: (row.traits as Record<string, unknown>) ?? {},
      ton: row.ton,
      sujetsRecurrents: row.sujets_recurrents ?? [],
      conseilsComportementaux: row.conseils_comportementaux ?? [],
      updatedAt: row.updated_at ? new Date(row.updated_at) : null,
    }));
  },

  async fetchLatestSummary(conversationId: string): Promise<ResumeQuotidien | null> {
    const { data, error } = await supabase
      .from(TABLES.RESUMES_QUOTIDIENS)
      .select('*')
      .eq('conversation_id', conversationId)
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
      date: data.date,
      resume: data.resume,
      variationsHumeur: (data.variations_humeur as ResumeQuotidien['variationsHumeur']) ?? [],
      signesPossiblesDeni: data.signes_possibles_deni ?? [],
      risqueTromperieEstime: data.risque_tromperie_estime,
      risqueTromperieLabel: data.risque_tromperie_label,
    };
  },

  async fetchIncoherences(conversationId: string, limite = 20): Promise<Incoherence[]> {
    const { data, error } = await supabase
      .from(TABLES.INCOHERENCES)
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(limite);
    if (error) throw error;
    return (data ?? []).map((row) => ({
      id: row.id,
      personneId: row.personne_id,
      type: row.type,
      citation1: row.citation1,
      date1: new Date(row.date1),
      citation2: row.citation2,
      date2: new Date(row.date2),
      explication: row.explication,
      gravite: row.gravite,
    }));
  },

  /**
   * Vérifie (via le RPC serveur `analyse_quotidienne_manquante`) si le cycle
   * 24h (purge + analyse) n'a pas encore tourné pour cette conversation
   * aujourd'hui — c'est-à-dire que l'app était probablement fermée au
   * moment où il aurait dû se déclencher.
   */
  async isCatchupNeeded(conversationId: string): Promise<boolean> {
    try {
      const { data, error } = await supabase.rpc('analyse_quotidienne_manquante', {
        p_conversation_id: conversationId,
      });
      if (error) return false;
      return !!data;
    } catch (err) {
      console.warn('[deepAnalysisRepository] Vérification du rattrapage échouée :', err);
      return false;
    }
  },

  /**
   * Exécute le rattrapage en deux étapes réelles, chacune liée à sa propre
   * promesse (pas de minuteur factice) :
   *   1. Purge la liste de flags (`comportements`) de CETTE conversation
   *      uniquement — pas les autres, dont le propre rattrapage n'a peut-être
   *      pas encore eu lieu.
   *   2. Déclenche l'analyse profonde du jour côté serveur (profil,
   *      incohérences, résumé).
   * `onStage` permet à l'UI (popup bloquant) de refléter la progression réelle.
   */
  async runCatchup(conversationId: string, onStage: (stage: 'purge' | 'analyse') => void): Promise<void> {
    onStage('purge');
    try {
      const { error } = await supabase.rpc('purger_comportements_conversation', {
        p_conversation_id: conversationId,
      });
      if (error) console.warn('[deepAnalysisRepository] Purge de rattrapage échouée :', error);
    } catch (err) {
      console.warn('[deepAnalysisRepository] Purge de rattrapage échouée :', err);
    }

    onStage('analyse');
    try {
      await supabase.functions.invoke('daily-psychological-analysis', {
        body: { conversationId },
      });
    } catch (err) {
      console.warn('[deepAnalysisRepository] Analyse de rattrapage échouée :', err);
    }
  },

  /** Force une actualisation immédiate (bouton manuel), sans passer par la vérification "déjà fait aujourd'hui" côté client. */
  async forcerActualisation(conversationId: string): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
    const { data, error } = await supabase.functions.invoke('daily-psychological-analysis', {
      body: { conversationId },
    });
    if (error) return { ok: false, error: error.message };
    return data ?? { ok: true };
  },
};
