-- ============================================================
-- CORRECTION COMPLÈTE : Bucket "avatars" — Supabase Storage RLS
-- À exécuter dans : Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. Créer ou corriger le bucket "avatars" (public pour lecture)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,         -- lecture publique (les avatars sont visibles sans token)
  5242880,      -- 5 MB max
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public             = true,
  file_size_limit    = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2. Supprimer les anciennes politiques (nettoyage avant recréation)
DROP POLICY IF EXISTS "avatars: upload propriétaire"        ON storage.objects;
DROP POLICY IF EXISTS "avatars: lecture publique"           ON storage.objects;
DROP POLICY IF EXISTS "avatars: mise à jour propriétaire"  ON storage.objects;
DROP POLICY IF EXISTS "avatars: suppression propriétaire"  ON storage.objects;

-- 4. Lecture : PUBLIQUE — tout le monde peut voir un avatar
CREATE POLICY "avatars: lecture publique"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');

-- 5. Upload (INSERT) : l'utilisateur ne peut uploader que dans son dossier
--    Chemin attendu : avatars/{userId}/avatar.jpg
--    (storage.foldername(name))[1] = premier segment du chemin = userId
CREATE POLICY "avatars: upload propriétaire"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'avatars'
  AND auth.role() = 'authenticated'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- 6. Mise à jour (UPDATE / upsert:true) : même règle que l'upload
--    USING = filtre les lignes ciblées
--    WITH CHECK = valide le nouvel état après modification
CREATE POLICY "avatars: mise à jour propriétaire"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'avatars'
  AND auth.uid()::text = (storage.foldername(name))[1]
)
WITH CHECK (
  bucket_id = 'avatars'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- 7. Suppression : réservée au propriétaire du dossier
CREATE POLICY "avatars: suppression propriétaire"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'avatars'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- ============================================================
-- VÉRIFICATION (optionnel — exécuter séparément pour tester)
-- ============================================================
-- SELECT policyname, cmd, qual, with_check
-- FROM pg_policies
-- WHERE tablename = 'objects' AND schemaname = 'storage'
--   AND policyname LIKE 'avatars%';
