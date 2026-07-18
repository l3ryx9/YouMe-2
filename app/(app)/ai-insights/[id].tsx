/**
 * Écran Insights IA
 */
import React, { useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useYoumeColors, YoumeColors, YOUME_COLORS, SPACING, TYPOGRAPHY, BORDER_RADIUS } from '../../../src/shared/constants/theme';
import { useConversationStore } from '../../../src/presentation/stores/conversationStore';
import { getEmotionColor } from '../../../src/shared/utils/emotionColors';
import type { AIAnalysisResult } from '../../../src/domain/entities/Message';

export default function AIInsightsScreen() {
  const { id: messageId } = useLocalSearchParams<{ id: string }>();
  const { messages } = useConversationStore();
  const colors = useYoumeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);

  const message = Object.values(messages).flat().find((m) => m.id === messageId);
  const analysis = message?.aiAnalysis;

  if (!analysis) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Insights IA</Text>
        </View>
        <View style={styles.empty}>
          <Ionicons name="sparkles-outline" size={56} color={colors.textMuted} />
          <Text style={styles.emptyText}>Analyse IA non disponible pour ce message.</Text>
        </View>
      </View>
    );
  }

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scroll}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Ionicons name="sparkles" size={18} color={colors.primary} />
        <Text style={styles.headerTitle}>Insights IA</Text>
      </View>

      <View style={styles.disclaimer}>
        <Ionicons name="information-circle-outline" size={16} color={YOUME_COLORS.warning} />
        <Text style={styles.disclaimerText}>
          Analyse probabiliste — résultats non définitifs. Toujours vérifier manuellement.
        </Text>
      </View>

      {analysis.transcription && (
        <Section title="📝 Transcription Whisper">
          <View style={styles.card}>
            <Text style={styles.transcriptionText}>"{analysis.transcription}"</Text>
            {analysis.language && (
              <Text style={styles.metaText}>
                Langue : {analysis.language} • Durée : {analysis.audioDuration?.toFixed(1)}s
              </Text>
            )}
          </View>
        </Section>
      )}

      <Section title="💭 Analyse Émotionnelle">
        <View style={styles.card}>
          <View style={styles.emotionHeader}>
            <View style={[styles.emotionDot, { backgroundColor: getEmotionColor(analysis.emotions.primary) }]} />
            <Text style={[styles.emotionPrimary, { color: getEmotionColor(analysis.emotions.primary) }]}>
              {analysis.emotions.label}
            </Text>
          </View>
          <Text style={styles.confidenceText}>
            Confiance : {Math.round(analysis.emotions.primaryScore * 100)}%
          </Text>
          {analysis.emotions.secondary.length > 0 && (
            <View style={styles.secondaryEmotions}>
              {analysis.emotions.secondary.map((e) => (
                <View key={e.emotion} style={styles.secondaryChip}>
                  <Text style={styles.secondaryChipText}>
                    {e.emotion} ({Math.round(e.score * 100)}%)
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </Section>

      {analysis.summary && (
        <Section title="📋 Résumé">
          <View style={styles.card}>
            <Text style={styles.summaryText}>{analysis.summary}</Text>
          </View>
        </Section>
      )}

      {analysis.topics && analysis.topics.length > 0 && (
        <Section title="🏷️ Sujets détectés">
          <View style={styles.card}>
            <View style={styles.tagList}>
              {analysis.topics.map((topic) => (
                <View key={topic} style={styles.tag}>
                  <Text style={styles.tagText}>{topic}</Text>
                </View>
              ))}
            </View>
          </View>
        </Section>
      )}

      {analysis.entities && (
        <>
          {analysis.entities.tasks.length > 0 && (
            <Section title="✅ Tâches identifiées">
              {analysis.entities.tasks.map((t, i) => (
                <View key={i} style={styles.entityCard}>
                  <Text style={styles.entityValue}>{t.value}</Text>
                  <Text style={styles.entityCitation}>Citation : "{t.citation}"</Text>
                </View>
              ))}
            </Section>
          )}
          {analysis.entities.persons.length > 0 && (
            <Section title="👤 Personnes mentionnées">
              {analysis.entities.persons.map((p, i) => (
                <View key={i} style={styles.entityCard}>
                  <Text style={styles.entityValue}>{p.value}</Text>
                  <Text style={styles.entityCitation}>"{p.citation}"</Text>
                </View>
              ))}
            </Section>
          )}
        </>
      )}

      <Text style={styles.analysisDate}>
        Analysé le {analysis.processedAt.toLocaleString('fr-FR')}
      </Text>
    </ScrollView>
  );
}

function getStyles(colors: YoumeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    scroll: { paddingBottom: 40 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
      paddingTop: 48,
      paddingBottom: SPACING.sm,
      paddingHorizontal: SPACING.md,
      backgroundColor: colors.secondary,
    },
    headerTitle: { fontSize: TYPOGRAPHY.size.xl, fontWeight: '700', color: colors.textPrimary },
    disclaimer: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: SPACING.xs,
      margin: SPACING.md,
      backgroundColor: `${YOUME_COLORS.warning}22`,
      borderRadius: BORDER_RADIUS.md,
      padding: SPACING.sm,
      borderWidth: 1,
      borderColor: `${YOUME_COLORS.warning}44`,
    },
    disclaimerText: { flex: 1, fontSize: TYPOGRAPHY.size.xs, color: YOUME_COLORS.warning, lineHeight: 18 },
    section: { marginHorizontal: SPACING.md, marginBottom: SPACING.md },
    sectionTitle: { fontSize: TYPOGRAPHY.size.sm, fontWeight: '700', color: colors.textSecondary, marginBottom: SPACING.xs },
    card: {
      backgroundColor: colors.surface,
      borderRadius: BORDER_RADIUS.lg,
      padding: SPACING.md,
      gap: SPACING.xs,
    },
    transcriptionText: { fontSize: TYPOGRAPHY.size.md, color: colors.textPrimary, fontStyle: 'italic', lineHeight: 22 },
    metaText: { fontSize: TYPOGRAPHY.size.xs, color: colors.textMuted },
    emotionHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
    emotionDot: { width: 12, height: 12, borderRadius: 6 },
    emotionPrimary: { fontSize: TYPOGRAPHY.size.lg, fontWeight: '600' },
    confidenceText: { fontSize: TYPOGRAPHY.size.sm, color: colors.textSecondary },
    secondaryEmotions: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs, marginTop: SPACING.xs },
    secondaryChip: {
      backgroundColor: colors.surfaceVariant,
      borderRadius: BORDER_RADIUS.sm,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    secondaryChipText: { fontSize: TYPOGRAPHY.size.xs, color: colors.textSecondary },
    summaryText: { fontSize: TYPOGRAPHY.size.md, color: colors.textPrimary, lineHeight: 22 },
    tagList: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs },
    tag: {
      backgroundColor: `${colors.primary}22`,
      borderRadius: BORDER_RADIUS.sm,
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    tagText: { fontSize: TYPOGRAPHY.size.xs, color: colors.primary },
    entityCard: {
      backgroundColor: colors.surface,
      borderRadius: BORDER_RADIUS.md,
      padding: SPACING.sm,
      marginBottom: SPACING.xs,
      borderLeftWidth: 3,
      borderLeftColor: colors.primary,
    },
    entityValue: { fontSize: TYPOGRAPHY.size.md, color: colors.textPrimary, fontWeight: '500' },
    entityCitation: { fontSize: TYPOGRAPHY.size.xs, color: colors.textSecondary, fontStyle: 'italic', marginTop: 4 },
    analysisDate: { fontSize: TYPOGRAPHY.size.xs, color: colors.textMuted, textAlign: 'center', marginTop: SPACING.md },
    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACING.md, padding: SPACING.xl },
    emptyText: { fontSize: TYPOGRAPHY.size.md, color: colors.textSecondary, textAlign: 'center' },
  });
}
