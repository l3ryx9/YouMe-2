// Minifieur Metro personnalisé.
//
// 1. On minifie normalement avec Terser (comportement par défaut de Metro/Expo).
// 2. Pour les fichiers listés dans SENSITIVE_PATH_PATTERNS (chiffrement E2E),
//    on passe en plus le résultat dans javascript-obfuscator (control-flow
//    flattening, tableau de chaînes chiffré) avant de le renvoyer à Metro.
//
// Historique : l'authentification (AuthService, authStore, useAuth,
// authValidators) était obfusquée elle aussi, avec en plus l'option
// `selfDefending`. Ça a cassé le bouton "Se connecter" en production :
// `selfDefending` protège le code en comparant son propre `toString()`
// à une empreinte figée au moment de l'obfuscation, or Hermes recompile
// le bundle en bytecode après coup, donc cette empreinte ne correspond
// plus jamais et le mécanisme anti-sabotage se déclenche silencieusement,
// cassant l'exécution. On a donc retiré `selfDefending` partout et on
// n'obfusque plus que le module de chiffrement, qui est la vraie cible en
// cas de reverse engineering.
//
// On ne fait pas ça sur l'ensemble du bundle : l'obfuscation forte alourdit
// nettement la taille du bundle et le temps de démarrage, donc on la réserve
// aux fichiers dont la lecture en clair serait vraiment dommageable si
// quelqu'un décompile l'APK/IPA.
const terserMinifier = require('metro-minify-terser');
const JavaScriptObfuscator = require('javascript-obfuscator');

// Chemins (relatifs à la racine du projet, tels qu'ils apparaissent dans
// `filename`) à obfusquer en plus de la minification standard.
const SENSITIVE_PATH_PATTERNS = [
  // Chiffrement E2E (E2ECryptoService, KeyStorage, etc.)
  /src[\\/]infrastructure[\\/]crypto[\\/]/,
];

function isSensitiveFile(filename) {
  return SENSITIVE_PATH_PATTERNS.some((pattern) => pattern.test(filename));
}

module.exports.minify = async function minify(options) {
  const terserResult = await terserMinifier.minify(options);

  if (!isSensitiveFile(options.filename)) {
    return terserResult;
  }

  const obfuscated = JavaScriptObfuscator.obfuscate(terserResult.code, {
    compact: true,
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 0.75,
    deadCodeInjection: true,
    deadCodeInjectionThreshold: 0.3,
    stringArray: true,
    stringArrayEncoding: ['base64'],
    stringArrayThreshold: 0.75,
    splitStrings: true,
    splitStringsChunkLength: 8,
    identifierNamesGenerator: 'hexadecimal',
    renameGlobals: false,
    // selfDefending retiré : incompatible avec la recompilation Hermes
    // (cf. commentaire plus haut), ça cassait l'exécution en production.
    selfDefending: false,
    disableConsoleOutput: false,
    numbersToExpressions: true,
    simplify: true,
    transformObjectKeys: true,
    // On ne cible que ce fichier : pas de commentaire de licence à gérer,
    // pas besoin de source map (déjà retirée en release, cf. babel.config.js).
    sourceMap: false,
  });

  return {
    code: obfuscated.getObfuscatedCode(),
    map: terserResult.map,
  };
};
