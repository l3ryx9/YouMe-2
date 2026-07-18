// Config Metro personnalisée : on repart de la config Expo par défaut et on
// remplace uniquement le minifieur, pour pouvoir obfusquer en plus les
// modules sensibles (chiffrement E2E) avant que Hermes ne compile le bundle.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.transformer.minifierPath = require.resolve('./scripts/metro-obfuscator-minifier.js');

// Les poids des modèles IA embarqués (Emotion, Whisper) sont livrés en .onnx
// directement dans assets/ai-models/. Metro doit les traiter comme des
// assets binaires (copiés tels quels dans le bundle natif) et non comme du
// code source.
config.resolver.assetExts = [...config.resolver.assetExts, 'onnx'];

module.exports = config;
