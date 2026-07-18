/**
 * Composant Lecteur de Message Vocal
 * Supporte les fichiers locaux ET le téléchargement depuis Firebase Storage (transit).
 */
import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Audio } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { useYoumeColors, YoumeColors, SPACING, TYPOGRAPHY } from '@shared/constants/theme';
import { formatVoiceDuration } from '@shared/utils/dateUtils';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import { useMediaPath } from '@presentation/hooks/useMediaPath';

interface VoiceMessagePlayerProps {
  /** Chemin local sur l'appareil expéditeur (peut ne pas exister sur le destinataire) */
  localPath: string;
  /** URL Firebase Storage (relay de transit) */
  storageUrl?: string;
  /** Identifiant stable du message pour le cache local */
  messageId: string;
  /** ID de la conversation — requis pour l'acquittement après téléchargement */
  conversationId: string;
  duration: number;
  isOwn: boolean;
}

export const VoiceMessagePlayer: React.FC<VoiceMessagePlayerProps> = ({
  localPath,
  storageUrl,
  messageId,
  conversationId,
  duration,
  isOwn,
}) => {
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPlayLoading, setIsPlayLoading] = useState(false);
  const [position, setPosition] = useState(0);
  const [totalDuration, setTotalDuration] = useState(duration);
  const progressWidth = useSharedValue(0);
  const colors = useYoumeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);

  // Résolution du chemin local effectif (local → cache → téléchargement Storage)
  const ext = localPath?.match(/\.([a-zA-Z0-9]+)$/)?.[1] ?? 'm4a';
  const { effectivePath, isDownloading, unavailable } = useMediaPath({
    localPath,
    storageUrl,
    messageId,
    ext,
    conversationId,
    isReceiver: !isOwn,
  });

  const progressStyle = useAnimatedStyle(() => ({
    width: `${progressWidth.value * 100}%`,
  }));

  useEffect(() => {
    return () => { sound?.unloadAsync(); };
  }, [sound]);

  const handlePlayPause = async () => {
    if (!effectivePath) return;

    if (sound) {
      if (isPlaying) {
        await sound.pauseAsync();
        setIsPlaying(false);
      } else {
        await sound.playAsync();
        setIsPlaying(true);
      }
      return;
    }

    setIsPlayLoading(true);
    try {
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: effectivePath },
        { shouldPlay: true },
        (status) => {
          if (status.isLoaded) {
            const pos = status.positionMillis / 1000;
            const dur = (status.durationMillis ?? duration * 1000) / 1000;
            setPosition(pos);
            setTotalDuration(dur);
            progressWidth.value = withTiming(dur > 0 ? pos / dur : 0, { duration: 100 });

            if (status.didJustFinish) {
              setIsPlaying(false);
              setPosition(0);
              progressWidth.value = withTiming(0);
              newSound.unloadAsync();
              setSound(null);
            }
          }
        }
      );
      setSound(newSound);
      setIsPlaying(true);
    } catch (error) {
      console.error('[VoicePlayer] Erreur lecture :', error);
    } finally {
      setIsPlayLoading(false);
    }
  };

  const tint = isOwn ? '#B2DFD4' : colors.primary;
  const isLoading = isDownloading || isPlayLoading;

  return (
    <View style={styles.container}>
      <TouchableOpacity
        onPress={handlePlayPause}
        style={styles.playButton}
        disabled={isLoading || unavailable}
      >
        {isLoading ? (
          <ActivityIndicator size="small" color={tint} />
        ) : unavailable ? (
          <Ionicons name="alert-circle-outline" size={22} color={colors.textMuted} />
        ) : (
          <Ionicons name={isPlaying ? 'pause' : 'play'} size={22} color={tint} />
        )}
      </TouchableOpacity>

      <View style={styles.progressContainer}>
        {unavailable ? (
          <Text style={[styles.unavailableText, { color: colors.textMuted }]}>
            Audio non disponible
          </Text>
        ) : (
          <>
            <View style={styles.waveform}>
              {Array.from({ length: 30 }).map((_, i) => (
                <View
                  key={i}
                  style={[
                    styles.waveBar,
                    {
                      height: 4 + Math.sin(i * 0.8) * 8 + Math.random() * 4,
                      backgroundColor: i / 30 < position / totalDuration ? tint : colors.textMuted,
                    },
                  ]}
                />
              ))}
            </View>
            <View style={styles.progressTrack}>
              <Animated.View style={[styles.progressFill, { backgroundColor: tint }, progressStyle]} />
            </View>
          </>
        )}
      </View>

      <Text style={[styles.duration, { color: isOwn ? '#B2DFD4' : colors.textSecondary }]}>
        {formatVoiceDuration(isPlaying ? position : totalDuration)}
      </Text>
    </View>
  );
};

function getStyles(colors: YoumeColors) {
  return StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
      minWidth: 180,
      maxWidth: 240,
    },
    playButton: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
    progressContainer: { flex: 1 },
    waveform: { flexDirection: 'row', alignItems: 'center', gap: 2, height: 24, marginBottom: 4 },
    waveBar: { width: 2, borderRadius: 1 },
    progressTrack: { height: 2, backgroundColor: colors.divider, borderRadius: 1 },
    progressFill: { height: '100%', borderRadius: 1 },
    duration: { fontSize: TYPOGRAPHY.size.xs, minWidth: 35, textAlign: 'right' },
    unavailableText: { fontSize: TYPOGRAPHY.size.xs, fontStyle: 'italic' },
  });
}
