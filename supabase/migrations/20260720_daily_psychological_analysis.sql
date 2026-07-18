-- ══════════════════════════════════════════════════════════════════════════════
-- Profils psychologiques, red/green flags, et analyse quotidienne à minuit (Paris)
-- ══════════════════════════════════════════════════════════════════════════════
--
-- Architecture :
--   - scores_relationnels : la JAUGE red/green flag — PERSISTE dans le temps,
--     jamais purgée automatiquement.
--   - comportements       : la LISTE détaillée des flags (avec citation, etc.)
--     affichée quand on ouvre l'écran flags/[id] — PURGÉE chaque nuit à minuit
--     heure de Paris par le job ci-dessous (mais pas la jauge).
--   - profils_personnalite : alimenté chaque nuit avec les traits/ton/sujets
--     + conseils comportementaux, à partir de l'analyse complète de la journée
--     (texte ET audio transcrit).
--   - resumes_quotidiens   : un résumé factuel par conversation et par jour.
--
-- ── Tables ───────────────────────────────────────────────────────────────────

create table if not exists profils_personnalite (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null,
  personne_id uuid not null references auth.users(id) on delete cascade,
  traits jsonb default '{}',
  ton text,
  sujets_recurrents text[],
  historique_emotions jsonb default '[]',
  conseils_comportementaux text[],
  updated_at timestamptz default now(),
  unique (conversation_id, personne_id)
);

create table if not exists comportements (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null,
  personne_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('negatif', 'positif')),
  categorie text,
  description text not null,
  extrait_message text,
  confiance text check (confiance in ('faible', 'moyenne', 'forte')),
  created_at timestamptz default now()
);

create table if not exists scores_relationnels (
  conversation_id uuid not null,
  personne_id uuid not null references auth.users(id) on delete cascade,
  score_redflag int check (score_redflag between 0 and 100) default 70,
  score_greenflag int check (score_greenflag between 0 and 100) default 70,
  resume text,
  nb_messages_analyses int default 0,
  updated_at timestamptz default now(),
  primary key (conversation_id, personne_id)
);

create table if not exists resumes_quotidiens (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null,
  date date not null,
  resume text not null,
  created_at timestamptz default now(),
  unique (conversation_id, date)
);

create table if not exists compteurs_conversation (
  conversation_id uuid primary key,
  total_messages int default 0
);

create index if not exists idx_comportements_conv on comportements(conversation_id);

-- ── Purge quotidienne (appelée par la Edge Function daily-psychological-analysis) ──
-- Supprime la liste détaillée des flags de TOUTES les conversations — la jauge
-- (scores_relationnels) n'est jamais touchée par cette fonction.
create or replace function purger_comportements_du_jour()
returns void
language sql
security definer
as $$
  delete from comportements;
$$;

-- ── Planification : appel horaire, la Edge Function vérifie elle-même si on
--    est à minuit heure de Paris avant d'exécuter quoi que ce soit. Cette
--    approche évite les soucis de décalage horaire d'été/hiver (CET/CEST)
--    qu'un cron UTC fixe unique ne gérerait pas correctement.
-- Nécessite pg_cron + pg_net (activés par défaut sur Supabase Cloud).
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'daily-psychological-analysis-hourly-check',
  '0 * * * *', -- toutes les heures, à la minute 0 (UTC)
  $$
  select net.http_post(
    url     := current_setting('app.supabase_url', true) || '/functions/v1/daily-psychological-analysis',
    body    := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.supabase_service_key', true)
    )
  );
  $$
);

-- ══════════════════════════════════════════════════════════════════════════════
-- Configuration requise (à exécuter UNE seule fois, comme pour le webhook push) :
-- ALTER DATABASE postgres SET app.supabase_url          = 'https://xxxx.supabase.co';
-- ALTER DATABASE postgres SET app.supabase_service_key  = 'eyJ...'; -- SERVICE ROLE key, pas anon
-- ══════════════════════════════════════════════════════════════════════════════
