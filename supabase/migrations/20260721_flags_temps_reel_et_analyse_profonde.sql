-- ══════════════════════════════════════════════════════════════════════════════
-- Flags temps réel (tous les 20 messages) + Analyse psychologique profonde
-- ══════════════════════════════════════════════════════════════════════════════
--
-- Ce fichier complète 20260720_daily_psychological_analysis.sql :
--   1. Sécurise (RLS) les 4 tables créées par cette migration précédente —
--      elles n'avaient aucune politique, donc aucun accès possible depuis le
--      client avec la clé anon (seule la Service Key, utilisée par les Edge
--      Functions, pouvait les lire/écrire). Nécessaire pour que le popup de
--      flags dans le chat et l'écran d'analyse puissent lire ces données.
--   2. Ajoute `faits_cles` (mémoire factuelle datée, par personne) et
--      `incoherences` (contradictions détectées entre deux faits/messages,
--      avec citations + dates) — la base sur laquelle Gemini s'appuie pour
--      détecter les incohérences dans le temps et affiner le profil au fil
--      des jours.
--   3. Étend `resumes_quotidiens` avec les signaux de la journée (variations
--      d'humeur, indices de déni, estimation de risque de tromperie) —
--      toujours formulés comme des signaux probabilistes, jamais des
--      accusations.
--   4. Ajoute deux RPC :
--      - `enregistrer_analyse_flags_temps_reel` : appelée par le client
--        après chaque analyse Gemini tous les 20 messages, pour écrire la
--        liste de flags + mettre à jour la jauge, de façon atomique et
--        vérifiée côté serveur (l'appelant doit être participant de la
--        conversation).
--      - `analyse_quotidienne_manquante` : vérifie si l'analyse profonde du
--        jour (heure de Paris) a déjà tourné pour une conversation — utilisée
--        par le client au lancement de l'app / à l'ouverture d'une
--        conversation pour déclencher un rattrapage si l'app était fermée à
--        minuit.
--
-- ── 1. RLS sur les tables existantes ────────────────────────────────────────

ALTER TABLE public.profils_personnalite ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comportements        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scores_relationnels  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resumes_quotidiens   ENABLE ROW LEVEL SECURITY;

-- Toutes ces tables sont accessibles en LECTURE uniquement aux deux
-- participants de la conversation concernée (jamais à un tiers, jamais en
-- écriture directe). Toute écriture passe soit par le RPC SECURITY DEFINER
-- `enregistrer_analyse_flags_temps_reel` ci-dessous (qui vérifie lui-même
-- que l'appelant est participant), soit par la Edge Function
-- `daily-psychological-analysis` (Service Key, qui contourne RLS) — jamais
-- par un insert/update direct du client sur ces tables.

CREATE POLICY "profils_select_participant" ON public.profils_personnalite
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = profils_personnalite.conversation_id AND auth.uid() = ANY(c.participant_ids)
  ));

CREATE POLICY "comportements_select_participant" ON public.comportements
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = comportements.conversation_id AND auth.uid() = ANY(c.participant_ids)
  ));

CREATE POLICY "scores_select_participant" ON public.scores_relationnels
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = scores_relationnels.conversation_id AND auth.uid() = ANY(c.participant_ids)
  ));

CREATE POLICY "resumes_select_participant" ON public.resumes_quotidiens
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = resumes_quotidiens.conversation_id AND auth.uid() = ANY(c.participant_ids)
  ));

-- ── 2. Tables faits_cles / incoherences ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS faits_cles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL,
  personne_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fait text NOT NULL,
  citation text,
  message_id uuid,
  prononce_le timestamptz NOT NULL, -- date + heure exactes du message d'origine
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_faits_cles_conv ON faits_cles(conversation_id, personne_id, prononce_le DESC);

CREATE TABLE IF NOT EXISTS incoherences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL,
  personne_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text CHECK (type IN ('contradiction', 'changement_version', 'chronologique', 'factuel')) DEFAULT 'contradiction',
  citation1 text NOT NULL,
  date1 timestamptz NOT NULL,
  citation2 text NOT NULL,
  date2 timestamptz NOT NULL,
  explication text NOT NULL, -- formulation prudente : "signal possible", jamais une accusation
  gravite text CHECK (gravite IN ('faible', 'modérée', 'élevée')) DEFAULT 'faible',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_incoherences_conv ON incoherences(conversation_id, personne_id, created_at DESC);

ALTER TABLE faits_cles   ENABLE ROW LEVEL SECURITY;
ALTER TABLE incoherences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "faits_cles_select_participant" ON public.faits_cles
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = faits_cles.conversation_id AND auth.uid() = ANY(c.participant_ids)
  ));

CREATE POLICY "incoherences_select_participant" ON public.incoherences
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = incoherences.conversation_id AND auth.uid() = ANY(c.participant_ids)
  ));

-- Note : faits_cles et incoherences ne sont JAMAIS purgées par le job
-- quotidien — elles constituent la mémoire longue qui permet à Gemini
-- d'affiner le profil psychologique au fil du temps, contrairement à
-- `comportements` (liste red/green flags affichée dans le chat) qui, elle,
-- est réinitialisée chaque nuit.

-- ── 3. Extension de resumes_quotidiens ──────────────────────────────────────

