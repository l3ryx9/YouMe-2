/**
 * Bouton "bubble 3D" — effet de bulle/sphère physique :
 *   - dégradé clair (haut) → foncé (bas) pour donner du volume
 *   - reflet elliptique semi-transparent en haut à gauche (comme une bulle
 *     de savon éclairée) pour renforcer l'illusion de sphère
 *   - ombre large et basse (voir SHADOW.bubble) pour faire "flotter" le
 *     bouton au-dessus de l'écran
 *   - légère animation d'enfoncement (scale + ombre resserrée) au toucher
 *   - retour haptique léger à l'appui
 *
 * Deux formes selon qu'un `label` est fourni ou non :
 *   - pas de label → cercle plein (icône seule), pour les actions rapides
 *     du type barre du bas (envoyer, micro, pièce jointe...)
 *   - avec label → pilule (icône + texte), pour les actions principales
 *     d'un écran (CTA, valider, confirmer...)
 *
 * Tailles (voir BUBBLE_SIZES dans le thème) volontairement généreuses —
 * au-delà du minimum tactile recommandé (44pt/48dp) — pour qu'un bouton se
 * comprenne comme actionnable au premier coup d'œil, sans avoir à deviner.
 */
import React, { useRef } from 'react';
import { Text, TouchableWithoutFeedback, View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { BUBBLE_SIZES, SHADOW, TYPOGRAPHY, SPACING, YoumeColors } from '@shared/constants/theme';

export type BubbleVariant = 'primary' | 'secondary' | 'success' | 'danger' | 'surface';
export type BubbleSize = keyof typeof BUBBLE_SIZES;

interface Bubble3DButtonProps {
  onPress: () => void;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  label?: string;
  size?: BubbleSize;
  variant?: BubbleVariant;
  disabled?: boolean;
  colors: YoumeColors;
  style?: StyleProp<ViewStyle>;
  /** Accessible : lu par les lecteurs d'écran si le bouton n'a pas de label visible. */
  accessibilityLabel?: string;
}

function gradientForVariant(variant: BubbleVariant, colors: YoumeColors): [string, string] {
  switch (variant) {
    case 'primary':   return [colors.primaryLight, colors.primaryDark];
    case 'secondary': return [colors.surfaceVariant, colors.secondary];
    case 'success':   return ['#8FF0A4', colors.success];
    case 'danger':    return ['#F0A0A0', colors.error];
    case 'surface':   return [colors.surface, colors.surfaceVariant];
  }
}

function iconColorForVariant(variant: BubbleVariant, colors: YoumeColors): string {
  return variant === 'surface' || variant === 'secondary' ? colors.textPrimary : '#FFFFFF';
}

export function Bubble3DButton({
  onPress,
  icon,
  label,
  size = 'md',
  variant = 'primary',
  disabled = false,
  colors,
  style,
  accessibilityLabel,
}: Bubble3DButtonProps) {
  const scale = useSharedValue(1);
  const pressedRef = useRef(false);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    pressedRef.current = true;
    scale.value = withSpring(0.92, { damping: 14, stiffness: 220 });
  };

  const handlePressOut = () => {
    pressedRef.current = false;
    // Rebond léger façon gélatine plutôt qu'un simple retour linéaire.
    scale.value = withSpring(1, { damping: 6, stiffness: 260, mass: 0.6 });
  };

  const handlePress = () => {
    if (disabled) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onPress();
  };

  const diameter = BUBBLE_SIZES[size];
  const isPill = !!label;
  const [colorTop, colorBottom] = gradientForVariant(variant, colors);
  const iconColor = iconColorForVariant(variant, colors);
  const iconSize = Math.round(diameter * 0.42);

  return (
    <Animated.View
      style={[
        animatedStyle,
        disabled && styles.disabled,
        SHADOW.bubble,
        isPill ? { borderRadius: diameter / 2 } : { width: diameter, height: diameter, borderRadius: diameter / 2 },
        style,
      ]}
    >
      <TouchableWithoutFeedback
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
      >
        <LinearGradient
          colors={[colorTop, colorBottom]}
          start={{ x: 0.2, y: 0 }}
          end={{ x: 0.8, y: 1 }}
          style={[
            isPill
              ? [styles.pill, { height: diameter, borderRadius: diameter / 2, paddingHorizontal: diameter * 0.4 }]
              : [styles.circle, { width: diameter, height: diameter, borderRadius: diameter / 2 }],
          ]}
        >
          {/* Reflet — simule la lumière sur une surface bombée */}
          <View
            pointerEvents="none"
            style={[
              styles.highlight,
              {
                width: diameter * 0.6,
                height: diameter * 0.35,
                borderRadius: diameter * 0.3,
                top: diameter * 0.08,
                left: diameter * (isPill ? 0.12 : 0.14),
              },
            ]}
          />
          {icon && <Ionicons name={icon} size={iconSize} color={iconColor} />}
          {label && (
            <Text
              style={[
                styles.label,
                { color: iconColor, marginLeft: icon ? SPACING.xs : 0, fontSize: Math.max(TYPOGRAPHY.size.md, diameter * 0.24) },
              ]}
              numberOfLines={1}
            >
              {label}
            </Text>
          )}
        </LinearGradient>
      </TouchableWithoutFeedback>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  highlight: {
    position: 'absolute',
    backgroundColor: 'rgba(255,255,255,0.35)',
    transform: [{ rotate: '-20deg' }],
  },
  label: {
    fontWeight: '700',
  },
  disabled: {
    opacity: 0.45,
  },
});
