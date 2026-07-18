/**
 * Motif de fond « peau d'ananas » — treillis diagonal de losanges, comme la
 * texture caractéristique de la peau d'un ananas, en orange/jaune sur fond
 * noir. Utilisé plein écran derrière l'intro animée « YouMe » au démarrage
 * de l'app. Entièrement vectoriel (react-native-svg) → toujours net, quelle
 * que soit la résolution de l'écran.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import Svg, { Defs, Pattern, Path, Rect, Circle } from 'react-native-svg';

interface PineapplePatternProps {
  orange?: string;
  yellow?: string;
  opacity?: number;
}

const TILE = 64;

export function PineapplePattern({
  orange = '#F2932E',
  yellow = '#F4C63A',
  opacity = 0.3,
}: PineapplePatternProps) {
  return (
    <Svg
      style={StyleSheet.absoluteFillObject}
      width="100%"
      height="100%"
      opacity={opacity}
      pointerEvents="none"
    >
      <Defs>
        <Pattern id="pineappleTile" patternUnits="userSpaceOnUse" width={TILE} height={TILE}>
          {/* Treillis diagonal — losanges caractéristiques de la peau d'ananas */}
          <Path d={`M 0 ${TILE / 2} L ${TILE / 2} 0`} stroke={orange} strokeWidth={1.4} />
          <Path d={`M ${TILE / 2} 0 L ${TILE} ${TILE / 2}`} stroke={orange} strokeWidth={1.4} />
          <Path d={`M ${TILE} ${TILE / 2} L ${TILE / 2} ${TILE}`} stroke={orange} strokeWidth={1.4} />
          <Path d={`M ${TILE / 2} ${TILE} L 0 ${TILE / 2}`} stroke={orange} strokeWidth={1.4} />
          {/* Petit point jaune au centre de chaque losange — écaille d'ananas */}
          <Circle cx={TILE / 2} cy={TILE / 2} r={3} fill={yellow} />
        </Pattern>
      </Defs>
      <Rect x={0} y={0} width="100%" height="100%" fill="url(#pineappleTile)" />
    </Svg>
  );
}
