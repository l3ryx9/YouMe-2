/**
 * Popup (fenêtre) listant les red flags / green flags de la conversation,
 * ouvert depuis le bouton-jauge du header du chat. Contrairement à
 * l'ancien comportement (navigation plein écran vers /flags/[id]), ce
 * composant s'affiche par-dessus le chat pour un accès rapide.
 *
 * Source de vérité : Supabase (`comportements` + `scores_relationnels`, via
 * FlagsRepository) — la liste est donc bien celle qui sera purgée chaque
 * nuit à minuit (heure de Paris), y compris côté serveur, tandis que la
 * jauge (scores) persiste dans le temps.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, Modal, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { YoumeColors, SPACING, TYPOGRAPHY, BORDER_RADIUS } from '@shared/constants/theme';
import type { RelationshipFlag } from '@domain/entities/Memory';
import type { FlagsGaugeEtListe } from '@infrastructure/supabase/FlagsRepository';

const SEVERITY_COLOR: Record<string, string> = {
  faible: '#9CA36B',
  modéré: '#D2A24C',
  élevé: '#C0552F',
};

function FlagCard({ flag, colors }: { flag: RelationshipFlag; colors: YoumeColors }) {
  const styles = useMemo(() => getStyles(colors), [colors]);
  const isRed = flag.type === 'red';
  const color = isRed ? colors.error : colors.success;
  const sevColor = SEVERITY_COLOR[flag.severity] ?? colors.textSecondary;
  return (
    <View style={[styles.flagCard, { borderLeftColor: color }]}>
      <View style={styles.flagTop}>
        <Ionicons name={isRed ? 'alert-circle' : 'checkmark-circle'} size={16} color={color} />
        <Text style={[styles.flagCategory, { color }]}>{flag.category}</Text>
        <View style={[styles.sevBadge, { backgroundColor: `${sevColor}22`, borderColor: sevColor }]}>
          <Text style={[styles.sevText, { color: sevColor }]}>{flag.severity}</Text>
        </View>
      </View>
      {flag.citation ? (
        <View style={styles.citationBox}>
          <Text style={styles.citationText}>« {flag.citation} »</Text>
        </View>
      ) : null}
      {flag.explanation ? <Text style={styles.explanation}>{flag.explanation}</Text> : null}
    </View>
  );
}

interface FlagsListModalProps {
  visible: boolean;
  onClose: () => void;
  colors: YoumeColors;
  loading: boolean;
  data: FlagsGaugeEtListe | null;
  onRefresh: () => void;
  refreshing: boolean;
  partnerName: string;
}

export function FlagsListModal({
  visible,
  onClose,
  colors,
  loading,
  data,
  onRefresh,
  refreshing,
  partnerName,
}: FlagsListModalProps) {
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const [tab, setTab] = useState<'red' | 'green'>('red');

  const redFlags = data?.flags.filter((f) => f.type === 'red') ?? [];
  const greenFlags = data?.flags.filter((f) => f.type === 'green') ?? [];
  const activeFlags = tab === 'red' ? redFlags : greenFlags;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + SPACING.lg, maxHeight: '82%' }]}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <Ionicons name="flag" size={18} color={colors.primary} />
              <Text style={styles.title}>Signaux relationnels</Text>
            </View>
            <TouchableOpacity onPress={onRefresh} disabled={refreshing} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              {refreshing ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Ionicons name="refresh" size={20} color={colors.primary} />
              )}
            </TouchableOpacity>
          </View>
          <Text style={styles.subtitle}>Avec {partnerName} · mis à jour tous les 20 messages</Text>

          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : (
            <>
              <View style={styles.gaugeRow}>
                <View style={styles.gaugeBlock}>
                  <Text style={styles.gaugeLabel}>✅ Green flags</Text>
                  <Text style={[styles.gaugeValue, { color: colors.success }]}>{data?.greenScore ?? 70}/100</Text>
                </View>
                <View style={styles.gaugeBlock}>
                  <Text style={styles.gaugeLabel}>🚩 Red flags</Text>
                  <Text style={[styles.gaugeValue, { color: colors.error }]}>{data?.redScore ?? 70}/100</Text>
                </View>
              </View>

              {data?.resume ? (
                <View style={styles.summaryBox}>
                  <Text style={styles.summaryText}>{data.resume}</Text>
                </View>
              ) : null}

              <View style={styles.tabs}>
                <TouchableOpacity style={[styles.tab, tab === 'red' && styles.tabActiveRed]} onPress={() => setTab('red')}>
                  <Text style={[styles.tabText, tab === 'red' && { color: colors.error }]}>🚩 Red ({redFlags.length})</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.tab, tab === 'green' && styles.tabActiveGreen]} onPress={() => setTab('green')}>
                  <Text style={[styles.tabText, tab === 'green' && { color: colors.success }]}>✅ Green ({greenFlags.length})</Text>
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
                {activeFlags.length === 0 ? (
                  <Text style={styles.emptyText}>
                    {tab === 'red'
                      ? 'Aucun signal d\'alerte affiché pour le moment.'
                      : 'Aucun signal positif affiché pour le moment.'}
                  </Text>
                ) : (
                  activeFlags.map((flag, i) => <FlagCard key={`${tab}-${i}`} flag={flag} colors={colors} />)
                )}
                <Text style={styles.footerNote}>
                  Cette liste est réinitialisée chaque nuit ; la jauge ci-dessus, elle, reste enregistrée.
                </Text>
              </ScrollView>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

function getStyles(colors: YoumeColors) {
  return StyleSheet.create({
    overlay: { flex: 1, justifyContent: 'flex-end' },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: SPACING.lg,
    },
    handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.divider, alignSelf: 'center', marginBottom: SPACING.md },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
    title: { fontSize: TYPOGRAPHY.size.lg, fontWeight: '700', color: colors.textPrimary },
    subtitle: { fontSize: TYPOGRAPHY.size.xs, color: colors.textMuted, marginTop: 4, marginBottom: SPACING.md },
    loadingBox: { paddingVertical: SPACING.xl, alignItems: 'center' },
    gaugeRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.md },
    gaugeBlock: { flex: 1, backgroundColor: colors.surfaceVariant, borderRadius: BORDER_RADIUS.md, padding: SPACING.sm, alignItems: 'center' },
    gaugeLabel: { fontSize: TYPOGRAPHY.size.xs, color: colors.textSecondary },
    gaugeValue: { fontSize: TYPOGRAPHY.size.lg, fontWeight: '700', marginTop: 2 },
    summaryBox: { backgroundColor: colors.surfaceVariant, borderRadius: BORDER_RADIUS.md, padding: SPACING.sm, marginBottom: SPACING.md },
    summaryText: { color: colors.textPrimary, fontSize: TYPOGRAPHY.size.sm, lineHeight: 19 },
    tabs: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.sm },
    tab: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: SPACING.sm,
      borderRadius: BORDER_RADIUS.md,
      backgroundColor: colors.surfaceVariant,
      borderWidth: 1,
      borderColor: 'transparent',
    },
    tabActiveRed: { borderColor: colors.error, backgroundColor: `${colors.error}14` },
    tabActiveGreen: { borderColor: colors.success, backgroundColor: `${colors.success}14` },
    tabText: { color: colors.textSecondary, fontWeight: '600', fontSize: TYPOGRAPHY.size.sm },
    list: { flexGrow: 0 },
    emptyText: { color: colors.textSecondary, fontSize: TYPOGRAPHY.size.sm, textAlign: 'center', marginTop: SPACING.lg, fontStyle: 'italic' },
    flagCard: { backgroundColor: colors.surfaceVariant, borderRadius: BORDER_RADIUS.md, borderLeftWidth: 4, padding: SPACING.sm, marginBottom: SPACING.sm },
    flagTop: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, flexWrap: 'wrap' },
    flagCategory: { fontWeight: '700', fontSize: TYPOGRAPHY.size.sm },
    sevBadge: { borderRadius: 6, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 1 },
    sevText: { fontSize: TYPOGRAPHY.size.xs, fontWeight: '600', textTransform: 'capitalize' },
    citationBox: { backgroundColor: colors.surface, borderRadius: BORDER_RADIUS.sm, padding: SPACING.xs, marginTop: SPACING.xs },
    citationText: { color: colors.textPrimary, fontSize: TYPOGRAPHY.size.sm, fontStyle: 'italic' },
    explanation: { color: colors.textSecondary, fontSize: TYPOGRAPHY.size.xs, lineHeight: 17, marginTop: SPACING.xs },
    footerNote: { color: colors.textMuted, fontSize: TYPOGRAPHY.size.xs, textAlign: 'center', marginTop: SPACING.sm, marginBottom: SPACING.md, fontStyle: 'italic' },
  });
}
