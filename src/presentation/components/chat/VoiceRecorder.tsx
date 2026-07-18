/**
 * Composant Enregistreur de Message Vocal
 */
import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated as RNAnimated,
  PermissionsAndroid,
  Platform,
} from 'react-native';
import LiveAudioStream from 'react-native-live-audio-stream';
import * as FileSystem from 'expo-file-system';
import { v4 as uuidv4 } from 'uuid';
import { Ionicons } from '@expo/vector-icons';
import { useYoumeColors, YoumeColors, SPACING, TYPOGRAPHY, BORDER_RADIUS } from '@shared/constants/theme';
import { formatVoiceDuration } from '@shared/utils/dateUtils';
import { themedAlert } from '@presentation/components/common/ThemedAlert';
import {
  createPcmAccumulator,
  appendBase64Chunk,
  concatPcmBytes,
  buildWavFile,
  bytesToBase64,
  type PcmAccumulator,
} from '@shared/utils/audioUtils';

const SAMPLE_RATE = 16000;

interface VoiceRecorderProps {
  onRecordingComplete: (uri: string, duration: number) => void;
  onCancel: () => void;
}

async function requestMicrophonePermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const granted = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
    {
      title: 'Autorisation microphone',
      message: 'YouMe V2 a besoin du microphone pour enregistrer des messages vocaux.',
      buttonPositive: 'OK',
    }
  );
  return granted === PermissionsAndroid.RESULTS.GRANTED;
}

export const VoiceRecorder: React.FC<VoiceRecorderProps> = ({
  onRecordingComplete,
  onCancel,
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const pcmRef = useRef<PcmAccumulator>(createPcmAccumulator());
  const isPausedRef = useRef(false);
  const colors = useYoumeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);

  const pulseScale = useRef(new RNAnimated.Value(1)).current;
  const pulseLoop = useRef(
    RNAnimated.loop(
      RNAnimated.sequence([
        RNAnimated.timing(pulseScale, { toValue: 1.2, duration: 600, useNativeDriver: true }),
        RNAnimated.timing(pulseScale, { toValue: 1, duration: 600, useNativeDriver: true }),
      ])
    )
  ).current;

  useEffect(() => {
    startRecording();
    return () => {
      LiveAudioStream.stop();
    };
  }, []);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isRecording && !isPaused) {
      interval = setInterval(() => setDuration((d) => d + 1), 1000);
      pulseLoop.start();
    } else {
      pulseLoop.stop();
    }
    return () => {
      clearInterval(interval);
      pulseLoop.stop();
    };
  }, [isRecording, isPaused]);

  const startRecording = async () => {
    try {
      const granted = await requestMicrophonePermission();
      if (!granted) {
        console.warn('Permission microphone refusée');
        onCancel();
        return;
      }

      pcmRef.current = createPcmAccumulator();
      isPausedRef.current = false;

      LiveAudioStream.init({
        sampleRate: SAMPLE_RATE,
        channels: 1,
        bitsPerSample: 16,
        audioSource: 6,
        bufferSize: 4096,
        // Non utilisé : on consomme les chunks PCM bruts via l'événement 'data'
        // plutôt que le fichier WAV écrit par le module natif, mais la lib
        // exige cette propriété dans ses types.
        wavFile: '',
      });

      LiveAudioStream.on('data', (base64Chunk: string) => {
        if (isPausedRef.current) return;
        appendBase64Chunk(pcmRef.current, base64Chunk);
      });

      LiveAudioStream.start();
      setIsRecording(true);
      setDuration(0);
    } catch (error) {
      console.error('[VoiceRecorder] Erreur démarrage :', error);
      onCancel();
    }
  };

  const handlePauseResume = () => {
    isPausedRef.current = !isPausedRef.current;
    setIsPaused(isPausedRef.current);
  };

  const finalizeToWavFile = async (): Promise<string> => {
    const pcmBytes = concatPcmBytes(pcmRef.current);
    const wavBytes = buildWavFile(pcmBytes, SAMPLE_RATE, 1);
    const base64Wav = bytesToBase64(wavBytes);

    const dir = `${FileSystem.cacheDirectory}voice_tmp/`;
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
    const path = `${dir}${uuidv4()}.wav`;
    await FileSystem.writeAsStringAsync(path, base64Wav, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return path;
  };

  const handleSend = async () => {
    try {
      LiveAudioStream.stop();
      setIsRecording(false);
      const uri = await finalizeToWavFile();
      onRecordingComplete(uri, duration);
    } catch (error: any) {
      // FIX : avant, en cas d'échec de finalisation (écriture du fichier
      // WAV, mémoire, etc.), l'enregistrement était annulé en silence sans
      // aucun message — l'utilisateur ne savait pas pourquoi rien ne
      // partait. On affiche maintenant l'erreur réelle avant d'annuler.
      console.error('[VoiceRecorder] Erreur finalisation :', error);
      themedAlert.alert(
        'Erreur',
        error?.message ?? 'Impossible de finaliser l\'enregistrement vocal'
      );
      onCancel();
    }
  };

  const handleCancel = () => {
    LiveAudioStream.stop();
    setIsRecording(false);
    onCancel();
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={handleCancel} style={styles.cancelButton}>
        <Ionicons name="trash-outline" size={22} color={colors.error} />
      </TouchableOpacity>

      <View style={styles.center}>
        <RNAnimated.View style={[styles.pulse, { transform: [{ scale: pulseScale }] }]} />
        <Text style={styles.duration}>{formatVoiceDuration(duration)}</Text>
        <Text style={styles.status}>{isPaused ? '⏸ En pause' : '🔴 Enregistrement...'}</Text>
      </View>

      <TouchableOpacity onPress={handlePauseResume} style={styles.pauseButton}>
        <Ionicons
          name={isPaused ? 'play-circle-outline' : 'pause-circle-outline'}
          size={30}
          color={colors.textPrimary}
        />
      </TouchableOpacity>

      <TouchableOpacity onPress={handleSend} style={styles.sendButton}>
        <Ionicons name="send" size={22} color="#FFFFFF" />
      </TouchableOpacity>
    </View>
  );
};

function getStyles(colors: YoumeColors) {
  return StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: BORDER_RADIUS.lg,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
      gap: SPACING.md,
    },
    cancelButton: { padding: SPACING.xs },
    center: { flex: 1, alignItems: 'center', flexDirection: 'row', gap: SPACING.sm },
    pulse: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.error },
    duration: { color: colors.textPrimary, fontSize: TYPOGRAPHY.size.md, fontWeight: '600' },
    status: { color: colors.textSecondary, fontSize: TYPOGRAPHY.size.sm },
    pauseButton: { padding: SPACING.xs },
    sendButton: {
      backgroundColor: colors.primary,
      borderRadius: 24,
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}
