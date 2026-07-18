/**
 * Utilitaires de conversion audio brut (PCM 16-bit) vers fichier WAV.
 *
 * Historique : ces fonctions vivaient auparavant sous `src/ai/whisper/`
 * (utilisées pour préparer l'audio avant transcription locale par Whisper).
 * Elles sont purement du traitement de signal, sans dépendance à un modèle
 * IA — déplacées ici après la suppression de l'IA locale.
 */

export interface PcmAccumulator {
  chunks: Uint8Array[];
}

export function createPcmAccumulator(): PcmAccumulator {
  return { chunks: [] };
}

// Décode un chunk audio reçu en base64 (depuis LiveAudioStream) et l'ajoute à l'accumulateur
export function appendBase64Chunk(accumulator: PcmAccumulator, base64Chunk: string): void {
  accumulator.chunks.push(base64ToBytes(base64Chunk));
}

// Concatène tous les chunks PCM accumulés en un seul buffer
export function concatPcmBytes(accumulator: PcmAccumulator): Uint8Array {
  const totalLength = accumulator.chunks.reduce((sum, c) => sum + c.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of accumulator.chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

// Enveloppe des données PCM 16-bit brutes dans un header WAV valide
export function buildWavFile(pcmBytes: Uint8Array, sampleRate: number, numChannels: number): Uint8Array {
  const bytesPerSample = 2; // PCM 16-bit
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = pcmBytes.length;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);       // taille du sous-bloc fmt
  view.setUint16(20, 1, true);        // format PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bytesPerSample * 8, true); // bits par échantillon
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  const wavBytes = new Uint8Array(buffer);
  wavBytes.set(pcmBytes, 44);
  return wavBytes;
}

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

// --- Base64 (implémentation sans dépendance externe, compatible React Native) ---

const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function bytesToBase64(bytes: Uint8Array): string {
  let result = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b1 = bytes[i];
    const b2 = i + 1 < bytes.length ? bytes[i + 1] : undefined;
    const b3 = i + 2 < bytes.length ? bytes[i + 2] : undefined;

    result += B64_CHARS[b1 >> 2];
    result += B64_CHARS[((b1 & 0x03) << 4) | (b2 !== undefined ? b2 >> 4 : 0)];
    result += b2 !== undefined ? B64_CHARS[((b2 & 0x0f) << 2) | (b3 !== undefined ? b3 >> 6 : 0)] : '=';
    result += b3 !== undefined ? B64_CHARS[b3 & 0x3f] : '=';
  }
  return result;
}

function base64ToBytes(base64: string): Uint8Array {
  const clean = base64.replace(/[^A-Za-z0-9+/]/g, '');
  const bytes: number[] = [];
  for (let i = 0; i < clean.length; i += 4) {
    const e1 = B64_CHARS.indexOf(clean[i]);
    const e2 = B64_CHARS.indexOf(clean[i + 1]);
    const e3 = clean[i + 2] !== undefined ? B64_CHARS.indexOf(clean[i + 2]) : -1;
    const e4 = clean[i + 3] !== undefined ? B64_CHARS.indexOf(clean[i + 3]) : -1;

    bytes.push((e1 << 2) | (e2 >> 4));
    if (e3 >= 0) bytes.push(((e2 & 15) << 4) | (e3 >> 2));
    if (e4 >= 0) bytes.push(((e3 & 3) << 6) | e4);
  }
  return new Uint8Array(bytes);
}
