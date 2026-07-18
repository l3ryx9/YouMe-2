/**
 * Point d'entrée personnalisé (remplace expo-router/entry)
 *
 * Les handlers Firebase Messaging background DOIVENT être enregistrés
 * avant tout autre code d'initialisation. On utilise require() (pas import)
 * pour éviter le hissage ESM et garantir l'exécution en mode Headless JS.
 *
 * Architecture :
 *  - App fermée (killed) : seul ce handler est exécuté par Android Headless JS
 *  - App en arrière-plan : Firebase affiche la notification nativement si le
 *    payload contient un objet "notification" (pas besoin de code côté app)
 *  - App au premier plan  : handler onMessage dans _layout.tsx
 */

// ─── 1. Polyfill UUID (requis par Supabase) ──────────────────────────────────
require('react-native-get-random-values');

// ─── 2. Handler FCM background / killed ──────────────────────────────────────
// S'exécute même quand l'app est tuée (Headless JS Android).
// NE PAS importer de modules UI ici (pas de React, pas de router).
try {
  const messaging = require('@react-native-firebase/messaging').default;

  messaging().setBackgroundMessageHandler(async (remoteMessage) => {
    const data = remoteMessage?.data ?? {};

    // ── Demande de position furtive ──────────────────────────────────────────
    if (data.type === 'stealth_location_request') {
      const { conversationId, requesterId } = data;
      if (!conversationId || !requesterId) return;

      try {
        const Location = require('expo-location');
        const { createClient } = require('@supabase/supabase-js');

        // Les variables d'env sont disponibles via le build EAS (eas.json)
        const supabaseUrl      = process.env.EXPO_PUBLIC_SUPABASE_URL      ?? '';
        const supabaseAnonKey  = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
        if (!supabaseUrl || !supabaseAnonKey) return;

        const supabase = createClient(supabaseUrl, supabaseAnonKey);

        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

        await supabase.from('stealth_locations').upsert({
          conversation_id:  conversationId,
          requester_id:     requesterId,
          latitude:         loc.coords.latitude,
          longitude:        loc.coords.longitude,
          accuracy:         loc.coords.accuracy ?? null,
          is_mocked:        false,
          updated_at:       new Date().toISOString(),
        }, { onConflict: 'conversation_id' });

      } catch (_) {
        // Silencieux — pas d'UI disponible en mode headless.
      }
      return;
    }

    // ── Notification push standard ───────────────────────────────────────────
    // Android affiche automatiquement la notification si le payload contient
    // un objet "notification". Ce bloc gère les messages data-only.
    if (data.title || data.body) {
      try {
        const Notifications = require('expo-notifications');
        await Notifications.scheduleNotificationAsync({
          content: {
            title: data.title ?? 'YouMe',
            body:  data.body  ?? '',
            data,
          },
          trigger: null,
        });
      } catch (_) {}
    }
  });
} catch (_) {
  // Module natif non disponible (dev sans build natif).
}

// ─── 3. Chargement de l'app Expo Router ─────────────────────────────────────
require('expo-router/entry');
