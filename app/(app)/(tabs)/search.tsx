/**
 * Onglet Analyse IA — Grille d'incohérences
 */
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ScrollView,
  ActivityIndicator,
  Dimensions,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useYoumeColors, YoumeColors, YOUME_COLORS, SPACING, TYPOGRAPHY, BORDER_RADIUS, SHADOW } from '../../../src/shared/constants/theme';
import { useAuthStore } from '../../../src/presentation/stores/authStore';
import { useUIStore } from '../../../src/presentation/stores/uiStore';
import { useConversationStore } from '../../../src/presentation/stores/conversationStore';
import { Avatar } from '../../../src/presentation/components/common/Avatar';
import { deepAnalysisRepository } from '../../../src/infrastructure/supabase/DeepAnalysisRepository';

const { width: SCREEN_W } = Dimensions.get('window');
const GRID_COLS = 2;
const CELL_GAP = SPACING.sm;
const CELL_SIZE = (SCREEN_W - SPACING.md * 2 - CELL_GAP) / GRID_COLS;

interface InconsistencyFlag {
  id: string;
  type: 'contradiction' | 'changement_version' | 'chronologique' | 'factuel';
  description: string;
  date: string;
  confidence: number;
}

interface MonitoredConversation {
  id: string;
  partnerName: string;
  partnerInitials: string;
  coherenceScore: number;
  flags: InconsistencyFlag[];
  lastAnalyzed: string;
}

const TYPE_LABELS: Record<InconsistencyFlag['type'], string> = {
  contradiction: 'Contradiction',
  changement_version: 'Version modifiée',
  chronologique: 'Chronologie',
  factuel: 'Factuel',
};

const TYPE_COLORS: Record<InconsistencyFlag['type'], string> = {
  contradiction: '#E06A6A',
  changement_version: '#FF8C00',
  chronologique: '#9370DB',
  factuel: '#6495ED',
};

function flagColor(count: number): string {
  if (count === 0) return YOUME_COLORS.coherenceHigh;
  if (count === 1) return YOUME_COLORS.coherenceMedium;
  return YOUME_COLORS.coherenceLow;
}

function ConversationCell({
  item,
  onPress,
  colors,
}: {
  item: MonitoredConversation;
  onPress: (item: MonitoredConversation) => void;
  colors: YoumeColors;
}) {
  const styles = useMemo(() => getStyles(colors), [colors]);
  const flagCount = item.flags.length;
  const isAlert = flagCount >= 2;
  const borderCol = flagColor(flagCount);

  return (
    <TouchableOpacity
      style={[
        styles.cell,
        { borderColor: borderCol },
        isAlert && styles.cellAlert,
      ]}
      onPress={() => onPress(item)}
      activeOpacity={0.75}
    >
      {flagCount > 0 && (
        <View style={[styles.flagBadge, { backgroundColor: borderCol }]}>
          <Ionicons name="warning" size={10} color="#FFF" />
          <Text style={styles.flagBadgeText}>{flagCount}</Text>
        </View>
      )}
      <Avatar displayName={item.partnerName} size={52} showStatus={false} />
      <Text style={styles.cellName} numberOfLines={1}>{item.partnerName}</Text>
      <View style={styles.scoreRow}>
        <View style={[styles.scoreDot, { backgroundColor: borderCol }]} />
        <Text style={[styles.scoreText, { color: borderCol }]}>{item.coherenceScore}%</Text>
      </View>
      <Text style={styles.cellStatus} numberOfLines={1}>
        {isAlert ? '⚠ Analyse requise' : flagCount === 1 ? '1 signal faible' : 'Cohérent'}
      </Text>
    </TouchableOpacity>
  );
}

