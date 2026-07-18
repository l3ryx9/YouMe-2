-- ============================================================
-- Fix : la table `conversations` n'était jamais ajoutée à la
-- publication realtime, contrairement à messages/partners/etc.
-- Résultat : l'écran Messages ne recevait aucun événement
-- postgres_changes et ne se rafraîchissait qu'au redémarrage
-- de l'app (rechargement initial au montage de l'écran).
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'conversations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
  END IF;
END $$;
