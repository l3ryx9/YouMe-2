-- ============================================================
-- Migration : table app_logs
-- Remonte automatiquement les erreurs de l'application vers
-- Supabase pour permettre le diagnostic à distance.
--
-- À exécuter dans l'éditeur SQL de votre tableau de bord Supabase :
--   https://supabase.com/dashboard → SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS public.app_logs (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at  TIMESTAMPTZ NOT NULL    DEFAULT NOW(),
  level       TEXT        NOT NULL,   -- 'warn' | 'error'
  context     TEXT        NOT NULL,   -- ex: 'MessageRepository.sendMessage'
  code        TEXT,                   -- code technique de l'erreur
  message     TEXT,                   -- message lisible
  stack       TEXT,                   -- stack trace JS (erreurs seulement)
  user_id     UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  platform    TEXT,                   -- 'ios' | 'android' | 'web'
  app_version TEXT                    -- version de l'application
);

-- Index pour accélérer les requêtes de diagnostic
CREATE INDEX IF NOT EXISTS idx_app_logs_level      ON public.app_logs (level);
CREATE INDEX IF NOT EXISTS idx_app_logs_user_id    ON public.app_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_app_logs_created_at ON public.app_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_logs_context    ON public.app_logs (context);

-- ── Row Level Security ────────────────────────────────────────
ALTER TABLE public.app_logs ENABLE ROW LEVEL SECURITY;

-- Un utilisateur peut insérer uniquement ses propres logs
CREATE POLICY "logs_insert" ON public.app_logs
  FOR INSERT WITH CHECK (
    auth.uid() = user_id   -- log authentifié
    OR user_id IS NULL     -- log avant authentification (démarrage, crash)
  );

-- Un utilisateur ne peut lire que ses propres logs (écran debug in-app)
CREATE POLICY "logs_select_own" ON public.app_logs
  FOR SELECT USING (auth.uid() = user_id);

-- Note : le service role (clé service_role, utilisé depuis le dashboard
-- Supabase) contourne le RLS et peut lire tous les logs.

-- ── Nettoyage automatique (optionnel) ────────────────────────
-- Supprime les logs de plus de 30 jours pour éviter l'accumulation.
-- À activer manuellement si vous le souhaitez :
--
-- CREATE EXTENSION IF NOT EXISTS pg_cron;
-- SELECT cron.schedule(
--   'purge_old_app_logs',
--   '0 3 * * *',   -- chaque nuit à 3h
--   $$ DELETE FROM public.app_logs WHERE created_at < NOW() - INTERVAL '30 days' $$
-- );
