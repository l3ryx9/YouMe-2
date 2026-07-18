-- ============================================================
-- Règles : demandes de partenaire, messagerie, médias, présence
-- À exécuter dans Supabase Dashboard → SQL Editor
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. PARTNER_REQUESTS — accepter / refuser
--    Seul le destinataire peut faire passer une demande de
--    'pending' à 'accepted' ou 'rejected'. L'expéditeur ne peut
--    pas modifier le statut lui-même (il ne peut qu'annuler,
--    déjà couvert par partner_requests_delete).
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.partner_requests
  DROP CONSTRAINT IF EXISTS partner_requests_status_check;
ALTER TABLE public.partner_requests
  ADD CONSTRAINT partner_requests_status_check
  CHECK (status IN ('pending', 'accepted', 'rejected'));

DROP POLICY IF EXISTS partner_requests_update ON public.partner_requests;
CREATE POLICY partner_requests_update ON public.partner_requests
  FOR UPDATE
  USING (auth.uid() = receiver_id AND status = 'pending')
  WITH CHECK (auth.uid() = receiver_id AND status IN ('accepted', 'rejected'));

-- ────────────────────────────────────────────────────────────
-- 2. MESSAGES — horodatage, immuabilité, durées audio/vidéo
-- ────────────────────────────────────────────────────────────

-- Colonne manquante pour la durée vidéo (le schéma n'avait que voice_duration)
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS video_duration REAL;

-- Limites de durée : audio 35s max, vidéo 30s max
ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_voice_duration_check;
ALTER TABLE public.messages
  ADD CONSTRAINT messages_voice_duration_check
  CHECK (type <> 'voice' OR (voice_duration IS NOT NULL AND voice_duration <= 35));

ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_video_duration_check;
ALTER TABLE public.messages
  ADD CONSTRAINT messages_video_duration_check
  CHECK (type <> 'video' OR (video_duration IS NOT NULL AND video_duration <= 30));

-- Empêche toute suppression définitive d'un message envoyé
-- (aucune policy DELETE = DELETE toujours refusé par RLS)
DROP POLICY IF EXISTS msg_delete_participant ON public.messages;

-- Rend le contenu d'un message immuable une fois envoyé : seules
-- les colonnes de statut / réactions / nettoyage média peuvent
-- changer après l'insertion (accusé de réception, réactions,
-- suppression du média une fois lu).
CREATE OR REPLACE FUNCTION public.enforce_message_immutability()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.id                 IS DISTINCT FROM OLD.id
     OR NEW.conversation_id IS DISTINCT FROM OLD.conversation_id
     OR NEW.sender_id       IS DISTINCT FROM OLD.sender_id
     OR NEW.receiver_id     IS DISTINCT FROM OLD.receiver_id
     OR NEW.type            IS DISTINCT FROM OLD.type
     OR NEW.content         IS DISTINCT FROM OLD.content
     OR NEW.created_at      IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'Un message ne peut pas être modifié ou supprimé après son envoi';
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_messages_immutable ON public.messages;
CREATE TRIGGER trg_messages_immutable
  BEFORE UPDATE ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.enforce_message_immutability();

-- Filet de sécurité anti-doublon : bloque l'insertion d'un message
-- strictement identique (même expéditeur, même conversation, même
-- contenu ou même fichier média) envoyé à moins d'une seconde
-- d'intervalle — couvre les doubles-clics / doubles envois réseau.
-- extract()/date_trunc() sur un timestamptz sont marqués STABLE par
-- Postgres (et donc refusés dans un index), même si l'epoch UTC d'un
-- timestamptz ne dépend en réalité d'aucun fuseau horaire. On passe
-- donc par un petit wrapper explicitement marqué IMMUTABLE.
CREATE OR REPLACE FUNCTION public.immutable_epoch_second(ts TIMESTAMPTZ)
RETURNS BIGINT AS $
  SELECT floor(extract(epoch FROM ts))::BIGINT;
$ LANGUAGE sql IMMUTABLE PARALLEL SAFE;

CREATE UNIQUE INDEX IF NOT EXISTS uq_messages_no_duplicate
  ON public.messages (
    conversation_id,
    sender_id,
    type,
    COALESCE(content, ''),
    COALESCE(storage_url, ''),
    public.immutable_epoch_second(created_at)
  );

-- ────────────────────────────────────────────────────────────
-- 3. Suppression du média du Storage dès l'accusé de réception
--    (status -> 'read'). Le fichier est retiré du bucket
--    temp-media et les chemins locaux/URL sont vidés.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cleanup_media_on_read()
RETURNS TRIGGER AS $$
DECLARE
  object_path TEXT;
BEGIN
  IF NEW.status = 'read'
     AND OLD.status IS DISTINCT FROM NEW.status
     AND NEW.type IN ('image', 'voice', 'video')
     AND NEW.storage_url IS NOT NULL
  THEN
    -- Extrait le chemin de l'objet dans le bucket temp-media à partir de l'URL publique
    object_path := substring(NEW.storage_url FROM '/temp-media/(.*)$');

    IF object_path IS NOT NULL THEN
      DELETE FROM storage.objects
      WHERE bucket_id = 'temp-media' AND name = object_path;
    END IF;

    NEW.storage_url       := NULL;
    NEW.image_local_path  := NULL;
    NEW.voice_local_path  := NULL;
    NEW.video_local_path  := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Doit s'exécuter AVANT le trigger d'immuabilité pour pouvoir
-- encore modifier NEW (les colonnes vidées ne sont pas bloquées
-- par enforce_message_immutability, qui ne surveille pas ces
-- colonnes).
DROP TRIGGER IF EXISTS trg_messages_cleanup_media ON public.messages;
CREATE TRIGGER trg_messages_cleanup_media
  BEFORE UPDATE ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.cleanup_media_on_read();

-- ────────────────────────────────────────────────────────────
-- 4. Avatar — synchronise photo_url vers le profil public dès
--    qu'il change dans users (l'app écrit dans users, mais
--    public_profiles est la table lue par les autres membres).
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sync_public_profile_photo()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.photo_url IS DISTINCT FROM OLD.photo_url
     OR NEW.display_name IS DISTINCT FROM OLD.display_name
     OR NEW.bio IS DISTINCT FROM OLD.bio
  THEN
    UPDATE public.public_profiles
    SET photo_url    = NEW.photo_url,
        display_name = NEW.display_name,
        bio          = NEW.bio
    WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_users_sync_public_profile ON public.users;
CREATE TRIGGER trg_users_sync_public_profile
  AFTER UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.sync_public_profile_photo();

-- ────────────────────────────────────────────────────────────
-- 5. Statut en ligne / dernière déconnexion
--    Colonnes déjà présentes (is_online, last_seen) : on
--    s'assure juste qu'elles sont aussi synchronisées vers
--    public_profiles à chaque heartbeat.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sync_public_profile_presence()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_online IS DISTINCT FROM OLD.is_online
     OR NEW.last_seen IS DISTINCT FROM OLD.last_seen
  THEN
    UPDATE public.public_profiles
    SET is_online = NEW.is_online,
        last_seen = NEW.last_seen
    WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_users_sync_presence ON public.users;
CREATE TRIGGER trg_users_sync_presence
  AFTER UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.sync_public_profile_presence();
