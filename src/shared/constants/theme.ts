/**
 * Thème YouMe V2 — « Forêt Enchantée » (dark) / « Clairière » (light)
 * Vert pomme + marron clair + accents ananas (orange/jaune) sur fond noir
 * teinté de vert (dark) ou parchemin crème (light).
 */
import { MD3DarkTheme, MD3LightTheme } from 'react-native-paper';
import type { MD3Theme } from 'react-native-paper';
import { useMemo } from 'react';
import { useUIStore } from '../../presentation/stores/uiStore';

// ─── Couleurs brand/accent ────────────────────────────────────────────────────

export const YOUME_COLORS = {
  // Dégradé principal (vert pomme → forêt profonde)
  gradientStart: '#8CC152',
  gradientMid:   '#4C7A28',
  gradientEnd:   '#0A0F08',

  primary:      '#6FAF3E', // vert pomme
  primaryDark:  '#4C7A28', // vert forêt profond
  primaryLight: '#9CD16B', // vert pomme clair
  secondary:    '#4A3524', // marron foncé (écorce)

  // Surfaces & fonds — thème « Forêt Enchantée » (nuit)
  background:     '#0A0F08', // noir à peine teinté de vert — nuit en forêt
  surface:        '#16201A', // brun-mousse très sombre
  surfaceVariant: '#22301F', // sol de forêt, un ton au-dessus

  // Bulles de chat
  bubbleOwn:      '#6FAF3E', // vert pomme
  bubbleOther:    '#4A3524', // marron clair (écorce)
  bubbleOwnText:  '#FFFFFF',
  bubbleOtherText:'#F0EAD8',

  // Textes
  textPrimary:   '#F0EAD8', // ivoire chaud (clair de lune à travers les feuilles)
  textSecondary: '#C9BFA0', // kaki clair
  textMuted:     '#8E9A7A', // mousse grisée
  textLink:      '#F2932E', // orange ananas

  // États & feedback
  online:    '#8CE86B',
  delivered: '#C9BFA0',
  read:      '#F2932E', // orange ananas — coche "lu" bien visible
  error:     '#E0665A',
  warning:   '#F4C63A', // jaune ananas
  success:   '#6FAF3E',

  // Accents « ananas » (utilisés pour badges, liens, éléments à faire ressortir)
  pineappleOrange: '#F2932E',
  pineappleYellow: '#F4C63A',

  // Émotions (inchangé — génériques, indépendantes du thème)
  emotionJoy:      '#FFD700',
  emotionSadness:  '#6495ED',
  emotionAnger:    '#FF4444',
  emotionFear:     '#9370DB',
  emotionSurprise: '#FF8C00',
  emotionNeutral:  '#9E9E9E',

  // Cohérence IA
  coherenceHigh:   '#6FAF3E',
  coherenceMedium: '#F4C63A',
  coherenceLow:    '#E0665A',

  // Interface
  divider:         '#243422',
  inputBackground: '#16201A',
  placeholder:     '#6B7A5C',
  badge:           '#F2932E',
  locationPin:     '#6FAF3E',

  // Legacy light mode fields (kept for backwards compat)
  lightBackground:  '#F5F1E6',
  lightSurface:     '#FFFFFF',
  lightBubbleOwn:   '#6FAF3E',
  lightBubbleOther: '#FFFFFF',
  lightTextPrimary: '#1E2A16',
} as const;

// Type largi (chaque couleur est un `string` hex) pour permettre les
// surcharges Light avec des valeurs différentes des littéraux `as const`.
export type YoumeColors = { [K in keyof typeof YOUME_COLORS]: string };

// ─── Surcharges Light (Forêt de jour) ─────────────────────────────────────────

const LIGHT_OVERRIDES: Partial<YoumeColors> = {
  secondary:      '#F3EDE0',
  background:     '#F5F1E6', // parchemin / clairière
  surface:        '#FFFFFF',
  surfaceVariant: '#EAE0C8', // tan clair
  divider:        '#DCD2B8',
  inputBackground:'#FFFFFF',
  placeholder:    '#9C8F6E',
  textPrimary:    '#1E2A16',
  textSecondary:  '#5A6B45',
  textMuted:      '#8E9A7A',
  textLink:       '#B96A1E',
  bubbleOwn:      '#6FAF3E',
  bubbleOther:    '#FFFFFF',
  bubbleOwnText:  '#FFFFFF',
  bubbleOtherText:'#1E2A16',
};

