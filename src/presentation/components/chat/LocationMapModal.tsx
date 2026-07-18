/**
 * LocationMapModal
 * Affiche une vraie carte native (react-native-maps) pour une position donnée.
 * Aucune redirection vers l'app Maps — tout reste dans YouMe.
 */
import React, { useRef } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Linking,
  Platform,
} from 'react-native';
import MapView, { Marker, PROVIDER_DEFAULT, Circle } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { YOUME_COLORS, SPACING, TYPOGRAPHY, BORDER_RADIUS } from '@shared/constants/theme';

interface LocationMapModalProps {
  visible: boolean;
  latitude: number;
  longitude: number;
  accuracy?: number;
  label?: string;
  isMocked?: boolean;
  onClose: () => void;
}

const DELTA = 0.004;

export const LocationMapModal: React.FC<LocationMapModalProps> = ({
  visible,
  latitude,
  longitude,
  accuracy,
  label,
  isMocked,
  onClose,
}) => {
  const mapRef = useRef<MapView>(null);

  const region = {
    latitude,
    longitude,
    latitudeDelta: DELTA,
    longitudeDelta: DELTA,
  };

  const openExternal = () => {
    const url = Platform.OS === 'ios'
      ? `maps://?q=${latitude},${longitude}`
      : `geo:${latitude},${longitude}?q=${latitude},${longitude}`;
    Linking.openURL(url).catch(() =>
      Linking.openURL(`https://maps.google.com/?q=${latitude},${longitude}`)
    );
  };

  const recenter = () => {
    mapRef.current?.animateToRegion(region, 500);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.safeArea}>
        {/* En-tête */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.iconBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close" size={22} color={YOUME_COLORS.textPrimary} />
          </TouchableOpacity>

          <View style={styles.titleBlock}>
            <Ionicons
              name="location"
              size={16}
              color={isMocked ? YOUME_COLORS.warning : YOUME_COLORS.locationPin}
            />
            <Text style={styles.title} numberOfLines={1}>
              {label ?? 'Position partagée'}
            </Text>
          </View>

          <TouchableOpacity onPress={openExternal} style={styles.iconBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="open-outline" size={20} color={YOUME_COLORS.primary} />
          </TouchableOpacity>
        </View>

        {/* Badge position fictive */}
        {isMocked && (
          <View style={styles.mockBanner}>
            <Ionicons name="warning" size={14} color={YOUME_COLORS.warning} />
            <Text style={styles.mockBannerText}>
              Position fictive détectée — coordonnées non fiables
            </Text>
          </View>
        )}

        {/* Coordonnées */}
        <View style={styles.coordsBar}>
          <Text style={styles.coordsText}>
            {latitude.toFixed(6)}, {longitude.toFixed(6)}
            {accuracy != null ? `  ·  ±${Math.round(accuracy)} m` : ''}
          </Text>
        </View>

        {/* Carte native */}
        <View style={styles.mapContainer}>
          <MapView
            ref={mapRef}
            style={styles.map}
            provider={PROVIDER_DEFAULT}
            initialRegion={region}
            showsUserLocation={false}
            showsCompass
            showsScale
            mapType="standard"
          >
            <Marker
              coordinate={{ latitude, longitude }}
              title={label ?? 'Position partagée'}
              pinColor={isMocked ? YOUME_COLORS.warning : YOUME_COLORS.locationPin}
            />
            {accuracy != null && accuracy > 0 && (
              <Circle
                center={{ latitude, longitude }}
                radius={accuracy}
                strokeColor={isMocked ? `${YOUME_COLORS.warning}80` : `${YOUME_COLORS.locationPin}80`}
                fillColor={isMocked ? `${YOUME_COLORS.warning}18` : `${YOUME_COLORS.locationPin}18`}
                strokeWidth={1.5}
              />
            )}
          </MapView>

          {/* Bouton recentrer */}
          <TouchableOpacity style={styles.recenterBtn} onPress={recenter}>
            <Ionicons name="locate" size={20} color={YOUME_COLORS.primary} />
          </TouchableOpacity>
        </View>

        {/* Bouton ouvrir dans l'app Maps native (optionnel) */}
        <TouchableOpacity style={styles.openBtn} onPress={openExternal} activeOpacity={0.85}>
          <Ionicons name="navigate-outline" size={18} color="#fff" />
          <Text style={styles.openBtnText}>Ouvrir dans Maps</Text>
        </TouchableOpacity>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: YOUME_COLORS.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: YOUME_COLORS.divider,
    gap: SPACING.sm,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: YOUME_COLORS.surfaceVariant,
    justifyContent: 'center',
    alignItems: 'center',
  },
  titleBlock: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  title: {
    fontSize: TYPOGRAPHY.size.md,
    fontWeight: '700',
    color: YOUME_COLORS.textPrimary,
    flex: 1,
  },
  mockBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    backgroundColor: `${YOUME_COLORS.warning}18`,
    borderBottomWidth: 1,
    borderBottomColor: `${YOUME_COLORS.warning}40`,
  },
  mockBannerText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: YOUME_COLORS.warning,
    fontWeight: '600',
    flex: 1,
  },
  coordsBar: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    backgroundColor: YOUME_COLORS.surfaceVariant,
  },
  coordsText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: YOUME_COLORS.textMuted,
    fontFamily: Platform.OS === 'android' ? 'monospace' : 'Courier',
    textAlign: 'center',
  },
  mapContainer: {
    flex: 1,
    position: 'relative',
  },
  map: {
    flex: 1,
  },
  recenterBtn: {
    position: 'absolute',
    bottom: SPACING.md,
    right: SPACING.md,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: YOUME_COLORS.surface,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
  },
  openBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    margin: SPACING.md,
    paddingVertical: SPACING.md,
    backgroundColor: YOUME_COLORS.primary,
    borderRadius: BORDER_RADIUS.lg,
  },
  openBtnText: {
    fontSize: TYPOGRAPHY.size.md,
    fontWeight: '700',
    color: '#fff',
  },
});
