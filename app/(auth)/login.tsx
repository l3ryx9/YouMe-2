/**
 * Écran de Connexion — Thème Forêt Sombre
 */
import React, { useState, useMemo } from 'react';
import { themedAlert } from '@presentation/components/common/ThemedAlert';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
  ImageBackground,
} from 'react-native';
import { router } from 'expo-router';
import { TextInput, Button, HelperText } from 'react-native-paper';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { YOUME_COLORS, SPACING, TYPOGRAPHY, BORDER_RADIUS } from '../../src/shared/constants/theme';
import { loginSchema, type LoginFormData } from '../../src/shared/validators/authValidators';
import { useAuth } from '../../src/presentation/hooks/useAuth';
import { HONEYPOT_FIELD_NAME, honeypotFieldStyle, getFormOpenedAt } from '../../src/shared/utils/antiBot';

const FS_INPUT_BG   = 'rgba(14, 27, 20, 0.85)';
const FS_SURFACE    = 'rgba(58, 16, 40, 0.88)';
const FS_BORDER     = 'rgba(219, 90, 150, 0.45)';
const FS_TEXT       = '#E7F2EB';
const FS_TEXT_MUTED = '#95B8A8';
const FS_GREEN      = '#52B788';

export default function LoginScreen() {
  const { login, isLoading } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [honeypot, setHoneypot] = useState('');
  // Capturé une seule fois au montage : sert à détecter les soumissions
  // trop rapides pour être humaines (voir src/shared/utils/antiBot.ts).
  const [formOpenedAt] = useState(() => getFormOpenedAt());

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = async (data: LoginFormData) => {
    try {
      await login(data, { honeypot, formOpenedAt });
    } catch (error: any) {
      themedAlert.alert('Erreur de connexion', error?.message ?? 'Erreur inconnue');
    }
  };

  const onInvalid = (formErrors: any) => {
    const first: any = Object.values(formErrors ?? {})[0];
    themedAlert.alert(
      'Formulaire incomplet',
      first?.message ?? 'Veuillez vérifier votre email et mot de passe.'
    );
  };

  return (
    <ImageBackground
      source={require('../../assets/images/forest-login-bg.png')}
      style={styles.background}
      resizeMode="cover"
    >
      <View style={styles.overlay} />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

          {/* ── En-tête ── */}
          <Animated.View entering={FadeInDown.delay(100).springify()} style={styles.header}>
            {/* Logo splash sans fond noir */}
            <Image
              source={require('../../assets/images/logo-splash.png')}
              style={styles.logo}
              resizeMode="contain"
            />

            {/* YouMe — blanc avec contour noir fin (4 ombres décalées) */}
            <View style={styles.appNameWrapper}>
              <Text style={[styles.appName, styles.appNameOutline]} aria-hidden>YouMe</Text>
              <Text style={[styles.appName, styles.appNameOutline, { left: -2, top: 0 }]} aria-hidden>YouMe</Text>
              <Text style={[styles.appName, styles.appNameOutline, { left: 0, top: -2 }]} aria-hidden>YouMe</Text>
              <Text style={[styles.appName, styles.appNameOutline, { left: 2, top: 0 }]} aria-hidden>YouMe</Text>
              <Text style={[styles.appName, styles.appNameOutline, { left: 0, top: 2 }]} aria-hidden>YouMe</Text>
              <Text style={styles.appName}>YouMe</Text>
            </View>
            <Text style={styles.tagline}>Messagerie privée avec IA locale</Text>
          </Animated.View>

          {/* ── Formulaire ── */}
          <Animated.View entering={FadeInUp.delay(200).springify()} style={styles.form}>

            {/*
              Champ honeypot — invisible pour un utilisateur humain, mais
              généralement rempli par les bots qui soumettent tous les
              champs d'un formulaire. Ne jamais l'afficher ni le labelliser
              de façon visible. Voir src/shared/utils/antiBot.ts.
            */}
            <TextInput
              value={honeypot}
              onChangeText={setHoneypot}
              style={honeypotFieldStyle}
              importantForAutofill="no"
              autoComplete="off"
              tabIndex={-1}
              accessible={false}
              nativeID={HONEYPOT_FIELD_NAME}
            />

            {/* Email */}
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

            {/* Mot de passe */}
            <Controller
              control={control}
              name="password"
              render={({ field: { onChange, onBlur, value } }) => (
                <View>
                  <TextInput
                    label="Mot de passe"
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoComplete="password"
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
                  {errors.password && (
                    <HelperText type="error" style={styles.helperText}>
                      {errors.password.message}
                    </HelperText>
                  )}
                </View>
              )}
            />

            {/* Bouton connexion */}
            <Button
              mode="contained"
              onPress={handleSubmit(onSubmit, onInvalid)}
              loading={isLoading}
              disabled={isLoading}
              style={styles.loginButton}
              contentStyle={styles.loginButtonContent}
              labelStyle={styles.loginButtonLabel}
              buttonColor={FS_GREEN}
            >
              Se connecter
            </Button>

            {/* Mot de passe oublié */}
            <TouchableOpacity
              style={styles.forgotPassword}
              onPress={() => router.push('/(auth)/forgot-password')}
            >
              <Text style={styles.forgotPasswordText}>Mot de passe oublié ?</Text>
            </TouchableOpacity>

            {/* Lien inscription */}
            <View style={styles.footer}>
              <Text style={styles.footerText}>Pas encore de compte ?</Text>
              <TouchableOpacity onPress={() => router.push('/(auth)/register')}>
                <Text style={styles.registerLink}> S'inscrire</Text>
              </TouchableOpacity>
            </View>

          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1, backgroundColor: '#000000' },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },

  container: { flex: 1 },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.xl,
    justifyContent: 'center',
  },
  header: { alignItems: 'center', paddingTop: 0, paddingBottom: SPACING.sm },
  logo: {
    width: 150,
    height: 150,
    marginBottom: SPACING.sm,
  },
  appName: {
    fontSize: 58,
    fontFamily: Platform.OS === 'ios' ? 'Impact' : 'sans-serif-condensed',
    fontWeight: 'bold',
    color: '#FFFFFF',
    letterSpacing: 4,
    marginTop: 0,
  },
  appNameWrapper: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 0,
  },
  appNameOutline: {
    position: 'absolute',
    color: '#000000',
  },
  tagline: {
    fontSize: TYPOGRAPHY.size.sm,
    color: FS_TEXT_MUTED,
    marginTop: 4,
    letterSpacing: 0.3,
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
    color: YOUME_COLORS.error,
    fontSize: TYPOGRAPHY.size.xs,
  },
  loginButton: {
    marginTop: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
  },
  loginButtonContent: { height: 50 },
  loginButtonLabel: {
    fontSize: TYPOGRAPHY.size.md,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  forgotPassword: { alignSelf: 'center', marginTop: SPACING.sm },
  forgotPasswordText: {
    color: FS_GREEN,
    fontSize: TYPOGRAPHY.size.md,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: SPACING.md,
    gap: 2,
  },
  footerText: { color: FS_TEXT_MUTED, fontSize: TYPOGRAPHY.size.md },
  registerLink: {
    color: FS_GREEN,
    fontSize: TYPOGRAPHY.size.md,
    fontWeight: '700',
  },
  debugLogsLink: { alignSelf: 'center', marginTop: SPACING.md },
  debugLogsLinkText: {
    color: FS_TEXT_MUTED,
    fontSize: TYPOGRAPHY.size.sm,
    textDecorationLine: 'underline',
  },
});