export function getYoumeColors(isDarkMode: boolean): YoumeColors {
  if (isDarkMode) return YOUME_COLORS;
  return { ...YOUME_COLORS, ...LIGHT_OVERRIDES } as YoumeColors;
}

export function useYoumeColors(): YoumeColors {
  const isDarkMode = useUIStore((s) => s.isDarkMode);
  return useMemo(() => getYoumeColors(isDarkMode), [isDarkMode]);
}

// ─── Thèmes React-Native-Paper ───────────────────────────────────────────────

export const YOUME_DARK_THEME: MD3Theme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    primary:          YOUME_COLORS.primary,
    onPrimary:        '#FFFFFF',
    primaryContainer: YOUME_COLORS.primaryDark,
    secondary:        YOUME_COLORS.secondary,
    tertiary:         YOUME_COLORS.primaryLight,
    background:       YOUME_COLORS.background,
    surface:          YOUME_COLORS.surface,
    surfaceVariant:   YOUME_COLORS.surfaceVariant,
    onSurface:        YOUME_COLORS.textPrimary,
    onSurfaceVariant: YOUME_COLORS.textSecondary,
    outline:          YOUME_COLORS.divider,
    error:            YOUME_COLORS.error,
  },
};

export const YOUME_LIGHT_THEME: MD3Theme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary:          YOUME_COLORS.primary,
    onPrimary:        '#FFFFFF',
    primaryContainer: LIGHT_OVERRIDES.bubbleOwn as string,
    secondary:        LIGHT_OVERRIDES.secondary as string,
    tertiary:         YOUME_COLORS.primaryLight,
    background:       LIGHT_OVERRIDES.background as string,
    surface:          LIGHT_OVERRIDES.surface as string,
    surfaceVariant:   LIGHT_OVERRIDES.surfaceVariant as string,
    onSurface:        LIGHT_OVERRIDES.textPrimary as string,
    onSurfaceVariant: LIGHT_OVERRIDES.textSecondary as string,
    outline:          LIGHT_OVERRIDES.divider as string,
    error:            YOUME_COLORS.error,
  },
};

// ─── Autres constantes (inchangées) ──────────────────────────────────────────

export const SPACING = {
  xs:  4,
  sm:  8,
  md:  16,
  lg:  24,
  xl:  32,
  xxl: 48,
} as const;

export const BORDER_RADIUS = {
  sm:     8,
  md:     12,
  lg:     16,
  xl:     24,
  round:  50,
  bubble: 18,
} as const;

export const TYPOGRAPHY = {
  fontFamily: {
    regular: 'System',
    medium:  'System',
    bold:    'System',
    script:  'DancingScript_700Bold',
  },
  size: {
    xs:      11,
    sm:      12,
    md:      14,
    lg:      16,
    xl:      18,
    xxl:     24,
    heading: 28,
  },
} as const;

export const SHADOW = {
  sm: {
    shadowColor:   '#000',
    shadowOffset:  { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius:  2,
    elevation:     2,
  },
  md: {
    shadowColor:   '#000',
    shadowOffset:  { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius:  4,
    elevation:     4,
  },
  glow: {
    shadowColor:   '#E91E8C',
    shadowOffset:  { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius:  10,
    elevation:     6,
  },
  // ── Effet "bubble 3D" : ombre large et douce en position basse, comme un
  //    bouton physique qui flotte au-dessus de l'écran. Combiné à un
  //    dégradé clair→foncé et un reflet elliptique (voir Bubble3DButton),
  //    ça donne l'impression d'une sphère/bulle plutôt qu'un carré plat.
  bubble: {
    shadowColor:   '#000',
    shadowOffset:  { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius:  12,
    elevation:     10,
  },
  // État "pressé" : ombre resserrée pour simuler l'enfoncement du bouton.
  bubblePressed: {
    shadowColor:   '#000',
    shadowOffset:  { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius:  4,
    elevation:     3,
  },
} as const;

// ─── Tailles des boutons "bubble" ─────────────────────────────────────────────
// Choisies au-dessus du minimum tactile recommandé (44pt Apple / 48dp Google)
// pour que chaque bouton se voie et se comprenne comme actionnable au premier
// coup d'œil, sans avoir à deviner sa fonction.
export const BUBBLE_SIZES = {
  sm: 48,   // action secondaire (ex: pièce jointe)
  md: 60,   // action standard (ex: bouton d'un formulaire)
  lg: 76,   // action principale d'un écran (ex: envoyer, valider)
  xl: 96,   // action héro (ex: bouton d'accueil, CTA principal)
} as const;
