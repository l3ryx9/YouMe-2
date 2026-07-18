/**
 * Écran de suppression de compte
 */
import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { YOUME_COLORS, SPACING, TYPOGRAPHY, BORDER_RADIUS } from '@shared/constants/theme';
import { useAuth } from '@presentation/hooks/useAuth';
import { themedAlert } from '@presentation/components/common/ThemedAlert';

export default function AccountDeletionScreen() {
  const insets = useSafeAreaInsets();
  const { user, deleteAccount, isLoading } = useAuth();
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  const handleDelete = () => {
    if (!password.trim()) {
      setError('Veuillez entrer votre mot de passe pour confirmer.');
      return;
    }
    themedAlert.alert(
      'Supprimer définitivement ?',
      'Cette action est irréversible. Toutes vos conversations et données seront effacées.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            try {
              setError('');
              await deleteAccount(password);
            } catch (err: any) {
              setError(err.message ?? 'Une erreur est survenue.');
            }
          },
        },
      ]
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 40 }]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={YOUME_COLORS.textPrimary} />
        </TouchableOpacity>

        {/* Icône avertissement */}
        <View style={styles.iconWrap}>
          <Ionicons name="warning-outline" size={56} color={YOUME_COLORS.error} />
        </View>

        <Text style={styles.title}>Supprimer le compte</Text>
        <Text style={styles.subtitle}>
          Cette action est <Text style={styles.bold}>irréversible</Text>. Toutes vos conversations,
          messages et données seront définitivement supprimés.
        </Text>

        {/* Email affiché */}
        <View style={styles.emailCard}>
          <Ionicons name="person-circle-outline" size={20} color={YOUME_COLORS.textMuted} />
          <Text style={styles.emailText} numberOfLines={1}>{user?.email}</Text>
        </View>

        {/* Champ mot de passe */}
        <Text style={styles.label}>Confirmez avec votre mot de passe</Text>
        <View style={styles.inputWrapper}>
          <Ionicons name="lock-closed-outline" size={18} color={YOUME_COLORS.textMuted} style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            placeholder="Mot de passe"
            placeholderTextColor={YOUME_COLORS.placeholder}
            value={password}
            onChangeText={(t) => { setPassword(t); setError(''); }}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
          />
          <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
            <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color={YOUME_COLORS.textMuted} />
          </TouchableOpacity>
        </View>

        {error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : null}

        {/* Bouton suppression */}
        <TouchableOpacity
          style={[styles.deleteBtn, isLoading && styles.deleteBtnDisabled]}
          onPress={handleDelete}
          disabled={isLoading}
          activeOpacity={0.85}
        >
          {isLoading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Ionicons name="trash-outline" size={18} color="#FFFFFF" />
              <Text style={styles.deleteBtnText}>Supprimer définitivement</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Annuler */}
        <TouchableOpacity style={styles.cancelBtn} onPress={() => router.back()}>
          <Text style={styles.cancelText}>Annuler</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: YOUME_COLORS.background },
  scroll: { paddingHorizontal: SPACING.lg, gap: SPACING.md },
  backBtn: { padding: SPACING.xs, alignSelf: 'flex-start', marginBottom: SPACING.sm },
  iconWrap: { alignItems: 'center', paddingVertical: SPACING.md },
  title: {
    fontSize: TYPOGRAPHY.size.heading,
    fontFamily: 'Impact',
    letterSpacing: 1,
    color: YOUME_COLORS.error,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: TYPOGRAPHY.size.sm,
    color: YOUME_COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  bold: { fontWeight: '700', color: YOUME_COLORS.textPrimary },
  emailCard: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    backgroundColor: YOUME_COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1, borderColor: YOUME_COLORS.divider,
  },
  emailText: { flex: 1, fontSize: TYPOGRAPHY.size.sm, color: YOUME_COLORS.textSecondary },
  label: { fontSize: TYPOGRAPHY.size.sm, color: YOUME_COLORS.textSecondary, fontWeight: '600' },
  inputWrapper: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: YOUME_COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1, borderColor: YOUME_COLORS.divider,
    paddingHorizontal: SPACING.md,
  },
  inputIcon: { marginRight: SPACING.sm },
  input: {
    flex: 1, height: 48,
    fontSize: TYPOGRAPHY.size.md,
    color: YOUME_COLORS.textPrimary,
  },
  eyeBtn: { padding: SPACING.xs },
  errorText: { fontSize: TYPOGRAPHY.size.sm, color: YOUME_COLORS.error },
  deleteBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: SPACING.sm, backgroundColor: YOUME_COLORS.error,
    borderRadius: BORDER_RADIUS.lg, height: 52, marginTop: SPACING.sm,
  },
  deleteBtnDisabled: { opacity: 0.6 },
  deleteBtnText: { fontSize: TYPOGRAPHY.size.md, fontWeight: '700', color: '#FFFFFF' },
  cancelBtn: { alignItems: 'center', paddingVertical: SPACING.sm },
  cancelText: { fontSize: TYPOGRAPHY.size.sm, color: YOUME_COLORS.textMuted },
});
