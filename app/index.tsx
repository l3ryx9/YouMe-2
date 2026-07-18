/**
 * Route d'entrée « / » — Expo Router
 *
 * Rôle : donner un écran correspondant à l'URL initiale « / » et rediriger
 * immédiatement vers le bon groupe de routes selon l'état d'authentification.
 *
 * Pourquoi ce fichier existe :
 *   Sans lui, « / » ne correspond à aucun écran (il n'y a que les groupes
 *   (auth) et (app)). L'app se retrouvait alors à naviguer « à la main »
 *   depuis le layout racine avant que le navigateur soit monté — ce qui
 *   fait planter l'app juste après l'intro. Ici, on utilise le composant
 *   <Redirect> d'Expo Router, qui attend que la navigation soit prête avant
 *   de rediriger : plus de crash, et le login/inscription s'affiche.
 *
 * L'IA locale (téléchargement de modèles, vérification areAllModelsReady)
 * a été retirée — l'app utilise désormais Gemini côté serveur, plus besoin
 * d'attendre quoi que ce soit avant de rediriger vers login/tabs.
 *
 * Écran de démarrage : `logo-splash.png` (image statique) a été remplacé
 * par l'intro animée « YouMe » (AnimatedYouMe — les lettres apparaissent
 * puis se dispersent), sur un fond noir texturé du motif « peau d'ananas »
 * plein écran, cohérent avec le thème Forêt Enchantée.
 */
import { Redirect } from 'expo-router';
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useAuthStore } from '@presentation/stores/authStore';
import { AnimatedYouMe } from '@presentation/components/common/AnimatedYouMe';
import { PineapplePattern } from '@presentation/components/common/PineapplePattern';
import { YOUME_COLORS } from '@shared/constants/theme';

export default function Index() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isInitialized   = useAuthStore((s) => s.isInitialized);

  // Intro animée pendant que Supabase vérifie la session.
  if (!isInitialized) {
    return (
      <View style={styles.splash}>
        <PineapplePattern orange={YOUME_COLORS.pineappleOrange} yellow={YOUME_COLORS.pineappleYellow} opacity={0.3} />
        <AnimatedYouMe color={YOUME_COLORS.primaryLight} />
      </View>
    );
  }

  return (
    <Redirect href={isAuthenticated ? '/(app)/(tabs)' : '/(auth)/login'} />
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
