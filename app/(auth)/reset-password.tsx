/**
 * Écran Réinitialisation du mot de passe — Thème Forêt Sombre
 *
 * Atteint uniquement via le deep link envoyé par sendPasswordReset()
 * (youme://reset-password#access_token=...&type=recovery). La session
 * de récupération est déjà établie par app/_layout.tsx au moment où cet
 * écran s'affiche (voir handleRecoveryUrl / setSessionFromUrl) : il ne
 * reste qu'à définir le nouveau mot de passe.
 */
import React, { useState } from 'react';
import { themedAlert } from '@presentation/components/common/ThemedAlert';
import {
  View,
  Text,
  StyleSheet,
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
import { resetPasswordSchema, type ResetPasswordFormData, getPasswordStrength } from '../../src/shared/validators/authValidators';
import { useAuth } from '../../src/presentation/hooks/useAuth';

const FS_INPUT_BG   = 'rgba(14, 27, 20, 0.85)';
const FS_SURFACE    = 'rgba(58, 16, 40, 0.88)';
const FS_BORDER     = 'rgba(219, 90, 150, 0.45)';
const FS_TEXT       = '#E7F2EB';
const FS_TEXT_MUTED = '#95B8A8';
const FS_GREEN      = '#52B788';

export default function ResetPasswordScreen() {
  const { updatePassword, isLoading } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [done, setDone] = useState(false);

  const {
    control,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<ResetPasswordFormData>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: '', confirmPassword: '' },
  });

  const strength = getPasswordStrength(watch('password'));

  const onSubmit = async (data: ResetPasswordFormData) => {
    try {
      await updatePassword(data.password);
      setDone(true);
    } catch (error: any) {
      themedAlert.alert('Erreur', error?.message ?? "Impossible de changer le mot de passe. Le lien a peut-être expiré — recommencez depuis « Mot de passe oublié ».");
    }
  };

  const onInvalid = (formErrors: any) => {
    const first: any = Object.values(formErrors ?? {})[0];
    themedAlert.alert('Formulaire incomplet', first?.message ?? 'Veuillez vérifier les champs.');
  };

  return (
    <View style={styles.background}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

          <Animated.View entering={FadeInDown.delay(100).springify()} style={styles.header}>
            <Text style={styles.title}>Nouveau mot de passe</Text>
            <Text style={styles.subtitle}>
              {done
                ? 'Votre mot de passe a été mis à jour.'
                : 'Choisissez un nouveau mot de passe pour votre compte.'}
            </Text>
          </Animated.View>

          <Animated.View entering={FadeInUp.delay(200).springify()} style={styles.form}>
            {done ? (
              <Button
                mode="contained"
                onPress={() => router.replace('/(app)/(tabs)/')}
                style={styles.submitButton}
                contentStyle={styles.submitButtonContent}
                labelStyle={styles.submitButtonLabel}
                buttonColor={FS_GREEN}
              >
                Continuer
              </Button>
            ) : (
              <>
                <Controller
                  control={control}
                  name="password"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <View>
                      <TextInput
                        label="Nouveau mot de passe"
                        value={value}
                        onChangeText={onChange}
                        onBlur={onBlur}
                        secureTextEntry={!showPassword}
                        autoCapitalize="none"
                        autoComplete="password-new"
                        mode="outlined"
                        style={styles.input}
                        outlineStyle={styles.inputOutline}
                        textColor={FS_TEXT}
                        placeholderTextColor={FS_TEXT_MUTED}
                        activeOutlineColor={FS_GREEN}
                        outlineColor={FS_BORDER}
                        left={<TextInput.Icon icon="lock-outline" color={FS_TEXT_MUTED} />}
                        right={
                          <TextInput.Icon
                            icon={showPassword ? 'eye-off' : 'eye'}
                            color={FS_TEXT_MUTED}
                            onPress={() => setShowPassword((v) => !v)}
                          />
                        }
                        error={!!errors.password}
                      />
                      {value.length > 0 && (
                        <Text style={[styles.strengthText, { color: strength.color }]}>
                          Force : {strength.label}
                        </Text>
                      )}
                      {errors.password && (
                        <HelperText type="error" style={styles.helperText}>
                          {errors.password.message}
                        </HelperText>
                      )}
                    </View>
                  )}
                />

                <Controller
                  control={control}
                  name="confirmPassword"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <View>
                      <TextInput
                        label="Confirmer le mot de passe"
                        value={value}
                        onChangeText={onChange}
                        onBlur={onBlur}
                        secureTextEntry={!showPassword}
                        autoCapitalize="none"
                        autoComplete="password-new"
                        mode="outlined"
                        style={styles.input}
                        outlineStyle={styles.inputOutline}
                        textColor={FS_TEXT}
                        placeholderTextColor={FS_TEXT_MUTED}
                        activeOutlineColor={FS_GREEN}
                        outlineColor={FS_BORDER}
                        left={<TextInput.Icon icon="lock-check-outline" color={FS_TEXT_MUTED} />}
                        error={!!errors.confirmPassword}
                      />
                      {errors.confirmPassword && (
                        <HelperText type="error" style={styles.helperText}>
                          {errors.confirmPassword.message}
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
                  Valider le nouveau mot de passe
                </Button>
              </>
            )}
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
  strengthText: {
    fontSize: TYPOGRAPHY.size.xs,
    marginTop: 2,
    marginLeft: SPACING.sm,
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
});
