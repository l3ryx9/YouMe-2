/**
 * Composant Badge Émotion
 */
import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useYoumeColors, YoumeColors, SPACING, TYPOGRAPHY, BORDER_RADIUS } from '@shared/constants/theme';
import type { EmotionResult } from '@domain/entities/Message';
import { getEmotionColor } from '@shared/utils/emotionColors';

interface EmotionBadgeProps {
  emotion: EmotionResult;
  isOwn: boolean;
}

const EMOTION_ICONS: Record<string, string> = {
  joy: '😊',
  sadness: '😢',
  anger: '😠',
  fear: '😨',
  surprise: '😮',
  disgust: '🤢',
  neutral: '😐',
  love: '❤️',
  optimism: '🌟',
  pessimism: '😔',
};

export const EmotionBadge: React.FC<EmotionBadgeProps> = ({ emotion, isOwn }) => {
  const colors = useYoumeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const icon = EMOTION_ICONS[emotion.primary] ?? '🤔';
  const color = getEmotionColor(emotion.primary);

  return (
    <View style={[styles.container, isOwn ? styles.ownContainer : styles.otherContainer]}>
      <Text style={styles.icon}>{icon}</Text>
      <View style={styles.content}>
        <Text style={[styles.label, { color }]}>{emotion.label}</Text>
        <Text style={styles.disclaimer}>Analyse IA probabiliste — non définitive</Text>
        {emotion.secondary.length > 0 && (
          <View style={styles.secondary}>
            {emotion.secondary.slice(0, 2).map((e) => (
              <View
                key={e.emotion}
                style={[styles.secondaryBadge, { backgroundColor: `${getEmotionColor(e.emotion)}22` }]}
              >
                <Text style={[styles.secondaryText, { color: getEmotionColor(e.emotion) }]}>
                  {EMOTION_ICONS[e.emotion] ?? ''} {Math.round(e.score * 100)}%
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
};

function getStyles(colors: YoumeColors) {
  return StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: SPACING.sm,
      maxWidth: '80%',
      backgroundColor: colors.surfaceVariant,
      borderRadius: BORDER_RADIUS.md,
      padding: SPACING.sm,
      marginTop: 4,
      borderWidth: 1,
      borderColor: colors.divider,
    },
    ownContainer: { alignSelf: 'flex-end' },
    otherContainer: { alignSelf: 'flex-start' },
    icon: { fontSize: 20 },
    content: { flex: 1 },
    label: { fontSize: TYPOGRAPHY.size.sm, fontWeight: '600' },
    disclaimer: { fontSize: TYPOGRAPHY.size.xs, color: colors.textMuted, marginTop: 2 },
    secondary: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
    secondaryBadge: { borderRadius: BORDER_RADIUS.sm, paddingHorizontal: 6, paddingVertical: 2 },
    secondaryText: { fontSize: TYPOGRAPHY.size.xs },
  });
}
