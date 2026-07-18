-- ============================================================
-- Migration : sécurité RLS + index
-- Généré par audit YouMe — 2026-07-14
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. TABLE : users
--    Problème : politique ALL sans with_check → un UPDATE
--    pourrait modifier l'id ou l'email en contournant le check.
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS users_owner_policy ON users;

CREATE POLICY users_select ON users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY users_update ON users
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- INSERT géré uniquement par le backend via service_role (pas de politique INSERT utilisateur)
-- DELETE idem — désactivé côté client

-- ────────────────────────────────────────────────────────────
-- 2. TABLE : conversations
--    Problème : politique ALL → un participant peut DELETE
--    toute la conversation. Pas de with_check sur INSERT.
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS conversations_participant_policy ON conversations;

CREATE POLICY conversations_select ON conversations
  FOR SELECT USING (auth.uid() = ANY(participant_ids));

CREATE POLICY conversations_insert ON conversations
  FOR INSERT WITH CHECK (auth.uid() = ANY(participant_ids));

CREATE POLICY conversations_update ON conversations
  FOR UPDATE
  USING (auth.uid() = ANY(participant_ids))
  WITH CHECK (auth.uid() = ANY(participant_ids));

-- Pas de politique DELETE : les conversations ne peuvent pas
-- être supprimées depuis le client.

-- ────────────────────────────────────────────────────────────
-- 3. TABLE : messages
--    Problème : le destinataire peut DELETE les messages reçus.
--    INSERT sans with_check → on peut créer des messages avec
--    n'importe quel sender_id.
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS messages_participant_policy ON messages;

CREATE POLICY messages_select ON messages
  FOR SELECT USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

CREATE POLICY messages_insert ON messages
  FOR INSERT WITH CHECK (auth.uid() = sender_id);

CREATE POLICY messages_update ON messages
  FOR UPDATE
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id)
  WITH CHECK (auth.uid() = sender_id OR auth.uid() = receiver_id);

-- Seul l'expéditeur peut DELETE (soft delete côté code, mais
-- on empêche tout de même un DELETE direct par le destinataire)
CREATE POLICY messages_delete ON messages
  FOR DELETE USING (auth.uid() = sender_id);

-- ────────────────────────────────────────────────────────────
-- 4. TABLE : partner_requests
--    Problème : politique ALL → le destinataire peut INSERT
--    une fausse demande en se faisant passer pour n'importe
--    qui ; l'expéditeur peut UPDATE le statut directement.
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS partner_requests_policy ON partner_requests;

-- N'importe qui peut lire ses propres demandes (envoyées ou reçues)
CREATE POLICY partner_requests_select ON partner_requests
  FOR SELECT USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

-- Seul l'expéditeur peut créer une demande en son nom
CREATE POLICY partner_requests_insert ON partner_requests
  FOR INSERT WITH CHECK (auth.uid() = sender_id);

-- Seul le destinataire peut accepter/rejeter (UPDATE status)
CREATE POLICY partner_requests_update ON partner_requests
  FOR UPDATE
  USING (auth.uid() = receiver_id)
  WITH CHECK (auth.uid() = receiver_id);

-- Seul l'expéditeur peut annuler/supprimer sa propre demande
CREATE POLICY partner_requests_delete ON partner_requests
  FOR DELETE USING (auth.uid() = sender_id);

-- ────────────────────────────────────────────────────────────
-- 5. TABLE : partners
--    Problème : partner_id peut modifier ou supprimer les
--    entrées où il apparaît comme partenaire (pas comme owner).
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS partners_policy ON partners;

-- Chaque utilisateur ne voit que ses propres entrées
CREATE POLICY partners_select ON partners
  FOR SELECT USING (auth.uid() = user_id);

-- INSERT uniquement via service_role (géré par acceptPartnerRequest)
-- On l'autorise quand même côté RLS mais user_id doit être soi-même
CREATE POLICY partners_insert ON partners
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Suppression uniquement par le propriétaire de la ligne
CREATE POLICY partners_delete ON partners
  FOR DELETE USING (auth.uid() = user_id);

