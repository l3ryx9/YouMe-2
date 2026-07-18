/**
 * Écran Position en Direct
 * Affiche la position du partenaire en temps réel sur une carte native.
 * Mise à jour automatique via onSnapshot Firestore.
 * Le mode furtif (5 taps, FCM, background) est géré en dehors de cet écran.
 */
import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated as RNAnimated,
  Platform,
  Linking,
  SafeAreaView,
} from 'react-native';
import MapView, {
  Marker,
  Circle,
  PROVIDER_DEFAULT,
  type Region,
} from 'react-native-maps';
import { useLocalSearchParams, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useYoumeColors, YoumeColors, SPACING, TYPOGRAPHY, BORDER_RADIUS, SHADOW } from '../../../src/shared/constants/theme';
import { locationService } from '../../../src/infrastructure/location/LocationService';
import { fcmLocationService } from '../../../src/infrastructure/location/FcmLocationService';
import { useLocationStore } from '../../../src/presentation/stores/locationStore';
import { useAuthStore } from '../../../src/presentation/stores/authStore';
import { useConversationStore } from '../../../src/presentation/stores/conversationStore';
import type { LiveLocationData } from '../../../src/infrastructure/location/LocationService';

const DELTA = 0.006;
const REFRESH_INTERVAL_MS = 15_000;

// ── Point animé "pulse" ───────────────────────────────────────────────────────