function InconsistencyModal({
  conversation,
  visible,
  onClose,
  colors,
}: {
  conversation: MonitoredConversation | null;
  visible: boolean;
  onClose: () => void;
  colors: YoumeColors;
}) {
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => getStyles(colors), [colors]);
  if (!conversation) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={onClose} />
        <View style={[styles.modalSheet, { paddingBottom: insets.bottom + SPACING.lg }]}>
          <View style={styles.modalHandle} />
          <View style={styles.modalHeader}>
            <View style={styles.modalTitleRow}>
              <Ionicons name="warning" size={20} color={colors.error} />
              <Text style={styles.modalTitle}>Incohérences — {conversation.partnerName}</Text>
            </View>
            <Text style={styles.modalSubtitle}>
              Analyse IA Gemini · {conversation.flags.length} incohérence
              {conversation.flags.length > 1 ? 's' : ''} détectée
              {conversation.flags.length > 1 ? 's' : ''}
            </Text>
          </View>
          <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
            {conversation.flags.map((flag) => (
              <View key={flag.id} style={styles.flagCard}>
                <View style={styles.flagCardHeader}>
                  <View style={[styles.flagTypeBadge, { backgroundColor: `${TYPE_COLORS[flag.type]}22` }]}>
                    <Text style={[styles.flagTypeText, { color: TYPE_COLORS[flag.type] }]}>
                      {TYPE_LABELS[flag.type]}
                    </Text>
                  </View>
                  <Text style={styles.flagDate}>{flag.date}</Text>
                </View>
                <Text style={styles.flagDescription}>{flag.description}</Text>
                <View style={styles.flagFooter}>
                  <Text style={styles.flagConfidence}>Confiance : {flag.confidence}%</Text>
                </View>
              </View>
            ))}
            <View style={styles.geminiNote}>
              <Ionicons name="sparkles" size={14} color={colors.primary} />
              <Text style={styles.geminiNoteText}>
                Analyse finalisée par Gemini AI · Les résultats sont des indicateurs,
                jamais des certitudes. Une vérification manuelle est recommandée.
              </Text>
            </View>
          </ScrollView>
          <View style={styles.modalActions}>
            <TouchableOpacity style={styles.actionIgnore} onPress={onClose}>
              <Text style={styles.actionIgnoreText}>Ignorer</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionReport} onPress={onClose}>
              <Ionicons name="flag" size={16} color="#FFF" />
              <Text style={styles.actionReportText}>Signaler</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default function AIGridScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();
  const { aiEnabled } = useUIStore();
  const { conversations } = useConversationStore();
  const colors = useYoumeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);

  const [selectedConv, setSelectedConv] = useState<MonitoredConversation | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Données réelles issues de l'analyse psychologique profonde Gemini
  // (Edge Function `daily-psychological-analysis`, tournant chaque nuit à
  // minuit heure de Paris — voir migrations 20260720 et 20260721) :
  //  - `incoherences` : contradictions détectées entre deux faits/messages
  //    dans le temps, avec citations exactes et horodatage. Jamais purgées
  //    automatiquement (mémoire longue qui affine le profil au fil du temps).
  //  - `resumes_quotidiens.risque_tromperie_estime` : estimation prudente du
  //    jour, utilisée ici pour la pastille de cohérence tant qu'aucune
  //    incohérence individuelle n'a encore été isolée.
  const [analysisByConv, setAnalysisByConv] = useState<
    Record<string, { coherenceScore: number; flags: InconsistencyFlag[]; lastAnalyzed: string }>
  >({});

  const conversationIdsKey = conversations.map((c) => c.id).join(',');
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        conversations.map(async (conv) => {
          try {
            const [incoherences, resume] = await Promise.all([
              deepAnalysisRepository.fetchIncoherences(conv.id, 10),
              deepAnalysisRepository.fetchLatestSummary(conv.id),
            ]);

            const flags: InconsistencyFlag[] = incoherences.map((inc) => ({
              id: inc.id,
              type: inc.type,
              description: inc.explication,
              date: inc.date2.toLocaleDateString('fr-FR'),
              confidence: inc.gravite === 'élevée' ? 85 : inc.gravite === 'modérée' ? 55 : 30,
            }));

            // Score de cohérence : dérivé du risque estimé par l'analyse du
            // jour si disponible, sinon du nombre/gravité des incohérences
            // connues, sinon 100 (aucun signal détecté pour l'instant).
            const coherenceScore = resume?.risqueTromperieEstime != null
              ? Math.round((1 - resume.risqueTromperieEstime) * 100)
              : flags.length > 0
                ? Math.max(0, 100 - flags.length * 15)
                : 100;

            return [conv.id, {
              coherenceScore,
              flags,
              lastAnalyzed: resume?.date ?? (flags.length > 0 ? 'analyse en cours' : 'jamais'),
            }] as const;
          } catch (err) {
            console.warn('[AIGridScreen] Chargement analyse échoué pour', conv.id, err);
            return [conv.id, { coherenceScore: 100, flags: [] as InconsistencyFlag[], lastAnalyzed: 'jamais' }] as const;
          }
        })
      );
      if (!cancelled) {
        setAnalysisByConv(Object.fromEntries(entries));
      }
    })();
    return () => { cancelled = true; };
  }, [conversationIdsKey]);

  const monitoredConversations: MonitoredConversation[] = useMemo(() => {
    if (!conversations || conversations.length === 0) {
      return [];
    }
    return conversations.map((conv) => {
      const analysis = analysisByConv[conv.id];
      return {
        id: conv.id,
        // FIX : `ConversationWithPartner` n'a jamais eu de champ `partnerName`
        // (le vrai champ est `partnerDisplayName`) — cette page affichait donc
        // systématiquement "Inconnu" pour tout le monde, quel que soit le surnom réel.
        partnerName: conv.partnerDisplayName ?? 'Inconnu',
        partnerInitials: (conv.partnerDisplayName ?? 'IN').slice(0, 2).toUpperCase(),
        coherenceScore: analysis?.coherenceScore ?? 100,
        flags: analysis?.flags ?? [],
        lastAnalyzed: analysis?.lastAnalyzed ?? 'jamais',
      };
    });
  }, [conversations, analysisByConv]);

  const handleCellPress = useCallback((item: MonitoredConversation) => {
    if (item.flags.length >= 2) {
      setSelectedConv(item);
      setModalVisible(true);
    }
  }, []);

  if (!aiEnabled) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Ionicons name="sparkles" size={22} color={colors.primary} />
          <Text style={styles.headerTitle}>Analyse IA</Text>
        </View>
        <View style={styles.disabledContainer}>
          <Ionicons name="sparkles-outline" size={56} color={colors.textMuted} />
          <Text style={styles.disabledTitle}>IA désactivée</Text>
          <Text style={styles.disabledText}>
            Activez l'analyse IA dans les réglages pour surveiller vos conversations.
          </Text>
        </View>
      </View>
    );
  }

  const alertCount = monitoredConversations.filter((c) => c.flags.length >= 2).length;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="sparkles" size={22} color={colors.primary} />
          <Text style={styles.headerTitle}>Analyse IA</Text>
          {alertCount > 0 && (
            <View style={styles.alertBadge}>
              <Text style={styles.alertBadgeText}>{alertCount}</Text>
            </View>
          )}
        </View>
        <Text style={styles.headerSub}>
          {monitoredConversations.length} conversation
          {monitoredConversations.length > 1 ? 's' : ''} surveillée
          {monitoredConversations.length > 1 ? 's' : ''}
        </Text>
      </View>

      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: YOUME_COLORS.coherenceHigh }]} />
          <Text style={styles.legendText}>Cohérent</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: YOUME_COLORS.coherenceMedium }]} />
          <Text style={styles.legendText}>1 signal</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: YOUME_COLORS.coherenceLow }]} />
          <Text style={styles.legendText}>Alerte (2+)</Text>
        </View>
      </View>

      {isLoading ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 60 }} />
      ) : (
        <FlatList
          data={monitoredConversations}
          keyExtractor={(item) => item.id}
          numColumns={GRID_COLS}
          contentContainerStyle={styles.grid}
          columnWrapperStyle={styles.gridRow}
          renderItem={({ item }) => (
            <ConversationCell item={item} onPress={handleCellPress} colors={colors} />
          )}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="chatbubbles-outline" size={48} color={colors.textMuted} />
              <Text style={styles.emptyText}>Aucune conversation surveillée</Text>
            </View>
          }
        />
      )}

      <View style={[styles.footer, { paddingBottom: insets.bottom + SPACING.sm }]}>
        <Ionicons name="information-circle-outline" size={12} color={colors.textMuted} />
        <Text style={styles.footerText}>
          Appuyez sur un bouton rouge (≥2 incohérences) pour voir le rapport
        </Text>
      </View>

      <InconsistencyModal
        conversation={selectedConv}
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        colors={colors}
      />
    </View>
  );
}

