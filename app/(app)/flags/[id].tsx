/**
 * Écran Signaux relationnels — Red Flags / Green Flags (Gemini)
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useYoumeColors, YoumeColors, YOUME_COLORS, SPACING, TYPOGRAPHY, BORDER_RADIUS } from '../../../src/shared/constants/theme';
import { useAuthStore } from '../../../src/presentation/stores/authStore';
import { useConversationStore } from '../../../src/presentation/stores/conversationStore';
import { geminiFlagModule } from '../../../src/infrastructure/gemini/GeminiFlagAnalysis';
import { flagsRepository } from '../../../src/infrastructure/supabase/FlagsRepository';
import type { RelationshipFlag } from '../../../src/domain/entities/Memory';

const SEVERITY_COLOR: Record<string, string> = {
  faible: '#9CA36B',
  modéré: '#D2A24C',
  élevé: '#C0552F',
};

function FlagGauge({
  score,
  type,
  isDefault,
  colors,
}: {
  score: number;
  type: 'red' | 'green';
  isDefault: boolean;
  colors: YoumeColors;
}) {
  const isGreen  = type === 'green';
  const barColor = isGreen
    ? (score >= 70 ? colors.success : score >= 45 ? '#D2A24C' : colors.error)
    : (score >= 70 ? colors.success : score >= 45 ? '#D2A24C' : colors.error);

  const label = isDefault
    ? 'Démarrage — lancer l\'analyse pour affiner'
    : score >= 70 ? 'Bonne situation' : score >= 45 ? 'À surveiller' : 'Préoccupant';

  const styles = useMemo(() => getStyles(colors), [colors]);

  return (
    <View style={[styles.gauge, { marginTop: SPACING.sm }]}>
      <View style={styles.gaugeHeader}>
        <Text style={styles.gaugeTitle}>
          {isGreen ? '✅ Green Flags' : '🚩 Red Flags'}
        </Text>
        <Text style={[styles.gaugeScore, { color: barColor }]}>{score}/100</Text>
      </View>
      <View style={styles.gaugeTrack}>
        <View style={[styles.gaugeFill, { width: `${Math.max(0, Math.min(100, score))}%`, backgroundColor: barColor }]} />
      </View>
      <Text style={[styles.gaugeLabel, { color: barColor }]}>{label}</Text>
    </View>
  );
}

function FlagCard({ flag, colors }: { flag: RelationshipFlag; colors: YoumeColors }) {
  const styles = useMemo(() => getStyles(colors), [colors]);
  const isRed = flag.type === 'red';
  const color = isRed ? colors.error : colors.success;
  const sevColor = SEVERITY_COLOR[flag.severity] ?? colors.textSecondary;
  return (
    <View style={[styles.flagCard, { borderLeftColor: color }]}>
      <View style={styles.flagTop}>
        <Ionicons name={isRed ? 'alert-circle' : 'checkmark-circle'} size={18} color={color} />
        <Text style={[styles.flagCategory, { color }]}>{flag.category}</Text>
        <View style={[styles.sevBadge, { backgroundColor: `${sevColor}22`, borderColor: sevColor }]}>
          <Text style={[styles.sevText, { color: sevColor }]}>{flag.severity}</Text>
        </View>
        {flag.sender ? <Text style={styles.flagSender}>· {flag.sender}</Text> : null}
      </View>
      <View style={styles.citationBox}>
        <Text style={styles.citationText}>« {flag.citation} »</Text>
      </View>
      {flag.explanation ? <Text style={styles.explanation}>{flag.explanation}</Text> : null}
      <Text style={styles.confidence}>Confiance : {Math.round(flag.confidence * 100)}%</Text>
    </View>
  );
}

export default function FlagsScreen() {
  const { id: conversationId } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuthStore();
  const { messages, conversations } = useConversationStore();
  const colors = useYoumeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);

  // Source de vérité : Supabase (comportements + scores_relationnels), la
  // même que le popup ouvert depuis le header du chat — cet écran plein
  // écran affiche donc exactement les mêmes données, purgées chaque nuit.
  const [greenScore, setGreenScore] = useState(70);
  const [redScore, setRedScore] = useState(70);
  const [summary, setSummary] = useState<string | null>(null);
  const [flags, setFlags] = useState<RelationshipFlag[]>([]);
  const [hasAnyData, setHasAnyData] = useState(false);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<'red' | 'green'>('red');
  const [error, setError] = useState<string | null>(null);

  const convMessages = useMemo(() => messages[conversationId ?? ''] ?? [], [messages, conversationId]);
  const partner = useMemo(() => conversations.find((c) => c.id === conversationId), [conversations, conversationId]);

  const chargerDepuisSupabase = useCallback(async () => {
    if (!conversationId) return;
    const data = await flagsRepository.fetchCurrent(conversationId);
    setGreenScore(data.greenScore);
    setRedScore(data.redScore);
    setSummary(data.resume);
    setFlags(data.flags);
    setHasAnyData(data.updatedAt !== null);
  }, [conversationId]);

  useEffect(() => {
    chargerDepuisSupabase().catch(() => {});
  }, [chargerDepuisSupabase]);

  const handleAnalyze = useCallback(async () => {
    if (!user || !conversationId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await geminiFlagModule.analyzeFlags(convMessages, user.id, partner?.partnerDisplayName ?? 'votre partenaire');
      if (!res) {
        setError('Pas assez de messages exploitables pour une analyse fiable (5 minimum).');
        return;
      }
      await flagsRepository.persistAnalysis(conversationId, res, user.id, partner?.partnerId ?? null);
      await chargerDepuisSupabase();
    } catch (e: any) {
      setError(e?.message ?? 'Erreur pendant l\'analyse.');
    } finally {
      setLoading(false);
    }
  }, [user, conversationId, convMessages, partner, chargerDepuisSupabase]);

  const activeFlags = flags.filter((f) => f.type === tab);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scroll}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Ionicons name="flag" size={18} color={colors.primary} />
        <Text style={styles.headerTitle}>Signaux relationnels</Text>
      </View>

      {partner && <Text style={styles.partnerLine}>Avec {partner.partnerDisplayName}</Text>}

      <View style={styles.disclaimer}>
        <Ionicons name="information-circle-outline" size={16} color={colors.textSecondary} />
        <Text style={styles.disclaimerText}>
          Analyse probabiliste et non accusatoire. Les citations sont des faits ; les explications sont des hypothèses, pas des preuves.
        </Text>
      </View>

      <TouchableOpacity
        style={[styles.analyzeBtn, loading && styles.analyzeBtnDisabled]}
        onPress={handleAnalyze}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <Ionicons name="sparkles" size={18} color="#fff" />
            <Text style={styles.analyzeBtnText}>{hasAnyData ? 'Relancer l\'analyse' : 'Analyser la conversation'}</Text>
          </>
        )}
      </TouchableOpacity>

      {error && <Text style={styles.errorText}>{error}</Text>}

      {/* Jauges toujours visibles — 70% par défaut, mises à jour après analyse. La jauge
          n'est jamais réinitialisée par la purge quotidienne (contrairement à la liste ci-dessous). */}
      <FlagGauge score={greenScore} type="green" isDefault={!hasAnyData} colors={colors} />
      <FlagGauge score={redScore}   type="red"   isDefault={!hasAnyData} colors={colors} />

      {hasAnyData && (
        <>
          {summary ? (
            <View style={styles.summaryBox}>
              <Text style={styles.summaryText}>{summary}</Text>
            </View>
          ) : null}

          <View style={styles.tabs}>
            <TouchableOpacity style={[styles.tab, tab === 'red' && styles.tabActiveRed]} onPress={() => setTab('red')}>
              <Text style={[styles.tabText, tab === 'red' && { color: colors.error }]}>
                🚩 Red flags ({flags.filter((f) => f.type === 'red').length})
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.tab, tab === 'green' && styles.tabActiveGreen]} onPress={() => setTab('green')}>
              <Text style={[styles.tabText, tab === 'green' && { color: colors.success }]}>
                ✅ Green flags ({flags.filter((f) => f.type === 'green').length})
              </Text>
            </TouchableOpacity>
          </View>

          {activeFlags.length === 0 ? (
            <Text style={styles.emptyText}>
              {tab === 'red'
                ? 'Aucun signal d\'alerte affiché pour le moment (liste réinitialisée chaque nuit).'
                : 'Aucun signal positif affiché pour le moment (liste réinitialisée chaque nuit).'}
            </Text>
          ) : (
            activeFlags.map((flag, i) => <FlagCard key={`${tab}-${i}`} flag={flag} colors={colors} />)
          )}
        </>
      )}
    </ScrollView>
  );
}

