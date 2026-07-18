/**
 * Composant Barre de Force du Mot de Passe
 */
import React, { useMemo } from 'react';
import { View, Text, StyleSheet, DimensionValue } from 'react-native';
import { useYoumeColors, YoumeColors, SPACING, TYPOGRAPHY, BORDER_RADIUS } from '@shared/constants/theme';
import { getPasswordStrength } from '@shared/validators/authValidators';

interface PasswordStrengthBarProps {
  password: string;
}

export const PasswordStrengthBar: React.FC<PasswordStrengthBarProps> = ({ password }) => {
  const colors = useYoumeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);

  if (!password) return null;
  const { score, label, color } = getPasswordStrength(password);
  const width = `${score}%` as DimensionValue;

  return (
    <View style={styles.container}>
      <View style={styles.track}>
        <View style={[styles.fill, { width, backgroundColor: color }]} />
      </View>
      <Text style={[styles.label, { color }]}>{label}</Text>
    </View>
  );
};

function getStyles(colors: YoumeColors) {
  return StyleSheet.create({
    container: { marginTop: SPACING.xs },
    track: {
      height: 4,
      backgroundColor: colors.divider,
      borderRadius: BORDER_RADIUS.sm,
      overflow: 'hidden',
    },
    fill: {
      height: '100%',
      borderRadius: BORDER_RADIUS.sm,
    },
    label: {
      fontSize: TYPOGRAPHY.size.xs,
      marginTop: 4,
    },
  });
}
