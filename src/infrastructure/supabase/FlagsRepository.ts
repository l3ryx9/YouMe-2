/**
 * Lecture/écriture des red flags / green flags temps réel (déclenchés tous
 * les 20 messages par `geminiFlagModule`) dans Supabase.
 *
 * Architecture (voir migrations 20260720 et 20260721) :
 *   - `scores_relationnels` : la JAUGE affichée dans le header du chat.
 *     Persiste dans le temps, n'est JAMAIS purgée automatiquement.
 *   - `comportements` : la LISTE détaillée des flags (avec citation, etc.)
 *     affichée dans le popup ouvert depuis le bouton du header. Purgée
 *     automatiquement chaque nuit à minuit (heure de Paris) — y compris côté
 *     serveur — par la Edge Function `daily-psychological-analysis`.
 *
 * L'écriture passe par le RPC `enregistrer_analyse_flags_temps_reel`
 * (SECURITY DEFINER, vérifie que l'appelant est bien participant de la
 * conversation) plutôt que par des inserts directs, pour pouvoir écrire
 * une ligne de jauge pour les DEUX participants en une seule transaction.
 */
import { supabase, TABLES } from '@infrastructure/supabase/config';
import type { FlagAnalysisResult, RelationshipFlag } from '@domain/entities/Memory';

export interface FlagsGaugeEtListe {
  greenScore: number;
  redScore: number;
  resume: string | null;
  nbMessagesAnalyses: number;
  /** null si aucune analyse n'a encore eu lieu (jauge par défaut 70/70 côté UI) */
  updatedAt: Date | null;
  flags: RelationshipFlag[];
}

const SCORE_DEFAUT = 70;

function confianceVersLabel(confidence: number): 'faible' | 'moyenne' | 'forte' {
  if (confidence >= 0.75) return 'forte';
  if (confidence >= 0.4) return 'moyenne';
  return 'faible';
}

export const flagsRepository = {
  /**
   * Persiste le résultat d'une analyse Gemini (tous les 20 messages) :
   * ajoute les flags détectés à `comportements` et met à jour la jauge
   * `scores_relationnels` (partagée entre les deux participants).
   */
  async persistAnalysis(
    conversationId: string,
    result: FlagAnalysisResult,
    userId: string,
    partnerId: string | null
  ): Promise<{ greenScore: number; redScore: number }> {
    const greenBonus = result.greenFlags.reduce(
      (acc, f) => acc + (f.severity === 'élevé' ? 12 : f.severity === 'modéré' ? 8 : 4),
      0
    );
    const greenScore = Math.min(100, Math.max(0, 50 + greenBonus));

    const redPenalty = result.redFlags.reduce(
      (acc, f) => acc + (f.severity === 'élevé' ? 18 : f.severity === 'modéré' ? 10 : 5),
      0
    );
    const redScore = Math.min(100, Math.max(0, 100 - redPenalty));

    const tousLesFlags = [...result.redFlags, ...result.greenFlags].map((f) => ({
      type: f.type === 'red' ? 'negatif' : 'positif',
      categorie: f.category,
      description: f.explanation,
      extrait_message: f.citation,
      confiance: confianceVersLabel(f.confidence),
      // Rattache le flag à la bonne personne quand on peut la déduire du nom
      // du sender renvoyé par Gemini ; à défaut, l'appelant (comportement
      // par défaut raisonnable : mieux vaut l'attribuer à quelqu'un que de
      // planter l'écriture).
      personne_id: f.sender && partnerId && f.sender.toLowerCase() !== 'vous' ? partnerId : userId,
    }));

    const { error } = await supabase.rpc('enregistrer_analyse_flags_temps_reel', {
      p_conversation_id: conversationId,
      p_flags: tousLesFlags as any,
      p_score_greenflag: greenScore,
      p_score_redflag: redScore,
      p_resume: result.summary ?? null,
      p_nb_messages: result.messageCount,
    });

    if (error) throw error;

    return { greenScore, redScore };
  },

  /**
   * Charge l'état courant (jauge + liste des flags du jour) depuis Supabase.
   * C'est la source de vérité affichée dans le popup — après la purge
   * quotidienne, `flags` revient à `[]` mais la jauge reste inchangée.
   */
  async fetchCurrent(conversationId: string): Promise<FlagsGaugeEtListe> {
    const [{ data: scoreRows }, { data: comportementRows }] = await Promise.all([
      supabase
        .from(TABLES.SCORES_RELATIONNELS)
        .select('*')
        .eq('conversation_id', conversationId)
        .limit(1),
      supabase
        .from(TABLES.COMPORTEMENTS)
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false }),
    ]);

    const scoreRow = scoreRows?.[0];

    const flags: RelationshipFlag[] = (comportementRows ?? []).map((c) => ({
      type: c.type === 'positif' ? 'green' : 'red',
      category: c.categorie ?? 'Comportement',
      severity: c.confiance === 'forte' ? 'élevé' : c.confiance === 'moyenne' ? 'modéré' : 'faible',
      citation: c.extrait_message ?? '',
      explanation: c.description,
      confidence: c.confiance === 'forte' ? 0.85 : c.confiance === 'moyenne' ? 0.6 : 0.35,
    }));

    return {
      greenScore: scoreRow?.score_greenflag ?? SCORE_DEFAUT,
      redScore: scoreRow?.score_redflag ?? SCORE_DEFAUT,
      resume: scoreRow?.resume ?? null,
      nbMessagesAnalyses: scoreRow?.nb_messages_analyses ?? 0,
      updatedAt: scoreRow?.updated_at ? new Date(scoreRow.updated_at) : null,
      flags,
    };
  },

  /**
   * Abonnement temps réel : si le partenaire déclenche une analyse (ou si la
   * purge de minuit passe) pendant que l'écran est ouvert, le popup et la
   * jauge se mettent à jour sans re-fetch manuel.
   */
  subscribeToChanges(conversationId: string, onChange: () => void): () => void {
    const channel = supabase
      .channel(`flags:${conversationId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: TABLES.COMPORTEMENTS, filter: `conversation_id=eq.${conversationId}` },
        onChange
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: TABLES.SCORES_RELATIONNELS, filter: `conversation_id=eq.${conversationId}` },
        onChange
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  },
};
