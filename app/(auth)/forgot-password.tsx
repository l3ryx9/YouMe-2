/**
 * Écran Mot de passe oublié — Thème Forêt Sombre
 * Envoie un email de réinitialisation via Supabase Auth.
 */
import React, { useState } from 'react';
import { themedAlert } from '@presentation/components/common/ThemedAlert';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { TextInput, Button, HelperText } from 'react-native-paper';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { SPACING, TYPOGRAPHY, BORDER_RADIUS } from '../../src/shared/constants/theme';
import { forgotPasswordSchema, type ForgotPasswordFormData } from '../../src/shared/validators/authValidators';
import { useAuth } from '../../src/presentation/hooks/useAuth';

const FS_INPUT_BG   = 'rgba(14, 27, 20, 0.85)';
const FS_SURFACE    = 'rgba(58, 16, 40, 0.88)';
const FS_BORDER     = 'rgba(219, 90, 150, 0.45)';
const FS_TEXT       = '#E7F2EB';
const FS_TEXT_MUTED = '#95B8A8';
const FS_GREEN      = '#52B788';

export default function ForgotPasswordScreen() {
  const { sendPasswordReset, isLoading } = useAuth();
  const [sent, setSent] = useState(false);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordFormData>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });

  const onSubmit = async (data: ForgotPasswordFormData) => {
    try {
      await sendPasswordReset(data.email);
      setSent(true);
    } catch (error: any) {
      themedAlert.alert('Erreur', error?.message ?? "Impossible d'envoyer l'email de réinitialisation.");
    }
  };

  const onInvalid = (formErrors: any) => {
    const first: any = Object.values(formErrors ?? {})[0];
    themedAlert.alert('Formulaire incomplet', first?.message ?? 'Veuillez vérifier votre email.');
  };

  return (
    <View style={styles.background}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

          {/* ── En-tête ── */}
          <Animated.View entering={FadeInDown.delay(100).springify()} style={styles.header}>
            <Text style={styles.title}>Mot de passe oublié ?</Text>
            <Text style={styles.subtitle}>
              {sent
                ? 'Vérifiez votre boîte mail pour continuer.'
                : 'Indiquez votre email, nous vous enverrons un lien de réinitialisation.'}
            </Text>
          </Animated.View>

          {/* ── Formulaire ── */}
          <Animated.View entering={FadeInUp.delay(200).springify()} style={styles.form}>
            {sent ? (
              <>
                <Text style={styles.confirmationText}>
                  Un email a été envoyé. Suivez le lien qu'il contient pour choisir un nouveau
                  mot de passe.
                </Text>
                <Button
                  mode="contained"
                  onPress={() => router.replace('/(auth)/login')}
                  style={styles.submitButton}
                  contentStyle={styles.submitButtonContent}
                  labelStyle={styles.submitButtonLabel}
                  buttonColor={FS_GREEN}
                >
                  Retour à la connexion
                </Button>
              </>
            ) : (
              <>
                <Controller
                  control={control}
                  name="email"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <View>
                      <TextInput
                        label="Adresse email"
                        value={value}
                        onChangeText={onChange}
                        onBlur={onBlur}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        autoComplete="email"
                        mode="outlined"
                        style={styles.input}
                        outlineStyle={styles.inputOutline}
                        textColor={FS_TEXT}
                        placeholderTextColor={FS_TEXT_MUTED}
                        activeOutlineColor={FS_GREEN}
                        outlineColor={FS_BORDER}
                        left={<TextInput.Icon icon="email-outline" color={FS_TEXT_MUTED} />}
                        error={!!errors.email}
                      />
                      {errors.email && (
                        <HelperText type="error" style={styles.helperText}>
                          {errors.email.message}
                        </HelperText>
                      )}
                    </View>
                  )}
                />

                <Button
                  mode="contained"
                  onPress={handleSubmit(onSubmit, onInvalid)}
                  loading={isLoading}
                  disabled={isLoading}
                  style={styles.submitButton}
                  contentStyle={styles.submitButtonContent}
                  labelStyle={styles.submitButtonLabel}
                  buttonColor={FS_GREEN}
                >
                  Envoyer le lien
                </Button>
              </>
            )}

            {/* Retour connexion */}
            <TouchableOpacity
              style={styles.backLink}
              onPress={() => router.back()}
            >
              <Text style={styles.backLinkText}>← Retour à la connexion</Text>
            </TouchableOpacity>

          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1, backgroundColor: '#000000' },
  container: { flex: 1 },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.xl,
    justifyContent: 'center',
  },
  header: { alignItems: 'center', paddingBottom: SPACING.lg },
  title: {
    fontSize: TYPOGRAPHY.size.heading,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: TYPOGRAPHY.size.md,
    color: FS_TEXT_MUTED,
    textAlign: 'center',
    marginTop: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
  form: {
    backgroundColor: FS_SURFACE,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    gap: SPACING.sm,
    borderWidth: 1,
    borderColor: FS_BORDER,
  },
  input: { backgroundColor: FS_INPUT_BG },
  inputOutline: {
    borderColor: FS_BORDER,
    borderRadius: BORDER_RADIUS.md,
  },
  helperText: {
    color: '#DC2626',
    fontSize: TYPOGRAPHY.size.xs,
  },
  confirmationText: {
    color: FS_TEXT,
    fontSize: TYPOGRAPHY.size.md,
    textAlign: 'center',
    marginBottom: SPACING.sm,
  },
  submitButton: {
    marginTop: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
  },
  submitButtonContent: { height: 50 },
  submitButtonLabel: {
    fontSize: TYPOGRAPHY.size.md,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  backLink: { alignSelf: 'center', marginTop: SPACING.md },
  backLinkText: {
    color: FS_GREEN,
    fontSize: TYPOGRAPHY.size.md,
  },
});
