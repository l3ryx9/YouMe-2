function stripImportMetaUrl({ types: t }) {
  // @xenova/transformers (utilisé ici uniquement pour la tokenisation locale,
  // voir src/ai/models/tokenizerLoader.ts) importe en interne son backend
  // onnxruntime-web, qui contient une référence statique à `import.meta.url`
  // pour localiser ses binaires WASM. Ce chemin de code n'est jamais exécuté
  // dans l'app (l'inférence passe par onnxruntime-react-native, pas par le
  // backend WASM de transformers.js), mais Hermes ne sait pas parser la
  // syntaxe `import.meta` et fait échouer le build release
  // (":app:createBundleReleaseJsAndAssets", erreur "'import.meta' is
  // currently unsupported"). On neutralise donc `import.meta` / `import.meta.xxx`
  // au niveau Babel avant que Hermes ne voie le bundle final.
  return {
    visitor: {
      MetaProperty(path) {
        if (path.node.meta.name !== 'import' || path.node.property.name !== 'meta') {
          return;
        }
        const parent = path.parentPath;
        if (parent.isMemberExpression() && parent.node.object === path.node) {
          parent.replaceWith(t.stringLiteral(''));
        } else {
          path.replaceWith(t.objectExpression([]));
        }
      },
    },
  };
}

module.exports = function (api) {
  // FIX: api.cache(true) appelle api.cache.forever() en interne.
  // Ensuite, api.env() appelle api.cache.using() — ce qui provoque l'erreur
  // "Caching has already been configured with .never or .forever()".
  // Solution : utiliser api.cache.using() pour invalider le cache selon
  // NODE_ENV, et lire isProduction directement depuis process.env.
  api.cache.using(() => process.env.NODE_ENV);
  const isProduction = process.env.NODE_ENV === 'production';

  return {
    presets: ['babel-preset-expo'],
    plugins: [
      stripImportMetaUrl,
      // En production, on retire tous les console.* du bundle final :
      // ça évite de laisser fuiter des traces de debug/logique métier
      // et ça réduit la taille du bundle envoyé à Hermes.
      isProduction && 'transform-remove-console',
      [
        'module-resolver',
        {
          root: ['./'],
          extensions: ['.ios.js', '.android.js', '.js', '.ts', '.tsx', '.json'],
          alias: {
            '@': './src',
            '@domain': './src/domain',
            '@data': './src/data',
            '@infrastructure': './src/infrastructure',
            '@presentation': './src/presentation',
            '@ai': './src/ai',
            '@shared': './src/shared',
            '@assets': './assets',
            '@tests': './__tests__',
          },
        },
      ],
      'react-native-reanimated/plugin',
    ].filter(Boolean),
  };
};
