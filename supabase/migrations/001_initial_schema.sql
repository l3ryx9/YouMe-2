-- ============================================================
-- YouMe V2 — Schéma PostgreSQL Supabase
-- À exécuter dans l'éditeur SQL de votre tableau de bord Supabase.
-- ============================================================

-- ── Extensions ──────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Table : users ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.users (
  id                 UUID PRIMARY KEY,
  email              TEXT NOT NULL UNIQUE,
  username           TEXT NOT NULL UNIQUE,
  display_name       TEXT NOT NULL,
  photo_url          TEXT,
  bio                TEXT,
  is_online          BOOLEAN NOT NULL DEFAULT false,
  last_seen          TIMESTAMPTZ,
  is_email_verified  BOOLEAN NOT NULL DEFAULT false,
  ai_enabled         BOOLEAN NOT NULL DEFAULT true,
  fcm_token          TEXT,
  native_fcm_token   TEXT,
  e2e_public_key     TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Table : usernames ────────────────────────────────────────
-- Réservation des noms d'utilisateur (contrainte d'unicité forte)
CREATE TABLE IF NOT EXISTS public.usernames (
  username  TEXT PRIMARY KEY,
  uid       UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE
);

-- ── Table : public_profiles ──────────────────────────────────
-- Vue dénormalisée lisible par tous (RLS : SELECT public)
CREATE TABLE IF NOT EXISTS public.public_profiles (
  id             UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  username       TEXT NOT NULL UNIQUE,
  display_name   TEXT NOT NULL,
  photo_url      TEXT,
  bio            TEXT,
  is_online      BOOLEAN NOT NULL DEFAULT false,
  last_seen      TIMESTAMPTZ,
  e2e_public_key TEXT
);

