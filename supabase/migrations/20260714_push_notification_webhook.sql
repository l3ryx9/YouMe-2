-- ══════════════════════════════════════════════════════════════════════════════
-- Database Webhook — Notifications Push (messages → Edge Function)
-- ══════════════════════════════════════════════════════════════════════════════
--
-- Ce script configure le déclenchement automatique de la Edge Function
-- "send-push-notification" à chaque INSERT dans public.messages.
--
-- ⚠️  pg_net est requis (activé par défaut sur Supabase Cloud).
--     Vérifier : SELECT * FROM pg_extension WHERE extname = 'pg_net';
--
-- Deux façons de configurer le webhook :
--   A) Via le Dashboard Supabase (recommandé — zéro SQL à écrire)
--   B) Via ce script SQL + pg_net (ci-dessous)
--
-- ─────────────────────────────────────────────────────────────────────────────
-- MÉTHODE A (Dashboard) — la plus simple :
--   1. Supabase Dashboard → Database → Webhooks → "Create a new hook"
--   2. Name : send_push_on_message
--   3. Table : public.messages
--   4. Events : INSERT
--   5. URL : https://<project-ref>.supabase.co/functions/v1/send-push-notification
--   6. HTTP Headers :
--        Authorization : Bearer <votre ANON KEY ou SERVICE KEY>
--   7. Save
-- ─────────────────────────────────────────────────────────────────────────────
-- MÉTHODE B (SQL + pg_net) — script ci-dessous :
-- ══════════════════════════════════════════════════════════════════════════════

-- Active pg_net si pas encore activé
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ── Fonction trigger ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trigger_send_push_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _payload  jsonb;
  _url      text;
  _anon_key text;
BEGIN
  -- Ne rien faire pour les messages supprimés
  IF NEW.is_deleted THEN
    RETURN NEW;
  END IF;

  -- URL de la Edge Function (remplacer <project-ref> par ton vrai identifiant)
  _url := current_setting('app.supabase_url', true)
          || '/functions/v1/send-push-notification';

  -- Clé anon pour autoriser l'appel (déjà publique, pas sensible)
  _anon_key := current_setting('app.supabase_anon_key', true);

  _payload := jsonb_build_object(
    'type',       'INSERT',
    'table',      'messages',
    'record',     row_to_json(NEW)::jsonb,
    'old_record', NULL
  );

  -- Appel HTTP asynchrone (ne bloque pas l'INSERT)
  PERFORM net.http_post(
    url     := _url,
    body    := _payload,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || _anon_key
    )
  );

  RETURN NEW;
END;
$$;

-- ── Trigger sur INSERT messages ───────────────────────────────────────────────
DROP TRIGGER IF EXISTS on_message_inserted ON public.messages;

CREATE TRIGGER on_message_inserted
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_send_push_notification();


-- ══════════════════════════════════════════════════════════════════════════════
-- Configuration des paramètres d'URL (à exécuter UNE seule fois)
-- Remplacer les valeurs par les tiennes avant d'exécuter.
-- ══════════════════════════════════════════════════════════════════════════════

-- ALTER DATABASE postgres SET app.supabase_url    = 'https://xxxx.supabase.co';
-- ALTER DATABASE postgres SET app.supabase_anon_key = 'eyJ...';
