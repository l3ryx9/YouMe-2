-- ============================================================
-- Correctif : restaure la politique INSERT manquante sur `users`
--
-- Contexte : la migration 20260714_security_and_indexes.sql a
-- supprimé l'ancienne politique ALL `users_owner_policy` et l'a
-- remplacée uniquement par des politiques SELECT/UPDATE, en
-- partant du principe que la création de profil se ferait côté
-- backend via la clé service_role.
--
-- En pratique, `UserRepository.createUser` (client mobile)
-- insère directement dans `public.users` avec la clé anon/
-- authenticated. Sans politique INSERT, RLS bloque cet insert
-- et l'inscription échoue systématiquement avec l'erreur
-- « Impossible de créer votre profil ».
--
-- Ce correctif rétablit un INSERT restreint à sa propre ligne
-- (auth.uid() = id), ce qui conserve l'intention de sécurité de
-- la migration précédente (aucun utilisateur ne peut créer de
-- profil pour un autre uid) tout en débloquant l'inscription.
-- ============================================================

DROP POLICY IF EXISTS users_insert ON public.users;

CREATE POLICY users_insert ON public.users
  FOR INSERT WITH CHECK (auth.uid() = id);
