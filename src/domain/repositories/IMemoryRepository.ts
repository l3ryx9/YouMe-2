/**
 * Interface Repository : Mémoire IA
 * Définit le contrat pour le stockage de la mémoire intelligente locale.
 */
import type {
  MemoryEntry,
  ConversationSummary,
  InconsistencyRecord,
  SearchResult,
  MemoryCategory,
} from '../entities/Memory';

export interface IMemoryRepository {
  saveMemoryEntry(entry: Omit<MemoryEntry, 'id' | 'createdAt'>): Promise<MemoryEntry>;
  getMemoryEntries(partnerId: string, category?: MemoryCategory): Promise<MemoryEntry[]>;
  saveSummary(summary: Omit<ConversationSummary, 'id' | 'createdAt'>): Promise<ConversationSummary>;
  getSummaries(conversationId: string): Promise<ConversationSummary[]>;
  saveInconsistency(
    record: Omit<InconsistencyRecord, 'id' | 'detectedAt'>
  ): Promise<InconsistencyRecord>;
  getInconsistencies(conversationId: string): Promise<InconsistencyRecord[]>;
  updateInconsistencyReviewed(id: string): Promise<void>;
  searchMemory(query: string, partnerId?: string): Promise<SearchResult[]>;
  deleteAllMemory(partnerId?: string): Promise<void>;
  exportMemory(partnerId?: string): Promise<string>;
  getMemoryStats(partnerId: string): Promise<{
    totalEntries: number;
    byCategory: Record<string, number>;
    totalSummaries: number;
    totalInconsistencies: number;
  }>;
}
