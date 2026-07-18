/**
 * Motif de fond « forêt enchantée » pour l'écran de discussion : troncs
 * d'arbre stylisés (cercles concentriques façon coupe de tronc) + quelques
 * feuilles, en transparence derrière les messages. Entièrement vectoriel
 * (react-native-svg) → toujours net, quelle que soit la résolution de
 * l'écran, pas de pixellisation possible contrairement à une image bitmap.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import Svg, { Defs, Pattern, Circle, Path, Rect } from 'react-native-svg';

interface ForestPatternProps {
  /** Couleur des motifs (vert ou marron selon le thème) */
  color?: string;
  /** Opacité globale — bas par défaut pour ne jamais gêner la lecture des messages */
  opacity?: number;
}

const TILE = 140;

export function ForestPattern({ color = '#6FAF3E', opacity = 0.06 }: ForestPatternProps) {
  return (
    <Svg
      style={StyleSheet.absoluteFillObject}
      width="100%"
      height="100%"
      opacity={opacity}
      pointerEvents="none"
    >
      <Defs>
        <Pattern id="forestTile" patternUnits="userSpaceOnUse" width={TILE} height={TILE}>
          {/* Tronc — cercles concentriques façon coupe transversale */}
          <Circle cx={TILE * 0.25} cy={TILE * 0.3} r={26} stroke={color} strokeWidth={1.5} fill="none" />
          <Circle cx={TILE * 0.25} cy={TILE * 0.3} r={17} stroke={color} strokeWidth={1.2} fill="none" />
          <Circle cx={TILE * 0.25} cy={TILE * 0.3} r={8} stroke={color} strokeWidth={1} fill="none" />

          {/* Petite feuille stylisée */}
          <Path
            d={`M ${TILE * 0.78} ${TILE * 0.15}
                C ${TILE * 0.9} ${TILE * 0.1}, ${TILE * 0.95} ${TILE * 0.25}, ${TILE * 0.82} ${TILE * 0.32}
                C ${TILE * 0.7} ${TILE * 0.25}, ${TILE * 0.68} ${TILE * 0.18}, ${TILE * 0.78} ${TILE * 0.15} Z`}
            stroke={color}
            strokeWidth={1.2}
            fill="none"
          />

          {/* Second tronc, plus petit, décalé */}
          <Circle cx={TILE * 0.75} cy={TILE * 0.78} r={20} stroke={color} strokeWidth={1.3} fill="none" />
          <Circle cx={TILE * 0.75} cy={TILE * 0.78} r={11} stroke={color} strokeWidth={1} fill="none" />

          {/* Brin d'herbe / branche */}
          <Path
            d={`M ${TILE * 0.15} ${TILE * 0.85} q 8 -20 0 -35`}
            stroke={color}
            strokeWidth={1.2}
            fill="none"
          />
          <Path
            d={`M ${TILE * 0.1} ${TILE * 0.85} q 10 -15 0 -28`}
            stroke={color}
            strokeWidth={1}
            fill="none"
          />
        </Pattern>
      </Defs>
      <Rect x={0} y={0} width="100%" height="100%" fill="url(#forestTile)" />
    </Svg>
  );
}
