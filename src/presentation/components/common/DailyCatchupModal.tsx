/**
 * Popup affiché quand le rattrapage quotidien se déclenche à l'ouverture de
 * l'app (l'app était fermée au moment où le cycle 24h aurait dû tourner).
 * Deux étapes réelles, chacune liée à la promesse correspondante — pas de
 * minuteur factice :
 *   1. "purge"   : suppression de la liste de flags de la conversation.
 *   2. "analyse" : la 2ᵉ IA analyse les messages du jour et met à jour le
 *      profil psychologique.
 */
import React, { useMemo } from 'react';
import { View, Text, Modal, ActivityIndicator, StyleSheet } from 'react-native';
import { YoumeColors, SPACING, TYPOGRAPHY, BORDER_RADIUS } from '@shared/constants/theme';

export type CatchupStage = 'purge' | 'analyse';

interface DailyCatchupModalProps {
  visible: boolean;
  stage: CatchupStage;
  colors: YoumeColors;
}

const STAGE_TEXT: Record<CatchupStage, { title: string; subtitle: string }> = {
  purge: {
    title: 'Suppression de la mémoire',
    subtitle: 'Veuillez patienter…',
  },
  analyse: {
    title: 'Analyse des messages du jour',
    subtitle: 'Patientez, on y est presque…',
  },
};

export function DailyCatchupModal({ visible, stage, colors }: DailyCatchupModalProps) {
  const styles = useMemo(() => getStyles(colors), [colors]);
  const { title, subtitle } = STAGE_TEXT[stage];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => {}}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>
      </View>
    </Modal>
  );
}

function getStyles(colors: YoumeColors) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.75)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: SPACING.xl,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: BORDER_RADIUS.lg,
      paddingVertical: SPACING.xl,
      paddingHorizontal: SPACING.lg,
      alignItems: 'center',
      gap: SPACING.sm,
      minWidth: 240,
    },
    title: {
      fontSize: TYPOGRAPHY.size.md,
      fontWeight: '700',
      color: colors.textPrimary,
      textAlign: 'center',
      marginTop: SPACING.sm,
    },
    subtitle: {
      fontSize: TYPOGRAPHY.size.sm,
      color: colors.textSecondary,
      textAlign: 'center',
    },
  });
}
