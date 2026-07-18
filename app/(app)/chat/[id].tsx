/**
 * Écran de Chat
 * Messagerie temps réel avec texte et vocal, accusés et analyse IA.
 * Partage de position (en direct, arrière-plan) + suivi furtif (5 taps).
 * Jauge Red/Green flags Gemini — déclenchée tous les 20 messages.
 */
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { themedAlert } from '@presentation/components/common/ThemedAlert';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Animated as RNAnimated,
  Dimensions,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import * as FileSystem from 'expo-file-system';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useYoumeColors, YoumeColors, YOUME_COLORS, SPACING, TYPOGRAPHY, BORDER_RADIUS, SHADOW } from '../../../src/shared/constants/theme';
import { isEffectivelyOnline } from '../../../src/shared/utils/presence';
import { MessageBubble } from '../../../src/presentation/components/chat/MessageBubble';
import { VoiceRecorder } from '../../../src/presentation/components/chat/VoiceRecorder';
import { Avatar } from '../../../src/presentation/components/common/Avatar';
import { useAuthStore } from '../../../src/presentation/stores/authStore';
import { useConversationStore } from '../../../src/presentation/stores/conversationStore';
import { useLocationStore } from '../../../src/presentation/stores/locationStore';
import { messageRepository } from '../../../src/infrastructure/supabase/MessageRepository';
import { voiceStorage } from '../../../src/infrastructure/storage/VoiceMessageStorage';
import { localImageStorage } from '../../../src/infrastructure/storage/LocalImageStorage';
import { uploadMedia } from '../../../src/infrastructure/supabase/MediaUploadService';
import { supabase, TABLES } from '../../../src/infrastructure/supabase/config';
import { locationService } from '../../../src/infrastructure/location/LocationService';
import { stealthLocationService } from '../../../src/infrastructure/location/StealthLocationService';
import { fcmLocationService } from '../../../src/infrastructure/location/FcmLocationService';
import { useUIStore } from '../../../src/presentation/stores/uiStore';
import { formatMessageDay, formatMessageTime, isSameDay } from '../../../src/shared/utils/dateUtils';
import type { Message, LocationData } from '../../../src/domain/entities/Message';
import { LocationMapModal } from '../../../src/presentation/components/chat/LocationMapModal';
import { geminiFlagModule } from '../../../src/infrastructure/gemini/GeminiFlagAnalysis';
import { aiMessageAnalyzer } from '../../../src/infrastructure/gemini/AIMessageAnalyzer';
import { flagsRepository, type FlagsGaugeEtListe } from '../../../src/infrastructure/supabase/FlagsRepository';
import { deepAnalysisRepository } from '../../../src/infrastructure/supabase/DeepAnalysisRepository';
import { FlagsListModal } from '../../../src/presentation/components/chat/FlagsListModal';
import { DailyCatchupModal, type CatchupStage } from '../../../src/presentation/components/common/DailyCatchupModal';
import { Bubble3DButton } from '../../../src/presentation/components/common/Bubble3DButton';
import { ForestPattern } from '../../../src/presentation/components/common/ForestPattern';
import { IAFloatingButton } from '../../../src/presentation/components/chat/IAFloatingButton';
import { GeminiAskModal } from '../../../src/presentation/components/chat/GeminiAskModal';

const { width: SCREEN_W } = Dimensions.get('window');

/** Jauge mini inline dans le header (red ou green) */
function MiniGaugeBar({ score, color }: { score: number; color: string }) {
  return (
    <View style={{ width: 28, height: 4, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 2, overflow: 'hidden' }}>
      <View style={{ width: `${Math.max(0, Math.min(100, score))}%`, height: 4, backgroundColor: color, borderRadius: 2 }} />
    </View>
  );
}

/** Indicateur de jauge Red/Green flags dans le header */
function FlagGaugeIndicator({
  green,
  red,
  colors,
  onPress,
}: {
  green: number;
  red: number;
  colors: YoumeColors;
  onPress: () => void;
}) {
  const greenColor = green >= 70 ? (colors.success ?? '#4CAF50') : green >= 45 ? '#D2A24C' : colors.error;
  const redColor   = red   >= 70 ? (colors.success ?? '#4CAF50') : red   >= 45 ? '#D2A24C' : colors.error;

  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 6,
        paddingVertical: 4,
        borderRadius: BORDER_RADIUS.sm,
        gap: 3,
      }}
      hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
    >
      {/* Green flags bar */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
        <Text style={{ fontSize: 8, color: greenColor, fontWeight: '700' }}>✅</Text>
        <MiniGaugeBar score={green} color={greenColor} />
      </View>
      {/* Red flags bar */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
        <Text style={{ fontSize: 8, color: redColor, fontWeight: '700' }}>🚩</Text>
        <MiniGaugeBar score={red} color={redColor} />
      </View>
    </TouchableOpacity>
  );
}

interface TempGaugeProps {
  label: string;
  initials: string;
  score: number;
  color: string;
  colors: YoumeColors;
}

