-- ============================================================
-- Migration : protection anti-bot (honeypot, rate limiting,
-- score de risque, journalisation)
--
-- Ajoute les tables et fonctions nécessaires pour que la
-- Edge Function `anti-bot-guard` puisse :
--   1. Enregistrer les tentatives d'inscription/connexion et
--      compter les événements récents par IP ou par compte
--      (rate limiting côté serveur, résistant à la falsification
--      du client).
--   2. Journaliser les tentatives bloquées ou suspectes pour
--      pouvoir affiner les règles plus tard.
--
-- Ces tables ne sont accessibles qu'via la service_role key
-- (utilisée uniquement côté Edge Function) : RLS activé, aucune
-- politique pour `anon`/`authenticated` → aucun accès direct
-- depuis le client mobile.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. TABLE : rate_limit_events
--    Une ligne par tentative. Le comptage par fenêtre glissante
--    se fait en comptant les lignes récentes (identifier + action).
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rate_limit_events (
  id          BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  action      TEXT        NOT NULL,   -- 'register' | 'login'
  identifier  TEXT        NOT NULL    -- IP (pour register) ou email normalisé (pour login)
);

CREATE INDEX IF NOT EXISTS rate_limit_events_lookup_idx
  ON public.rate_limit_events (action, identifier, created_at DESC);

-- Purge automatique : on ne garde pas plus de 24h d'historique
-- (suffisant pour des fenêtres de 1 minute, évite la croissance infinie).
CREATE OR REPLACE FUNCTION public.prune_rate_limit_events() RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.rate_limit_events WHERE created_at < NOW() - INTERVAL '24 hours';
$$;

ALTER TABLE public.rate_limit_events ENABLE ROW LEVEL SECURITY;
-- Aucune politique : seule la service_role (qui contourne RLS) peut lire/écrire.

-- ────────────────────────────────────────────────────────────
-- 2. FONCTION : record_and_count_rate_limit
--    Enregistre une tentative puis retourne le nombre de
--    tentatives pour ce couple (action, identifier) dans la
--    fenêtre glissante demandée. Atomique (une seule requête
--    depuis le point de vue de l'appelant).
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.record_and_count_rate_limit(
  p_action TEXT,
  p_identifier TEXT,
  p_window_seconds INT
) RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT;
BEGIN
  INSERT INTO public.rate_limit_events (action, identifier)
  VALUES (p_action, p_identifier);

  SELECT COUNT(*) INTO v_count
  FROM public.rate_limit_events
  WHERE action = p_action
    AND identifier = p_identifier
    AND created_at >= NOW() - make_interval(secs => p_window_seconds);

  -- Purge best-effort à faible fréquence (1 chance sur 50) pour ne pas
  -- alourdir chaque appel avec un DELETE.
  IF random() < 0.02 THEN
    PERFORM public.prune_rate_limit_events();
  END IF;

  RETURN v_count;
END;
$$;

-- Uniquement appelable via service_role (Edge Function) ou un rôle
-- explicite ; on révoque l'exécution pour anon/authenticated.
REVOKE ALL ON FUNCTION public.record_and_count_rate_limit(TEXT, TEXT, INT) FROM PUBLIC;

-- ────────────────────────────────────────────────────────────
-- 3. TABLE : security_logs
--    Historique des tentatives suspectes ou bloquées, pour
--    audit et ajustement des règles anti-bot.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.security_logs (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  action      TEXT        NOT NULL,   -- 'register' | 'login'
  ip          TEXT,                   -- adresse IP source (peut être NULL si non résolue)
  email       TEXT,                   -- email concerné (si fourni), non indexé sur les données sensibles
  risk_score  INT         NOT NULL,
  decision    TEXT        NOT NULL,   -- 'allow' | 'verify' | 'block'
  reason      TEXT                    -- courte explication (honeypot, timing, rate_limit, ...)
);

CREATE INDEX IF NOT EXISTS security_logs_created_at_idx ON public.security_logs (created_at DESC);

ALTER TABLE public.security_logs ENABLE ROW LEVEL SECURITY;
-- Aucune politique : seule la service_role peut écrire/lire ces journaux.

CREATE OR REPLACE FUNCTION public.log_security_event(
  p_action TEXT,
  p_ip TEXT,
  p_email TEXT,
  p_risk_score INT,
  p_decision TEXT,
  p_reason TEXT
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.security_logs (action, ip, email, risk_score, decision, reason)
  VALUES (p_action, p_ip, p_email, p_risk_score, p_decision, p_reason);
$$;

REVOKE ALL ON FUNCTION public.log_security_event(TEXT, TEXT, TEXT, INT, TEXT, TEXT) FROM PUBLIC;