function PulseMarker({ isMocked, color }: { isMocked: boolean; color: string }) {
  const scale = useRef(new RNAnimated.Value(1)).current;
  const opacity = useRef(new RNAnimated.Value(0.6)).current;

  useEffect(() => {
    const pulse = RNAnimated.loop(
      RNAnimated.parallel([
        RNAnimated.sequence([
          RNAnimated.timing(scale, { toValue: 2.2, duration: 1200, useNativeDriver: true }),
          RNAnimated.timing(scale, { toValue: 1, duration: 0, useNativeDriver: true }),
        ]),
        RNAnimated.sequence([
          RNAnimated.timing(opacity, { toValue: 0, duration: 1200, useNativeDriver: true }),
          RNAnimated.timing(opacity, { toValue: 0.6, duration: 0, useNativeDriver: true }),
        ]),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  const pinColor = isMocked ? '#F59E0B' : color;

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', width: 36, height: 36 }}>
      <RNAnimated.View
        style={{
          position: 'absolute',
          width: 24,
          height: 24,
          borderRadius: 12,
          backgroundColor: pinColor,
          transform: [{ scale }],
          opacity,
        }}
      />
      <View style={{
        width: 18,
        height: 18,
        borderRadius: 9,
        backgroundColor: pinColor,
        borderWidth: 2.5,
        borderColor: '#fff',
        shadowColor: pinColor,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.5,
        shadowRadius: 4,
        elevation: 4,
      }} />
    </View>
  );
}

// ── Écran principal ───────────────────────────────────────────────────────────

export default function LiveLocationScreen() {
  const { id: conversationId } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();
  const { conversations } = useConversationStore();
  const {
    partnerLocation,
    setPartnerLocation,
    isSharing,
    sharingConversationId,
    stealthActive,
    stealthTargetId,
    setSharing,
  } = useLocationStore();

  const colors = useYoumeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const mapRef = useRef<MapView>(null);

  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const refreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const partnerId = conversations.find((c) => c.id === conversationId)?.partnerId ?? null;
  const isSharingHere = isSharing && sharingConversationId === conversationId;
  const isStealthHere = stealthActive && stealthTargetId === partnerId;

  // ── Abonnement temps réel Firestore ─────────────────────────────────────────
  useEffect(() => {
    if (!conversationId) return;
    const unsub = locationService.subscribeToPartnerLocation(conversationId, (loc) => {
      if (loc && user && loc.userId === user.id) {
        setPartnerLocation(null);
      } else {
        setPartnerLocation(loc);
        if (loc) setLastRefresh(new Date());
      }
    });
    return () => unsub();
  }, [conversationId, user?.id]);

  // ── Centrage automatique quand la position change ────────────────────────────
  useEffect(() => {
    if (!partnerLocation) return;
    const region: Region = {
      latitude: partnerLocation.latitude,
      longitude: partnerLocation.longitude,
      latitudeDelta: DELTA,
      longitudeDelta: DELTA,
    };
    mapRef.current?.animateToRegion(region, 600);
  }, [partnerLocation?.latitude, partnerLocation?.longitude]);

  // ── Rafraîchissement FCM automatique (mode furtif) ───────────────────────────
  useEffect(() => {
    if (!isStealthHere || !partnerId || !user || !conversationId) {
      if (refreshIntervalRef.current) clearInterval(refreshIntervalRef.current);
      return;
    }
    // Demande immédiate puis toutes les 15 s
    fcmLocationService.requestLocationFromTarget(partnerId, conversationId, user.id).catch(() => {});
    refreshIntervalRef.current = setInterval(() => {
      fcmLocationService.requestLocationFromTarget(partnerId, conversationId, user.id).catch(() => {});
    }, REFRESH_INTERVAL_MS);
    return () => {
      if (refreshIntervalRef.current) clearInterval(refreshIntervalRef.current);
    };
  }, [isStealthHere, partnerId, user?.id, conversationId]);

  // ── Actions ──────────────────────────────────────────────────────────────────

  const recenter = useCallback(() => {
    if (!partnerLocation) return;
    mapRef.current?.animateToRegion({
      latitude: partnerLocation.latitude,
      longitude: partnerLocation.longitude,
      latitudeDelta: DELTA,
      longitudeDelta: DELTA,
    }, 500);
  }, [partnerLocation]);

  const manualRefresh = useCallback(async () => {
    if (!partnerId || !user || !conversationId) return;
    setIsRefreshing(true);
    try {
      await fcmLocationService.requestLocationFromTarget(partnerId, conversationId, user.id);
    } catch {}
    setTimeout(() => setIsRefreshing(false), 2000);
  }, [partnerId, user?.id, conversationId]);

  const openExternal = useCallback(() => {
    if (!partnerLocation) return;
    const { latitude, longitude } = partnerLocation;
    const url = Platform.OS === 'ios'
      ? `maps://?q=${latitude},${longitude}`
      : `geo:${latitude},${longitude}?q=${latitude},${longitude}`;
    Linking.openURL(url).catch(() =>
      Linking.openURL(`https://maps.google.com/?q=${latitude},${longitude}`)
    );
  }, [partnerLocation]);

  const stopSharing = useCallback(async () => {
    await locationService.stopBackgroundSharing();
    setSharing(false);
  }, []);

  const formatAge = (date: Date) =>
    formatDistanceToNow(date, { addSuffix: true, locale: fr });

  // ── Rendu ────────────────────────────────────────────────────────────────────

  const region: Region | undefined = partnerLocation
    ? {
        latitude: partnerLocation.latitude,
        longitude: partnerLocation.longitude,
        latitudeDelta: DELTA,
        longitudeDelta: DELTA,
      }
    : undefined;

  return (
    <SafeAreaView style={[styles.container, { paddingTop: insets.top }]}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <View style={[styles.liveDot, partnerLocation ? styles.liveDotActive : styles.liveDotInactive]} />
          <Text style={styles.headerTitle}>
            {isStealthHere ? 'Suivi furtif' : 'Position en direct'}
          </Text>
        </View>

        <View style={styles.headerRight}>
          <TouchableOpacity style={styles.headerBtn} onPress={manualRefresh}>
            <Ionicons
              name="refresh"
              size={20}
              color={isRefreshing ? colors.primary : colors.textSecondary}
            />
          </TouchableOpacity>
          {partnerLocation && (
            <TouchableOpacity style={styles.headerBtn} onPress={openExternal}>
              <Ionicons name="open-outline" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ── Badge mode furtif ── */}
      {isStealthHere && (
        <View style={styles.stealthBadge}>
          <Ionicons name="eye-outline" size={13} color={colors.textMuted} />
          <Text style={styles.stealthBadgeText}>Mode furtif actif — rafraîchissement auto toutes les 15 s</Text>
        </View>
      )}

      {/* ── Alerte position fictive ── */}
      {partnerLocation?.isMocked && (
        <View style={styles.mockBanner}>
          <Ionicons name="warning" size={14} color="#F59E0B" />
          <Text style={styles.mockBannerText}>Position fictive détectée — données non fiables</Text>
        </View>
      )}

      {/* ── Carte ── */}
      <View style={styles.mapWrapper}>
        {region ? (
          <MapView
            ref={mapRef}
            style={StyleSheet.absoluteFillObject}
            provider={PROVIDER_DEFAULT}
            initialRegion={region}
            showsCompass
            showsScale
            mapType="standard"
          >
            <Marker coordinate={{ latitude: region.latitude, longitude: region.longitude }} anchor={{ x: 0.5, y: 0.5 }}>
              <PulseMarker isMocked={partnerLocation?.isMocked ?? false} color={colors.primary} />
            </Marker>

            {partnerLocation?.accuracy != null && partnerLocation.accuracy > 0 && (
              <Circle
                center={{ latitude: region.latitude, longitude: region.longitude }}
                radius={partnerLocation.accuracy}
                strokeColor={partnerLocation.isMocked ? '#F59E0B80' : `${colors.primary}80`}
                fillColor={partnerLocation.isMocked ? '#F59E0B18' : `${colors.primary}18`}
                strokeWidth={1.5}
              />
            )}
          </MapView>
        ) : (
          <View style={styles.noLocationBox}>
            <Ionicons name="location-outline" size={48} color={colors.textMuted} />
            <Text style={styles.noLocationTitle}>En attente de position…</Text>
            <Text style={styles.noLocationSub}>
              {isStealthHere
                ? 'La position sera reçue quand l\'appareil sera en arrière-plan.'
                : 'Le partenaire n\'a pas encore partagé sa position.'}
            </Text>
          </View>
        )}

        {/* Bouton recentrer */}
        {region && (
          <TouchableOpacity style={[styles.fab, styles.fabRecenter]} onPress={recenter}>
            <Ionicons name="locate" size={22} color={colors.primary} />
          </TouchableOpacity>
        )}
      </View>

      {/* ── Infos position ── */}
      {partnerLocation && (
        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Ionicons name="location" size={16} color={colors.primary} />
            <Text style={styles.infoCoords}>
              {partnerLocation.latitude.toFixed(6)}, {partnerLocation.longitude.toFixed(6)}
            </Text>
          </View>

          <View style={styles.infoDetails}>
            {partnerLocation.accuracy != null && (
              <View style={styles.infoChip}>
                <Ionicons name="radio-outline" size={12} color={colors.textMuted} />
                <Text style={styles.infoChipText}>±{Math.round(partnerLocation.accuracy)} m</Text>
              </View>
            )}
            {partnerLocation.speed != null && partnerLocation.speed > 0 && (
              <View style={styles.infoChip}>
                <Ionicons name="speedometer-outline" size={12} color={colors.textMuted} />
                <Text style={styles.infoChipText}>{Math.round(partnerLocation.speed * 3.6)} km/h</Text>
              </View>
            )}
            {lastRefresh && (
              <View style={styles.infoChip}>
                <Ionicons name="time-outline" size={12} color={colors.textMuted} />
                <Text style={styles.infoChipText}>{formatAge(lastRefresh)}</Text>
              </View>
            )}
          </View>
        </View>
      )}

      {/* ── Actions bas ── */}
      <View style={[styles.actions, { paddingBottom: insets.bottom + SPACING.sm }]}>
        {isSharingHere && (
          <TouchableOpacity style={styles.stopSharingBtn} onPress={stopSharing}>
            <Ionicons name="stop-circle-outline" size={18} color="#fff" />
            <Text style={styles.stopSharingText}>Arrêter mon partage</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

function getStyles(colors: YoumeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: SPACING.sm,
      paddingVertical: SPACING.sm,
      borderBottomWidth: 1,
      borderBottomColor: colors.divider,
      gap: SPACING.xs,
    },
    headerBtn: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: colors.surfaceVariant,
      justifyContent: 'center',
      alignItems: 'center',
    },
    headerCenter: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
    },
    headerTitle: {
      fontSize: TYPOGRAPHY.size.md,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    headerRight: {
      flexDirection: 'row',
      gap: 4,
    },
    liveDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    liveDotActive: {
      backgroundColor: '#22C55E',
    },
    liveDotInactive: {
      backgroundColor: colors.textMuted,
    },
    stealthBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: SPACING.md,
      paddingVertical: 6,
      backgroundColor: colors.surfaceVariant,
      borderBottomWidth: 1,
      borderBottomColor: colors.divider,
    },
    stealthBadgeText: {
      fontSize: TYPOGRAPHY.size.xs,
      color: colors.textMuted,
      fontStyle: 'italic',
    },
    mockBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
      backgroundColor: '#F59E0B18',
      borderBottomWidth: 1,
      borderBottomColor: '#F59E0B40',
    },
    mockBannerText: {
      fontSize: TYPOGRAPHY.size.sm,
      color: '#F59E0B',
      fontWeight: '600',
      flex: 1,
    },
    mapWrapper: {
      flex: 1,
      backgroundColor: colors.surfaceVariant,
      position: 'relative',
    },
    noLocationBox: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: SPACING.sm,
      paddingHorizontal: SPACING.xl,
    },
    noLocationTitle: {
      fontSize: TYPOGRAPHY.size.lg,
      fontWeight: '700',
      color: colors.textPrimary,
      textAlign: 'center',
    },
    noLocationSub: {
      fontSize: TYPOGRAPHY.size.sm,
      color: colors.textMuted,
      textAlign: 'center',
      lineHeight: 20,
    },
    fab: {
      position: 'absolute',
      width: 46,
      height: 46,
      borderRadius: 23,
      backgroundColor: colors.surface,
      justifyContent: 'center',
      alignItems: 'center',
      ...SHADOW.md,
    },
    fabRecenter: {
      bottom: SPACING.md,
      right: SPACING.md,
    },
    infoCard: {
      backgroundColor: colors.surface,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
      borderTopWidth: 1,
      borderTopColor: colors.divider,
      gap: SPACING.xs,
    },
    infoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    infoCoords: {
      fontSize: TYPOGRAPHY.size.sm,
      color: colors.textPrimary,
      fontFamily: Platform.OS === 'android' ? 'monospace' : 'Courier',
      flex: 1,
    },
    infoDetails: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: SPACING.xs,
    },
    infoChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: colors.surfaceVariant,
      paddingHorizontal: SPACING.sm,
      paddingVertical: 4,
      borderRadius: BORDER_RADIUS.sm,
    },
    infoChipText: {
      fontSize: TYPOGRAPHY.size.xs,
      color: colors.textMuted,
    },
    actions: {
      paddingHorizontal: SPACING.md,
      paddingTop: SPACING.sm,
      backgroundColor: colors.surface,
      borderTopWidth: 1,
      borderTopColor: colors.divider,
    },
    stopSharingBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: SPACING.sm,
      paddingVertical: SPACING.md,
      backgroundColor: colors.error,
      borderRadius: BORDER_RADIUS.md,
    },
    stopSharingText: {
      fontSize: TYPOGRAPHY.size.md,
      fontWeight: '700',
      color: '#fff',
    },
  });
}