function TempGauge({ label, initials, score, color, colors }: TempGaugeProps) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm }}>
      <View style={{ width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', backgroundColor: `${color}30` }}>
        <Text style={{ fontSize: TYPOGRAPHY.size.md, fontWeight: '700', color }}>{initials}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
          <Text style={{ fontSize: TYPOGRAPHY.size.sm, color: colors.textPrimary, fontWeight: '600' }}>{label}</Text>
          <Text style={{ fontSize: TYPOGRAPHY.size.sm, fontWeight: '700', color }}>{score} pts</Text>
        </View>
        <View style={{ height: 8, backgroundColor: colors.surfaceVariant, borderRadius: 4, overflow: 'hidden' }}>
          <View style={{ width: `${score}%`, height: 8, borderRadius: 4, backgroundColor: color }} />
        </View>
      </View>
    </View>
  );
}

function TemperatureModal({
  visible,
  onClose,
  partnerName,
  userScore,
  partnerScore,
  colors,
}: {
  visible: boolean;
  onClose: () => void;
  partnerName: string;
  userScore: number;
  partnerScore: number;
  colors: YoumeColors;
}) {
  const styles = useMemo(() => getTempModalStyles(colors), [colors]);
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.title}>🌡 Température</Text>
            <Text style={styles.subtitle}>Score de confiance basé sur les interactions IA</Text>
          </View>
          <TempGauge label="Vous" initials="V" score={userScore} color={userScore > 60 ? colors.primary : colors.coherenceMedium} colors={colors} />
          <TempGauge label={partnerName} initials={partnerName.slice(0, 1).toUpperCase()} score={partnerScore} color={partnerScore > 60 ? colors.coherenceMedium : colors.error} colors={colors} />
          <Text style={styles.note}>Les scores évoluent en fonction de la cohérence des échanges analysés par l'IA.</Text>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeBtnText}>Fermer</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function getTempModalStyles(colors: YoumeColors) {
  return StyleSheet.create({
    overlay: { flex: 1, justifyContent: 'flex-end' },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: SPACING.lg,
      paddingBottom: SPACING.xl,
    },
    handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.divider, alignSelf: 'center', marginBottom: SPACING.lg },
    header: { marginBottom: SPACING.lg, gap: 4 },
    title: { fontSize: TYPOGRAPHY.size.xl, fontWeight: '700', color: colors.textPrimary },
    subtitle: { fontSize: TYPOGRAPHY.size.sm, color: colors.textMuted },
    note: { fontSize: TYPOGRAPHY.size.xs, color: colors.textMuted, fontStyle: 'italic', textAlign: 'center', marginTop: SPACING.sm, marginBottom: SPACING.md, lineHeight: 18 },
    closeBtn: { height: 48, borderRadius: BORDER_RADIUS.md, borderWidth: 1.5, borderColor: colors.primary, justifyContent: 'center', alignItems: 'center' },
    closeBtnText: { fontSize: TYPOGRAPHY.size.md, color: colors.primary, fontWeight: '600' },
  });
}

/** Scores Red/Green flags issus de l'analyse Gemini */
interface FlagScores {
  green: number;
  red: number;
}

