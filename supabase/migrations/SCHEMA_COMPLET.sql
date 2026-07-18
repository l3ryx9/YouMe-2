-- ============================================================
-- YouMe — SCHÉMA COMPLET (tables + RLS + index + Storage + Realtime)
-- Version consolidée — intègre tous les correctifs de bugs et de sécurité
--
-- ⚠️  À exécuter UNE SEULE FOIS sur une base vide.
--     Si ta base a déjà des tables, utilise les migrations séparées.
--
-- Ordre d'exécution dans Supabase SQL Editor :
--   1. Colle ce fichier entier
--   2. Clique Run query (confirme l'avertissement "destructive")
--   3. Vérifie "Success. No rows returned"
-- ============================================================


-- ============================================================
-- 0. EXTENSIONS
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";


-- ============================================================
-- 1. TABLES
-- ============================================================

-- ── users ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.users (
  id                UUID        PRIMARY KEY,          -- = auth.uid()
  email             TEXT        NOT NULL UNIQUE,
  username          TEXT        NOT NULL UNIQUE,
  display_name      TEXT        NOT NULL,
  photo_url         TEXT,
  bio               TEXT,
  is_online         BOOLEAN     NOT NULL DEFAULT false,
  last_seen         TIMESTAMPTZ,
  is_email_verified BOOLEAN     NOT NULL DEFAULT false,
  ai_enabled        BOOLEAN     NOT NULL DEFAULT true,
  fcm_token         TEXT,
  native_fcm_token  TEXT,
  e2e_public_key    TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── usernames ────────────────────────────────────────────────
-- Réserve les pseudos (contrainte d'unicité forte)
CREATE TABLE IF NOT EXISTS public.usernames (
  username TEXT PRIMARY KEY,
  uid      UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE
);

-- ── public_profiles ──────────────────────────────────────────
-- Vue dénormalisée lisible par tous les utilisateurs connectés
CREATE TABLE IF NOT EXISTS public.public_profiles (
  id             UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  username       TEXT        NOT NULL UNIQUE,
  display_name   TEXT        NOT NULL,
  photo_url      TEXT,
  bio            TEXT,
  is_online      BOOLEAN     NOT NULL DEFAULT false,
  last_seen      TIMESTAMPTZ,
  e2e_public_key TEXT
);

-- ── conversations ────────────────────────────────────────────
-- FIX : unread_count INTEGER (pas JSONB — bug corrigé)
CREATE TABLE IF NOT EXISTS public.conversations (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  participant_ids UUID[]      NOT NULL,
  last_message    JSONB,
  unread_count    INTEGER     NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── messages ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.messages (
  id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id  UUID        NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id        UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  receiver_id      UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type             TEXT        NOT NULL,  -- 'text' | 'image' | 'voice' | 'video' | 'location'
  content          TEXT,
  voice_local_path TEXT,
  voice_duration   REAL,
  image_local_path TEXT,
  video_local_path TEXT,
  storage_url      TEXT,
  status           TEXT        NOT NULL DEFAULT 'sent',  -- 'sent' | 'delivered' | 'read'
  is_deleted       BOOLEAN     NOT NULL DEFAULT false,
  ai_analysis      JSONB,
  reactions        JSONB,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── partner_requests ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.partner_requests (
  id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  sender_id           UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  sender_username     TEXT        NOT NULL,
  sender_display_name TEXT        NOT NULL,
  sender_photo_url    TEXT,
  receiver_id         UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status              TEXT        NOT NULL DEFAULT 'pending',  -- 'pending' | 'accepted' | 'rejected'
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- FIX : empêche les doublons de demandes en attente
  UNIQUE (sender_id, receiver_id)
);

-- ── partners ─────────────────────────────────────────────────
-- FIX : ajout colonne id (manquante → crash "null value in column id")
CREATE TABLE IF NOT EXISTS public.partners (
  id                   UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id              UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  partner_id           UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  partner_username     TEXT        NOT NULL,
  partner_display_name TEXT        NOT NULL,
  partner_photo_url    TEXT,
  conversation_id      UUID        NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, partner_id)
);

-- ── location_shares ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.location_shares (
  id                UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID            NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  conversation_id   UUID            NOT NULL UNIQUE,  -- une seule position active par conversation
  latitude          DOUBLE PRECISION NOT NULL,
  longitude         DOUBLE PRECISION NOT NULL,
  accuracy          REAL,
  speed             REAL,
  is_mocked         BOOLEAN         NOT NULL DEFAULT false,
  is_stealth_update BOOLEAN         NOT NULL DEFAULT false,
  updated_at        TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- ── location_requests ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.location_requests (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  target_user_id  UUID        NOT NULL UNIQUE,  -- une seule demande active par cible
  conversation_id UUID        NOT NULL,
  requester_id    UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  requested_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── stealth_tracking ─────────────────────────────────────────
-- FIX : colonne cible = target_user_id (pas user_id — bug corrigé)
CREATE TABLE IF NOT EXISTS public.stealth_tracking (
  target_user_id  UUID        PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  enabled         BOOLEAN     NOT NULL DEFAULT true,
  requester_id    UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  conversation_id UUID        NOT NULL,
  activated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── app_logs ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.app_logs (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  level       TEXT        NOT NULL,   -- 'warn' | 'error'
  context     TEXT        NOT NULL,   -- ex: 'MessageRepository.sendMessage'
  code        TEXT,
  message     TEXT,
  stack       TEXT,
  user_id     UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  platform    TEXT,                   -- 'ios' | 'android' | 'web'
  app_version TEXT
);


-- ============================================================
-- 2. ROW LEVEL SECURITY — activation
-- ============================================================
ALTER TABLE public.users             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usernames         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_profiles   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_requests  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partners          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.location_shares   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.location_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stealth_tracking  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_logs          ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- 3. POLITIQUES RLS
-- Suppression préalable pour éviter les conflits si ré-exécution
-- ============================================================

-- ── users ────────────────────────────────────────────────────
DROP POLICY IF EXISTS users_select     ON public.users;
DROP POLICY IF EXISTS users_insert     ON public.users;
DROP POLICY IF EXISTS users_update     ON public.users;
DROP POLICY IF EXISTS users_delete     ON public.users;
DROP POLICY IF EXISTS users_select_own ON public.users;
DROP POLICY IF EXISTS users_insert_own ON public.users;
DROP POLICY IF EXISTS users_update_own ON public.users;
DROP POLICY IF EXISTS users_delete_own ON public.users;
DROP POLICY IF EXISTS users_owner_policy ON public.users;

CREATE POLICY users_select ON public.users
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY users_insert ON public.users
  FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY users_update ON public.users
  FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY users_delete ON public.users
  FOR DELETE USING (auth.uid() = id);

-- ── usernames ────────────────────────────────────────────────
DROP POLICY IF EXISTS usernames_select_all ON public.usernames;
DROP POLICY IF EXISTS usernames_insert_own ON public.usernames;
DROP POLICY IF EXISTS usernames_delete_own ON public.usernames;

CREATE POLICY usernames_select_all ON public.usernames
  FOR SELECT USING (true);
CREATE POLICY usernames_insert_own ON public.usernames
  FOR INSERT WITH CHECK (auth.uid() = uid);
CREATE POLICY usernames_delete_own ON public.usernames
  FOR DELETE USING (auth.uid() = uid);

-- ── public_profiles ──────────────────────────────────────────
DROP POLICY IF EXISTS profiles_select_auth ON public.public_profiles;
DROP POLICY IF EXISTS profiles_insert_own  ON public.public_profiles;
DROP POLICY IF EXISTS profiles_update_own  ON public.public_profiles;
DROP POLICY IF EXISTS profiles_delete_own  ON public.public_profiles;

CREATE POLICY profiles_select_auth ON public.public_profiles
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY profiles_insert_own ON public.public_profiles
  FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY profiles_update_own ON public.public_profiles
  FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY profiles_delete_own ON public.public_profiles
  FOR DELETE USING (auth.uid() = id);

-- ── conversations ────────────────────────────────────────────
DROP POLICY IF EXISTS conv_select_participant    ON public.conversations;
DROP POLICY IF EXISTS conv_insert_participant    ON public.conversations;
DROP POLICY IF EXISTS conv_update_participant    ON public.conversations;
DROP POLICY IF EXISTS conversations_select       ON public.conversations;
DROP POLICY IF EXISTS conversations_insert       ON public.conversations;
DROP POLICY IF EXISTS conversations_update       ON public.conversations;
DROP POLICY IF EXISTS conversations_participant_policy ON public.conversations;

CREATE POLICY conversations_select ON public.conversations
  FOR SELECT USING (auth.uid() = ANY(participant_ids));
CREATE POLICY conversations_insert ON public.conversations
  FOR INSERT WITH CHECK (auth.uid() = ANY(participant_ids));
CREATE POLICY conversations_update ON public.conversations
  FOR UPDATE USING (auth.uid() = ANY(participant_ids))
  WITH CHECK (auth.uid() = ANY(participant_ids));
-- Pas de DELETE : les conversations ne peuvent pas être supprimées depuis le client

-- ── messages ─────────────────────────────────────────────────
DROP POLICY IF EXISTS msg_select_participant  ON public.messages;
DROP POLICY IF EXISTS msg_insert_sender       ON public.messages;
DROP POLICY IF EXISTS msg_update_participant  ON public.messages;
DROP POLICY IF EXISTS messages_select         ON public.messages;
DROP POLICY IF EXISTS messages_insert         ON public.messages;
DROP POLICY IF EXISTS messages_update         ON public.messages;
DROP POLICY IF EXISTS messages_delete         ON public.messages;
DROP POLICY IF EXISTS messages_participant_policy ON public.messages;

CREATE POLICY messages_select ON public.messages
  FOR SELECT USING (auth.uid() = sender_id OR auth.uid() = receiver_id);
CREATE POLICY messages_insert ON public.messages
  FOR INSERT WITH CHECK (auth.uid() = sender_id);
CREATE POLICY messages_update ON public.messages
  FOR UPDATE USING (auth.uid() = sender_id OR auth.uid() = receiver_id)
  WITH CHECK (auth.uid() = sender_id OR auth.uid() = receiver_id);
-- FIX : seul l'expéditeur peut supprimer (pas le destinataire)
CREATE POLICY messages_delete ON public.messages
  FOR DELETE USING (auth.uid() = sender_id);

-- ── partner_requests ─────────────────────────────────────────
DROP POLICY IF EXISTS req_select                  ON public.partner_requests;
DROP POLICY IF EXISTS req_insert                  ON public.partner_requests;
DROP POLICY IF EXISTS req_update                  ON public.partner_requests;
DROP POLICY IF EXISTS partner_requests_select     ON public.partner_requests;
DROP POLICY IF EXISTS partner_requests_insert     ON public.partner_requests;
DROP POLICY IF EXISTS partner_requests_update     ON public.partner_requests;
DROP POLICY IF EXISTS partner_requests_delete     ON public.partner_requests;
DROP POLICY IF EXISTS partner_requests_policy     ON public.partner_requests;

CREATE POLICY partner_requests_select ON public.partner_requests
  FOR SELECT USING (auth.uid() = sender_id OR auth.uid() = receiver_id);
CREATE POLICY partner_requests_insert ON public.partner_requests
  FOR INSERT WITH CHECK (auth.uid() = sender_id);
-- FIX : seul le destinataire peut accepter/rejeter
CREATE POLICY partner_requests_update ON public.partner_requests
  FOR UPDATE USING (auth.uid() = receiver_id)
  WITH CHECK (auth.uid() = receiver_id);
-- Seul l'expéditeur peut annuler sa demande
CREATE POLICY partner_requests_delete ON public.partner_requests
  FOR DELETE USING (auth.uid() = sender_id);

-- ── partners ─────────────────────────────────────────────────
DROP POLICY IF EXISTS partners_select  ON public.partners;
DROP POLICY IF EXISTS partners_insert  ON public.partners;
DROP POLICY IF EXISTS partners_delete  ON public.partners;
DROP POLICY IF EXISTS partners_policy  ON public.partners;

CREATE POLICY partners_select ON public.partners
  FOR SELECT USING (auth.uid() = user_id);
-- INSERT autorisé côté RLS : user_id doit être soi-même
-- (les deux lignes A→B et B→A sont insérées par acceptPartnerRequest)
CREATE POLICY partners_insert ON public.partners
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY partners_delete ON public.partners
  FOR DELETE USING (auth.uid() = user_id);

-- ── location_shares ──────────────────────────────────────────
-- FIX critique : avant, tout utilisateur connecté pouvait lire
-- la localisation de tout le monde
DROP POLICY IF EXISTS loc_select                ON public.location_shares;
DROP POLICY IF EXISTS loc_insert                ON public.location_shares;
DROP POLICY IF EXISTS loc_update                ON public.location_shares;
DROP POLICY IF EXISTS location_shares_select    ON public.location_shares;
DROP POLICY IF EXISTS location_shares_insert    ON public.location_shares;
DROP POLICY IF EXISTS location_shares_update    ON public.location_shares;
DROP POLICY IF EXISTS location_shares_delete    ON public.location_shares;
DROP POLICY IF EXISTS location_shares_policy    ON public.location_shares;

CREATE POLICY location_shares_select ON public.location_shares
  FOR SELECT USING (
    auth.uid() = user_id
    OR auth.uid() IN (
      SELECT partner_id FROM public.partners WHERE user_id = location_shares.user_id
    )
  );
CREATE POLICY location_shares_insert ON public.location_shares
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY location_shares_update ON public.location_shares
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY location_shares_delete ON public.location_shares
  FOR DELETE USING (auth.uid() = user_id);

-- ── location_requests ────────────────────────────────────────
DROP POLICY IF EXISTS loc_req_select         ON public.location_requests;
DROP POLICY IF EXISTS loc_req_insert         ON public.location_requests;
DROP POLICY IF EXISTS loc_req_update         ON public.location_requests;
DROP POLICY IF EXISTS location_requests_select ON public.location_requests;
DROP POLICY IF EXISTS location_requests_insert ON public.location_requests;
DROP POLICY IF EXISTS location_requests_delete ON public.location_requests;
DROP POLICY IF EXISTS location_requests_policy ON public.location_requests;

CREATE POLICY location_requests_select ON public.location_requests
  FOR SELECT USING (auth.uid() = requester_id OR auth.uid() = target_user_id);
CREATE POLICY location_requests_insert ON public.location_requests
  FOR INSERT WITH CHECK (auth.uid() = requester_id);
CREATE POLICY location_requests_delete ON public.location_requests
  FOR DELETE USING (auth.uid() = requester_id OR auth.uid() = target_user_id);

-- ── stealth_tracking ─────────────────────────────────────────
-- FIX : colonne cible = target_user_id
DROP POLICY IF EXISTS stealth_select          ON public.stealth_tracking;
DROP POLICY IF EXISTS stealth_insert          ON public.stealth_tracking;
DROP POLICY IF EXISTS stealth_update          ON public.stealth_tracking;
DROP POLICY IF EXISTS stealth_delete          ON public.stealth_tracking;
DROP POLICY IF EXISTS stealth_tracking_select ON public.stealth_tracking;
DROP POLICY IF EXISTS stealth_tracking_insert ON public.stealth_tracking;
DROP POLICY IF EXISTS stealth_tracking_delete ON public.stealth_tracking;
DROP POLICY IF EXISTS stealth_tracking_policy ON public.stealth_tracking;

CREATE POLICY stealth_tracking_select ON public.stealth_tracking
  FOR SELECT USING (auth.uid() = target_user_id OR auth.uid() = requester_id);
CREATE POLICY stealth_tracking_insert ON public.stealth_tracking
  FOR INSERT WITH CHECK (auth.uid() = requester_id);
CREATE POLICY stealth_tracking_delete ON public.stealth_tracking
  FOR DELETE USING (auth.uid() = requester_id OR auth.uid() = target_user_id);

-- ── app_logs ─────────────────────────────────────────────────
DROP POLICY IF EXISTS logs_insert      ON public.app_logs;
DROP POLICY IF EXISTS logs_select_own  ON public.app_logs;

CREATE POLICY logs_insert ON public.app_logs
  FOR INSERT WITH CHECK (auth.uid() = user_id OR user_id IS NULL);
CREATE POLICY logs_select_own ON public.app_logs
  FOR SELECT USING (auth.uid() = user_id);


-- ============================================================
-- 4. INDEX
-- ============================================================

-- messages
CREATE INDEX IF NOT EXISTS idx_messages_conv_created
  ON public.messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_sender
  ON public.messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_receiver
  ON public.messages(receiver_id);

-- conversations
CREATE INDEX IF NOT EXISTS idx_conversations_participants
  ON public.conversations USING GIN(participant_ids);
CREATE INDEX IF NOT EXISTS idx_conversations_updated
  ON public.conversations(updated_at DESC);

-- partner_requests
CREATE INDEX IF NOT EXISTS idx_partner_requests_receiver_status
  ON public.partner_requests(receiver_id, status);
CREATE INDEX IF NOT EXISTS idx_partner_requests_sender
  ON public.partner_requests(sender_id);

-- partners
CREATE INDEX IF NOT EXISTS idx_partners_user_id
  ON public.partners(user_id);
CREATE INDEX IF NOT EXISTS idx_partners_partner_id
  ON public.partners(partner_id);

-- location_shares
CREATE INDEX IF NOT EXISTS idx_location_shares_user_id
  ON public.location_shares(user_id);
CREATE INDEX IF NOT EXISTS idx_location_shares_conversation
  ON public.location_shares(conversation_id);

-- stealth_tracking
CREATE INDEX IF NOT EXISTS idx_stealth_target_user_id
  ON public.stealth_tracking(target_user_id);
CREATE INDEX IF NOT EXISTS idx_stealth_requester
  ON public.stealth_tracking(requester_id);

-- app_logs
CREATE INDEX IF NOT EXISTS idx_app_logs_level
  ON public.app_logs(level);
CREATE INDEX IF NOT EXISTS idx_app_logs_user_id
  ON public.app_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_app_logs_created_at
  ON public.app_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_logs_context
  ON public.app_logs(context);


-- ============================================================
-- 5. FONCTION RPC — suppression de compte
-- Appelée par AuthService.deleteAccount()
-- ============================================================
CREATE OR REPLACE FUNCTION public.delete_user()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM public.users WHERE id = auth.uid();
  DELETE FROM auth.users  WHERE id = auth.uid();
END;
$$;


-- ============================================================
-- 6. REALTIME — tables temps-réel
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.partner_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE public.partners;
ALTER PUBLICATION supabase_realtime ADD TABLE public.location_shares;
ALTER PUBLICATION supabase_realtime ADD TABLE public.stealth_tracking;


-- ============================================================
-- 7. STORAGE — buckets + politiques
-- ============================================================

-- Bucket temp-media (relay audio/vidéo/photo entre utilisateurs)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'temp-media', 'temp-media', true,
  52428800,  -- 50 MB
  ARRAY[
    'image/jpeg','image/png','image/webp','image/gif',
    'video/mp4','video/quicktime','video/webm',
    'audio/m4a','audio/aac','audio/wav','audio/mpeg',
    'application/octet-stream'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit    = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Bucket avatars (photos de profil)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars', 'avatars', true,
  5242880,   -- 5 MB
  ARRAY['image/jpeg','image/png','image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Politiques Storage temp-media
DROP POLICY IF EXISTS "temp-media: upload authentifié"       ON storage.objects;
DROP POLICY IF EXISTS "temp-media: lecture publique"         ON storage.objects;
DROP POLICY IF EXISTS "temp-media: suppression propriétaire" ON storage.objects;

CREATE POLICY "temp-media: upload authentifié"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'temp-media' AND auth.role() = 'authenticated');

CREATE POLICY "temp-media: lecture publique"
ON storage.objects FOR SELECT
USING (bucket_id = 'temp-media');

CREATE POLICY "temp-media: suppression propriétaire"
ON storage.objects FOR DELETE
USING (bucket_id = 'temp-media' AND auth.role() = 'authenticated');

-- Politiques Storage avatars
DROP POLICY IF EXISTS "avatars: upload propriétaire"      ON storage.objects;
DROP POLICY IF EXISTS "avatars: lecture publique"         ON storage.objects;
DROP POLICY IF EXISTS "avatars: mise à jour propriétaire" ON storage.objects;

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

-- ============================================================
-- FIN DU SCRIPT
-- ============================================================
