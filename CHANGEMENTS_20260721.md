# Flags temps réel + analyse psychologique profonde — récapitulatif

Ce patch branche les 3 écrans (`analysis`, `flags`, `ai-insights`) et l'écran
`Analyse IA` (`(tabs)/search.tsx`) sur le comportement décrit : jauge +
popup red/green flags tous les 20 messages, purge quotidienne (y compris
serveur), et une deuxième IA qui construit un profil psychologique quotidien
avec détection d'incohérences/contradictions datées, variations d'humeur et
signes de déni — avec rattrapage si l'app était fermée à minuit.

**Non testé en conditions réelles** (pas d'accès à un projet Supabase ni à
une clé Gemini dans cet environnement) — à valider avant mise en prod,
notamment le comportement de pg_cron et le format des réponses JSON de
Gemini (le prompt les contraint, mais aucun modèle n'est fiable à 100 %,
d'où les `try/catch` défensifs à chaque étape).

## Fichiers ajoutés

- `supabase/migrations/20260721_flags_temps_reel_et_analyse_profonde.sql`
  RLS sur les 4 tables de la migration précédente (elles n'avaient aucune
  politique — inaccessibles depuis le client jusqu'ici), tables `faits_cles`
  et `incoherences`, colonnes supplémentaires sur `resumes_quotidiens`, RPC
  `enregistrer_analyse_flags_temps_reel` et `analyse_quotidienne_manquante`.
- `src/infrastructure/supabase/FlagsRepository.ts` — lecture/écriture des
  flags temps réel.
- `src/infrastructure/supabase/DeepAnalysisRepository.ts` — lecture des
  profils/résumés/incohérences + déclenchement du rattrapage.
- `src/presentation/components/chat/FlagsListModal.tsx` — le popup (fenêtre)
  ouvert depuis le bouton-jauge du header du chat.

## Fichiers modifiés

- `supabase/functions/daily-psychological-analysis/index.ts` — réécrite :
  mode cron (minuit Paris, inchangé dans l'esprit) + nouveau mode
  "rattrapage" ciblé sur une conversation (appelé par le client), extraction
  de faits datés, détection d'incohérences par comparaison aux faits déjà
  connus, variations d'humeur, signes de déni, estimation prudente d'un
  risque global — jamais un verdict.
- `app/(app)/chat/[id].tsx` — le bouton-jauge du header ouvre désormais le
  popup `FlagsListModal` au lieu de naviguer plein écran ; l'analyse tous les
  20 messages est persistée en base (au lieu de rester en mémoire locale) ;
  déclenchement du rattrapage de l'analyse profonde à l'ouverture de la
  conversation.
- `app/(app)/flags/[id].tsx` — lit/écrit désormais la même source de vérité
  Supabase que le popup (gardé comme point d'entrée alternatif, ex.
  deep-link, plus rien ne le lie directement dans l'UI actuelle).
- `app/(app)/analysis/[id].tsx` — nouvelle section "Profil psychologique
  (analyse automatique)" au-dessus de l'analyse instantanée existante :
  profils par personne, résumé du jour avec niveau d'incohérence, liste des
  incohérences détectées dans le temps.
- `app/(app)/(tabs)/search.tsx` — la grille "Analyse IA" lit maintenant les
  vraies incohérences Supabase/Gemini au lieu de l'ancienne mémoire SQLite
  locale (`memoryRepository`, résidu de l'IA on-device supprimée).
- `src/infrastructure/supabase/config.ts` — ajout de `TABLES.FAITS_CLES` et
  `TABLES.INCOHERENCES`.
- `src/infrastructure/supabase/database.types.ts` — types TypeScript pour
  les 6 tables d'analyse + les 2 nouveaux RPC.

## À faire côté Supabase avant de tester

1. Appliquer la nouvelle migration (`supabase db push` ou équivalent).
2. Redéployer la Edge Function `daily-psychological-analysis`
   (`supabase functions deploy daily-psychological-analysis`).
3. Si ce n'est pas déjà fait pour la migration précédente : configurer
   `app.supabase_url` et `app.supabase_service_key` (voir le bas du fichier
   `20260720_daily_psychological_analysis.sql`) pour que pg_cron fonctionne.
   Le mode "rattrapage" ajouté ici compense les cas où pg_cron n'est pas
   disponible (ex. plan Supabase qui ne l'inclut pas), mais mieux vaut avoir
   les deux.

## Comportement obtenu

- **Toutes les 20 messages** : Gemini analyse la conversation, écrit les
  red/green flags dans `comportements` et met à jour la jauge dans
  `scores_relationnels` (visible dans le header du chat).
- **Bouton du header** → popup avec la jauge + la liste des flags du jour.
- **Chaque nuit à minuit (heure de Paris)**, automatiquement, sur le
  serveur (indépendamment de l'app) :
  - la liste `comportements` est vidée (jauge inchangée) ;
  - le profil psychologique de chaque personne est mis à jour ;
  - les nouveaux faits datés sont enregistrés, comparés aux faits connus
    pour détecter des incohérences (jamais purgées — mémoire longue) ;
  - un résumé du jour est généré, avec un niveau d'incohérence prudent.
- **Si l'app était fermée à minuit** : à l'ouverture d'une conversation (ou
  de l'onglet Analyse), le client vérifie si l'analyse du jour manque et la
  déclenche alors côté serveur.
