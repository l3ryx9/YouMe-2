/**
 * Layout des Onglets principaux
 * Style WhatsApp : Conversations | Contacts | Recherche | Paramètres
 */
import React, { useMemo } from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { View, Text, StyleSheet } from 'react-native';
import { useYoumeColors, YoumeColors, TYPOGRAPHY } from '../../../src/shared/constants/theme';
import { usePartnerStore } from '../../../src/presentation/stores/partnerStore';

function TabBadge({ count, colors }: { count: number; colors: YoumeColors }) {
  if (count === 0) return null;
  const styles = useMemo(() => getStyles(colors), [colors]);
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeText}>{count > 99 ? '99+' : count}</Text>
    </View>
  );
}

export default function TabsLayout() {
  const { pendingRequests } = usePartnerStore();
  const colors = useYoumeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: styles.tabLabel,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Messages',
          tabBarIcon: ({ color }) => (
            <Ionicons name="chatbubbles" size={26} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="partners"
        options={{
          title: 'Contacts',
          tabBarIcon: ({ color }) => (
            <View>
              <Ionicons name="people" size={26} color={color} />
              <TabBadge count={pendingRequests.length} colors={colors} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: 'Recherche IA',
          tabBarIcon: ({ color }) => (
            <Ionicons name="sparkles" size={26} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Paramètres',
          tabBarIcon: ({ color }) => (
            <Ionicons name="settings-outline" size={26} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

function getStyles(colors: YoumeColors) {
  return StyleSheet.create({
    tabBar: {
      backgroundColor: colors.secondary,
      borderTopColor: colors.divider,
      borderTopWidth: 1,
      height: 62,
      paddingBottom: 8,
      paddingTop: 4,
    },
    tabLabel: {
      fontSize: TYPOGRAPHY.size.xs,
      fontWeight: '700',
    },
    badge: {
      position: 'absolute',
      top: -4,
      right: -8,
      backgroundColor: colors.error,
      borderRadius: 8,
      minWidth: 16,
      height: 16,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 3,
    },
    badgeText: {
      fontSize: 9,
      color: '#FFFFFF',
      fontWeight: '700',
    },
  });
}