ALTER TABLE resumes_quotidiens
  ADD COLUMN IF NOT EXISTS variations_humeur jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS signes_possibles_deni text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS indicateurs_tromperie text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS risque_tromperie_estime numeric CHECK (risque_tromperie_estime BETWEEN 0 AND 1),
  ADD COLUMN IF NOT EXISTS risque_tromperie_label text CHECK (risque_tromperie_label IN ('faible', 'modéré', 'élevé'));

-- ── 4. RPC : écriture temps réel des flags (tous les 20 messages) ──────────
--
-- p_flags est un tableau JSON d'objets :
--   { "type": "negatif"|"positif", "categorie": "...", "description": "...",
--     "extrait_message": "...", "confiance": "faible"|"moyenne"|"forte",
--     "personne_id": "uuid" }
-- Écrit dans `comportements` (append) et met à jour la jauge dans
-- `scores_relationnels` pour les DEUX participants (jauge partagée du
-- couple, pas un score individuel opposant l'un à l'autre).

CREATE OR REPLACE FUNCTION enregistrer_analyse_flags_temps_reel(
  p_conversation_id uuid,
  p_flags jsonb,
  p_score_greenflag int,
  p_score_redflag int,
  p_resume text,
  p_nb_messages int
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_participant_ids uuid[];
  v_flag jsonb;
BEGIN
  SELECT participant_ids INTO v_participant_ids
  FROM conversations
  WHERE id = p_conversation_id;

  IF v_participant_ids IS NULL THEN
    RAISE EXCEPTION 'Conversation introuvable';
  END IF;

  IF NOT (auth.uid() = ANY(v_participant_ids)) THEN
    RAISE EXCEPTION 'Non autorisé';
  END IF;

  -- Ajoute les nouveaux flags détectés (append — la purge quotidienne s'en
  -- charge, pas un remplacement à chaque appel, pour ne rien perdre entre
  -- deux analyses si l'utilisateur consulte la liste entre-temps).
  FOR v_flag IN SELECT * FROM jsonb_array_elements(p_flags)
  LOOP
    INSERT INTO comportements (
      conversation_id, personne_id, type, categorie, description, extrait_message, confiance
    ) VALUES (
      p_conversation_id,
      COALESCE((v_flag->>'personne_id')::uuid, auth.uid()),
      COALESCE(v_flag->>'type', 'negatif'),
      v_flag->>'categorie',
      COALESCE(v_flag->>'description', ''),
      v_flag->>'extrait_message',
      COALESCE(v_flag->>'confiance', 'moyenne')
    );
  END LOOP;

  -- Jauge partagée : même valeur écrite pour les deux participants (une
  -- ligne par personne_id, comme le prévoit le schéma existant).
  INSERT INTO scores_relationnels (conversation_id, personne_id, score_redflag, score_greenflag, resume, nb_messages_analyses, updated_at)
  SELECT p_conversation_id, pid, p_score_redflag, p_score_greenflag, p_resume, p_nb_messages, now()
  FROM unnest(v_participant_ids) AS pid
  ON CONFLICT (conversation_id, personne_id) DO UPDATE
    SET score_redflag = EXCLUDED.score_redflag,
        score_greenflag = EXCLUDED.score_greenflag,
        resume = EXCLUDED.resume,
        nb_messages_analyses = EXCLUDED.nb_messages_analyses,
        updated_at = now();
END;
$$;

-- ── 5. RPC : l'analyse profonde du jour a-t-elle déjà tourné ? ─────────────
--
-- Renvoie TRUE si aucune ligne resumes_quotidiens n'existe pour la date du
-- jour (heure de Paris) pour cette conversation ET qu'il y a eu au moins un
-- message dans les dernières 24h — c'est-à-dire : l'analyse quotidienne a
-- probablement été manquée (app fermée à minuit, cron indisponible...) et
-- doit être rattrapée à l'ouverture.

CREATE OR REPLACE FUNCTION analyse_quotidienne_manquante(p_conversation_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_participant_ids uuid[];
  v_paris_date date;
  v_a_des_messages boolean;
  v_deja_analyse boolean;
BEGIN
  SELECT participant_ids INTO v_participant_ids FROM conversations WHERE id = p_conversation_id;
  IF v_participant_ids IS NULL OR NOT (auth.uid() = ANY(v_participant_ids)) THEN
    RETURN false;
  END IF;

  v_paris_date := (now() AT TIME ZONE 'Europe/Paris')::date;

  SELECT EXISTS (
    SELECT 1 FROM messages
    WHERE conversation_id = p_conversation_id
      AND is_deleted = false
      AND created_at >= now() - interval '24 hours'
  ) INTO v_a_des_messages;

  IF NOT v_a_des_messages THEN
    RETURN false;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM resumes_quotidiens
    WHERE conversation_id = p_conversation_id AND date = v_paris_date
  ) INTO v_deja_analyse;

  RETURN NOT v_deja_analyse;
END;
$$;

-- ══════════════════════════════════════════════════════════════════════════════
-- Rien à configurer en plus de 20260720_daily_psychological_analysis.sql —
-- ces RPC tournent avec les droits de l'utilisateur connecté (RLS-safe) et
-- n'ont pas besoin de la Service Key.
-- ══════════════════════════════════════════════════════════════════════════════