export default function ChatScreen() {
  const { id: conversationId } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();
  const { aiEnabled } = useUIStore();
  const { messages, setMessages, addMessage, updateMessage, conversations } = useConversationStore();
  const {
    isSharing,
    sharingConversationId,
    partnerLocation,
    stealthActive,
    stealthTargetId,
    setSharing,
    setPartnerLocation,
    setStealthActive,
    registerTap,
    resetTaps,
  } = useLocationStore();
  const [text, setText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [tempModalVisible, setTempModalVisible] = useState(false);
  const [resolvedPartnerId, setResolvedPartnerId] = useState<string | null>(null);
  const [mapModalVisible, setMapModalVisible] = useState(false);
  const [tapFeedback, setTapFeedback] = useState<number | null>(null);
  const tapFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [mapModalCoords, setMapModalCoords] = useState<{ lat: number; lng: number; label?: string } | null>(null);

  /** Scores Gemini Red/Green flags — déclenchés tous les 20 messages */
  const [flagScores, setFlagScores] = useState<FlagScores>({ green: 70, red: 70 });
  const lastFlagAnalysisCount = useRef(0);

  /** Popup (fenêtre) listant les flags — ouvert depuis le bouton-jauge du header */
  const [flagsModalVisible, setFlagsModalVisible] = useState(false);
  const [flagsData, setFlagsData] = useState<FlagsGaugeEtListe | null>(null);
  const [flagsLoading, setFlagsLoading] = useState(false);
  const [flagsRefreshing, setFlagsRefreshing] = useState(false);

  /** Popup bloquant "suppression puis analyse" affiché quand l'app rattrape le cycle 24h manqué */
  const [catchupVisible, setCatchupVisible] = useState(false);
  const [catchupStage, setCatchupStage] = useState<CatchupStage>('purge');
  const catchupTriggeredRef = useRef(false);

  /** Fenêtre "poser une question à Gemini" — ouverte depuis le bouton IA flottant */
  const [askModalVisible, setAskModalVisible] = useState(false);

  const flatListRef = useRef<FlatList>(null);
  const shareTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stealthRefreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const colors = useYoumeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);

  const conversationMessages = messages[conversationId ?? ''] ?? [];
  const [partnerProfile, setPartnerProfile] = useState<{ displayName: string; isOnline: boolean; lastSeen: Date | null }>({ displayName: 'Partenaire', isOnline: false, lastSeen: null });
  const partnerName = partnerProfile?.displayName ?? 'Partenaire';
  const partnerIsOnline = isEffectivelyOnline(partnerProfile?.isOnline, partnerProfile?.lastSeen);
  const partnerStatusLabel = useMemo(() => {
    if (partnerIsOnline) return 'En ligne';
    if (partnerProfile?.lastSeen) {
      return `Vu ${formatDistanceToNow(partnerProfile.lastSeen, { addSuffix: true, locale: fr })}`;
    }
    return 'Hors ligne';
  }, [partnerIsOnline, partnerProfile?.lastSeen]);
  const userTempScore = 72;
  const partnerTempScore = 45;

  const storePartnerId =
    conversations.find((c) => c.id === conversationId)?.partnerId ?? null;
  const partnerId = storePartnerId ?? resolvedPartnerId;

  const isSharingHere = isSharing && sharingConversationId === conversationId;
  const stealthHere = stealthActive && stealthTargetId === partnerId;

  /** Charge la jauge + la liste des flags persistées (Supabase) au montage de l'écran. */
  const chargerFlags = useCallback(async () => {
    if (!conversationId) return;
    try {
      const data = await flagsRepository.fetchCurrent(conversationId);
      setFlagsData(data);
      setFlagScores({ green: data.greenScore, red: data.redScore });
    } catch (err) {
      console.warn('[ChatScreen] Chargement des flags échoué :', err);
    }
  }, [conversationId]);

  useEffect(() => {
    setFlagsLoading(true);
    chargerFlags().finally(() => setFlagsLoading(false));
  }, [chargerFlags]);

  /** Rafraîchit la jauge + le popup en direct si l'autre appareil écrit (nouvelle analyse, purge de minuit...). */
  useEffect(() => {
    if (!conversationId) return;
    return flagsRepository.subscribeToChanges(conversationId, chargerFlags);
  }, [conversationId, chargerFlags]);

  /**
   * Déclenche l'analyse Gemini Red/Green flags tous les 20 messages, puis
   * PERSISTE le résultat côté serveur (comportements + scores_relationnels)
   * via le RPC `enregistrer_analyse_flags_temps_reel` — la jauge affichée
   * dans le header ne vit donc plus uniquement en mémoire locale : elle
   * survit à la fermeture de l'app et est partagée avec le partenaire.
   */
  useEffect(() => {
    if (!user || !conversationId || !geminiFlagModule.isAvailable()) return;
    const count = conversationMessages.length;
    if (count === 0) return;
    if (count - lastFlagAnalysisCount.current >= 20) {
      lastFlagAnalysisCount.current = count;
      const partner = conversations.find((c) => c.id === conversationId);
      geminiFlagModule
        .analyzeFlags(conversationMessages, user.id, partner?.partnerDisplayName ?? 'votre partenaire')
        .then(async (result) => {
          if (!result) return;
          try {
            const { greenScore, redScore } = await flagsRepository.persistAnalysis(
              conversationId,
              result,
              user.id,
              partner?.partnerId ?? null
            );
            setFlagScores({ green: greenScore, red: redScore });
            // Le popup, s'il est ouvert, doit refléter la nouvelle analyse immédiatement.
            chargerFlags();
          } catch (err) {
            console.warn('[ChatScreen] Écriture des flags échouée :', err);
          }
        })
        .catch(() => {});
    }
  }, [conversationMessages.length, user?.id, conversationId, chargerFlags]);

  /**
   * Analyse psychologique profonde (2ᵉ IA) : tourne chaque nuit à minuit
   * (heure de Paris) côté serveur, quelle que soit l'activité de l'app
   * (pg_cron). Ce déclenchement côté client sert de filet de rattrapage :
   * si l'app était fermée à minuit ou si pg_cron n'est pas configuré sur le
   * projet Supabase, l'ouverture de cette conversation vérifie si le cycle
   * 24h (suppression + analyse) manque et l'exécute alors, avec un popup
   * bloquant qui reflète les deux étapes réelles.
   */
  useEffect(() => {
    if (!conversationId || !user || catchupTriggeredRef.current) return;
    catchupTriggeredRef.current = true;
    (async () => {
      const needed = await deepAnalysisRepository.isCatchupNeeded(conversationId);
      if (!needed) return;
      setCatchupStage('purge');
      setCatchupVisible(true);
      try {
        await deepAnalysisRepository.runCatchup(conversationId, setCatchupStage);
      } finally {
        setCatchupVisible(false);
        chargerFlags(); // la purge vient d'avoir lieu : rafraîchit la jauge/le popup flags
      }
    })();
  }, [conversationId, user?.id, chargerFlags]);

  const ouvrirFlagsModal = useCallback(() => {
    setFlagsModalVisible(true);
    if (!flagsData) {
      setFlagsLoading(true);
      chargerFlags().finally(() => setFlagsLoading(false));
    }
  }, [flagsData, chargerFlags]);

  const rafraichirFlagsManuel = useCallback(async () => {
    if (!user || !conversationId) return;
    setFlagsRefreshing(true);
    try {
      const partner = conversations.find((c) => c.id === conversationId);
      const result = await geminiFlagModule.analyzeFlags(
        conversationMessages,
        user.id,
        partner?.partnerDisplayName ?? 'votre partenaire'
      );
      if (result) {
        const { greenScore, redScore } = await flagsRepository.persistAnalysis(
          conversationId,
          result,
          user.id,
          partner?.partnerId ?? null
        );
        setFlagScores({ green: greenScore, red: redScore });
      }
      await chargerFlags();
    } catch (err) {
      console.warn('[ChatScreen] Rafraîchissement manuel des flags échoué :', err);
    } finally {
      setFlagsRefreshing(false);
    }
  }, [user, conversationId, conversationMessages, conversations, chargerFlags]);


  useEffect(() => {
    if (!conversationId) return;
    const unsubscribe = messageRepository.subscribeToMessages(conversationId, (msgs) => {
      setMessages(conversationId, msgs);
      if (user) {
        messageRepository.markMessagesAsRead(conversationId, user.id);
      }
    }, user?.id);
    return () => unsubscribe();
  }, [conversationId]);

  useEffect(() => {
    if (storePartnerId || !conversationId || !user) return;
    supabase
      .from(TABLES.CONVERSATIONS)
      .select('participant_ids')
      .eq('id', conversationId)
      .single()
      .then(
        ({ data }) => {
          if (data) {
            const ids: string[] = (data as any).participant_ids ?? [];
            setResolvedPartnerId(ids.find((pid) => pid !== user.id) ?? null);
          }
        },
        () => {}
      );
  }, [storePartnerId, conversationId, user?.id]);

  useEffect(() => {
    if (!partnerId) {
      setPartnerProfile({ displayName: 'Partenaire', isOnline: false, lastSeen: null });
      return;
    }
    supabase
      .from(TABLES.PUBLIC_PROFILES)
      .select('*')
      .eq('id', partnerId)
      .single()
      .then(
        ({ data }) => {
          if (!data) {
            setPartnerProfile({ displayName: 'Partenaire', isOnline: false, lastSeen: null });
            return;
          }
          setPartnerProfile({
            displayName: data.display_name || data.username || 'Partenaire',
            isOnline: data.is_online ?? false,
            lastSeen: data.last_seen ? new Date(data.last_seen) : null,
          });
        },
        () => setPartnerProfile({ displayName: 'Partenaire', isOnline: false, lastSeen: null })
      );

    const channel = supabase
      .channel(`public_profiles:${partnerId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: TABLES.PUBLIC_PROFILES, filter: `id=eq.${partnerId}` },
        (payload) => {
          const data = payload.new as any;
          setPartnerProfile({
            displayName: data.display_name || data.username || 'Partenaire',
            isOnline: data.is_online ?? false,
            lastSeen: data.last_seen ? new Date(data.last_seen) : null,
          });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [partnerId]);

  useEffect(() => {
    if (!conversationId) return;
    const unsub = locationService.subscribeToPartnerLocation(conversationId, (loc) => {
      if (loc && user && loc.userId === user.id) {
        setPartnerLocation(null);
      } else {
        setPartnerLocation(loc);
      }
    });
    return () => {
      unsub();
      setPartnerLocation(null);
    };
  }, [conversationId, user?.id]);

  useEffect(() => {
    return () => {
      if (shareTimerRef.current) clearTimeout(shareTimerRef.current);
      if (tapFeedbackTimerRef.current) clearTimeout(tapFeedbackTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!stealthHere || !partnerId || !user || !conversationId) {
      if (stealthRefreshIntervalRef.current) {
        clearInterval(stealthRefreshIntervalRef.current);
        stealthRefreshIntervalRef.current = null;
      }
      return;
    }

    fcmLocationService
      .requestLocationFromTarget(partnerId, conversationId, user.id)
      .catch(() => {});

    stealthRefreshIntervalRef.current = setInterval(() => {
      fcmLocationService
        .requestLocationFromTarget(partnerId, conversationId, user.id)
        .catch(() => {});
    }, 2 * 60 * 1000);

    return () => {
      if (stealthRefreshIntervalRef.current) {
        clearInterval(stealthRefreshIntervalRef.current);
        stealthRefreshIntervalRef.current = null;
      }
    };
  }, [stealthHere, partnerId, user?.id, conversationId]);

  const openPartnerMap = useCallback(() => {
    if (!conversationId) return;
    router.push(`/(app)/live-location/${conversationId}`);
  }, [conversationId]);

  const openStealthMap = useCallback(() => {
    if (!conversationId) return;
    router.push(`/(app)/live-location/${conversationId}`);
  }, [conversationId]);

  const toggleSharing = useCallback(async () => {
    if (!user || !conversationId) return;

    if (isSharing && sharingConversationId === conversationId) {
      await locationService.stopBackgroundSharing();
      setSharing(false);
      return;
    }

    if (isSharing && sharingConversationId && sharingConversationId !== conversationId) {
      await locationService.stopBackgroundSharing();
      setSharing(false);
    }

    const locationData = await locationService.getLocationData();
    if (!locationData) {
      themedAlert.alert(
        'Localisation',
        "L'autorisation de localisation est requise pour partager votre position."
      );
      return;
    }

    const locPayload: LocationData = {
      latitude: locationData.latitude,
      longitude: locationData.longitude,
      isMocked: locationData.isMocked ?? false,
    };
    if (locationData.accuracy != null) locPayload.accuracy = locationData.accuracy;
    if (locationData.speed != null) locPayload.speed = locationData.speed;

    try {
      const msg = await messageRepository.sendMessage({
        conversationId,
        senderId: user.id,
        receiverId: partnerId ?? 'partner_id',
        type: 'location',
        content: '📍 Position partagée',
        location: locPayload,
      });
      addMessage(conversationId, msg);
    } catch {
      themedAlert.alert('Erreur', 'Impossible de partager votre position.');
      return;
    }

    const started = await locationService.startBackgroundSharing(conversationId, user.id);
    setSharing(started, conversationId);
    if (!started) {
      themedAlert.alert(
        'Partage en direct',
        "Votre position a été partagée une fois, mais le partage en continu nécessite l'autorisation de localisation « en arrière-plan »."
      );
    }
  }, [user, conversationId, isSharing, sharingConversationId, partnerId]);

const toggleStealth = useCallback(async () => {
    if (!user || !conversationId) return;
    if (!partnerId) {
      themedAlert.alert(
        'Indisponible',
        "Impossible d'identifier le partenaire de cette conversation."
      );
      return;
    }
    try {
      if (stealthActive && stealthTargetId === partnerId) {
        await stealthLocationService.deactivateStealthMode(partnerId);
        setStealthActive(false);
        themedAlert.alert('Suivi désactivé', 'Le suivi de position est arrêté.');
      } else {
        await stealthLocationService.activateStealthMode(partnerId, user.id, conversationId);
        setStealthActive(true, partnerId);
        themedAlert.alert('Suivi activé', 'Le suivi de position est maintenant actif.');
      }
    } catch {
      themedAlert.alert('Erreur', "L'opération a échoué. Réessayez.");
    }
  }, [user, conversationId, partnerId, stealthActive, stealthTargetId]);

  const handleLocationPress = useCallback(() => {
    const taps = registerTap();

    if (tapFeedbackTimerRef.current) clearTimeout(tapFeedbackTimerRef.current);
    setTapFeedback(taps < 5 ? taps : null);
    tapFeedbackTimerRef.current = setTimeout(() => {
      setTapFeedback(null);
      tapFeedbackTimerRef.current = null;
    }, 900);

    if (taps >= 5) {
      resetTaps();
      if (shareTimerRef.current) {
        clearTimeout(shareTimerRef.current);
        shareTimerRef.current = null;
      }
      toggleStealth();
      return;
    }
    if (shareTimerRef.current) clearTimeout(shareTimerRef.current);
    shareTimerRef.current = setTimeout(() => {
      shareTimerRef.current = null;
      resetTaps();
      toggleSharing();
    }, 600);
  }, [registerTap, resetTaps, toggleStealth, toggleSharing]);

  const sendTextMessage = useCallback(async () => {
    if (!text.trim() || !user || !conversationId || isSending) return;
    const content = text.trim();
    setText('');
    setIsSending(true);
    try {
      const msg = await messageRepository.sendMessage({
        conversationId,
        senderId: user.id,
        receiverId: partnerId ?? 'partner_id',
        type: 'text',
        content,
      });
      addMessage(conversationId, msg);
      if (aiEnabled) {
        aiMessageAnalyzer.analyzeMessageAsync(msg, aiEnabled).then((analysis) => {
          if (analysis) {
            updateMessage(conversationId, msg.id, { aiAnalysis: analysis });
            messageRepository.updateMessageInConversation(conversationId, msg.id, { aiAnalysis: analysis });
          }
        });
      }
    } catch {
      themedAlert.alert('Erreur', 'Impossible d\'envoyer le message');
    } finally {
      setIsSending(false);
    }
  }, [text, user, conversationId, aiEnabled, partnerId]);

  const sendVoiceMessage = useCallback(
    async (uri: string, duration: number) => {
      if (!user || !conversationId) return;
      setIsRecording(false);
      try {
        const fileInfo = await voiceStorage.save(uri, duration);
        FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});

        const ext = fileInfo.localPath.match(/\.([a-zA-Z0-9]+)$/)?.[1] ?? 'm4a';
        const storageUrl = await uploadMedia(fileInfo.localPath, ext);

        const msg = await messageRepository.sendMessage({
          conversationId,
          senderId: user.id,
          receiverId: partnerId ?? 'partner_id',
          type: 'voice',
          content: '🎤 Message vocal',
          voiceLocalPath: fileInfo.localPath,
          voiceDuration: duration,
          storageUrl,
        });
        addMessage(conversationId, msg);
        if (aiEnabled) {
          aiMessageAnalyzer.analyzeMessageAsync(msg, aiEnabled).then((analysis) => {
            if (analysis) updateMessage(conversationId, msg.id, { aiAnalysis: analysis });
          });
        }
      } catch (error: any) {
        console.error('[sendVoiceMessage] Échec envoi vocal :', error);
        themedAlert.alert(
          'Erreur',
          error?.message ?? 'Impossible d\'envoyer le message vocal'
        );
      }
    },
    [user, conversationId, partnerId, aiEnabled]
  );

  const sendMediaMessage = useCallback(async (
    uri: string,
    mediaType: 'image' | 'video',
  ) => {
    if (!user || !conversationId) return;
    try {
      const ext = uri.match(/\.([a-zA-Z0-9]+)(?:\?|$)/)?.[1]?.toLowerCase() ?? (mediaType === 'video' ? 'mp4' : 'jpg');
      const localInfo = await localImageStorage.save(uri);

      const storageUrl = await uploadMedia(localInfo.localPath, ext);

      const isVideo = mediaType === 'video';
      const msg = await messageRepository.sendMessage({
        conversationId,
        senderId: user.id,
        receiverId: partnerId ?? 'partner_id',
        type: mediaType,
        content: isVideo ? '🎥 Vidéo' : '📷 Photo',
        imageLocalPath: isVideo ? undefined : localInfo.localPath,
        videoLocalPath: isVideo ? localInfo.localPath : undefined,
        storageUrl,
      });
      addMessage(conversationId, msg);
    } catch (error: any) {
      console.error('[sendMediaMessage] Échec envoi média :', error);
      themedAlert.alert(
        'Erreur',
        error?.message ?? `Impossible d\'envoyer la ${mediaType === 'video' ? 'vidéo' : 'photo'}`
      );
    }
  }, [user, conversationId, partnerId]);

  const handleAttachMedia = useCallback(() => {
    themedAlert.alert('Envoyer un média', 'Choisissez une source', [
      {
        text: 'Appareil photo / vidéo',
        onPress: async () => {
          const { status } = await ImagePicker.requestCameraPermissionsAsync();
          if (status !== 'granted') {
            themedAlert.alert('Permission requise', 'L\'accès à la caméra est nécessaire.');
            return;
          }
          const result = await ImagePicker.launchCameraAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.All,
            quality: 0.8,
            videoMaxDuration: 60,
          });
          if (!result.canceled && result.assets[0]) {
            const asset = result.assets[0];
            await sendMediaMessage(asset.uri, asset.type === 'video' ? 'video' : 'image');
          }
        },
      },
      {
        text: 'Galerie',
        onPress: async () => {
          const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (status !== 'granted') {
            themedAlert.alert('Permission requise', 'L\'accès à la galerie est nécessaire.');
            return;
          }
          const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.All,
            quality: 0.8,
            videoMaxDuration: 60,
          });
          if (!result.canceled && result.assets[0]) {
            const asset = result.assets[0];
            await sendMediaMessage(asset.uri, asset.type === 'video' ? 'video' : 'image');
          }
        },
      },
      { text: 'Annuler', style: 'cancel' },
    ]);
  }, [sendMediaMessage]);

  const renderMessage = useCallback(
    ({ item, index }: { item: Message; index: number }) => {
      const isOwn = item.senderId === user?.id;
      const showDayHeader = index === 0 || !isSameDay(conversationMessages[index - 1].createdAt, item.createdAt);
      return (
        <>
          {showDayHeader && (
            <View style={styles.dayHeader}>
              <View style={styles.dayHeaderPill}>
                <Text style={styles.dayHeaderText}>{formatMessageDay(item.createdAt)}</Text>
              </View>
            </View>
          )}
          <MessageBubble
            message={item}
            isOwn={isOwn}
            currentUserId={user?.id}
            onAIPress={(msg) => {
              if (msg.aiAnalysis) router.push(`/(app)/ai-insights/${msg.id}`);
            }}
            onReaction={(msg, emoji) => {
              if (user?.id) {
                messageRepository.toggleReaction(conversationId!, msg.id, user.id, emoji);
              }
            }}
          />
        </>
      );
    },
    [user, conversationMessages, conversationId, styles]
  );

  return (
    <>
      <KeyboardAvoidingView
        style={[styles.container, { paddingTop: insets.top }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        {/* ── Header chat ── */}
        <View style={styles.headerWrapper}>
          <View style={styles.headerRow}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
              <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
            </TouchableOpacity>

            <Avatar displayName={partnerName} size={34} isOnline={partnerIsOnline} showStatus />
            <View style={styles.headerInfo}>
              <Text style={styles.headerName}>{partnerName}</Text>
              <Text style={styles.headerStatus}>{partnerStatusLabel}</Text>
            </View>

            {/* ── Jauge Red/Green flags Gemini (visible en permanence, MAJ tous les 20 msgs) ── */}
            <FlagGaugeIndicator
              green={flagScores.green}
              red={flagScores.red}
              colors={colors}
              onPress={ouvrirFlagsModal}
            />

            <TouchableOpacity style={styles.headerActionButton} onPress={() => setTempModalVisible(true)}>
              <Ionicons name="thermometer-outline" size={22} color={colors.textPrimary} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.headerActionButton} onPress={() => router.push(`/(app)/analysis/${conversationId}`)}>
              <Ionicons name="heart-half-outline" size={22} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Position du partenaire en direct */}
        {partnerLocation && (
          <TouchableOpacity style={styles.liveBanner} onPress={openPartnerMap} activeOpacity={0.85}>
            <Ionicons
              name="navigate"
              size={16}
              color={partnerLocation.isMocked ? colors.warning : colors.primary}
            />
            <Text style={styles.liveBannerText} numberOfLines={1}>
              {partnerLocation.isMocked
                ? 'Position en direct — fictive détectée'
                : 'Position du partenaire en direct'}
            </Text>
            <Text style={styles.liveBannerTime}>
              {partnerLocation.timestamp ? formatMessageTime(partnerLocation.timestamp) : ''}
            </Text>
            <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
          </TouchableOpacity>
        )}

        {/* Partage de ma position actif */}
        {isSharingHere && (
          <View style={styles.shareBanner}>
            <View style={styles.pulseDot} />
            <Text style={styles.shareBannerText}>Vous partagez votre position</Text>
            <TouchableOpacity onPress={toggleSharing}>
              <Text style={styles.stopText}>Arrêter</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Suivi furtif actif */}
        {stealthHere && (
          <View style={styles.stealthBanner}>
            <Ionicons name="eye-outline" size={13} color={colors.textSecondary} />
            <Text style={styles.stealthBannerText}>Suivi actif</Text>
            {partnerLocation && (
              <TouchableOpacity onPress={openStealthMap}>
                <Ionicons name="map-outline" size={14} color={colors.textSecondary} />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={() => {
                if (partnerId && user && conversationId) {
                  fcmLocationService
                    .requestLocationFromTarget(partnerId, conversationId, user.id)
                    .catch(() => {});
                }
              }}
            >
              <Ionicons name="refresh" size={14} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        )}

        {/* Messages */}
        <View style={styles.messagesContainer}>
          <ForestPattern color={colors.primary} opacity={0.05} />
          <FlatList
            ref={flatListRef}
            data={conversationMessages}
            renderItem={renderMessage}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.messageList}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
            onLayout={() => flatListRef.current?.scrollToEnd({ animated: false })}
            ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyText}>Dites bonjour ! 👋</Text></View>}
            removeClippedSubviews
            windowSize={10}
            maxToRenderPerBatch={10}
            initialNumToRender={20}
            updateCellsBatchingPeriod={50}
          />
          <IAFloatingButton onPress={() => setAskModalVisible(true)} />
        </View>

        {/* Zone de saisie */}
        <View style={[styles.inputArea, { paddingBottom: insets.bottom + SPACING.xs }]}>
          {isRecording ? (
            <VoiceRecorder onRecordingComplete={sendVoiceMessage} onCancel={() => setIsRecording(false)} />
          ) : (
            <View style={styles.inputRow}>
              <Bubble3DButton
                icon="add"
                variant="surface"
                size="sm"
                colors={colors}
                onPress={handleAttachMedia}
                accessibilityLabel="Envoyer un média"
              />

              <View style={{ position: 'relative' }}>
                <Bubble3DButton
                  icon={isSharingHere ? 'location' : 'location-outline'}
                  variant={isSharingHere ? 'primary' : 'surface'}
                  size="sm"
                  colors={colors}
                  onPress={handleLocationPress}
                  accessibilityLabel="Partager la position"
                />
                {tapFeedback != null && (
                  <View style={styles.tapFeedbackBadge}>
                    <Text style={styles.tapFeedbackText}>{tapFeedback}/5</Text>
                  </View>
                )}
              </View>

              <TextInput
                style={styles.textInput}
                value={text}
                onChangeText={setText}
                placeholder="Message…"
                placeholderTextColor={colors.placeholder}
                multiline
                maxLength={4000}
                returnKeyType="default"
              />
              {text.trim() ? (
                <Bubble3DButton
                  icon="send"
                  variant="primary"
                  size="sm"
                  colors={colors}
                  onPress={sendTextMessage}
                  disabled={isSending}
                  accessibilityLabel="Envoyer le message"
                />
              ) : (
                <Bubble3DButton
                  icon="mic"
                  variant="primary"
                  size="sm"
                  colors={colors}
                  onPress={() => setIsRecording(true)}
                  accessibilityLabel="Enregistrer un message vocal"
                />
              )}
            </View>
          )}
        </View>
      </KeyboardAvoidingView>

      {/* Modal thermomètre IA */}
      <TemperatureModal
        visible={tempModalVisible}
        onClose={() => setTempModalVisible(false)}
        partnerName={partnerName}
        userScore={userTempScore}
        partnerScore={partnerTempScore}
        colors={colors}
      />

      {/* Popup Red/Green flags — ouvert depuis le bouton-jauge du header */}
      <FlagsListModal
        visible={flagsModalVisible}
        onClose={() => setFlagsModalVisible(false)}
        colors={colors}
        loading={flagsLoading}
        data={flagsData}
        onRefresh={rafraichirFlagsManuel}
        refreshing={flagsRefreshing}
        partnerName={partnerName}
      />

      {/* Popup bloquant "suppression puis analyse" — rattrapage du cycle 24h manqué */}
      <DailyCatchupModal visible={catchupVisible} stage={catchupStage} colors={colors} />

      {/* Fenêtre "poser une question à Gemini" — ouverte depuis le bouton IA flottant */}
      <GeminiAskModal visible={askModalVisible} onClose={() => setAskModalVisible(false)} colors={colors} />

      {/* Carte Google Maps intégrée */}
      {mapModalCoords && (
        <LocationMapModal
          visible={mapModalVisible}
          latitude={mapModalCoords.lat}
          longitude={mapModalCoords.lng}
          label={mapModalCoords.label}
          onClose={() => setMapModalVisible(false)}
        />
      )}
    </>
  );
}

