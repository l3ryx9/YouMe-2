/**
 * Repository Local : Mémoire IA
 * Stockage de la mémoire intelligente avec SQLite (données structurées)
 * et JSON (embeddings vectoriels).
 */
import * as SQLite from 'expo-sqlite';
import * as FileSystem from 'expo-file-system';
import { v4 as uuidv4 } from 'uuid';
import type { IMemoryRepository } from '@domain/repositories/IMemoryRepository';
import type {
  MemoryEntry,
  ConversationSummary,
  InconsistencyRecord,
  SearchResult,
  MemoryCategory,
  GeminiAnalysisResult,
  DailyGreenFlagCount,
  MessageGreenFlag,
  DailyAnalysisReport,
  ContradictionDetail,
  EmotionalVariation,
} from '@domain/entities/Memory';
import { cosineSimilarity } from '@shared/utils/vectorUtils';

const DB_NAME = 'youme_memory.db';
const EMBEDDINGS_FILE = `${FileSystem.documentDirectory}embeddings.json`;

export class LocalMemoryRepository implements IMemoryRepository {
  private db: SQLite.SQLiteDatabase | null = null;

  async initialize(): Promise<void> {
    this.db = await SQLite.openDatabaseAsync(DB_NAME);
    await this.db.execAsync(`
      PRAGMA journal_mode = WAL;

      CREATE TABLE IF NOT EXISTS memory_entries (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        partner_id TEXT NOT NULL,
        category TEXT NOT NULL,
        value TEXT NOT NULL,
        citation TEXT NOT NULL,
        message_id TEXT NOT NULL,
        emotion TEXT,
        emotion_score REAL,
        confidence REAL NOT NULL,
        timestamp INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS conversation_summaries (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        partner_id TEXT NOT NULL,
        summary TEXT NOT NULL,
        key_points TEXT NOT NULL,
        emotions TEXT NOT NULL,
        topics TEXT NOT NULL,
        from_date INTEGER NOT NULL,
        to_date INTEGER NOT NULL,
        message_count INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS inconsistencies (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        partner_id TEXT NOT NULL,
        statement1 TEXT NOT NULL,
        statement2 TEXT NOT NULL,
        citation1 TEXT NOT NULL,
        citation2 TEXT NOT NULL,
        message_id1 TEXT NOT NULL,
        message_id2 TEXT NOT NULL,
        date1 INTEGER NOT NULL,
        date2 INTEGER NOT NULL,
        inconsistency_type TEXT NOT NULL,
        explanation TEXT NOT NULL,
        coherence_score REAL NOT NULL,
        is_reviewed INTEGER NOT NULL DEFAULT 0,
        gemini_analysis TEXT,
        detected_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS daily_green_flags (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        partner_id TEXT NOT NULL,
        date TEXT NOT NULL,
        count INTEGER NOT NULL DEFAULT 0,
        flags TEXT NOT NULL DEFAULT '[]',
        updated_at INTEGER NOT NULL,
        UNIQUE(conversation_id, date)
      );

      CREATE TABLE IF NOT EXISTS daily_reports (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        partner_id TEXT NOT NULL,
        date TEXT NOT NULL,
        contradictions TEXT NOT NULL DEFAULT '[]',
        coherence_score REAL NOT NULL DEFAULT 50,
        emotional_journey TEXT NOT NULL DEFAULT '[]',
        dominant_emotion TEXT NOT NULL DEFAULT 'neutral',
        emotional_summary TEXT NOT NULL DEFAULT '',
        deception_risk_estimate REAL NOT NULL DEFAULT 0,
        deception_risk_label TEXT NOT NULL DEFAULT 'faible',
        deception_indicators TEXT NOT NULL DEFAULT '[]',
        summary TEXT NOT NULL DEFAULT '',
        facts TEXT NOT NULL DEFAULT '[]',
        interpretations TEXT NOT NULL DEFAULT '[]',
        message_count INTEGER NOT NULL DEFAULT 0,
        voice_count INTEGER NOT NULL DEFAULT 0,
        analyzed_at INTEGER NOT NULL,
        UNIQUE(conversation_id, date)
      );

      CREATE INDEX IF NOT EXISTS idx_memory_partner ON memory_entries(partner_id);
      CREATE INDEX IF NOT EXISTS idx_memory_category ON memory_entries(category);
      CREATE INDEX IF NOT EXISTS idx_summaries_conversation ON conversation_summaries(conversation_id);
      CREATE INDEX IF NOT EXISTS idx_inconsistencies_conversation ON inconsistencies(conversation_id);
      CREATE INDEX IF NOT EXISTS idx_daily_green_flags_conv ON daily_green_flags(conversation_id);
      CREATE INDEX IF NOT EXISTS idx_daily_reports_conv ON daily_reports(conversation_id);
    `);
  }

