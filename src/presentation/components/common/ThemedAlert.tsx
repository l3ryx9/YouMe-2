/**
 * ThemedAlert — Boîtes de dialogue personnalisées (remplace Alert.alert natif).
 * L'hôte <ThemedAlertHost /> doit être monté une seule fois, à la racine,
 * à l'intérieur du PaperProvider (voir app/_layout.tsx).
 *
 * FIX : Les styles s'adaptent maintenant au thème actif (sombre / clair)
 * via useYoumeColors() — plus de fond blanc fixe.
 */
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Modal, Portal, Text, Button } from 'react-native-paper';
import {
  useYoumeColors,
  YoumeColors,
  SPACING,
  BORDER_RADIUS,
  TYPOGRAPHY,
} from '@shared/constants/theme';

export type ThemedAlertButton = {
  text: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
};

type AlertConfig = {
  title: string;
  message?: string;
  buttons?: ThemedAlertButton[];
};

let showHandler: ((config: AlertConfig) => void) | null = null;

export const themedAlert = {
  alert(title: string, message?: string, buttons?: ThemedAlertButton[]) {
    if (showHandler) {
      showHandler({ title, message, buttons });
    } else if (__DEV__) {
      console.warn('ThemedAlertHost non monté — alerte ignorée :', title);
    }
  },
};

export function ThemedAlertHost() {
  const [visible, setVisible] = useState(false);
  const [config, setConfig] = useState<AlertConfig | null>(null);

  // ── Thème actif (réactif dark/light) ──────────────────────────────────────
  const colors = useYoumeColors();
  const s = useMemo(() => getStyles(colors), [colors]);

  useEffect(() => {
    showHandler = (next) => {
      setConfig(next);
      setVisible(true);
    };
    return () => {
      showHandler = null;
    };
  }, []);

  const dismiss = useCallback(() => setVisible(false), []);

  const buttons: ThemedAlertButton[] =
    config?.buttons && config.buttons.length > 0
      ? config.buttons
      : [{ text: 'OK', style: 'default' }];

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={dismiss}
        contentContainerStyle={s.modal}
      >
        <View style={s.card}>
          {!!config?.title && <Text style={s.title}>{config.title}</Text>}
          {!!config?.message && <Text style={s.message}>{config.message}</Text>}
          <View style={s.buttonRow}>
            {buttons.map((b, i) => (
              <Button
                key={`${b.text}-${i}`}
                onPress={() => {
                  dismiss();
                  b.onPress?.();
                }}
                textColor={
                  b.style === 'destructive'
                    ? colors.error
                    : b.style === 'cancel'
                      ? colors.textMuted
                      : colors.primary
                }
                style={s.button}
                labelStyle={s.buttonLabel}
                compact
              >
                {b.text}
              </Button>
            ))}
          </View>
        </View>
      </Modal>
    </Portal>
  );
}

function getStyles(colors: YoumeColors) {
  return StyleSheet.create({
    modal: {
      marginHorizontal: SPACING.xl,
      alignItems: 'center',
      justifyContent: 'center',
    },
    card: {
      width: '100%',
      backgroundColor: colors.surface,       // fond du thème (sombre ou clair)
      borderRadius: BORDER_RADIUS.lg,
      borderWidth: 2,
      borderColor: colors.primary,           // bordure rose fuchsia
      paddingVertical: SPACING.lg,
      paddingHorizontal: SPACING.lg,
      // Lueur rose légère (visible en mode sombre)
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.25,
      shadowRadius: 12,
      elevation: 8,
    },
    title: {
      fontSize: TYPOGRAPHY.size.xl,
      fontWeight: '700',
      color: colors.primary,                 // titre en rose fuchsia
      marginBottom: SPACING.sm,
    },
    message: {
      fontSize: TYPOGRAPHY.size.md,
      color: colors.textSecondary,           // texte secondaire du thème
      lineHeight: 20,
      marginBottom: SPACING.sm,
    },
    buttonRow: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      alignItems: 'center',
      flexWrap: 'wrap',
      marginTop: SPACING.sm,
    },
    button: {
      marginLeft: SPACING.xs,
    },
    buttonLabel: {
      fontSize: TYPOGRAPHY.size.md,
      fontWeight: '600',
    },
  });
}
