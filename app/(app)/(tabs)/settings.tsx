/**
 * Écran Paramètres
 */
import React, { useState, useMemo } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { themedAlert } from '@presentation/components/common/ThemedAlert';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Share,
} from 'react-native';
import { router } from 'expo-router';
import { Switch, ActivityIndicator } from 'react-native-paper';
import { uploadAvatar } from '../../../src/infrastructure/supabase/AvatarService';
import { useAuthStore } from '../../../src/presentation/stores/authStore';
import { Ionicons } from '@expo/vector-icons';
import { useYoumeColors, YoumeColors, SPACING, TYPOGRAPHY, BORDER_RADIUS } from '../../../src/shared/constants/theme';
import { Avatar } from '../../../src/presentation/components/common/Avatar';
import { useAuth } from '../../../src/presentation/hooks/useAuth';
import { useUIStore } from '../../../src/presentation/stores/uiStore';
import { memoryRepository } from '../../../src/infrastructure/storage/LocalMemoryRepository';
import { userRepository } from '../../../src/infrastructure/supabase/UserRepository';

interface SettingRow {
  icon: string;
  label: string;
  description?: string;
  onPress?: () => void;
  rightElement?: React.ReactNode;
  danger?: boolean;
}

export default function SettingsScreen() {
  const { user, logout } = useAuth();
  const { setUser } = useAuthStore();
  const { notificationsEnabled, isDarkMode, setNotificationsEnabled, toggleDarkMode } = useUIStore();
  const [exportingData, setExportingData] = useState(false);
  const [deletingMemory, setDeletingMemory] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const colors = useYoumeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);

  const processAvatarUpload = async (uri: string) => {
    if (!user) return;
    setUploadingAvatar(true);
    try {
      const photoURL = await uploadAvatar(user.id, uri);
      await userRepository.updateUser(user.id, { photoURL });
      setUser({ ...user, photoURL });
      themedAlert.alert('Succès', 'Photo de profil mise à jour.');
    } catch (err: any) {
      const msg = err?.message ?? 'Erreur inconnue';
      themedAlert.alert('Erreur upload avatar', msg);
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleAvatarPress = () => {
    themedAlert.alert('Photo de profil', 'Choisissez une source', [
      {
        text: 'Appareil photo',
        onPress: async () => {
          const { status } = await ImagePicker.requestCameraPermissionsAsync();
          if (status !== 'granted') {
            themedAlert.alert('Permission requise', 'L\'accès à la caméra est nécessaire.');
            return;
          }
          const result = await ImagePicker.launchCameraAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.8,
          });
          if (!result.canceled && result.assets[0]) {
            await processAvatarUpload(result.assets[0].uri);
          }
        },
      },
      {
        text: 'Galerie',
        onPress: async () => {
          const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (status !== 'granted') {
            themedAlert.alert('Permission requise', 'L\'accès à la galerie est nécessaire.');
            return;
          }
          const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.8,
          });
          if (!result.canceled && result.assets[0]) {
            await processAvatarUpload(result.assets[0].uri);
          }
        },
      },
      { text: 'Annuler', style: 'cancel' },
    ]);
  };

  const handleExportData = async () => {
    if (!user) return;
    setExportingData(true);
    try {
      const data = await memoryRepository.exportMemory();
      await Share.share({
        title: 'YouMe — Mes données',
        message: data,
      });
    } catch (error) {
      themedAlert.alert('Erreur', 'Impossible d\'exporter les données');
    } finally {
      setExportingData(false);
    }
  };

  const handleDeleteMemory = () => {
    themedAlert.alert(
      'Supprimer la mémoire IA',
      'Cette action supprimera définitivement toutes les données analysées par l\'IA (résumés, émotions, entités). Les messages ne sont pas affectés.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            setDeletingMemory(true);
            try {
              await memoryRepository.deleteAllMemory();
              themedAlert.alert('Mémoire IA supprimée', 'Toutes les données IA ont été effacées.');
            } catch (error) {
              themedAlert.alert('Erreur', 'Impossible de supprimer la mémoire');
            } finally {
              setDeletingMemory(false);
            }
          },
        },
      ]
    );
  };

  const handleLogout = () => {
    themedAlert.alert(
      'Déconnexion',
      'Voulez-vous vous déconnecter ?',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Déconnecter', style: 'destructive', onPress: () => logout() },
      ]
    );
  };

  const Section = ({ title, rows }: { title: string; rows: SettingRow[] }) => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionContent}>
        {rows.map((row, index) => (
          <TouchableOpacity
            key={row.label}
            style={[
              styles.row,
              index < rows.length - 1 && styles.rowBorder,
            ]}
            onPress={row.onPress}
            disabled={!row.onPress}
            activeOpacity={row.onPress ? 0.7 : 1}
          >
            <View style={[styles.rowIcon, row.danger && styles.rowIconDanger]}>
              <Ionicons
                name={row.icon as any}
                size={20}
                color={row.danger ? colors.error : colors.primary}
              />
            </View>
            <View style={styles.rowContent}>
              <Text style={[styles.rowLabel, row.danger && styles.rowLabelDanger]}>
                {row.label}
              </Text>
              {row.description && (
                <Text style={styles.rowDescription}>{row.description}</Text>
              )}
            </View>
            {row.rightElement ?? (
              row.onPress && (
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
              )
            )}
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scroll}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Paramètres</Text>
      </View>

      {/* Profil */}
      {user && (
        <TouchableOpacity style={styles.profileCard} onPress={handleAvatarPress} disabled={uploadingAvatar}>
          <View>
            <Avatar displayName={user.displayName} photoURL={user.photoURL} size={60} showStatus={false} />
            {uploadingAvatar && (
              <View style={styles.avatarOverlay}>
                <ActivityIndicator size="small" color="#fff" />
              </View>
            )}
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>{user.displayName}</Text>
            <Text style={styles.profileUsername}>@{user.username}</Text>
            <Text style={styles.profileEmail}>{user.email}</Text>
            <Text style={styles.avatarHint}>Appuyez pour changer la photo</Text>
          </View>
          <Ionicons name="camera-outline" size={20} color={colors.textMuted} />
        </TouchableOpacity>
      )}

      {/* Préférences */}
      <Section
        title="Préférences"
        rows={[
          {
            icon: isDarkMode ? 'moon-outline' : 'sunny-outline',
            label: 'Thème',
            description: isDarkMode ? 'Forêt Sombre — interface en mode sombre' : 'Forêt Claire — interface en mode clair',
            rightElement: (
              <Switch value={isDarkMode} onValueChange={toggleDarkMode} color={colors.primary} />
            ),
          },
          {
            icon: 'notifications-outline',
            label: 'Notifications',
            rightElement: (
              <Switch value={notificationsEnabled} onValueChange={setNotificationsEnabled} color={colors.primary} />
            ),
          },
        ]}
      />

      {/* Confidentialité */}
      <Section
        title="Confidentialité & Données"
        rows={[
          {
            icon: 'download-outline',
            label: 'Exporter mes données',
            description: 'Exporter la mémoire IA en JSON',
            onPress: handleExportData,
            rightElement: exportingData ? <ActivityIndicator size="small" color={colors.primary} /> : undefined,
          },
          {
            icon: 'trash-outline',
            label: 'Supprimer la mémoire IA',
            description: 'Efface tous les résumés et analyses',
            onPress: handleDeleteMemory,
            rightElement: deletingMemory ? <ActivityIndicator size="small" color={colors.error} /> : undefined,
            danger: true,
          },
        ]}
      />

      {/* Compte */}
      <Section
        title="Compte"
        rows={[
          {
            icon: 'log-out-outline',
            label: 'Se déconnecter',
            onPress: handleLogout,
          },
          {
            icon: 'person-remove-outline',
            label: 'Supprimer le compte',
            description: 'Action irréversible',
            onPress: () => router.push('/(app)/account-deletion'),
            danger: true,
          },
        ]}
      />

      {/* À propos */}
      <View style={styles.about}>
        <Text style={styles.aboutTitle}>YouMe</Text>
        <Text style={styles.aboutVersion}>Version 1.0.0</Text>
        <Text style={styles.aboutDesc}>
          Messagerie privée avec IA locale — 100% gratuit et open source.
          Vos données restent sur votre appareil.
        </Text>
      </View>
    </ScrollView>
  );
}

