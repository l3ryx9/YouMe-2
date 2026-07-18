-- ══════════════════════════════════════════════════════════════════════════════
-- Purge de rattrapage — scopée à une conversation
-- ══════════════════════════════════════════════════════════════════════════════
--
-- `purger_comportements_du_jour` (migration 20260720) supprime TOUS les flags
-- de TOUTES les conversations — adapté au balayage cron global, mais pas au
-- rattrapage déclenché par un seul utilisateur à l'ouverture de l'app (on ne
-- veut pas qu'ouvrir SA conversation purge aussi celle des autres couples,
-- potentiellement encore fraîche du jour si leur propre rattrapage n'a pas
-- encore eu lieu).
--
-- Cette RPC ne purge que la conversation demandée, et vérifie que l'appelant
-- en est bien participant.

CREATE OR REPLACE FUNCTION purger_comportements_conversation(p_conversation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_participant_ids uuid[];
BEGIN
  SELECT participant_ids INTO v_participant_ids FROM conversations WHERE id = p_conversation_id;

  IF v_participant_ids IS NULL THEN
    RAISE EXCEPTION 'Conversation introuvable';
  END IF;

  IF NOT (auth.uid() = ANY(v_participant_ids)) THEN
    RAISE EXCEPTION 'Non autorisé';
  END IF;

  DELETE FROM comportements WHERE conversation_id = p_conversation_id;
END;
$$;
