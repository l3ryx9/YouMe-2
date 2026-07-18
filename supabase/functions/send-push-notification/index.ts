/**
 * Supabase Edge Function — send-push-notification
 *
 * Déclenchée par un Database Webhook sur INSERT dans public.messages.
 * Envoie une notification push via l'API Expo Push (exp.host) au destinataire.
 *
 * Avantages de l'API Expo :
 *  - Pas de service account Firebase nécessaire
 *  - Gère automatiquement FCM (Android) ET APNs (iOS)
 *  - Le token Expo (ExponentPushToken[...]) est déjà stocké dans users.fcm_token
 *
 * Variables d'environnement requises (Supabase Dashboard → Settings → Edge Functions) :
 *   SUPABASE_URL   — URL du projet (déjà injectée automatiquement)
 *   SERVICE_KEY    — Service role key (pour contourner RLS et lire le token)
 *                    ⚠️ NE PAS utiliser le préfixe SUPABASE_ (réservé par Supabase)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

// Corps envoyé par le Database Webhook Supabase (table → row)
interface WebhookPayload {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  record: MessageRecord;
  old_record: MessageRecord | null;
}

interface MessageRecord {
  id: string;
  conversation_id: string;
  sender_id: string;
  receiver_id: string;
  type: string;          // 'text' | 'image' | 'voice' | 'video' | 'location'
  content: string | null;
  sender_display_name?: string;
  is_deleted: boolean;
  created_at: string;
}

Deno.serve(async (req: Request) => {
  try {
    // Vérification basique (Supabase envoie un header Authorization)
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response('Unauthorized', { status: 401 });
    }

    const payload: WebhookPayload = await req.json();

    // On ne traite que les nouveaux messages non supprimés
    if (payload.type !== 'INSERT' || payload.record.is_deleted) {
      return new Response('Ignored', { status: 200 });
    }

    const msg = payload.record;

    // Client Supabase avec la service role key (contourne RLS pour lire fcm_token)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SERVICE_KEY')!
    );

    // Récupère le token Expo et le nom d'affichage de l'expéditeur
    const { data: users, error } = await supabase
      .from('users')
      .select('id, fcm_token, display_name')
      .in('id', [msg.receiver_id, msg.sender_id]);

    if (error || !users) {
      console.error('[send-push] Erreur lecture users:', error?.message);
      return new Response('DB error', { status: 500 });
    }

    const receiver = users.find((u) => u.id === msg.receiver_id);
    const sender   = users.find((u) => u.id === msg.sender_id);

    if (!receiver?.fcm_token) {
      // Pas de token → pas de notif (permissions refusées ou pas encore connecté)
      return new Response('No token', { status: 200 });
    }

    // Construction du corps de la notification selon le type de message
    const senderName = sender?.display_name ?? msg.sender_display_name ?? 'Quelqu\'un';
    const body = buildNotificationBody(msg.type, msg.content);

    // Envoi via Expo Push API
    const pushResponse = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        to:    receiver.fcm_token,
        title: senderName,
        body,
        data: {
          conversationId: msg.conversation_id,
          senderId:       msg.sender_id,
          messageType:    msg.type,
          messageId:      msg.id,
        },
        sound:    'default',
        priority: 'high',
        // Android : canal défini dans NotificationService.ts
        channelId: 'messages',
        // Badge iOS : incrémenté automatiquement par Expo
        badge: 1,
      }),
    });

    const pushResult = await pushResponse.json();

    // Log si erreur Expo (token expiré, désactivé, etc.)
    const ticket = pushResult?.data;
    if (ticket?.status === 'error') {
      console.warn('[send-push] Ticket Expo en erreur:', ticket.message, '| token:', receiver.fcm_token);
      // Si le token est invalide (DeviceNotRegistered), on le supprime
      if (ticket.details?.error === 'DeviceNotRegistered') {
        await supabase
          .from('users')
          .update({ fcm_token: null })
          .eq('id', msg.receiver_id);
      }
    }

    return new Response(JSON.stringify({ ok: true, ticket }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('[send-push] Erreur inattendue:', err);
    return new Response('Internal error', { status: 500 });
  }
});

/** Construit le texte de la notification selon le type de message */
function buildNotificationBody(type: string, content: string | null): string {
  switch (type) {
    case 'text':     return content ? (content.length > 100 ? content.slice(0, 97) + '…' : content) : 'Nouveau message';
    case 'image':    return '📷 Photo';
    case 'video':    return '🎥 Vidéo';
    case 'voice':    return '🎤 Message vocal';
    case 'location': return '📍 Position partagée';
    default:         return 'Nouveau message';
  }
}
