/**
 * Fenêtre de discussion libre avec Gemini — ouverte depuis le bouton "IA"
 * flottant du chat. Éphémère (pas de sauvegarde), dans le style visuel du
 * thème (dégradés, reflets « gélatine »).
 */
import React, { useCallback, useState, useRef } from 'react';
import {
  View,
  Text,
  Modal,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { YoumeColors, SPACING, TYPOGRAPHY, BORDER_RADIUS } from '@shared/constants/theme';
import { poserQuestionGemini, type GeminiChatTurn } from '@infrastructure/gemini/GeminiChatService';

interface GeminiAskModalProps {
  visible: boolean;
  onClose: () => void;
  colors: YoumeColors;
}

export function GeminiAskModal({ visible, onClose, colors }: GeminiAskModalProps) {
  const insets = useSafeAreaInsets();
  const styles = getStyles(colors);
  const [historique, setHistorique] = useState<GeminiChatTurn[]>([]);
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const envoyer = useCallback(async () => {
    const q = question.trim();
    if (!q || loading) return;
    setQuestion('');
    setErreur(null);
    const nouvelHistorique: GeminiChatTurn[] = [...historique, { role: 'user', text: q }];
    setHistorique(nouvelHistorique);
    setLoading(true);
    try {
      const reponse = await poserQuestionGemini(historique, q);
      setHistorique([...nouvelHistorique, { role: 'assistant', text: reponse }]);
    } catch (err: any) {
      setErreur(err?.message ?? "La question n'a pas pu être envoyée. Réessayez.");
    } finally {
      setLoading(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [question, loading, historique]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + SPACING.md, maxHeight: '85%' }]}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <View style={styles.iaBadge}>
                <Ionicons name="help" size={14} color="#C0392B" />
              </View>
              <Text style={styles.title}>Demander à Gemini</Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView ref={scrollRef} style={styles.list} showsVerticalScrollIndicator={false}>
            {historique.length === 0 ? (
              <Text style={styles.emptyText}>
                Posez n'importe quelle question — conseils, organisation, culture générale...
              </Text>
            ) : (
              historique.map((turn, i) => (
                <View
                  key={i}
                  style={[styles.turnRow, turn.role === 'user' ? { alignSelf: 'flex-end' } : { alignSelf: 'flex-start' }]}
                >
                  <LinearGradient
                    colors={turn.role === 'user' ? [colors.primaryLight, colors.primaryDark] : [colors.surfaceVariant, colors.surface]}
                    start={{ x: 0.15, y: 0 }}
                    end={{ x: 0.85, y: 1 }}
                    style={styles.turnBubble}
                  >
                    <Text style={{ color: turn.role === 'user' ? '#FFFFFF' : colors.textPrimary, fontSize: TYPOGRAPHY.size.sm, lineHeight: 20 }}>
                      {turn.text}
                    </Text>
                  </LinearGradient>
                </View>
              ))
            )}
            {loading && (
              <View style={[styles.turnRow, { alignSelf: 'flex-start' }]}>
                <View style={[styles.turnBubble, { backgroundColor: colors.surfaceVariant, flexDirection: 'row', gap: 6 }]}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={{ color: colors.textSecondary, fontSize: TYPOGRAPHY.size.sm }}>Gemini réfléchit…</Text>
                </View>
              </View>
            )}
            {erreur && <Text style={styles.errorText}>{erreur}</Text>}
          </ScrollView>

          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={question}
              onChangeText={setQuestion}
              placeholder="Votre question…"
              placeholderTextColor={colors.placeholder}
              multiline
              maxLength={2000}
              editable={!loading}
            />
            <TouchableOpacity
              style={[styles.sendBtn, (!question.trim() || loading) && { opacity: 0.5 }]}
              onPress={envoyer}
              disabled={!question.trim() || loading}
            >
              <Ionicons name="send" size={18} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
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
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.sm },
    headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
    iaBadge: {
      width: 22, height: 22, borderRadius: 11,
      backgroundColor: '#2E6FE0',
      alignItems: 'center', justifyContent: 'center',
      borderWidth: 1.5, borderColor: '#C0392B',
    },
    title: { fontSize: TYPOGRAPHY.size.lg, fontWeight: '700', color: colors.textPrimary },
    list: { flexGrow: 0, marginBottom: SPACING.sm },
    emptyText: { color: colors.textSecondary, fontSize: TYPOGRAPHY.size.sm, textAlign: 'center', marginVertical: SPACING.lg, fontStyle: 'italic' },
    turnRow: { maxWidth: '85%', marginBottom: SPACING.sm },
    turnBubble: { borderRadius: BORDER_RADIUS.bubble, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
    errorText: { color: colors.error, fontSize: TYPOGRAPHY.size.sm, textAlign: 'center', marginTop: SPACING.sm },
    inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: SPACING.sm },
    input: {
      flex: 1,
      backgroundColor: colors.surfaceVariant,
      borderRadius: BORDER_RADIUS.xl,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
      color: colors.textPrimary,
      fontSize: TYPOGRAPHY.size.md,
      maxHeight: 100,
    },
    sendBtn: {
      width: 42, height: 42, borderRadius: 21,
      backgroundColor: colors.primary,
      alignItems: 'center', justifyContent: 'center',
    },
  });
}