function getStyles(colors: YoumeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    scroll: { padding: SPACING.lg, paddingBottom: SPACING.xxl },
    header: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
    headerTitle: { fontSize: TYPOGRAPHY.size.lg, fontWeight: '700', color: colors.textPrimary },
    partnerLine: { color: colors.textSecondary, fontSize: TYPOGRAPHY.size.sm, marginTop: SPACING.xs, marginLeft: 32 },
    disclaimer: {
      flexDirection: 'row',
      gap: SPACING.xs,
      backgroundColor: colors.surface,
      borderRadius: BORDER_RADIUS.md,
      padding: SPACING.md,
      marginTop: SPACING.md,
    },
    disclaimerText: { flex: 1, color: colors.textSecondary, fontSize: TYPOGRAPHY.size.xs, lineHeight: 17 },
    warnBox: { backgroundColor: '#3A2A12', borderRadius: BORDER_RADIUS.md, padding: SPACING.md, marginTop: SPACING.md, borderWidth: 1, borderColor: '#7A5A1E' },
    warnText: { color: '#E8C99B', fontSize: TYPOGRAPHY.size.sm, lineHeight: 18 },
    analyzeBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: SPACING.sm,
      backgroundColor: colors.primary,
      borderRadius: BORDER_RADIUS.md,
      height: 50,
      marginTop: SPACING.lg,
    },
    analyzeBtnDisabled: { opacity: 0.5 },
    analyzeBtnText: { color: '#fff', fontSize: TYPOGRAPHY.size.md, fontWeight: '600' },
    errorText: { color: colors.error, fontSize: TYPOGRAPHY.size.sm, marginTop: SPACING.md },
    gauge: { backgroundColor: colors.surface, borderRadius: BORDER_RADIUS.md, padding: SPACING.md, marginTop: SPACING.lg },
    gaugeHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    gaugeTitle: { color: colors.textPrimary, fontWeight: '600', fontSize: TYPOGRAPHY.size.md },
    gaugeScore: { fontWeight: '700', fontSize: TYPOGRAPHY.size.md },
    gaugeTrack: { height: 8, backgroundColor: colors.divider, borderRadius: 4, marginTop: SPACING.sm, overflow: 'hidden' },
    gaugeFill: { height: 8, borderRadius: 4 },
    gaugeLabel: { marginTop: SPACING.xs, fontWeight: '600', fontSize: TYPOGRAPHY.size.sm, textTransform: 'capitalize' },
    summaryBox: { backgroundColor: colors.surfaceVariant, borderRadius: BORDER_RADIUS.md, padding: SPACING.md, marginTop: SPACING.md },
    summaryText: { color: colors.textPrimary, fontSize: TYPOGRAPHY.size.sm, lineHeight: 20 },
    tabs: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.lg },
    tab: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: SPACING.sm,
      borderRadius: BORDER_RADIUS.md,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: 'transparent',
    },
    tabActiveRed: { borderColor: colors.error, backgroundColor: `${colors.error}14` },
    tabActiveGreen: { borderColor: colors.success, backgroundColor: `${colors.success}14` },
    tabText: { color: colors.textSecondary, fontWeight: '600', fontSize: TYPOGRAPHY.size.sm },
    emptyText: { color: colors.textSecondary, fontSize: TYPOGRAPHY.size.sm, textAlign: 'center', marginTop: SPACING.lg, fontStyle: 'italic' },
    flagCard: { backgroundColor: colors.surface, borderRadius: BORDER_RADIUS.md, borderLeftWidth: 4, padding: SPACING.md, marginTop: SPACING.md },
    flagTop: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, flexWrap: 'wrap' },
    flagCategory: { fontWeight: '700', fontSize: TYPOGRAPHY.size.sm },
    sevBadge: { borderRadius: 6, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 1 },
    sevText: { fontSize: TYPOGRAPHY.size.xs, fontWeight: '600', textTransform: 'capitalize' },
    flagSender: { color: colors.textSecondary, fontSize: TYPOGRAPHY.size.xs },
    citationBox: { backgroundColor: colors.surfaceVariant, borderRadius: BORDER_RADIUS.sm, padding: SPACING.sm, marginTop: SPACING.sm },
    citationText: { color: colors.textPrimary, fontSize: TYPOGRAPHY.size.sm, fontStyle: 'italic' },
    explanation: { color: colors.textSecondary, fontSize: TYPOGRAPHY.size.sm, lineHeight: 19, marginTop: SPACING.sm },
    confidence: { color: colors.textMuted, fontSize: TYPOGRAPHY.size.xs, marginTop: SPACING.xs },
    metaText: { color: colors.textMuted, fontSize: TYPOGRAPHY.size.xs, textAlign: 'center', marginTop: SPACING.lg },
  });
}
