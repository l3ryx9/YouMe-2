/**
 * Écran d'Inscription
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
  Alert,
  ImageBackground,
} from 'react-native';
import { router } from 'expo-router';
import { TextInput, Button, HelperText } from 'react-native-paper';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import {
  registerSchema,
  type RegisterFormData,
} from '../../src/shared/validators/authValidators';
import { SPACING, TYPOGRAPHY, BORDER_RADIUS } from '../../src/shared/constants/theme';
import { useAuth } from '../../src/presentation/hooks/useAuth';
import { PasswordStrengthBar } from '../../src/presentation/components/common/PasswordStrengthBar';
import { HONEYPOT_FIELD_NAME, honeypotFieldStyle, getFormOpenedAt } from '../../src/shared/utils/antiBot';

// Couleurs fixes (indépendantes du thème clair/sombre de l'app) — cet écran
// reste toujours sur le fond forêt sombre, donc le texte doit toujours
// rester clair, même si l'utilisateur a activé le thème clair ailleurs
// dans l'app. Mêmes valeurs que login.tsx pour la cohérence visuelle.
const FS_INPUT_BG   = 'rgba(14, 27, 20, 0.85)';
const FS_SURFACE    = 'rgba(58, 16, 40, 0.88)';
const FS_BORDER     = 'rgba(219, 90, 150, 0.45)';
const FS_TEXT       = '#E7F2EB';
const FS_TEXT_MUTED = '#95B8A8';
const FS_GREEN      = '#52B788';

export default function RegisterScreen() {
  const { register: registerUser, isLoading } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [honeypot, setHoneypot] = useState('');
  // Capturé une seule fois au montage : sert à détecter les soumissions
  // trop rapides pour être humaines (voir src/shared/utils/antiBot.ts).
  const [formOpenedAt] = useState(() => getFormOpenedAt());

  const {
    control,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      email: '',
      password: '',
      confirmPassword: '',
      username: '',
      displayName: '',
    },
  });

  const password = watch('password');

  const onSubmit = async (data: RegisterFormData) => {
    try {
      await registerUser(data, { honeypot, formOpenedAt });
      // L'inscription ne connecte plus automatiquement l'utilisateur
      // (voir useAuth.ts : logout() est appelé juste après la création
      // du profil). On revient donc explicitement sur l'écran login,
      // avec un message de confirmation.
      router.replace('/(auth)/login');
      themedAlert.alert('Compte créé', 'Votre compte a été créé avec succès. Vous pouvez maintenant vous connecter.');
    } catch (error: any) {
      themedAlert.alert('Erreur d\'inscription', error.message);
    }
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
        <Animated.View entering={FadeInDown.delay(100)} style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={FS_TEXT} />
          </TouchableOpacity>
          <Text style={styles.title}>Créer un compte</Text>
          <Text style={styles.subtitle}>Rejoignez YouMe</Text>
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(200)} style={styles.form}>
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

          <Controller
            control={control}
            name="email"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextInput
                label="Adresse email *"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                keyboardType="email-address"
                autoCapitalize="none"
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
            )}
          />
          {errors.email && <HelperText type="error">{errors.email.message}</HelperText>}

          <Controller
            control={control}
            name="username"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextInput
                label="Username unique *"
                value={value}
                onChangeText={(t) => onChange(t.toLowerCase().replace(/[^a-z0-9._]/g, ''))}
                onBlur={onBlur}
                autoCapitalize="none"
                mode="outlined"
                style={[styles.input, { marginTop: SPACING.sm }]}
                outlineStyle={styles.inputOutline}
                textColor={FS_TEXT}
                placeholderTextColor={FS_TEXT_MUTED}
                activeOutlineColor={FS_GREEN}
                outlineColor={FS_BORDER}
                left={<TextInput.Icon icon="at" color={FS_TEXT_MUTED} />}
                error={!!errors.username}
              />
            )}
          />
          {errors.username ? (
            <HelperText type="error">{errors.username.message}</HelperText>
          ) : (
            <HelperText type="info" visible>3-20 caractères, lettres, chiffres, . et _</HelperText>
          )}

          <Controller
            control={control}
            name="displayName"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextInput
                label="Surnom affiché *"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                mode="outlined"
                style={[styles.input, { marginTop: SPACING.sm }]}
                outlineStyle={styles.inputOutline}
                textColor={FS_TEXT}
                placeholderTextColor={FS_TEXT_MUTED}
                activeOutlineColor={FS_GREEN}
                outlineColor={FS_BORDER}
                left={<TextInput.Icon icon="account-outline" color={FS_TEXT_MUTED} />}
                error={!!errors.displayName}
              />
            )}
          />
          {errors.displayName && <HelperText type="error">{errors.displayName.message}</HelperText>}

          <Controller
            control={control}
            name="password"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextInput
                label="Mot de passe *"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                secureTextEntry={!showPassword}
                mode="outlined"
                style={[styles.input, { marginTop: SPACING.sm }]}
                outlineStyle={styles.inputOutline}
                textColor={FS_TEXT}
                placeholderTextColor={FS_TEXT_MUTED}
                activeOutlineColor={FS_GREEN}
                outlineColor={FS_BORDER}
                left={<TextInput.Icon icon="lock-outline" color={FS_TEXT_MUTED} />}
                right={
                  <TextInput.Icon
                    icon={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    color={FS_TEXT_MUTED}
                    onPress={() => setShowPassword(!showPassword)}
                  />
                }
                error={!!errors.password}
              />
            )}
          />
          <PasswordStrengthBar password={password} />
          {errors.password && <HelperText type="error">{errors.password.message}</HelperText>}

          <Controller
            control={control}
            name="confirmPassword"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextInput
                label="Confirmer le mot de passe *"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                secureTextEntry={!showConfirm}
                mode="outlined"
                style={[styles.input, { marginTop: SPACING.sm }]}
                outlineStyle={styles.inputOutline}
                textColor={FS_TEXT}
                placeholderTextColor={FS_TEXT_MUTED}
                activeOutlineColor={FS_GREEN}
                outlineColor={FS_BORDER}
                left={<TextInput.Icon icon="lock-check-outline" color={FS_TEXT_MUTED} />}
                right={
                  <TextInput.Icon
                    icon={showConfirm ? 'eye-off-outline' : 'eye-outline'}
                    color={FS_TEXT_MUTED}
                    onPress={() => setShowConfirm(!showConfirm)}
                  />
                }
                error={!!errors.confirmPassword}
              />
            )}
          />
          {errors.confirmPassword && <HelperText type="error">{errors.confirmPassword.message}</HelperText>}

          <Button
            mode="contained"
            onPress={handleSubmit(onSubmit)}
            loading={isLoading}
            disabled={isLoading}
            style={styles.button}
            contentStyle={styles.buttonContent}
            labelStyle={styles.buttonLabel}
            buttonColor={FS_GREEN}
          >
            Créer mon compte
          </Button>

          <Text style={styles.terms}>
            En vous inscrivant, vous acceptez notre politique de confidentialité.
            Vos données sont stockées localement sur votre appareil.
          </Text>
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(400)} style={styles.footer}>
          <Text style={styles.footerText}>Déjà un compte ?</Text>
          <TouchableOpacity onPress={() => router.replace('/(auth)/login')}>
            <Text style={styles.loginLink}>Se connecter</Text>
          </TouchableOpacity>
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
  scroll: { flexGrow: 1, paddingHorizontal: SPACING.xl, paddingVertical: SPACING.xl },
  header: { marginBottom: SPACING.xl },
  backButton: { marginBottom: SPACING.md },
  title: { fontSize: TYPOGRAPHY.size.xxl, fontWeight: '700', color: FS_TEXT },
  subtitle: { fontSize: TYPOGRAPHY.size.md, color: FS_TEXT_MUTED, marginTop: 4 },
  form: {
    gap: SPACING.xs,
    backgroundColor: FS_SURFACE,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: FS_BORDER,
  },
  input: { backgroundColor: FS_INPUT_BG },
  inputOutline: { borderColor: FS_BORDER, borderRadius: BORDER_RADIUS.md },
  button: { marginTop: SPACING.md, borderRadius: BORDER_RADIUS.md },
  buttonContent: { height: 50 },
  buttonLabel: { fontSize: TYPOGRAPHY.size.md, fontWeight: '600', color: '#FFFFFF' },
  terms: { fontSize: TYPOGRAPHY.size.xs, color: FS_TEXT_MUTED, textAlign: 'center', marginTop: SPACING.sm, lineHeight: 18 },
  footer: { flexDirection: 'row', justifyContent: 'center', gap: SPACING.xs, marginTop: SPACING.xl },
  footerText: { color: FS_TEXT_MUTED },
  loginLink: { color: FS_GREEN, fontWeight: '600' },
  debugLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: SPACING.lg },
  debugLinkText: { color: FS_TEXT_MUTED, fontSize: TYPOGRAPHY.size.xs },
});
