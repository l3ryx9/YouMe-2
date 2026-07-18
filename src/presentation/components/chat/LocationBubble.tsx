/**
 * Bulle de message — Localisation
 * Affiche une position partagée dans le fil de chat.
 * Tap → carte Google Maps intégrée (LocationMapModal).
 */
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import MapView, { Marker, Circle, PROVIDER_GOOGLE } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { YOUME_COLORS, SPACING, BORDER_RADIUS, TYPOGRAPHY } from '@shared/constants/theme';
import { formatMessageTime } from '@shared/utils/dateUtils';
import { LocationMapModal } from './LocationMapModal';
import type { LocationData } from '@domain/entities/Message';

interface LocationBubbleProps {
  locationData: LocationData;
  isOwn: boolean;
  createdAt: Date;
  isMocked?: boolean;
}

export const LocationBubble: React.FC<LocationBubbleProps> = ({
  locationData, isOwn, createdAt,
}) => {
  const { latitude, longitude, accuracy, isMocked } = locationData;
  const [mapVisible, setMapVisible] = useState(false);

  const formatCoord = (n: number, decimals = 5) => n.toFixed(decimals);

  return (
    <>
      <View style={[styles.container, isOwn ? styles.ownContainer : styles.otherContainer]}>
        <TouchableOpacity style={styles.card} onPress={() => setMapVisible(true)} activeOpacity={0.8}>
          {/* En-tête */}
          <View style={styles.header}>
            <View style={[styles.iconBg, isMocked && styles.iconBgMocked]}>
              <Ionicons
                name="location"
                size={20}
                color={isMocked ? YOUME_COLORS.warning : YOUME_COLORS.locationPin}
              />
            </View>
            <View style={styles.headerText}>
              <Text style={styles.title}>Position partagée</Text>
              {isMocked && (
                <View style={styles.mockBadge}>
                  <Ionicons name="warning" size={10} color={YOUME_COLORS.warning} />
                  <Text style={styles.mockText}>Position fictive détectée</Text>
                </View>
              )}
            </View>
          </View>

          {/* Mini carte Google Maps */}
          <MapView
            provider={PROVIDER_GOOGLE}
            style={styles.miniMap}
            region={{
              latitude,
              longitude,
              latitudeDelta: 0.003,
              longitudeDelta: 0.003,
            }}
            scrollEnabled={false}
            zoomEnabled={false}
            rotateEnabled={false}
            pitchEnabled={false}
            pointerEvents="none"
          >
            <Marker coordinate={{ latitude, longitude }} />
            {accuracy != null && (
              <Circle
                center={{ latitude, longitude }}
                radius={accuracy}
                strokeColor={isMocked ? YOUME_COLORS.warning : YOUME_COLORS.primary}
                fillColor={isMocked ? `${YOUME_COLORS.warning}22` : `${YOUME_COLORS.primary}22`}
              />
            )}
          </MapView>

          {/* Bouton ouvrir carte */}
          <View style={styles.footer}>
            <Ionicons name="map" size={12} color={YOUME_COLORS.primary} />
            <Text style={styles.openMap}>Voir sur la carte</Text>
          </View>
        </TouchableOpacity>

        {/* Heure */}
        <Text style={[styles.time, isOwn ? styles.timeOwn : styles.timeOther]}>
          {formatMessageTime(createdAt)}
        </Text>
      </View>

      <LocationMapModal
        visible={mapVisible}
        latitude={latitude}
        longitude={longitude}
        accuracy={accuracy}
        isMocked={isMocked}
        label="Position partagée"
        onClose={() => setMapVisible(false)}
      />
    </>
  );
};

const styles = StyleSheet.create({
  container: { maxWidth: '80%', marginVertical: 2 },
  ownContainer: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  otherContainer: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  card: {
    backgroundColor: YOUME_COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: YOUME_COLORS.divider,
    minWidth: 220,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm },
  iconBg: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: `${YOUME_COLORS.locationPin}22`,
    justifyContent: 'center', alignItems: 'center',
  },
  iconBgMocked: { backgroundColor: `${YOUME_COLORS.warning}22` },
  headerText: { flex: 1 },
  title: { fontSize: TYPOGRAPHY.size.sm, fontWeight: '700', color: YOUME_COLORS.textPrimary },
  mockBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  mockText: { fontSize: TYPOGRAPHY.size.xs, color: YOUME_COLORS.warning },
  miniMap: {
    width: '100%',
    height: 120,
    borderRadius: BORDER_RADIUS.md,
    overflow: 'hidden',
    marginBottom: SPACING.sm,
  },
  footer: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingTop: SPACING.sm, borderTopWidth: 1, borderTopColor: YOUME_COLORS.divider,
  },
  openMap: { fontSize: TYPOGRAPHY.size.sm, color: YOUME_COLORS.primary, fontWeight: '600' },
  time: { fontSize: TYPOGRAPHY.size.xs, color: YOUME_COLORS.textMuted, marginTop: 3 },
  timeOwn: { textAlign: 'right' },
  timeOther: { textAlign: 'left' },
});
