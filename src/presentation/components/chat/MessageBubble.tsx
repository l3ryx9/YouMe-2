/**
 * Bulles de message — texte, vocal, image, vidéo, position, système.
 *
 * Ce fichier contenait à l'origine uniquement `LocationBubble` (position
 * partagée). Le composant `MessageBubble` — utilisé par l'écran de chat
 * pour TOUS les types de message — était importé depuis ce fichier mais
 * n'y avait jamais été défini : l'écran de chat plantait donc dès qu'un
 * message s'affichait. Il est maintenant construit ci-dessous, avec :
 *   - un rendu dédié par type de message (texte/vocal/image/vidéo/position/système)
 *   - des coches de statut nettement visibles (sending/sent/delivered/read/failed)
 *   - une texture « gélatine » (dégradé + reflet) sur les bulles
 *   - réactions emoji (appui long pour choisir)
 *
 * SIMPLIFIÉ pour la position : plus de mini-carte react-native-maps intégrée
 * (dépendait du SDK Maps natif + d'une clé API Google configurée côté Google
 * Cloud Console — trop de points de défaillance pour un simple aperçu). On
 * affiche juste les coordonnées + un bouton qui ouvre l'app Maps du
 * téléphone (Google Maps / Apple Plans), qui elle gère tout nativement.
 */
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking, Platform, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { YOUME_COLORS, useYoumeColors, YoumeColors, SPACING, BORDER_RADIUS, TYPOGRAPHY, SHADOW } from '@shared/constants/theme';
import { formatMessageTime } from '@shared/utils/dateUtils';
import { themedAlert } from '@presentation/components/common/ThemedAlert';
import { useMediaPath } from '@presentation/hooks/useMediaPath';
import { VoiceMessagePlayer } from './VoiceMessagePlayer';
import type { LocationData, Message, MessageStatus } from '@domain/entities/Message';

const SHADOW_LOCAL = SHADOW.md;

interface LocationBubbleProps {
  locationData: LocationData;
  isOwn: boolean;
  createdAt: Date;
  isMocked?: boolean;
}

export const LocationBubble: React.FC<LocationBubbleProps> = ({
  locationData, isOwn, createdAt,
}) => {
  const { latitude, longitude, accuracy, isMocked } = locationData;

  // Robuste même si le téléphone n'a AUCUNE app capable d'ouvrir un lien
  // "geo:"/"maps:" (rare, mais possible sur certains téléphones sans
  // Google Play Services, ou avec Google Maps désinstallé) :
  //  1. Tente d'abord l'app Maps native (geo: sur Android, maps: sur iOS)
  //     — ouvre l'app installée par défaut pour ce type de lien.
  //  2. Si aucune app ne gère ce lien, tente l'URL web Google Maps
  //     (https://maps.google.com/...) — s'ouvre dans n'importe quel
  //     navigateur, donc fonctionne même sans app Maps dédiée installée.
  //  3. Si même ça échoue (aucun navigateur non plus — cas extrême),
  //     affiche les coordonnées dans une alerte pour que l'utilisateur
  //     puisse les noter/copier manuellement plutôt que de ne rien avoir.
  const openExternal = async () => {
    const nativeUrl = Platform.OS === 'ios'
      ? `maps://?q=${latitude},${longitude}`
      : `geo:${latitude},${longitude}?q=${latitude},${longitude}`;
    const webUrl = `https://maps.google.com/?q=${latitude},${longitude}`;

    // Note : on tente directement openURL() plutôt que de vérifier au
    // préalable avec canOpenURL() — sur Android 11+, canOpenURL() peut
    // renvoyer `false` à tort pour des apps pourtant installées si le
    // schéma "geo:" n'est pas déclaré dans un bloc <queries> du manifeste
    // (restrictions de visibilité des packages). openURL() déclenche un
    // intent standard qui, lui, fonctionne correctement même sans cette
    // déclaration.
    try {
      await Linking.openURL(nativeUrl);
      return;
    } catch {
      // Aucune app ne gère ce lien — on tente le fallback web ci-dessous.
    }

    try {
      await Linking.openURL(webUrl);
    } catch {
      themedAlert.alert(
        'Impossible d\'ouvrir Maps',
        `Aucune application Maps ni navigateur n'a pu être ouvert sur cet appareil.\n\nCoordonnées : ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`
      );
    }
  };

  return (
    <View style={[styles.container, isOwn ? styles.ownContainer : styles.otherContainer]}>
      <View style={styles.card}>
        {/* En-tête */}
        <View style={styles.header}>
          <View style={[styles.iconBg, isMocked && styles.iconBgMocked]}>
            <Ionicons
              name="location"
              size={20}
              color={isMocked ? YOUME_COLORS.warning : YOUME_COLORS.locationPin}
            />
          </View>
          <View style={styles.headerText}>
            <Text style={styles.title}>Position partagée</Text>
            {isMocked ? (
              <View style={styles.mockBadge}>
                <Ionicons name="warning" size={10} color={YOUME_COLORS.warning} />
                <Text style={styles.mockText}>Position fictive détectée</Text>
              </View>
            ) : (
              <Text style={styles.coords}>
                {latitude.toFixed(5)}, {longitude.toFixed(5)}
                {accuracy != null ? `  ·  ±${Math.round(accuracy)} m` : ''}
              </Text>
            )}
          </View>
        </View>

        {/* Bouton ouvrir Maps */}
        <TouchableOpacity style={styles.openButton} onPress={openExternal} activeOpacity={0.85}>
          <Ionicons name="navigate-outline" size={16} color="#fff" />
          <Text style={styles.openButtonText}>Ouvrir Maps</Text>
        </TouchableOpacity>
      </View>

      {/* Heure */}
      <Text style={[styles.time, isOwn ? styles.timeOwn : styles.timeOther]}>
        {formatMessageTime(createdAt)}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { maxWidth: '80%', marginVertical: 2 },
  ownContainer: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  otherContainer: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  card: {
    backgroundColor: YOUME_COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: YOUME_COLORS.divider,
    minWidth: 220,
    gap: SPACING.sm,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  iconBg: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: `${YOUME_COLORS.locationPin}22`,
    justifyContent: 'center', alignItems: 'center',
  },
  iconBgMocked: { backgroundColor: `${YOUME_COLORS.warning}22` },
  headerText: { flex: 1 },
  title: { fontSize: TYPOGRAPHY.size.sm, fontWeight: '700', color: YOUME_COLORS.textPrimary },
  coords: {
    fontSize: TYPOGRAPHY.size.xs,
    color: YOUME_COLORS.textMuted,
    marginTop: 2,
    fontFamily: Platform.OS === 'android' ? 'monospace' : 'Courier',
  },
  mockBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  mockText: { fontSize: TYPOGRAPHY.size.xs, color: YOUME_COLORS.warning },
  openButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: YOUME_COLORS.primary,
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.sm,
  },
  openButtonText: { fontSize: TYPOGRAPHY.size.sm, fontWeight: '700', color: '#fff' },
  time: { fontSize: TYPOGRAPHY.size.xs, color: YOUME_COLORS.textMuted, marginTop: 3 },
  timeOwn: { textAlign: 'right' },
  timeOther: { textAlign: 'left' },
});

