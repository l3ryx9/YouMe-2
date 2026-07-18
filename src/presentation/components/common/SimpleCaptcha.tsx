/**
 * SimpleCaptcha — Captcha arithmétique 100% local
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { TextInput } from 'react-native-paper';
import { IconButton } from 'react-native-paper';
import { useYoumeColors, YoumeColors, YOUME_COLORS, SPACING, TYPOGRAPHY, BORDER_RADIUS } from '@shared/constants/theme';

interface Challenge {
  a: number;
  b: number;
  op: '+' | '-';
  answer: number;
}

function generateChallenge(): Challenge {
  const op: '+' | '-' = Math.random() < 0.5 ? '+' : '-';
  let a = Math.floor(Math.random() * 9) + 1;
  let b = Math.floor(Math.random() * 9) + 1;
  if (op === '-' && b > a) {
    [a, b] = [b, a];
  }
  const answer = op === '+' ? a + b : a - b;
  return { a, b, op, answer };
}

interface SimpleCaptchaProps {
  onVerify: (token: string | null) => void;
  style?: ViewStyle;
}

export function SimpleCaptcha({ onVerify, style }: SimpleCaptchaProps) {
  const [challenge, setChallenge] = useState<Challenge>(() => generateChallenge());
  const [value, setValue] = useState('');
  const [solved, setSolved] = useState(false);
  const colors = useYoumeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);

  const refresh = useCallback(() => {
    setChallenge(generateChallenge());
    setValue('');
    setSolved(false);
    onVerify(null);
  }, [onVerify]);

  const handleChange = useCallback(
    (text: string) => {
      const cleaned = text.replace(/[^0-9-]/g, '');
      setValue(cleaned);
      const parsed = parseInt(cleaned, 10);
      if (!Number.isNaN(parsed) && parsed === challenge.answer) {
        setSolved(true);
        onVerify(`local-captcha-${Date.now()}`);
      } else {
        setSolved(false);
        onVerify(null);
      }
    },
    [challenge.answer, onVerify]
  );

  useEffect(() => {
    onVerify(solved ? `local-captcha-${Date.now()}` : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [challenge]);

  const displayChars = useMemo(
    () => `${challenge.a} ${challenge.op} ${challenge.b} =`.split(''),
    [challenge]
  );

  return (
    <View style={[styles.container, style]}>
      <Text style={styles.label}>Vérification anti-robot</Text>
      <View style={styles.row}>
        <View style={styles.challengeBox}>
          {displayChars.map((ch, i) => (
            <Text
              key={i}
              style={[
                styles.challengeChar,
                { transform: [{ rotate: `${((i % 3) - 1) * 8}deg` }] },
              ]}
            >
              {ch}
            </Text>
          ))}
        </View>

        <IconButton
          icon="refresh"
          size={22}
          iconColor={colors.textSecondary}
          onPress={refresh}
          accessibilityLabel="Générer un nouveau défi"
        />

        <TextInput
          mode="outlined"
          value={value}
          onChangeText={handleChange}
          keyboardType="number-pad"
          placeholder="?"
          maxLength={4}
          style={styles.input}
          outlineColor={solved ? YOUME_COLORS.success : colors.divider}
          activeOutlineColor={solved ? YOUME_COLORS.success : colors.primary}
          textColor={colors.textPrimary}
          right={
            solved ? <TextInput.Icon icon="check-circle" color={YOUME_COLORS.success} /> : undefined
          }
        />
      </View>
      {solved && <Text style={styles.successText}>Vérifié ✓</Text>}
    </View>
  );
}

function getStyles(colors: YoumeColors) {
  return StyleSheet.create({
    container: { marginTop: SPACING.sm },
    label: { color: colors.textSecondary, fontSize: TYPOGRAPHY.size.sm, marginBottom: SPACING.xs },
    row: { flexDirection: 'row', alignItems: 'center' },
    challengeBox: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surfaceVariant,
      borderRadius: BORDER_RADIUS.md,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
      borderWidth: 1,
      borderColor: colors.divider,
    },
    challengeChar: {
      color: colors.textPrimary,
      fontSize: TYPOGRAPHY.size.lg,
      fontWeight: '700',
      letterSpacing: 1,
      marginHorizontal: 1,
    },
    input: {
      flex: 1,
      height: 48,
      backgroundColor: colors.inputBackground,
    },
    successText: { color: YOUME_COLORS.success, fontSize: TYPOGRAPHY.size.xs, marginTop: 4 },
  });
}
