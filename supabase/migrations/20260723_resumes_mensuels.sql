-- ══════════════════════════════════════════════════════════════════════════════
-- Résumés mensuels consolidés — réduit le contexte des analyses quotidiennes
-- ══════════════════════════════════════════════════════════════════════════════
--
-- Problème : le prompt de l'analyse quotidienne relit jusqu'à 50 `faits_cles`
-- à chaque exécution pour détecter des incohérences dans le temps. Cette
-- liste grossit indéfiniment mois après mois, ce qui rallonge et renchérit
-- chaque appel Gemini sans que l'essentiel change beaucoup.
--
-- Solution : au 1er jour de chaque mois (heure de Paris), avant l'analyse du
-- jour, la Edge Function condense tous les `faits_cles` du mois précédent en
-- un résumé compact (`resumes_mensuels`) — ne gardant que ce qui est
-- vraiment durable (projets, décisions, habitudes récurrentes), pas
-- l'anecdotique. Les analyses quotidiennes suivantes utilisent alors :
--   - ce résumé mensuel pour tout ce qui est antérieur au mois en cours,
--   - les `faits_cles` bruts du mois en cours uniquement (pas tout l'historique).
--
-- Les faits_cles bruts ne sont PAS supprimés (traçabilité, réutilisables si
-- besoin) — seul le CONTEXTE envoyé à Gemini est borné dans le temps.

CREATE TABLE IF NOT EXISTS resumes_mensuels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL,
  personne_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mois text NOT NULL, -- format 'YYYY-MM'
  synthese text NOT NULL,
  traits_stables jsonb DEFAULT '{}',
  faits_marquants text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  UNIQUE (conversation_id, personne_id, mois)
);

CREATE INDEX IF NOT EXISTS idx_resumes_mensuels_conv ON resumes_mensuels(conversation_id, personne_id, mois DESC);

ALTER TABLE resumes_mensuels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "resumes_mensuels_select_participant" ON public.resumes_mensuels
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = resumes_mensuels.conversation_id AND auth.uid() = ANY(c.participant_ids)
  ));