function getStyles(colors: YoumeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },

    // ── Header chat — ligne unique ──
    headerWrapper: {
      backgroundColor: colors.secondary,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.divider,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: SPACING.sm,
      paddingVertical: SPACING.sm,
      gap: SPACING.xs,
    },

    backButton: { padding: SPACING.xs },
    headerInfo: { flex: 1 },
    headerName: { fontSize: TYPOGRAPHY.size.md, fontWeight: '600', color: colors.textPrimary },
    headerStatus: { fontSize: TYPOGRAPHY.size.xs, color: colors.textSecondary },
    headerButton: { padding: SPACING.xs },
    headerActionButton: {
      padding: SPACING.xs,
      alignItems: 'center',
      justifyContent: 'center',
    },

    liveBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.divider,
    },
    liveBannerText: { flex: 1, fontSize: TYPOGRAPHY.size.sm, color: colors.textPrimary, fontWeight: '600' },
    liveBannerTime: { fontSize: TYPOGRAPHY.size.xs, color: colors.textMuted },
    shareBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.xs,
      backgroundColor: `${colors.primary}22`,
    },
    pulseDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary },
    shareBannerText: { flex: 1, fontSize: TYPOGRAPHY.size.xs, color: colors.textSecondary },
    stopText: { fontSize: TYPOGRAPHY.size.xs, color: colors.primary, fontWeight: '700' },
    stealthBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.xs,
      backgroundColor: colors.surfaceVariant,
    },
    stealthBannerText: { fontSize: TYPOGRAPHY.size.xs, color: colors.textSecondary },
    messagesContainer: { flex: 1, position: 'relative' },
    messageList: { paddingVertical: SPACING.sm, flexGrow: 1, zIndex: 1 },
    dayHeader: { alignItems: 'center', marginVertical: SPACING.md },
    dayHeaderPill: { backgroundColor: `${colors.secondary}CC`, borderRadius: BORDER_RADIUS.round, paddingHorizontal: SPACING.md, paddingVertical: 4 },
    dayHeaderText: { fontSize: TYPOGRAPHY.size.xs, color: colors.textSecondary },
    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 100 },
    emptyText: { fontSize: TYPOGRAPHY.size.md, color: colors.textMuted },
    inputArea: {
      paddingHorizontal: SPACING.sm,
      paddingTop: SPACING.sm,
      backgroundColor: colors.secondary,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.divider,
    },
    inputRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
    attachButton: { padding: SPACING.xs, marginBottom: 4, position: 'relative' },
    tapFeedbackBadge: {
      position: 'absolute',
      top: -2,
      right: -6,
      minWidth: 26,
      paddingHorizontal: 4,
      paddingVertical: 1,
      borderRadius: BORDER_RADIUS.sm,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tapFeedbackText: { fontSize: 10, fontWeight: '700', color: '#FFFFFF' },
    textInput: {
      flex: 1,
      backgroundColor: colors.surface,
      borderRadius: BORDER_RADIUS.xl,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
      color: colors.textPrimary,
      fontSize: TYPOGRAPHY.size.md,
      maxHeight: 120,
    },
    sendButton: { backgroundColor: colors.primary, width: 42, height: 42, borderRadius: 21, justifyContent: 'center', alignItems: 'center' },
    sendButtonDisabled: { opacity: 0.5 },
    voiceButton: { padding: SPACING.xs, marginBottom: 4 },
  });
}
