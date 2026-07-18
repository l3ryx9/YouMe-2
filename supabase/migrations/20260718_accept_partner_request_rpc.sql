-- ============================================================
-- Fonction RPC : accept_partner_request
-- Crée les deux lignes de la relation partners (A→B et B→A)
-- de façon atomique, en contournant la RLS via SECURITY DEFINER.
--
-- Contexte : la policy partners_insert exige désormais
-- auth.uid() = user_id (migration 20260714_security_and_indexes.sql).
-- Or acceptRequest() doit insérer une ligne où user_id = l'autre
-- personne (sender), ce que l'utilisateur courant (receiver) ne
-- peut pas faire directement. On passe donc par une fonction
-- SECURITY DEFINER, appelée uniquement si l'appelant est bien
-- le receiver de la demande (vérifié en interne).
-- ============================================================

CREATE OR REPLACE FUNCTION public.accept_partner_request(p_request_id UUID)
RETURNS TABLE (conversation_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request       public.partner_requests%ROWTYPE;
  v_receiver      public.users%ROWTYPE;
  v_conversation_id UUID;
  v_now           TIMESTAMPTZ := NOW();
BEGIN
  -- 1. Charger la demande
  SELECT * INTO v_request
  FROM public.partner_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Demande introuvable';
  END IF;

  -- 2. Sécurité : seul le destinataire de la demande peut l'accepter
  IF v_request.receiver_id <> auth.uid() THEN
    RAISE EXCEPTION 'Non autorisé à accepter cette demande';
  END IF;

  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'Cette demande a déjà été traitée';
  END IF;

  -- 3. Profil du receiver (utilisateur courant)
  SELECT * INTO v_receiver
  FROM public.users
  WHERE id = v_request.receiver_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Votre profil est introuvable';
  END IF;

  -- 4. Trouver ou créer la conversation
  SELECT id INTO v_conversation_id
  FROM public.conversations
  WHERE participant_ids @> ARRAY[v_request.sender_id, v_request.receiver_id]
    AND participant_ids <@ ARRAY[v_request.sender_id, v_request.receiver_id]
  LIMIT 1;

  IF v_conversation_id IS NULL THEN
    v_conversation_id := uuid_generate_v4();
    INSERT INTO public.conversations (id, participant_ids, unread_count, created_at, updated_at)
    VALUES (v_conversation_id, ARRAY[v_request.sender_id, v_request.receiver_id], '{}'::jsonb, v_now, v_now);
  END IF;

  -- 5. Statut de la demande
  UPDATE public.partner_requests
  SET status = 'accepted', updated_at = v_now
  WHERE id = p_request_id;

  -- 6. Relation A → B (sender → receiver)
  INSERT INTO public.partners (
    user_id, partner_id, partner_username, partner_display_name,
    partner_photo_url, conversation_id, created_at
  ) VALUES (
    v_request.sender_id, v_request.receiver_id,
    v_receiver.username, v_receiver.display_name, v_receiver.photo_url,
    v_conversation_id, v_now
  )
  ON CONFLICT (user_id, partner_id) DO NOTHING;

  -- 7. Relation B → A (receiver → sender)
  INSERT INTO public.partners (
    user_id, partner_id, partner_username, partner_display_name,
    partner_photo_url, conversation_id, created_at
  ) VALUES (
    v_request.receiver_id, v_request.sender_id,
    v_request.sender_username, v_request.sender_display_name, v_request.sender_photo_url,
    v_conversation_id, v_now
  )
  ON CONFLICT (user_id, partner_id) DO NOTHING;

  RETURN QUERY SELECT v_conversation_id;
END;
$$;

-- Seuls les utilisateurs authentifiés peuvent appeler cette fonction
REVOKE ALL ON FUNCTION public.accept_partner_request(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_partner_request(UUID) TO authenticated;