  private getDb(): SQLite.SQLiteDatabase {
    if (!this.db) throw new Error('Base de données non initialisée. Appelez initialize() d\'abord.');
    return this.db;
  }

  // ─── Memory entries ─────────────────────────────────────────────────────────

  async saveMemoryEntry(entry: Omit<MemoryEntry, 'id' | 'createdAt'>): Promise<MemoryEntry> {
    const id = uuidv4();
    const now = Date.now();
    const db = this.getDb();

    await db.runAsync(
      `INSERT INTO memory_entries
        (id, conversation_id, partner_id, category, value, citation, message_id,
         emotion, emotion_score, confidence, timestamp, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, entry.conversationId, entry.partnerId, entry.category,
        entry.value, entry.citation, entry.messageId,
        entry.emotion ?? null, entry.emotionScore ?? null,
        entry.confidence, entry.timestamp.getTime(), now,
      ]
    );

    if (entry.embedding) {
      await this.saveEmbedding(id, entry.embedding);
    }

    return { ...entry, id, createdAt: new Date(now) };
  }

  async getMemoryEntries(partnerId: string, category?: MemoryCategory): Promise<MemoryEntry[]> {
    const db = this.getDb();
    let rows: any[];
    if (category) {
      rows = await db.getAllAsync(
        'SELECT * FROM memory_entries WHERE partner_id = ? AND category = ? ORDER BY timestamp DESC',
        [partnerId, category]
      );
    } else {
      rows = await db.getAllAsync(
        'SELECT * FROM memory_entries WHERE partner_id = ? ORDER BY timestamp DESC',
        [partnerId]
      );
    }
    return rows.map(this.mapMemoryRow);
  }

  // ─── Summaries ──────────────────────────────────────────────────────────────

  async saveSummary(
    summary: Omit<ConversationSummary, 'id' | 'createdAt'>
  ): Promise<ConversationSummary> {
    const id = uuidv4();
    const now = Date.now();
    const db = this.getDb();
    await db.runAsync(
      `INSERT INTO conversation_summaries
        (id, conversation_id, partner_id, summary, key_points, emotions, topics,
         from_date, to_date, message_count, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, summary.conversationId, summary.partnerId, summary.summary,
        JSON.stringify(summary.keyPoints), JSON.stringify(summary.emotions),
        JSON.stringify(summary.topics), summary.fromDate.getTime(),
        summary.toDate.getTime(), summary.messageCount, now,
      ]
    );
    return { ...summary, id, createdAt: new Date(now) };
  }

  async getSummaries(conversationId: string): Promise<ConversationSummary[]> {
    const db = this.getDb();
    const rows = await db.getAllAsync(
      'SELECT * FROM conversation_summaries WHERE conversation_id = ? ORDER BY created_at DESC',
      [conversationId]
    );
    return rows.map(this.mapSummaryRow);
  }

  // ─── Inconsistencies ────────────────────────────────────────────────────────

