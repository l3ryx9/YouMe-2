/**
 * Écran Journal d'erreurs
 */
import React, { useEffect, useState, useMemo } from 'react';
import { themedAlert } from '@presentation/components/common/ThemedAlert';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Share,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useYoumeColors, YoumeColors, YOUME_COLORS, SPACING, TYPOGRAPHY, BORDER_RADIUS } from '../src/shared/constants/theme';
import { getLogs, subscribeToLogs, clearLogs, type AppLogEntry } from '../src/shared/utils/logger';

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatLogForShare(l: AppLogEntry): string {
  const base = '[' + formatTimestamp(l.timestamp) + '] ' + l.context + ' — (' + l.code + ') ' + l.message;
  return l.stack ? base + '\n' + l.stack : base;
}

export default function DebugLogsScreen() {
  const [logs, setLogs] = useState<AppLogEntry[]>(getLogs());
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const colors = useYoumeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);

  useEffect(() => {
    const unsubscribe = subscribeToLogs(setLogs);
    return unsubscribe;
  }, []);

  const toggleExpanded = (index: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const handleShare = async () => {
    if (logs.length === 0) return;
    const text = logs.map(formatLogForShare).join('\n\n');
    await Share.share({ title: "Journal d'erreurs — YouMe V2", message: text });
  };

  const handleClear = () => {
    themedAlert.alert(
      'Vider le journal',
      'Voulez-vous effacer toutes les erreurs enregistrées ?',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Effacer', style: 'destructive', onPress: () => clearLogs() },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Journal d'erreurs</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={handleShare} style={styles.headerButton} disabled={logs.length === 0}>
            <Ionicons
              name="share-outline"
              size={22}
              color={logs.length === 0 ? colors.textMuted : colors.primary}
            />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleClear} style={styles.headerButton} disabled={logs.length === 0}>
            <Ionicons
              name="trash-outline"
              size={22}
              color={logs.length === 0 ? colors.textMuted : colors.error}
            />
          </TouchableOpacity>
        </View>
      </View>

      {logs.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="checkmark-circle-outline" size={56} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>Aucune erreur enregistrée</Text>
          <Text style={styles.emptyDesc}>
            Tous les problèmes rencontrés pendant l'utilisation de l'application (connexion, réseau,
            plantages, etc.) apparaîtront ici avec leur code technique et leur détail complet.
          </Text>
        </View>
      ) : (
        <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
          {logs.map((log, index) => (
            <TouchableOpacity
              key={log.timestamp + '-' + index}
              style={styles.logCard}
              activeOpacity={log.stack ? 0.7 : 1}
              onPress={() => log.stack && toggleExpanded(index)}
            >
              <View style={styles.logHeader}>
                <Text style={styles.logContext}>{log.context}</Text>
                <Text style={styles.logTime}>{formatTimestamp(log.timestamp)}</Text>
              </View>
              <Text style={styles.logCode}>{log.code}</Text>
              <Text style={styles.logMessage}>{log.message}</Text>
              {log.stack && (
                <View style={styles.detailsToggle}>
                  <Text style={styles.detailsToggleText}>
                    {expanded.has(index) ? 'Masquer les détails techniques' : 'Voir les détails techniques'}
                  </Text>
                  <Ionicons
                    name={expanded.has(index) ? 'chevron-up' : 'chevron-down'}
                    size={14}
                    color={colors.primary}
                  />
                </View>
              )}
              {log.stack && expanded.has(index) && (
                <Text style={styles.logStack}>{log.stack}</Text>
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function getStyles(colors: YoumeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingTop: 48,
      paddingBottom: SPACING.sm,
      paddingHorizontal: SPACING.md,
      backgroundColor: colors.secondary,
      gap: SPACING.sm,
    },
    backButton: { padding: 4 },
    headerTitle: { flex: 1, fontSize: TYPOGRAPHY.size.lg, fontWeight: '700', color: colors.textPrimary },
    headerActions: { flexDirection: 'row', gap: SPACING.sm },
    headerButton: { padding: 4 },
    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACING.xl, gap: SPACING.sm },
    emptyTitle: { fontSize: TYPOGRAPHY.size.md, fontWeight: '600', color: colors.textSecondary },
    emptyDesc: { fontSize: TYPOGRAPHY.size.sm, color: colors.textMuted, textAlign: 'center', lineHeight: 18 },
    list: { flex: 1 },
    listContent: { padding: SPACING.md, gap: SPACING.sm },
    logCard: {
      backgroundColor: colors.surface,
      borderRadius: BORDER_RADIUS.lg,
      padding: SPACING.md,
      marginBottom: SPACING.sm,
      borderLeftWidth: 3,
      borderLeftColor: YOUME_COLORS.error,
    },
    logHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
    logContext: { fontSize: TYPOGRAPHY.size.sm, fontWeight: '700', color: colors.textPrimary },
    logTime: { fontSize: TYPOGRAPHY.size.xs, color: colors.textMuted },
    logCode: {
      fontSize: TYPOGRAPHY.size.xs,
      fontWeight: '600',
      color: colors.primary,
      fontFamily: 'monospace',
      marginBottom: 4,
    },
    logMessage: { fontSize: TYPOGRAPHY.size.sm, color: colors.textSecondary, lineHeight: 18 },
    detailsToggle: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: SPACING.sm },
    detailsToggleText: { fontSize: TYPOGRAPHY.size.xs, fontWeight: '600', color: colors.primary },
    logStack: { fontSize: TYPOGRAPHY.size.xs, color: colors.textMuted, fontFamily: 'monospace', marginTop: SPACING.sm, lineHeight: 16 },
  });
}
