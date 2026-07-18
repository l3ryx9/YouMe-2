-- ============================================================
-- Migration : bucket temp-media + politiques Storage
-- À exécuter dans Supabase SQL Editor
-- ============================================================

-- 1. Créer le bucket temp-media s'il n'existe pas
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'temp-media',
  'temp-media',
  true,                          -- lecture publique (le destinataire télécharge sans token)
  52428800,                      -- 50 MB max par fichier
  ARRAY[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'video/mp4', 'video/quicktime', 'video/webm',
    'audio/m4a', 'audio/aac', 'audio/wav', 'audio/mpeg',
    'application/octet-stream'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit   = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2. Activer RLS sur storage.objects (nécessaire pour les politiques)
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- 3. Supprimer les anciennes politiques si elles existent
DROP POLICY IF EXISTS "temp-media: upload authentifié"  ON storage.objects;
DROP POLICY IF EXISTS "temp-media: lecture publique"    ON storage.objects;
DROP POLICY IF EXISTS "temp-media: suppression propriétaire" ON storage.objects;

-- 4. Upload : tout utilisateur authentifié peut envoyer un fichier
CREATE POLICY "temp-media: upload authentifié"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'temp-media'
  AND auth.role() = 'authenticated'
);

-- 5. Lecture : publique (le destinataire télécharge l'URL publique)
CREATE POLICY "temp-media: lecture publique"
ON storage.objects FOR SELECT
USING (bucket_id = 'temp-media');

-- 6. Suppression : réservée aux utilisateurs authentifiés
--    (le service supprime le fichier après confirmation du cache local)
CREATE POLICY "temp-media: suppression propriétaire"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'temp-media'
  AND auth.role() = 'authenticated'
);

-- ============================================================
-- Bucket avatars (si pas déjà configuré)
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  5242880,   -- 5 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "avatars: upload propriétaire" ON storage.objects;
DROP POLICY IF EXISTS "avatars: lecture publique"    ON storage.objects;

CREATE POLICY "avatars: upload propriétaire"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'avatars'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "avatars: lecture publique"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');

CREATE POLICY "avatars: mise à jour propriétaire"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'avatars'
  AND auth.uid()::text = (storage.foldername(name))[1]
);