-- ────────────────────────────────────────────────────────────
-- 6. TABLE : location_shares  ⚠️ CRITIQUE
--    Problème : auth.uid() IS NOT NULL → TOUT utilisateur
--    connecté peut lire la localisation de TOUT LE MONDE.
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS location_shares_policy ON location_shares;

-- Lecture : uniquement l'utilisateur lui-même ou ses partenaires
CREATE POLICY location_shares_select ON location_shares
  FOR SELECT USING (
    auth.uid() = user_id
    OR auth.uid() IN (
      SELECT partner_id FROM partners WHERE user_id = location_shares.user_id
    )
  );

-- Insertion/mise à jour : uniquement sur ses propres données
CREATE POLICY location_shares_insert ON location_shares
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY location_shares_update ON location_shares
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY location_shares_delete ON location_shares
  FOR DELETE USING (auth.uid() = user_id);

-- ────────────────────────────────────────────────────────────
-- 7. TABLE : location_requests
--    OK dans l'ensemble — on ajoute juste with_check sur INSERT
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS location_requests_policy ON location_requests;

CREATE POLICY location_requests_select ON location_requests
  FOR SELECT USING (auth.uid() = target_user_id OR auth.uid() = requester_id);

CREATE POLICY location_requests_insert ON location_requests
  FOR INSERT WITH CHECK (auth.uid() = requester_id);

CREATE POLICY location_requests_delete ON location_requests
  FOR DELETE USING (auth.uid() = requester_id OR auth.uid() = target_user_id);

-- ────────────────────────────────────────────────────────────
-- 8. TABLE : stealth_tracking
--    La colonne s'appelle target_user_id (pas user_id)
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS stealth_tracking_policy ON stealth_tracking;

CREATE POLICY stealth_tracking_select ON stealth_tracking
  FOR SELECT USING (auth.uid() = target_user_id OR auth.uid() = requester_id);

CREATE POLICY stealth_tracking_insert ON stealth_tracking
  FOR INSERT WITH CHECK (auth.uid() = requester_id);

CREATE POLICY stealth_tracking_delete ON stealth_tracking
  FOR DELETE USING (auth.uid() = requester_id OR auth.uid() = target_user_id);

-- ────────────────────────────────────────────────────────────
-- INDEX — performances
-- ────────────────────────────────────────────────────────────

-- Messages : chargement des messages d'une conversation (tri par date)
CREATE INDEX IF NOT EXISTS idx_messages_conv_created
  ON messages(conversation_id, created_at DESC);

-- Messages : lookup par expéditeur ou destinataire
CREATE INDEX IF NOT EXISTS idx_messages_sender   ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_receiver ON messages(receiver_id);

-- Conversations : recherche par participant (tableau UUID)
CREATE INDEX IF NOT EXISTS idx_conversations_participants
  ON conversations USING GIN(participant_ids);

CREATE INDEX IF NOT EXISTS idx_conversations_updated
  ON conversations(updated_at DESC);

-- Demandes partenaire : lookup des demandes en attente pour un receiver
CREATE INDEX IF NOT EXISTS idx_partner_requests_receiver_status
  ON partner_requests(receiver_id, status);

CREATE INDEX IF NOT EXISTS idx_partner_requests_sender
  ON partner_requests(sender_id);

-- Partenaires : listing rapide
CREATE INDEX IF NOT EXISTS idx_partners_user_id    ON partners(user_id);
CREATE INDEX IF NOT EXISTS idx_partners_partner_id ON partners(partner_id);

-- Localisation : lookup par utilisateur et conversation
CREATE INDEX IF NOT EXISTS idx_location_shares_user_id
  ON location_shares(user_id);

CREATE INDEX IF NOT EXISTS idx_location_shares_conversation
  ON location_shares(conversation_id);

-- Stealth tracking
CREATE INDEX IF NOT EXISTS idx_stealth_target_user_id
  ON stealth_tracking(target_user_id);

CREATE INDEX IF NOT EXISTS idx_stealth_requester
  ON stealth_tracking(requester_id);

-- app_logs : pas d'index ajouté (schéma de colonne incertain)
