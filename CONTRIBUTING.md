# Guide de Contribution — YouMe Intelligente

Merci de votre intérêt pour contribuer à YouMe Intelligente !

## Prérequis

- Node.js >= 20
- npm >= 10
- Expo CLI (`npm install -g expo-cli`)
- EAS CLI (`npm install -g eas-cli`)
- Android Studio ou Xcode pour les tests natifs

## Configuration du Projet

```bash
git clone https://github.com/l3ryx9/Youyou.git
cd Youyou
bash scripts/setup.sh
```

## Workflow de Développement

### Branches

- `main` : code de production stable
- `develop` : intégration des fonctionnalités
- `feature/*` : nouvelles fonctionnalités
- `fix/*` : corrections de bugs
- `docs/*` : documentation uniquement

### Conventions de Commit

Suivre [Conventional Commits](https://www.conventionalcommits.org/) :

```
feat: ajouter la recherche par date dans la mémoire IA
fix: corriger le lecteur vocal sur Android 14
docs: mettre à jour README pour l'installation des modèles
refactor: extraire la logique de transcription dans un hook
test: ajouter les tests du détecteur d'incohérences
```

### Avant de Soumettre une PR

1. **Qualité du code**
   ```bash
   npm run lint        # ESLint
   npm run typecheck   # TypeScript strict
   npm run test        # Tests unitaires
   npm run test:coverage # Couverture > 60%
   ```

2. **Tests obligatoires** pour :
   - Tout nouveau service IA
   - Tout validateur de formulaire
   - Tout utilitaire partagé

3. **Documentation** : mettre à jour ARCHITECTURE.md si la structure change

## Principes à Respecter

### Clean Architecture
- **Jamais** importer la couche infrastructure depuis le domaine
- **Jamais** importer la couche présentation depuis l'infrastructure
- Toujours définir une interface dans `domain/repositories/` avant l'implémentation

### IA Éthique (OBLIGATOIRE)
- **Toujours** formuler les résultats IA avec des termes probabilistes
- **Jamais** de certitude : utiliser "potentielle", "possible", "suggère"
- **Toujours** afficher la citation exacte du message source
- **Toujours** recommander la vérification manuelle pour les incohérences
- **Jamais** de score de "mensonge" ou de "tromperie" présenté comme définitif

### Confidentialité des Données
- Les fichiers audio **ne doivent jamais** être envoyés vers un service cloud
- La mémoire IA **doit rester** en SQLite local
- Tout export de données doit être initié par l'utilisateur

### Accessibilité
- Tous les composants interactifs doivent avoir `accessibilityLabel`
- Les couleurs doivent respecter les ratios de contraste WCAG AA

## Structure d'un Composant

```tsx
/**
 * Nom du Composant
 * Description courte du rôle et des responsabilités.
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { YOUME_COLORS, SPACING } from '@shared/constants/theme';

interface MonComposantProps {
  // Props typées
}

export const MonComposant: React.FC<MonComposantProps> = ({ ... }) => {
  // Logique du composant

  return (
    <View style={styles.container}>
      {/* JSX */}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { ... },
});
```

## Ajout d'un Modèle IA

1. Créer le service dans `src/ai/{nom}/`
2. Implémenter un fallback gracieux (règles ou heuristiques)
3. Ajouter les variables d'environnement dans `.env.example`
4. Documenter le modèle dans README.md
5. Écrire les tests unitaires avec mocks

## Rapport de Bugs

Ouvrez une issue GitHub avec :
- Version de l'application
- OS et version
- Appareil et RAM disponible
- Étapes pour reproduire
- Comportement attendu vs observé
- Logs (sans données personnelles)

## Licence

En contribuant, vous acceptez que votre code soit distribué sous la licence MIT de ce projet.
