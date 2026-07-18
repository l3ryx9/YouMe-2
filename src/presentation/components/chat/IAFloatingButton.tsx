/**
 * Bouton flottant "IA" — rond bleu avec un point d'interrogation rouge,
 * libellé "IA" en dessous. Ce n'est PAS un onglet de navigation : un bouton
 * flottant au-dessus du contenu du chat, qui ouvre la fenêtre de question
 * libre à Gemini (GeminiAskModal).
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { SPACING, TYPOGRAPHY, SHADOW } from '@shared/constants/theme';

const BLUE_TOP = '#4A8FF0';
const BLUE_BOTTOM = '#1A4FB8';
const RED_MARK = '#E03B30';

interface IAFloatingButtonProps {
  onPress: () => void;
}

export function IAFloatingButton({ onPress }: IAFloatingButtonProps) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const handlePressIn = () => {
    scale.value = withSpring(0.9, { damping: 12, stiffness: 220 });
  };
  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 6, stiffness: 260, mass: 0.6 });
  };
  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    onPress();
  };

  return (
    <View style={styles.wrapper} pointerEvents="box-none">
      <Animated.View style={[animatedStyle, SHADOW.bubble]}>
        <TouchableOpacity
          onPress={handlePress}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          activeOpacity={0.9}
          accessibilityRole="button"
          accessibilityLabel="Poser une question à l'IA"
        >
          <LinearGradient
            colors={[BLUE_TOP, BLUE_BOTTOM]}
            start={{ x: 0.2, y: 0 }}
            end={{ x: 0.8, y: 1 }}
            style={styles.circle}
          >
            <View pointerEvents="none" style={styles.sheen} />
            <Text style={styles.questionMark}>?</Text>
          </LinearGradient>
        </TouchableOpacity>
      </Animated.View>
      <Text style={styles.label}>IA</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    right: SPACING.md,
    bottom: 96,
    alignItems: 'center',
  },
  circle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  sheen: {
    position: 'absolute',
    top: 6,
    left: 10,
    width: 32,
    height: 16,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.35)',
    transform: [{ rotate: '-15deg' }],
  },
  questionMark: {
    fontSize: 30,
    fontWeight: '900',
    color: RED_MARK,
    textShadowColor: 'rgba(0,0,0,0.25)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
  },
  label: {
    marginTop: 4,
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: '700',
    color: '#FFFFFF',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
});
