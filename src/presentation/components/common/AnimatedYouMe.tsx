/**
 * AnimatedYouMe — Logo animé "YouMe" en Impact
 *
 * Séquence :
 *   1. Chaque lettre apparaît une par une (scale 0→1 + opacity 0→1, décalage 90 ms)
 *   2. Pause 1 200 ms
 *   3. Chaque lettre se disperse dans une direction fixe (translate + opacity→0)
 *
 * ⚠️ Robustesse (correctif crash « l'app se ferme après l'intro ») :
 *   Avant, la fin de l'animation appelait `onDone` via `runOnJS(...)` DEPUIS
 *   le callback de fin de `withTiming` (thread UI de Reanimated). Si ce pont
 *   worklet → JS échoue, l'app plante juste à la fin de l'intro.
 *   Ici, l'animation reste pilotée par Reanimated (purement visuel), mais
 *   `onDone` est déclenché par un simple setTimeout côté JS : fiable, et
 *   totalement indépendant du bon fonctionnement des worklets. Résultat :
 *   même si l'animation ne s'affiche pas correctement, l'app continue vers
 *   l'écran de connexion au lieu de se fermer.
 */
import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSequence,
  Easing,
} from 'react-native-reanimated';

const LETTERS = ['Y', 'o', 'u', 'M', 'e'];
const STAGGER      = 90;   // ms entre chaque lettre à l'apparition
const APPEAR_DUR   = 420;  // ms pour apparaître
const HOLD_DUR     = 1200; // ms de pause après apparition complète
const DISPERSE_DUR = 550;  // ms pour se disperser
const STAGGER_OUT  = 40;   // ms de décalage de dispersion entre lettres

// Directions de dispersion fixes par lettre (aléatoire mais déterministe)
const SCATTER: Array<{ dx: number; dy: number }> = [
  { dx: -180, dy: -220 },
  { dx:  -60, dy:  200 },
  { dx:  140, dy: -160 },
  { dx:  200, dy:  180 },
  { dx: -140, dy:  240 },
];

// Durée totale de la séquence : début de dispersion de la DERNIÈRE lettre
// + durée de dispersion. Sert au timer JS qui déclenche onDone.
const TOTAL_DURATION =
  (LETTERS.length - 1) * STAGGER +
  APPEAR_DUR +
  HOLD_DUR +
  (LETTERS.length - 1) * STAGGER_OUT +
  DISPERSE_DUR;

interface Props {
  onDone?: () => void;
  fontSize?: number;
  color?: string;
}

function Letter({
  char,
  index,
  fontSize,
  color,
}: {
  char: string;
  index: number;
  fontSize: number;
  color: string;
}) {
  const opacity    = useSharedValue(0);
  const scale      = useSharedValue(0.2);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);

  const appearDelay   = index * STAGGER;
  // La dispersion commence quand TOUTES les lettres ont fini d'apparaître.
  const disperseDelay =
    (LETTERS.length - 1) * STAGGER + APPEAR_DUR + HOLD_DUR + index * STAGGER_OUT;

  useEffect(() => {
    // Opacité : apparition, pause, puis disparition (aucun callback → pas de
    // pont worklet vers le JS, donc aucun risque de crash en fin d'animation).
    opacity.value = withSequence(
      withDelay(
        appearDelay,
        withTiming(1, { duration: APPEAR_DUR, easing: Easing.out(Easing.cubic) })
      ),
      withDelay(
        disperseDelay - appearDelay - APPEAR_DUR,
        withTiming(0, { duration: DISPERSE_DUR, easing: Easing.in(Easing.cubic) })
      )
    );

    // Échelle : apparition avec léger rebond.
    scale.value = withDelay(
      appearDelay,
      withTiming(1, { duration: APPEAR_DUR, easing: Easing.out(Easing.back(1.4)) })
    );

    // Translation de dispersion.
    const { dx, dy } = SCATTER[index % SCATTER.length];
    translateX.value = withDelay(
      disperseDelay,
      withTiming(dx, { duration: DISPERSE_DUR, easing: Easing.in(Easing.cubic) })
    );
    translateY.value = withDelay(
      disperseDelay,
      withTiming(dy, { duration: DISPERSE_DUR, easing: Easing.in(Easing.cubic) })
    );
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { scale: scale.value },
      { translateX: translateX.value },
      { translateY: translateY.value },
    ],
  }));

  return (
    <Animated.Text style={[styles.letter, animStyle, { fontSize, color }]}>
      {char}
    </Animated.Text>
  );
}

export function AnimatedYouMe({
  onDone,
  fontSize = 72,
  color = '#FFFFFF',
}: Props) {
  // onDone piloté par un timer JS fiable, PAS par un callback de worklet.
  // + petite marge (80 ms) pour laisser la dernière frame se jouer.
  useEffect(() => {
    if (!onDone) return;
    const timer = setTimeout(onDone, TOTAL_DURATION + 80);
    return () => clearTimeout(timer);
  }, [onDone]);

  return (
    <View style={styles.container}>
      {LETTERS.map((char, i) => (
        <Letter
          key={i}
          char={char}
          index={i}
          fontSize={fontSize}
          color={color}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 90,
  },
  letter: {
    // 'Impact' n'existe pas toujours sur Android : il retombe alors sur la
    // police système (pas de crash). Pour un rendu identique partout, bundlez
    // une vraie police via expo-font et remplacez la valeur ci-dessous.
    fontFamily: 'Impact',
    letterSpacing: 2,
    includeFontPadding: false,
    fontWeight: '900',
  },
});