  async saveInconsistency(
    record: Omit<InconsistencyRecord, 'id' | 'detectedAt'>
  ): Promise<InconsistencyRecord> {
    const id = uuidv4();
    const now = Date.now();
    const db = this.getDb();
    await db.runAsync(
      `INSERT INTO inconsistencies
        (id, conversation_id, partner_id, statement1, statement2, citation1, citation2,
         message_id1, message_id2, date1, date2, inconsistency_type, explanation,
         coherence_score, is_reviewed, gemini_analysis, detected_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, record.conversationId, record.partnerId,
        record.statement1, record.statement2,
        record.citation1, record.citation2,
        record.messageId1, record.messageId2,
        record.date1.getTime(), record.date2.getTime(),
        record.inconsistencyType, record.explanation,
        record.coherenceScore, 0,
        record.geminiAnalysis ? JSON.stringify(record.geminiAnalysis) : null,
        now,
      ]
    );
    return { ...record, id, detectedAt: new Date(now) };
  }

  async getInconsistencies(conversationId: string): Promise<InconsistencyRecord[]> {
    const db = this.getDb();
    const rows = await db.getAllAsync(
      'SELECT * FROM inconsistencies WHERE conversation_id = ? ORDER BY detected_at DESC',
      [conversationId]
    );
    return rows.map(this.mapInconsistencyRow);
  }

  async updateInconsistencyReviewed(id: string): Promise<void> {
    await this.getDb().runAsync(
      'UPDATE inconsistencies SET is_reviewed = 1 WHERE id = ?',
      [id]
    );
  }

  // ─── Daily green flags ───────────────────────────────────────────────────────

  /**
   * Ajoute un green flag détecté sur un message individuel.
   * Crée ou met à jour l'entrée du jour en cours.
   */
  async addDailyGreenFlag(
    conversationId: string,
    partnerId: string,
    flag: MessageGreenFlag
  ): Promise<DailyGreenFlagCount> {
    const db = this.getDb();
    const date = toDateString(new Date());
    const now = Date.now();

    const existing = await db.getFirstAsync<any>(
      'SELECT * FROM daily_green_flags WHERE conversation_id = ? AND date = ?',
      [conversationId, date]
    );

    if (existing) {
      const flags: MessageGreenFlag[] = JSON.parse(existing.flags);
      // Éviter les doublons sur le même message
      if (!flags.some((f) => f.messageId === flag.messageId)) {
        flags.push(flag);
        await db.runAsync(
          'UPDATE daily_green_flags SET count = ?, flags = ?, updated_at = ? WHERE id = ?',
          [flags.length, JSON.stringify(flags), now, existing.id]
        );
        return this.mapGreenFlagRow({ ...existing, count: flags.length, flags: JSON.stringify(flags), updated_at: now });
      }
      return this.mapGreenFlagRow(existing);
    }

    const id = uuidv4();
    const flags = [flag];
    await db.runAsync(
      `INSERT INTO daily_green_flags (id, conversation_id, partner_id, date, count, flags, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, conversationId, partnerId, date, 1, JSON.stringify(flags), now]
    );
    return { id, conversationId, partnerId, date, count: 1, flags, updatedAt: new Date(now) };
  }

  /**
   * Retourne le compteur de green flags pour un jour donné.
   * @param date Format YYYY-MM-DD. Si omis, retourne le jour courant.
   */
  async getDailyGreenFlagCount(
    conversationId: string,
    date?: string
  ): Promise<DailyGreenFlagCount | null> {
    const db = this.getDb();
    const targetDate = date ?? toDateString(new Date());
    const row = await db.getFirstAsync<any>(
      'SELECT * FROM daily_green_flags WHERE conversation_id = ? AND date = ?',
      [conversationId, targetDate]
    );
    return row ? this.mapGreenFlagRow(row) : null;
  }

  /**
   * Retourne l'historique des compteurs de green flags (7 derniers jours par défaut).
   */
  async getGreenFlagHistory(
    conversationId: string,
    days = 7
  ): Promise<DailyGreenFlagCount[]> {
    const db = this.getDb();
    const rows = await db.getAllAsync<any>(
      `SELECT * FROM daily_green_flags
       WHERE conversation_id = ?
       ORDER BY date DESC
       LIMIT ?`,
      [conversationId, days]
    );
    return rows.map(this.mapGreenFlagRow);
  }

  // ─── Daily analysis reports ─────────────────────────────────────────────────