// ═══════════════════════════════════════════════════════════════════════════
// MessageBubble — bulle de message générique (texte, vocal, image, vidéo,
// position, système), utilisée par l'écran de chat.
//
// Texture « gélatine » : dégradé clair→couleur de base + reflet elliptique en
// haut, comme Bubble3DButton, pour un rendu de bulle brillante et bombée.
// Coches de statut nettement plus visibles qu'un simple petit checkmark gris
// (taille 18, couleur orange ananas pour "lu" — se voit du premier coup d'œil).
// ═══════════════════════════════════════════════════════════════════════════

function lighten(hex: string, amount: number): string {
  const n = hex.replace('#', '');
  const r = Math.min(255, parseInt(n.substring(0, 2), 16) + amount);
  const g = Math.min(255, parseInt(n.substring(2, 4), 16) + amount);
  const b = Math.min(255, parseInt(n.substring(4, 6), 16) + amount);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

const REACTION_EMOJIS = ['❤️', '😂', '😮', '😢', '👍', '🔥'];

/**
 * Coches de statut — inspirées du standard messagerie, en plus visible :
 *   sending   → horloge
 *   sent      → une coche
 *   delivered → deux coches, couleur neutre
 *   read      → deux coches en orange ananas (se distingue immédiatement)
 *   failed    → point d'exclamation rouge
 */
function StatusTicks({ status, colors }: { status: MessageStatus; colors: YoumeColors }) {
  if (status === 'sending') return <Ionicons name="time-outline" size={15} color={colors.textMuted} />;
  if (status === 'failed') return <Ionicons name="alert-circle" size={16} color={colors.error} />;
  if (status === 'sent') return <Ionicons name="checkmark" size={18} color={colors.textSecondary} />;
  const color = status === 'read' ? colors.read : colors.textSecondary;
  return <Ionicons name="checkmark-done" size={18} color={color} />;
}

function ImageContent({ message, colors, isOwn }: { message: Message; colors: YoumeColors; isOwn: boolean }) {
  const ext = message.storageUrl?.match(/\.([a-zA-Z0-9]+)(?:\?|$)/)?.[1] ?? 'jpg';
  const { effectivePath, isDownloading, unavailable } = useMediaPath({
    localPath: message.imageLocalPath,
    storageUrl: message.storageUrl,
    messageId: message.id,
    ext,
    conversationId: message.conversationId,
    isReceiver: !isOwn,
  });

  if (unavailable) {
    return (
      <View style={[bubbleStyles.mediaPlaceholder, { backgroundColor: colors.surfaceVariant }]}>
        <Ionicons name="image-outline" size={28} color={colors.textMuted} />
        <Text style={{ color: colors.textMuted, fontSize: TYPOGRAPHY.size.xs, marginTop: 4 }}>Image indisponible</Text>
      </View>
    );
  }
  if (isDownloading || !effectivePath) {
    return (
      <View style={[bubbleStyles.mediaPlaceholder, { backgroundColor: colors.surfaceVariant }]}>
        <Ionicons name="cloud-download-outline" size={28} color={colors.textMuted} />
      </View>
    );
  }
  return <Image source={{ uri: effectivePath }} style={bubbleStyles.image} resizeMode="cover" />;
}

function VideoContent({ message, colors, isOwn }: { message: Message; colors: YoumeColors; isOwn: boolean }) {
  const ext = message.storageUrl?.match(/\.([a-zA-Z0-9]+)(?:\?|$)/)?.[1] ?? 'mp4';
  const { effectivePath, isDownloading, unavailable } = useMediaPath({
    localPath: message.videoLocalPath,
    storageUrl: message.storageUrl,
    messageId: message.id,
    ext,
    conversationId: message.conversationId,
    isReceiver: !isOwn,
  });

  const ouvrir = () => {
    if (effectivePath) Linking.openURL(effectivePath).catch(() => {});
  };

  if (unavailable) {
    return (
      <View style={[bubbleStyles.mediaPlaceholder, { backgroundColor: colors.surfaceVariant }]}>
        <Ionicons name="videocam-outline" size={28} color={colors.textMuted} />
        <Text style={{ color: colors.textMuted, fontSize: TYPOGRAPHY.size.xs, marginTop: 4 }}>Vidéo indisponible</Text>
      </View>
    );
  }
  return (
    <TouchableOpacity
      style={[bubbleStyles.mediaPlaceholder, { backgroundColor: colors.surfaceVariant }]}
      onPress={ouvrir}
      disabled={isDownloading || !effectivePath}
      activeOpacity={0.85}
    >
      {isDownloading ? (
        <Ionicons name="cloud-download-outline" size={28} color={colors.textMuted} />
      ) : (
        <View style={bubbleStyles.playButton}>
          <Ionicons name="play" size={24} color="#FFFFFF" />
        </View>
      )}
      <Text style={{ color: colors.textMuted, fontSize: TYPOGRAPHY.size.xs, marginTop: 6 }}>Vidéo · ouvrir</Text>
    </TouchableOpacity>
  );
}

interface MessageBubbleProps {
  message: Message;
  isOwn: boolean;
  currentUserId?: string;
  onAIPress?: (message: Message) => void;
  onReaction?: (message: Message, emoji: string) => void;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  isOwn,
  currentUserId,
  onAIPress,
  onReaction,
}) => {
  const colors = useYoumeColors();
  const [pickerVisible, setPickerVisible] = useState(false);

  if (message.type === 'system') {
    return (
      <View style={bubbleStyles.systemRow}>
        <Text style={[bubbleStyles.systemText, { color: colors.textMuted }]}>{message.content}</Text>
      </View>
    );
  }

  if (message.type === 'location' && message.location) {
    return (
      <LocationBubble
        locationData={message.location}
        isOwn={isOwn}
        createdAt={message.createdAt}
        isMocked={message.location.isMocked}
      />
    );
  }

  const bubbleColor = isOwn ? colors.bubbleOwn : colors.bubbleOther;
  const textColor = isOwn ? colors.bubbleOwnText : colors.bubbleOtherText;
  const reactionEntries = message.reactions ? Object.entries(message.reactions) : [];
  const myReaction = currentUserId ? message.reactions?.[currentUserId] : undefined;

  const reactionCounts = reactionEntries.reduce<Record<string, number>>((acc, [, emoji]) => {
    acc[emoji] = (acc[emoji] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <View style={[bubbleStyles.container, isOwn ? bubbleStyles.ownContainer : bubbleStyles.otherContainer]}>
      {pickerVisible && (
        <View style={[bubbleStyles.picker, { backgroundColor: colors.surface, borderColor: colors.divider }]}>
          {REACTION_EMOJIS.map((emoji) => (
            <TouchableOpacity
              key={emoji}
              onPress={() => {
                onReaction?.(message, emoji);
                setPickerVisible(false);
              }}
              hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
            >
              <Text style={bubbleStyles.pickerEmoji}>{emoji}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <TouchableOpacity
        activeOpacity={0.92}
        onLongPress={() => setPickerVisible((v) => !v)}
        delayLongPress={280}
      >
        <LinearGradient
          colors={[lighten(bubbleColor, 30), bubbleColor]}
          start={{ x: 0.15, y: 0 }}
          end={{ x: 0.85, y: 1 }}
          style={[
            bubbleStyles.bubble,
            isOwn ? bubbleStyles.bubbleOwnShape : bubbleStyles.bubbleOtherShape,
          ]}
        >
          {/* Reflet — texture « gélatine » */}
          <View pointerEvents="none" style={bubbleStyles.sheen} />

          {message.type === 'text' && (
            <Text style={[bubbleStyles.text, { color: textColor }]}>{message.content}</Text>
          )}

          {message.type === 'voice' && (
            <VoiceMessagePlayer
              localPath={message.voiceLocalPath ?? ''}
              storageUrl={message.storageUrl}
              messageId={message.id}
              conversationId={message.conversationId}
              duration={message.voiceDuration ?? 0}
              isOwn={isOwn}
            />
          )}

          {message.type === 'image' && <ImageContent message={message} colors={colors} isOwn={isOwn} />}
          {message.type === 'video' && <VideoContent message={message} colors={colors} isOwn={isOwn} />}

          <View style={bubbleStyles.footer}>
            {message.aiAnalysis && (
              <TouchableOpacity onPress={() => onAIPress?.(message)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                <Ionicons name="sparkles" size={13} color={textColor} style={{ opacity: 0.8 }} />
              </TouchableOpacity>
            )}
            <Text style={[bubbleStyles.time, { color: textColor, opacity: 0.75 }]}>
              {formatMessageTime(message.createdAt)}
            </Text>
            {isOwn && <StatusTicks status={message.status} colors={colors} />}
          </View>
        </LinearGradient>
      </TouchableOpacity>

      {Object.keys(reactionCounts).length > 0 && (
        <View style={[bubbleStyles.reactionsRow, isOwn ? { alignSelf: 'flex-end' } : { alignSelf: 'flex-start' }]}>
          {Object.entries(reactionCounts).map(([emoji, count]) => (
            <View
              key={emoji}
              style={[
                bubbleStyles.reactionBadge,
                { backgroundColor: colors.surface, borderColor: emoji === myReaction ? colors.primary : colors.divider },
              ]}
            >
              <Text style={bubbleStyles.reactionEmoji}>{emoji}</Text>
              {count > 1 && <Text style={[bubbleStyles.reactionCount, { color: colors.textSecondary }]}>{count}</Text>}
            </View>
          ))}
        </View>
      )}
    </View>
  );
};

const bubbleStyles = StyleSheet.create({
  container: { maxWidth: '80%', marginVertical: 3 },
  ownContainer: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  otherContainer: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  bubble: {
    borderRadius: BORDER_RADIUS.bubble,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    minWidth: 64,
    overflow: 'hidden',
    ...SHADOW_LOCAL,
  },
  bubbleOwnShape: { borderBottomRightRadius: 4 },
  bubbleOtherShape: { borderBottomLeftRadius: 4 },
  sheen: {
    position: 'absolute',
    top: -6,
    left: 8,
    width: '55%',
    height: 18,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.25)',
    transform: [{ rotate: '-6deg' }],
  },
  text: { fontSize: TYPOGRAPHY.size.md, lineHeight: 21 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 5, marginTop: 4 },
  time: { fontSize: TYPOGRAPHY.size.xs },
  systemRow: { alignSelf: 'center', marginVertical: SPACING.sm, paddingHorizontal: SPACING.md },
  systemText: { fontSize: TYPOGRAPHY.size.xs, fontStyle: 'italic', textAlign: 'center' },
  mediaPlaceholder: {
    width: 220,
    height: 160,
    borderRadius: BORDER_RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  image: { width: 220, height: 220, borderRadius: BORDER_RADIUS.md },
  playButton: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center', justifyContent: 'center',
  },
  picker: {
    flexDirection: 'row',
    gap: SPACING.sm,
    borderRadius: BORDER_RADIUS.round,
    borderWidth: 1,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
    marginBottom: 6,
    ...SHADOW_LOCAL,
  },
  pickerEmoji: { fontSize: 22 },
  reactionsRow: { flexDirection: 'row', gap: 4, marginTop: 3 },
  reactionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    borderRadius: BORDER_RADIUS.round,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  reactionEmoji: { fontSize: 12 },
  reactionCount: { fontSize: 10, fontWeight: '700' },
});
