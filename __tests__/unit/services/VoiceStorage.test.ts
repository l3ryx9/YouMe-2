/**
 * Tests Unitaires — Stockage des Messages Vocaux
 * Mock de expo-file-system pour les tests.
 */
jest.mock('expo-file-system', () => ({
  documentDirectory: '/mock/documents/',
  getInfoAsync: jest.fn(),
  makeDirectoryAsync: jest.fn(),
  copyAsync: jest.fn(),
  deleteAsync: jest.fn(),
  readDirectoryAsync: jest.fn(),
  writeAsStringAsync: jest.fn(),
  readAsStringAsync: jest.fn(),
}));

jest.mock('uuid', () => ({ v4: () => 'mock-uuid-1234' }));

import * as FileSystem from 'expo-file-system';
import { ExpoVoiceStorage } from '../../../src/infrastructure/storage/VoiceMessageStorage';

const mockGetInfo = FileSystem.getInfoAsync as jest.Mock;
const mockMakeDir = FileSystem.makeDirectoryAsync as jest.Mock;
const mockCopy = FileSystem.copyAsync as jest.Mock;
const mockDelete = FileSystem.deleteAsync as jest.Mock;

describe('ExpoVoiceStorage', () => {
  let storage: ExpoVoiceStorage;

  beforeEach(() => {
    storage = new ExpoVoiceStorage();
    jest.clearAllMocks();
  });

  describe('save', () => {
    it('copie le fichier et retourne les infos', async () => {
      mockGetInfo
        .mockResolvedValueOnce({ exists: true }) // ensureDir
        .mockResolvedValueOnce({ exists: true, size: 50000 }); // après copie
      mockCopy.mockResolvedValueOnce(undefined);

      const result = await storage.save('/tmp/recording.m4a', 15);

      expect(result.id).toBe('mock-uuid-1234');
      expect(result.localPath).toBe('/mock/documents/voice_messages/mock-uuid-1234.m4a');
      expect(result.duration).toBe(15);
      expect(result.size).toBe(50000);
      expect(mockCopy).toHaveBeenCalledWith({
        from: '/tmp/recording.m4a',
        to: '/mock/documents/voice_messages/mock-uuid-1234.m4a',
      });
    });

    it('crée le répertoire s\'il n\'existe pas', async () => {
      mockGetInfo
        .mockResolvedValueOnce({ exists: false }) // répertoire absent
        .mockResolvedValueOnce({ exists: true, size: 10000 });
      mockMakeDir.mockResolvedValueOnce(undefined);
      mockCopy.mockResolvedValueOnce(undefined);

      await storage.save('/tmp/rec.m4a', 5);
      expect(mockMakeDir).toHaveBeenCalledWith(
        '/mock/documents/voice_messages/',
        { intermediates: true }
      );
    });
  });

  describe('delete', () => {
    it('supprime le fichier s\'il existe', async () => {
      mockGetInfo.mockResolvedValueOnce({ exists: true });
      mockDelete.mockResolvedValueOnce(undefined);

      await storage.delete('/mock/documents/voice_messages/test.m4a');
      expect(mockDelete).toHaveBeenCalledWith(
        '/mock/documents/voice_messages/test.m4a',
        { idempotent: true }
      );
    });

    it('ne fait rien si le fichier n\'existe pas', async () => {
      mockGetInfo.mockResolvedValueOnce({ exists: false });
      await storage.delete('/mock/documents/voice_messages/absent.m4a');
      expect(mockDelete).not.toHaveBeenCalled();
    });
  });

  describe('exists', () => {
    it('retourne true si le fichier existe', async () => {
      mockGetInfo.mockResolvedValueOnce({ exists: true });
      const result = await storage.exists('/path/to/file.m4a');
      expect(result).toBe(true);
    });

    it('retourne false si le fichier n\'existe pas', async () => {
      mockGetInfo.mockResolvedValueOnce({ exists: false });
      const result = await storage.exists('/path/to/absent.m4a');
      expect(result).toBe(false);
    });
  });
});