  /**
   * Sauvegarde (ou écrase) le rapport d'analyse quotidienne.
   */
  async saveDailyReport(
    report: Omit<DailyAnalysisReport, 'id'>
  ): Promise<DailyAnalysisReport> {
    const db = this.getDb();
    const now = Date.now();

    // Supprimer l'existant pour ce jour (UNIQUE constraint)
    await db.runAsync(
      'DELETE FROM daily_reports WHERE conversation_id = ? AND date = ?',
      [report.conversationId, report.date]
    );

    const id = uuidv4();
    await db.runAsync(
      `INSERT INTO daily_reports (
        id, conversation_id, partner_id, date,
        contradictions, coherence_score,
        emotional_journey, dominant_emotion, emotional_summary,
        deception_risk_estimate, deception_risk_label, deception_indicators,
        summary, facts, interpretations,
        message_count, voice_count, analyzed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, report.conversationId, report.partnerId, report.date,
        JSON.stringify(report.contradictions), report.coherenceScore,
        JSON.stringify(report.emotionalJourney), report.dominantEmotion, report.emotionalSummary,
        report.deceptionRiskEstimate, report.deceptionRiskLabel,
        JSON.stringify(report.deceptionIndicators),
        report.summary,
        JSON.stringify(report.facts), JSON.stringify(report.interpretations),
        report.messageCount, report.voiceCount, now,
      ]
    );
    return { ...report, id, analyzedAt: new Date(now) };
  }

  /**
   * Récupère le rapport d'un jour donné.
   * @param date Format YYYY-MM-DD. Si omis, retourne celui d'hier.
   */
  async getDailyReport(
    conversationId: string,
    date?: string
  ): Promise<DailyAnalysisReport | null> {
    const db = this.getDb();
    const targetDate = date ?? toDateString(yesterday());
    const row = await db.getFirstAsync<any>(
      'SELECT * FROM daily_reports WHERE conversation_id = ? AND date = ?',
      [conversationId, targetDate]
    );
    return row ? this.mapDailyReportRow(row) : null;
  }

  /**
   * Retourne les N derniers rapports quotidiens.
   */
  async getDailyReportHistory(
    conversationId: string,
    days = 30
  ): Promise<DailyAnalysisReport[]> {
    const db = this.getDb();
    const rows = await db.getAllAsync<any>(
      `SELECT * FROM daily_reports
       WHERE conversation_id = ?
       ORDER BY date DESC
       LIMIT ?`,
      [conversationId, days]
    );
    return rows.map(this.mapDailyReportRow);
  }

  // ─── Search ─────────────────────────────────────────────────────────────────

  async searchMemory(queryStr: string, partnerId?: string): Promise<SearchResult[]> {
    const db = this.getDb();
    const lower = `%${queryStr.toLowerCase()}%`;
    let rows: any[];
    if (partnerId) {
      rows = await db.getAllAsync(
        `SELECT * FROM memory_entries
         WHERE partner_id = ? AND (LOWER(value) LIKE ? OR LOWER(citation) LIKE ?)
         ORDER BY timestamp DESC LIMIT 50`,
        [partnerId, lower, lower]
      );
    } else {
      rows = await db.getAllAsync(
        `SELECT * FROM memory_entries
         WHERE LOWER(value) LIKE ? OR LOWER(citation) LIKE ?
         ORDER BY timestamp DESC LIMIT 50`,
        [lower, lower]
      );
    }
    return rows.map((r: any): SearchResult => ({
      type: 'memory',
      relevanceScore: 1.0,
      citation: r.citation,
      messageId: r.message_id,
      memoryEntry: this.mapMemoryRow(r),
      conversationId: r.conversation_id,
      partnerId: r.partner_id,
      timestamp: new Date(r.timestamp),
    }));
  }

  async deleteAllMemory(partnerId?: string): Promise<void> {
    const db = this.getDb();
    if (partnerId) {
      await db.runAsync('DELETE FROM memory_entries WHERE partner_id = ?', [partnerId]);
      await db.runAsync('DELETE FROM conversation_summaries WHERE partner_id = ?', [partnerId]);
      await db.runAsync('DELETE FROM inconsistencies WHERE partner_id = ?', [partnerId]);
      await db.runAsync('DELETE FROM daily_green_flags WHERE partner_id = ?', [partnerId]);
      await db.runAsync('DELETE FROM daily_reports WHERE partner_id = ?', [partnerId]);
    } else {
      await db.runAsync('DELETE FROM memory_entries');
      await db.runAsync('DELETE FROM conversation_summaries');
      await db.runAsync('DELETE FROM inconsistencies');
      await db.runAsync('DELETE FROM daily_green_flags');
      await db.runAsync('DELETE FROM daily_reports');
    }
    await this.clearEmbeddings();
  }

  async exportMemory(partnerId?: string): Promise<string> {
    const db = this.getDb();
    let entries: any[], summaries: any[], inconsistencies: any[];
    if (partnerId) {
      entries = await db.getAllAsync('SELECT * FROM memory_entries WHERE partner_id = ?', [partnerId]);
      summaries = await db.getAllAsync('SELECT * FROM conversation_summaries WHERE partner_id = ?', [partnerId]);
      inconsistencies = await db.getAllAsync('SELECT * FROM inconsistencies WHERE partner_id = ?', [partnerId]);
    } else {
      entries = await db.getAllAsync('SELECT * FROM memory_entries');
      summaries = await db.getAllAsync('SELECT * FROM conversation_summaries');
      inconsistencies = await db.getAllAsync('SELECT * FROM inconsistencies');
    }
    return JSON.stringify({ entries, summaries, inconsistencies, exportedAt: new Date() }, null, 2);
  }

  async getMemoryStats(partnerId: string): Promise<{
    totalEntries: number;
    byCategory: Record<string, number>;
    totalSummaries: number;
    totalInconsistencies: number;
  }> {
    const db = this.getDb();
    const countRow = await db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM memory_entries WHERE partner_id = ?',
      [partnerId]
    );
    const categoryRows = await db.getAllAsync<{ category: string; count: number }>(
      'SELECT category, COUNT(*) as count FROM memory_entries WHERE partner_id = ? GROUP BY category',
      [partnerId]
    );
    const summaryCount = await db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM conversation_summaries WHERE partner_id = ?',
      [partnerId]
    );
    const inconsistencyCount = await db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM inconsistencies WHERE partner_id = ?',
      [partnerId]
    );
    return {
      totalEntries: countRow?.count ?? 0,
      byCategory: Object.fromEntries(categoryRows.map((r) => [r.category, r.count])),
      totalSummaries: summaryCount?.count ?? 0,
      totalInconsistencies: inconsistencyCount?.count ?? 0,
    };
  }

  // ─── Embeddings ─────────────────────────────────────────────────────────────

  private async saveEmbedding(id: string, embedding: number[]): Promise<void> {
    let data: Record<string, number[]> = {};
    const info = await FileSystem.getInfoAsync(EMBEDDINGS_FILE);
    if (info.exists) {
      const content = await FileSystem.readAsStringAsync(EMBEDDINGS_FILE);
      data = JSON.parse(content);
    }
    data[id] = embedding;
    await FileSystem.writeAsStringAsync(EMBEDDINGS_FILE, JSON.stringify(data));
  }

  private async clearEmbeddings(): Promise<void> {
    const info = await FileSystem.getInfoAsync(EMBEDDINGS_FILE);
    if (info.exists) await FileSystem.deleteAsync(EMBEDDINGS_FILE, { idempotent: true });
  }

  // ─── Mappers ─────────────────────────────────────────────────────────────────

  private mapMemoryRow(r: any): MemoryEntry {
    return {
      id: r.id,
      conversationId: r.conversation_id,
      partnerId: r.partner_id,
      category: r.category as MemoryCategory,
      value: r.value,
      citation: r.citation,
      messageId: r.message_id,
      emotion: r.emotion ?? undefined,
      emotionScore: r.emotion_score ?? undefined,
      confidence: r.confidence,
      timestamp: new Date(r.timestamp),
      createdAt: new Date(r.created_at),
    };
  }

  private mapSummaryRow(r: any): ConversationSummary {
    return {
      id: r.id,
      conversationId: r.conversation_id,
      partnerId: r.partner_id,
      summary: r.summary,
      keyPoints: JSON.parse(r.key_points),
      emotions: JSON.parse(r.emotions),
      topics: JSON.parse(r.topics),
      fromDate: new Date(r.from_date),
      toDate: new Date(r.to_date),
      messageCount: r.message_count,
      createdAt: new Date(r.created_at),
    };
  }

  private mapInconsistencyRow(r: any): InconsistencyRecord {
    return {
      id: r.id,
      conversationId: r.conversation_id,
      partnerId: r.partner_id,
      statement1: r.statement1,
      statement2: r.statement2,
      citation1: r.citation1,
      citation2: r.citation2,
      messageId1: r.message_id1,
      messageId2: r.message_id2,
      date1: new Date(r.date1),
      date2: new Date(r.date2),
      inconsistencyType: r.inconsistency_type,
      explanation: r.explanation,
      coherenceScore: r.coherence_score,
      isReviewed: r.is_reviewed === 1,
      geminiAnalysis: r.gemini_analysis ? JSON.parse(r.gemini_analysis) : undefined,
      detectedAt: new Date(r.detected_at),
    };
  }

  private mapGreenFlagRow(r: any): DailyGreenFlagCount {
    return {
      id: r.id,
      conversationId: r.conversation_id,
      partnerId: r.partner_id,
      date: r.date,
      count: r.count,
      flags: JSON.parse(r.flags),
      updatedAt: new Date(r.updated_at),
    };
  }

  private mapDailyReportRow(r: any): DailyAnalysisReport {
    return {
      id: r.id,
      conversationId: r.conversation_id,
      partnerId: r.partner_id,
      date: r.date,
      contradictions: JSON.parse(r.contradictions),
      coherenceScore: r.coherence_score,
      emotionalJourney: JSON.parse(r.emotional_journey),
      dominantEmotion: r.dominant_emotion,
      emotionalSummary: r.emotional_summary,
      deceptionRiskEstimate: r.deception_risk_estimate,
      deceptionRiskLabel: r.deception_risk_label,
      deceptionIndicators: JSON.parse(r.deception_indicators),
      summary: r.summary,
      facts: JSON.parse(r.facts),
      interpretations: JSON.parse(r.interpretations),
      messageCount: r.message_count,
      voiceCount: r.voice_count,
      analyzedAt: new Date(r.analyzed_at),
    };
  }
}

export const memoryRepository = new LocalMemoryRepository();

// ─── Utilitaires date ────────────────────────────────────────────────────────

export function toDateString(date: Date): string {
  return date.toISOString().split('T')[0]; // YYYY-MM-DD
}

export function yesterday(): Date {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d;
}
