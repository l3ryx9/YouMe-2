/**
 * Layout Application — écrans authentifiés
 *
 * Les subscriptions Realtime (demandes partenaire + liste partenaires + présence)
 * sont initialisées ici pour rester actives quel que soit l'onglet ouvert.
 */
import { useEffect, useRef } from 'react';
import { Stack } from 'expo-router';
import { useYoumeColors } from '../../src/shared/constants/theme';
import { useAuthStore } from '../../src/presentation/stores/authStore';
import { usePartnerStore } from '../../src/presentation/stores/partnerStore';
import { useConversationStore } from '../../src/presentation/stores/conversationStore';
import { partnerRepository } from '../../src/infrastructure/supabase/PartnerRepository';
import { supabase, TABLES } from '../../src/infrastructure/supabase/config';
import type { ConversationWithPartner } from '../../src/domain/entities/Conversation';

export default function AppLayout() {
  const colors = useYoumeColors();
  const { user } = useAuthStore();
  const { partners, setPartners, setPendingRequests, updatePartnerPresence } = usePartnerStore();
  const { setConversations } = useConversationStore();

  // Subscription globale — liste + demandes
  useEffect(() => {
    if (!user) return;
    const unsubPartners = partnerRepository.subscribeToPartners(user.id, setPartners);
    const unsubRequests = partnerRepository.subscribeToRequests(user.id, setPendingRequests);
    return () => { unsubPartners(); unsubRequests(); };
  }, [user?.id]);

  // Subscription globale — conversations (déplacée depuis l'onglet Messages :
  // l'onglet Contacts et l'onglet Analyse IA ont tous les deux besoin d'une
  // liste de conversations toujours à jour, même quand l'onglet Messages
  // n'est pas affiché à l'écran).
  useEffect(() => {
    if (!user) return;

    let channel: ReturnType<typeof supabase.channel> | null = null;

    const loadConversations = async () => {
      const { data: convRows, error: convRowsErr } = await supabase
        .from(TABLES.CONVERSATIONS)
        .select('*')
        .contains('participant_ids', [user.id])
        .not('last_message', 'is', null)
        .order('updated_at', { ascending: false });

      if (convRowsErr) {
        console.error('[AppLayout] Erreur chargement conversations :', convRowsErr.message);
        return;
      }
      if (!convRows) return;

      const partnerIds = Array.from(
        new Set(
          convRows
            .map((row) => (row.participant_ids as string[]).find((id) => id !== user.id))
            .filter((id): id is string => !!id)
        )
      );

      const profileEntries = await Promise.all(
        partnerIds.map(async (id) => {
          try {
            const { data } = await supabase
              .from(TABLES.PUBLIC_PROFILES)
              .select('*')
              .eq('id', id)
              .single();
            return [id, data] as const;
          } catch {
            return [id, null] as const;
          }
        })
      );
      const profiles = new Map(profileEntries);

      const convs: ConversationWithPartner[] = [];
      for (const row of convRows) {
        const partnerId = (row.participant_ids as string[]).find((id) => id !== user.id);
        if (!partnerId) continue;

        const profile = profiles.get(partnerId);

        convs.push({
          id: row.id,
          participantIds: row.participant_ids as [string, string],
          lastMessage: (row.last_message as unknown as ConversationWithPartner['lastMessage']) ?? undefined,
          unreadCount: row.unread_count ?? 0,
          createdAt: row.created_at ? new Date(row.created_at) : new Date(),
          updatedAt: row.updated_at ? new Date(row.updated_at) : new Date(),
          partnerId,
          partnerUsername: profile?.username ?? 'partenaire',
          partnerDisplayName: profile?.display_name ?? 'Partenaire',
          partnerPhotoURL: profile?.photo_url ?? undefined,
          partnerIsOnline: profile?.is_online ?? false,
          partnerLastSeen: profile?.last_seen ? new Date(profile.last_seen) : new Date(),
        });
      }
      setConversations(convs);
    };

    loadConversations();

    channel = supabase
      .channel(`conversations:${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: TABLES.CONVERSATIONS }, () => {
        loadConversations();
      })
      .subscribe();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [user?.id]);

  // Subscription présence — se reconnecte quand la liste de partenaires change
  const partnerIdsKey = partners.map((p) => p.partnerId).join(',');
  useEffect(() => {
    if (!partners.length) return;
    const ids = partners.map((p) => p.partnerId);
    const unsub = partnerRepository.subscribeToPartnersPresence(
      ids,
      (partnerId, isOnline, lastSeen) => updatePartnerPresence(partnerId, isOnline, lastSeen)
    );
    return () => unsub();
  }, [partnerIdsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="chat/[id]" options={{ headerShown: false, animation: 'slide_from_right' }} />
      <Stack.Screen name="ai-insights/[id]" options={{ headerShown: false, animation: 'slide_from_bottom' }} />
      <Stack.Screen name="analysis/[id]" options={{ headerShown: false, animation: 'slide_from_bottom' }} />
      <Stack.Screen name="flags/[id]" options={{ headerShown: false, animation: 'slide_from_bottom' }} />
    </Stack>
  );
              }