function getStyles(colors: YoumeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.md,
      backgroundColor: colors.secondary,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.divider,
    },
    headerLeft: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
    headerTitle: { fontSize: TYPOGRAPHY.size.xl, fontWeight: '700', color: colors.textPrimary },
    headerSub: { fontSize: TYPOGRAPHY.size.xs, color: colors.textMuted },
    alertBadge: {
      backgroundColor: colors.error,
      borderRadius: 8,
      minWidth: 18,
      height: 18,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 4,
    },
    alertBadgeText: { fontSize: 10, color: '#FFF', fontWeight: '700' },
    legend: { flexDirection: 'row', gap: SPACING.md, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    legendDot: { width: 8, height: 8, borderRadius: 4 },
    legendText: { fontSize: TYPOGRAPHY.size.xs, color: colors.textMuted },
    grid: { padding: SPACING.md, paddingBottom: SPACING.xl },
    gridRow: { gap: CELL_GAP, marginBottom: CELL_GAP },
    cell: {
      width: CELL_SIZE,
      height: CELL_SIZE,
      backgroundColor: colors.surface,
      borderRadius: BORDER_RADIUS.lg,
      borderWidth: 2,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      padding: SPACING.sm,
      position: 'relative',
    },
    cellAlert: { ...SHADOW.glow, shadowColor: colors.error },
    flagBadge: {
      position: 'absolute',
      top: 8,
      right: 8,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      borderRadius: 10,
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    flagBadgeText: { fontSize: 10, color: '#FFF', fontWeight: '700' },
    cellName: { fontSize: TYPOGRAPHY.size.sm, fontWeight: '600', color: colors.textPrimary, textAlign: 'center', marginTop: 2 },
    scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    scoreDot: { width: 6, height: 6, borderRadius: 3 },
    scoreText: { fontSize: TYPOGRAPHY.size.xs, fontWeight: '600' },
    cellStatus: { fontSize: 10, color: colors.textMuted, textAlign: 'center' },
    modalOverlay: { flex: 1, justifyContent: 'flex-end' },
    modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)' },
    modalSheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingHorizontal: SPACING.md,
      paddingTop: SPACING.sm,
      maxHeight: '80%',
    },
    modalHandle: {
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.divider,
      alignSelf: 'center',
      marginBottom: SPACING.md,
    },
    modalHeader: { marginBottom: SPACING.md, gap: 4 },
    modalTitleRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
    modalTitle: { fontSize: TYPOGRAPHY.size.lg, fontWeight: '700', color: colors.textPrimary, flex: 1 },
    modalSubtitle: { fontSize: TYPOGRAPHY.size.sm, color: colors.textSecondary },
    modalBody: { flexGrow: 0 },
    flagCard: {
      backgroundColor: colors.surfaceVariant,
      borderRadius: BORDER_RADIUS.md,
      padding: SPACING.md,
      marginBottom: SPACING.sm,
      gap: SPACING.xs,
    },
    flagCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    flagTypeBadge: { borderRadius: BORDER_RADIUS.sm, paddingHorizontal: 8, paddingVertical: 3 },
    flagTypeText: { fontSize: TYPOGRAPHY.size.xs, fontWeight: '700' },
    flagDate: { fontSize: TYPOGRAPHY.size.xs, color: colors.textMuted },
    flagDescription: { fontSize: TYPOGRAPHY.size.sm, color: colors.textSecondary, lineHeight: 20 },
    flagFooter: { flexDirection: 'row', justifyContent: 'flex-end' },
    flagConfidence: { fontSize: TYPOGRAPHY.size.xs, color: colors.textMuted, fontStyle: 'italic' },
    geminiNote: {
      flexDirection: 'row',
      gap: SPACING.xs,
      backgroundColor: `${colors.primary}15`,
      borderRadius: BORDER_RADIUS.md,
      padding: SPACING.sm,
      marginBottom: SPACING.md,
      borderLeftWidth: 3,
      borderLeftColor: colors.primary,
      alignItems: 'flex-start',
    },
    geminiNoteText: { flex: 1, fontSize: TYPOGRAPHY.size.xs, color: colors.textSecondary, lineHeight: 18, fontStyle: 'italic' },
    modalActions: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.sm },
    actionIgnore: {
      flex: 1,
      height: 48,
      justifyContent: 'center',
      alignItems: 'center',
      borderRadius: BORDER_RADIUS.md,
      borderWidth: 1.5,
      borderColor: colors.divider,
    },
    actionIgnoreText: { fontSize: TYPOGRAPHY.size.md, color: colors.textSecondary, fontWeight: '600' },
    actionReport: {
      flex: 1,
      height: 48,
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: SPACING.xs,
      borderRadius: BORDER_RADIUS.md,
      backgroundColor: colors.error,
    },
    actionReportText: { fontSize: TYPOGRAPHY.size.md, color: '#FFF', fontWeight: '600' },
    empty: { alignItems: 'center', paddingTop: 80, gap: SPACING.md },
    emptyText: { fontSize: TYPOGRAPHY.size.md, color: colors.textMuted },
    disabledContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACING.md, paddingHorizontal: SPACING.xl },
    disabledTitle: { fontSize: TYPOGRAPHY.size.xl, fontWeight: '600', color: colors.textSecondary },
    disabledText: { fontSize: TYPOGRAPHY.size.md, color: colors.textMuted, textAlign: 'center' },
    footer: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: SPACING.md, paddingTop: SPACING.sm },
    footerText: { fontSize: 10, color: colors.textMuted, flex: 1 },
  });
          }