function getStyles(colors: YoumeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    scroll: { paddingBottom: 40 },
    header: {
      paddingTop: 48,
      paddingBottom: SPACING.sm,
      paddingHorizontal: SPACING.md,
      backgroundColor: colors.secondary,
    },
    headerTitle: { fontSize: TYPOGRAPHY.size.xl, fontWeight: '700', color: colors.textPrimary },
    profileCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.md,
      backgroundColor: colors.surface,
      margin: SPACING.md,
      borderRadius: BORDER_RADIUS.lg,
      padding: SPACING.md,
    },
    profileInfo: { flex: 1 },
    profileName: { fontSize: TYPOGRAPHY.size.lg, fontWeight: '700', color: colors.textPrimary },
    profileUsername: { fontSize: TYPOGRAPHY.size.sm, color: colors.primary },
    profileEmail: { fontSize: TYPOGRAPHY.size.sm, color: colors.textSecondary },
    avatarHint: { fontSize: TYPOGRAPHY.size.xs, color: colors.textMuted, marginTop: 2 },
    avatarOverlay: {
      position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
      borderRadius: 30, backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'center', alignItems: 'center',
    },
    section: { marginHorizontal: SPACING.md, marginBottom: SPACING.md },
    sectionTitle: {
      fontSize: TYPOGRAPHY.size.sm,
      fontWeight: '600',
      color: colors.primary,
      marginBottom: SPACING.sm,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    sectionContent: {
      backgroundColor: colors.surface,
      borderRadius: BORDER_RADIUS.lg,
      overflow: 'hidden',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.md,
      gap: SPACING.md,
    },
    rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.divider },
    rowIcon: {
      width: 36,
      height: 36,
      borderRadius: BORDER_RADIUS.sm,
      backgroundColor: `${colors.primary}22`,
      justifyContent: 'center',
      alignItems: 'center',
    },
    rowIconDanger: { backgroundColor: `${colors.error}22` },
    rowContent: { flex: 1 },
    rowLabel: { fontSize: TYPOGRAPHY.size.md, color: colors.textPrimary },
    rowLabelDanger: { color: colors.error },
    rowDescription: { fontSize: TYPOGRAPHY.size.xs, color: colors.textMuted, marginTop: 2 },
    about: { alignItems: 'center', paddingHorizontal: SPACING.xl, paddingVertical: SPACING.xl, gap: SPACING.xs },
    aboutTitle: { fontSize: TYPOGRAPHY.size.md, fontWeight: '700', color: colors.textSecondary },
    aboutVersion: { fontSize: TYPOGRAPHY.size.sm, color: colors.textMuted },
    aboutDesc: { fontSize: TYPOGRAPHY.size.xs, color: colors.textMuted, textAlign: 'center', lineHeight: 18 },
  });
          }