-- ── Table : conversations ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.conversations (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  participant_ids  UUID[] NOT NULL,
  last_message     JSONB,
  unread_count     JSONB NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Index pour chercher les conversations d'un utilisateur
CREATE INDEX IF NOT EXISTS idx_conversations_participants ON public.conversations USING GIN (participant_ids);

-- ── Table : messages ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.messages (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id  UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id        UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  receiver_id      UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type             TEXT NOT NULL,          -- 'text' | 'image' | 'voice' | 'video' | 'location'
  content          TEXT,
  voice_local_path TEXT,
  voice_duration   REAL,
  image_local_path TEXT,
  video_local_path TEXT,
  storage_url      TEXT,
  status           TEXT NOT NULL DEFAULT 'sent', -- 'sent' | 'delivered' | 'read'
  is_deleted       BOOLEAN NOT NULL DEFAULT false,
  ai_analysis      JSONB,
  reactions        JSONB,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON public.messages(conversation_id, created_at DESC);

-- ── Table : partner_requests ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.partner_requests (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sender_id            UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  sender_username      TEXT NOT NULL,
  sender_display_name  TEXT NOT NULL,
  sender_photo_url     TEXT,
  receiver_id          UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status               TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'accepted' | 'rejected'
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_partner_requests_receiver ON public.partner_requests(receiver_id, status);

-- ── Table : partners ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.partners (
  user_id              UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  partner_id           UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  partner_username     TEXT NOT NULL,
  partner_display_name TEXT NOT NULL,
  partner_photo_url    TEXT,
  conversation_id      UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, partner_id)
);

-- ── Table : location_shares ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.location_shares (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  conversation_id   UUID NOT NULL UNIQUE,   -- une seule position active par conversation
  latitude          DOUBLE PRECISION NOT NULL,
  longitude         DOUBLE PRECISION NOT NULL,
  accuracy          REAL,
  speed             REAL,
  is_mocked         BOOLEAN NOT NULL DEFAULT false,
  is_stealth_update BOOLEAN NOT NULL DEFAULT false,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Table : location_requests ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.location_requests (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  target_user_id  UUID NOT NULL UNIQUE,     -- une seule demande active par cible
  conversation_id UUID NOT NULL,
  requester_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  requested_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Table : stealth_tracking ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.stealth_tracking (
  user_id         UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  enabled         BOOLEAN NOT NULL DEFAULT true,
  requester_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL,
  activated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Politiques RLS (Row Level Security)
-- ============================================================
ALTER TABLE public.users               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usernames           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_profiles     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_requests    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partners            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.location_shares     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.location_requests   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stealth_tracking    ENABLE ROW LEVEL SECURITY;

-- users : lecture uniquement par soi-même
CREATE POLICY "users_select_own"  ON public.users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "users_insert_own"  ON public.users FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "users_update_own"  ON public.users FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "users_delete_own"  ON public.users FOR DELETE USING (auth.uid() = id);

-- usernames : lecture pour tous (recherche disponibilité), écriture par soi-même
CREATE POLICY "usernames_select_all"  ON public.usernames FOR SELECT USING (true);
CREATE POLICY "usernames_insert_own"  ON public.usernames FOR INSERT WITH CHECK (auth.uid() = uid);
CREATE POLICY "usernames_delete_own"  ON public.usernames FOR DELETE USING (auth.uid() = uid);

-- public_profiles : lecture pour tous les utilisateurs authentifiés
CREATE POLICY "profiles_select_auth"  ON public.public_profiles FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "profiles_insert_own"   ON public.public_profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update_own"   ON public.public_profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "profiles_delete_own"   ON public.public_profiles FOR DELETE USING (auth.uid() = id);

-- conversations : accès si participant
CREATE POLICY "conv_select_participant" ON public.conversations
  FOR SELECT USING (auth.uid() = ANY(participant_ids));
CREATE POLICY "conv_insert_participant" ON public.conversations
  FOR INSERT WITH CHECK (auth.uid() = ANY(participant_ids));
CREATE POLICY "conv_update_participant" ON public.conversations
  FOR UPDATE USING (auth.uid() = ANY(participant_ids));

-- messages : accès si sender ou receiver
CREATE POLICY "msg_select_participant" ON public.messages
  FOR SELECT USING (auth.uid() = sender_id OR auth.uid() = receiver_id);
CREATE POLICY "msg_insert_sender"      ON public.messages
  FOR INSERT WITH CHECK (auth.uid() = sender_id);
CREATE POLICY "msg_update_participant" ON public.messages
  FOR UPDATE USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

-- partner_requests : sender ou receiver
CREATE POLICY "req_select" ON public.partner_requests
  FOR SELECT USING (auth.uid() = sender_id OR auth.uid() = receiver_id);
CREATE POLICY "req_insert" ON public.partner_requests
  FOR INSERT WITH CHECK (auth.uid() = sender_id);
CREATE POLICY "req_update" ON public.partner_requests
  FOR UPDATE USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

-- partners : propres entrées
CREATE POLICY "partners_select" ON public.partners FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "partners_insert" ON public.partners FOR INSERT WITH CHECK (auth.uid() = user_id OR auth.uid() = partner_id);
CREATE POLICY "partners_delete" ON public.partners FOR DELETE USING (auth.uid() = user_id OR auth.uid() = partner_id);

-- location_shares : participants de la conversation
CREATE POLICY "loc_select" ON public.location_shares
  FOR SELECT USING (auth.uid() = user_id OR EXISTS (
    SELECT 1 FROM public.partners WHERE user_id = auth.uid() AND conversation_id = location_shares.conversation_id
  ));
CREATE POLICY "loc_insert" ON public.location_shares FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "loc_update" ON public.location_shares FOR UPDATE USING (auth.uid() = user_id);

-- stealth_tracking : requester (lecture/écriture) ou target (lecture)
CREATE POLICY "stealth_select" ON public.stealth_tracking
  FOR SELECT USING (auth.uid() = user_id OR auth.uid() = requester_id);
CREATE POLICY "stealth_insert" ON public.stealth_tracking
  FOR INSERT WITH CHECK (auth.uid() = requester_id);
CREATE POLICY "stealth_update" ON public.stealth_tracking
  FOR UPDATE USING (auth.uid() = requester_id);
CREATE POLICY "stealth_delete" ON public.stealth_tracking
  FOR DELETE USING (auth.uid() = requester_id);

-- location_requests : requester ou target
CREATE POLICY "loc_req_select" ON public.location_requests
  FOR SELECT USING (auth.uid() = requester_id OR auth.uid() = target_user_id);
CREATE POLICY "loc_req_insert" ON public.location_requests
  FOR INSERT WITH CHECK (auth.uid() = requester_id);
CREATE POLICY "loc_req_update" ON public.location_requests
  FOR UPDATE USING (auth.uid() = requester_id);

-- ============================================================
-- Realtime — activer les publications pour les tables temps-réel
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.partner_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE public.partners;
ALTER PUBLICATION supabase_realtime ADD TABLE public.location_shares;
ALTER PUBLICATION supabase_realtime ADD TABLE public.stealth_tracking;

-- ============================================================
-- Fonction RPC : suppression de compte (appelée par AuthService.deleteAccount)
-- ============================================================
CREATE OR REPLACE FUNCTION public.delete_user()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM public.users WHERE id = auth.uid();
  DELETE FROM auth.users WHERE id = auth.uid();
END;
$$;

-- ============================================================
-- Buckets Supabase Storage (à créer depuis la console ou via API)
-- ============================================================
-- Bucket "avatars"    : public = true  (photos de profil accessibles sans auth)
-- Bucket "temp-media" : public = true  (relay de médias de messages)
--
-- Politiques Storage (à appliquer via la console Storage ou SQL Supabase) :
--   avatars:
--     SELECT : tous (public)
--     INSERT : authentifiés — path doit commencer par auth.uid()
--     UPDATE/DELETE : propriétaire uniquement
--   temp-media:
--     SELECT : tous (public)
--     INSERT : authentifiés
--     DELETE : authentifiés (n'importe quel user — relay éphémère)
