/**
 * Détecteur de localisation fictive (GPS simulé) — version renforcée
 *
 * Système de score pondéré. Seuils :
 *   ≥ 100 → certain   (blocage total)
 *   ≥ 60  → probable  (blocage + avertissement)
 *   ≥ 30  → possible  (avertissement seulement)
 *   < 30  → none
 *
 * shouldBlock = confidence est 'certain' ou 'probable'
 */
import * as Location from 'expo-location';

export interface MockDetectionResult {
  isMocked: boolean;
  confidence: 'certain' | 'probable' | 'possible' | 'none';
  /** Si true : NE PAS envoyer cette position à Firestore */
  shouldBlock: boolean;
  reasons: string[];
  score: number;
}

interface StoredLocation {
  location: Location.LocationObject;
  timestamp: number;
}

const MAX_HISTORY = 5;
let locationHistory: StoredLocation[] = [];

export function detectMockLocation(location: Location.LocationObject): MockDetectionResult {
  const reasons: string[] = [];
  let score = 0;

  const lat = location.coords.latitude;
  const lng = location.coords.longitude;
  const acc = location.coords.accuracy;
  const alt = location.coords.altitude;
  const altAcc = location.coords.altitudeAccuracy;
  const speed = location.coords.speed;
  const now = Date.now();

  // ── 1. Indicateur système Android (le plus fiable) ──────────────────────────
  if ((location as any).mocked === true) {
    reasons.push('Indicateur système Android : position fictive');
    score += 100;
  }

  // ── 2. Précision anormalement parfaite ──────────────────────────────────────
  if (acc !== null && acc !== undefined) {
    if (acc === 0) {
      reasons.push('Précision exactement 0 m (impossible physiquement)');
      score += 45;
    } else if (acc < 1) {
      reasons.push(`Précision ${acc.toFixed(2)} m < 1 m (très suspecte)`);
      score += 30;
    } else if (acc < 3) {
      reasons.push(`Précision ${acc.toFixed(2)} m < 3 m (suspecte)`);
      score += 10;
    }
  }

  // ── 3. Coordonnées entières (typique des apps mock) ─────────────────────────
  if (lat === Math.round(lat) && lng === Math.round(lng)) {
    reasons.push('Coordonnées entières (typique des apps de faux GPS)');
    score += 35;
  }

  // ── 4. Coordonnées très rondes à 1 ou 2 décimales ───────────────────────────
  const latStr = lat.toString();
  const lngStr = lng.toString();
  const latDecimals = (latStr.split('.')[1] ?? '').length;
  const lngDecimals = (lngStr.split('.')[1] ?? '').length;
  if (latDecimals <= 2 && lngDecimals <= 2 && latDecimals > 0) {
    reasons.push('Coordonnées trop rondes (≤ 2 décimales)');
    score += 20;
  }

  // ── 5. Altitude parfaitement nulle et précision parfaite ────────────────────
  if (alt === 0 && altAcc !== null && altAcc === 0) {
    reasons.push('Altitude 0 m avec précision 0 m (impossible)');
    score += 20;
  }

  // ── 6. Vitesse exactement 0 alors que la position a changé ──────────────────
  if (speed === 0 && locationHistory.length > 0) {
    const prev = locationHistory[locationHistory.length - 1];
    const dist = haversineDistance(prev.location.coords.latitude, prev.location.coords.longitude, lat, lng);
    if (dist > 5) {
      reasons.push(`Vitesse 0 mais position déplacée de ${Math.round(dist)} m`);
      score += 25;
    }
  }

  // ── 7. Vitesse impossible (téléportation) ───────────────────────────────────
  for (const stored of locationHistory) {
    const timeDeltaS = (now - stored.timestamp) / 1000;
    if (timeDeltaS <= 0 || timeDeltaS > 60) continue;
    const distM = haversineDistance(stored.location.coords.latitude, stored.location.coords.longitude, lat, lng);
    const speedMs = distM / timeDeltaS;
    if (speedMs > 250) {
      // > 900 km/h — supersonique
      reasons.push(`Vitesse impossible : ${Math.round(speedMs * 3.6)} km/h entre deux points`);
      score += 70;
      break;
    } else if (speedMs > 100) {
      // > 360 km/h — TGV max sur route
      reasons.push(`Vitesse très élevée : ${Math.round(speedMs * 3.6)} km/h`);
      score += 30;
      break;
    }
  }

  // ── 8. Position strictement identique à la précédente, répétée ──────────────
  if (locationHistory.length >= 2) {
    const allSame = locationHistory.slice(-2).every(
      (s) => s.location.coords.latitude === lat && s.location.coords.longitude === lng
    );
    const timeSinceLast = now - locationHistory[locationHistory.length - 1].timestamp;
    if (allSame && timeSinceLast > 30000) {
      // Même point exact depuis > 30 s — normal si immobile, mais combiné à d'autres signaux c'est suspect
      score += 10;
    }
  }

  // ── 9. Absence totale de vitesse et d'altitude quand accuracy est parfaite ──
  if (speed === null && alt === null && acc !== null && acc < 5) {
    reasons.push('Aucune donnée vitesse/altitude malgré une précision GPS élevée');
    score += 15;
  }

  // ── Mise à jour de l'historique ─────────────────────────────────────────────
  locationHistory.push({ location, timestamp: now });
  if (locationHistory.length > MAX_HISTORY) {
    locationHistory = locationHistory.slice(-MAX_HISTORY);
  }

  // ── Résultat ─────────────────────────────────────────────────────────────────
  let confidence: MockDetectionResult['confidence'] = 'none';
  if (score >= 100) confidence = 'certain';
  else if (score >= 60) confidence = 'probable';
  else if (score >= 30) confidence = 'possible';

  const isMocked = score >= 60;
  const shouldBlock = score >= 60;

  return { isMocked, confidence, shouldBlock, reasons, score };
}

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function resetMockDetector(): void {
  locationHistory = [];
}
