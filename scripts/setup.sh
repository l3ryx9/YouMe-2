#!/usr/bin/env bash
# =============================================================================
# YouMe V2 — Script de Configuration Initiale
# =============================================================================
# Usage : bash scripts/setup.sh
# Ce script configure l'environnement de développement pour YouMe V2.
# =============================================================================

set -e

RESET="\033[0m"
GREEN="\033[32m"
BLUE="\033[34m"
YELLOW="\033[33m"
RED="\033[31m"
BOLD="\033[1m"

echo -e "${BOLD}${BLUE}"
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║            YouMe V2 — Configuration               ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo -e "${RESET}"

# Vérifications préalables
echo -e "\n${BLUE}[1/6] Vérification des prérequis...${RESET}"

if ! command -v node &>/dev/null; then
  echo -e "${RED}✗ Node.js non trouvé. Installez Node.js >= 20 : https://nodejs.org${RESET}"
  exit 1
fi

NODE_VERSION=$(node --version | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
  echo -e "${RED}✗ Node.js >= 20 requis (actuel: v${NODE_VERSION})${RESET}"
  exit 1
fi
echo -e "${GREEN}✓ Node.js $(node --version) détecté${RESET}"

if ! command -v npm &>/dev/null; then
  echo -e "${RED}✗ npm non trouvé${RESET}"
  exit 1
fi
echo -e "${GREEN}✓ npm $(npm --version) détecté${RESET}"

# Configuration du fichier .env
echo -e "\n${BLUE}[2/6] Configuration des variables d'environnement...${RESET}"
if [ -f ".env" ]; then
  echo -e "${YELLOW}⚠ Fichier .env existant détecté — conservation${RESET}"
else
  cp .env.example .env
  echo -e "${GREEN}✓ Fichier .env créé depuis .env.example${RESET}"
  echo -e "${YELLOW}  ► Éditez .env et renseignez vos clés Firebase avant de continuer.${RESET}"
fi

# Installation des dépendances
echo -e "\n${BLUE}[3/6] Installation des dépendances npm...${RESET}"
npm install --legacy-peer-deps
echo -e "${GREEN}✓ Dépendances installées${RESET}"

# Installation d'Expo CLI
echo -e "\n${BLUE}[4/6] Installation d'Expo CLI et EAS CLI...${RESET}"
if ! command -v expo &>/dev/null; then
  npm install -g expo-cli eas-cli
  echo -e "${GREEN}✓ Expo CLI et EAS CLI installés${RESET}"
else
  echo -e "${GREEN}✓ Expo CLI déjà installé : $(expo --version)${RESET}"
fi

# Répertoire des modèles IA
echo -e "\n${BLUE}[5/6] Préparation du répertoire des modèles IA...${RESET}"
mkdir -p models
echo -e "${GREEN}✓ Répertoire models/ créé${RESET}"
echo -e "${YELLOW}"
echo "  IMPORTANT : Les modèles IA doivent être téléchargés séparément."
echo "  Voir la section 'Installation des modèles IA' dans README.md"
echo ""
echo "  Modèles requis :"
echo "  ├── models/whisper-tiny.onnx"
echo "  │   └── https://huggingface.co/onnx-community/whisper-tiny"
echo "  ├── models/emotion-distilbert.onnx"
echo "  │   └── https://huggingface.co/bhadresh-savani/distilbert-base-uncased-emotion"
echo "  └── models/gemma-2b-it-q4.gguf (optionnel — 1.5 GB)"
echo "      └── https://huggingface.co/google/gemma-2b-it (version GGUF Q4)"
echo -e "${RESET}"

# Vérification finale
echo -e "\n${BLUE}[6/6] Vérification de la configuration...${RESET}"

MISSING_VARS=()
REQUIRED_VARS=(
  "EXPO_PUBLIC_FIREBASE_API_KEY"
  "EXPO_PUBLIC_FIREBASE_PROJECT_ID"
  "EXPO_PUBLIC_FIREBASE_APP_ID"
)

if [ -f ".env" ]; then
  for var in "${REQUIRED_VARS[@]}"; do
    VALUE=$(grep "^${var}=" .env | cut -d'=' -f2)
    if [ -z "$VALUE" ] || [[ "$VALUE" == your_* ]]; then
      MISSING_VARS+=("$var")
    fi
  done
fi

if [ ${#MISSING_VARS[@]} -gt 0 ]; then
  echo -e "${YELLOW}⚠ Variables Firebase non configurées :${RESET}"
  for var in "${MISSING_VARS[@]}"; do
    echo -e "${YELLOW}  - $var${RESET}"
  done
  echo -e "${YELLOW}  Éditez le fichier .env avant de lancer l'application.${RESET}"
else
  echo -e "${GREEN}✓ Configuration Firebase détectée${RESET}"
fi

# Résumé
echo -e "\n${BOLD}${GREEN}"
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║              Configuration terminée !                       ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo -e "${RESET}"
echo ""
echo -e "${BOLD}Prochaines étapes :${RESET}"
echo ""
echo "  1. Éditez ${BOLD}.env${RESET} avec vos clés Firebase"
echo "  2. Placez vos fichiers Firebase dans le projet :"
echo "     ${BOLD}google-services.json${RESET} (Android)"
echo "     ${BOLD}GoogleService-Info.plist${RESET} (iOS)"
echo "  3. Téléchargez les modèles IA dans ${BOLD}models/${RESET}"
echo "  4. Lancez l'application :"
echo ""
echo "     ${BOLD}npx expo start${RESET}        # Démarrage local"
echo "     ${BOLD}npm run test${RESET}           # Exécuter les tests"
echo "     ${BOLD}npm run build:android${RESET}  # Build Android (EAS)"
echo "     ${BOLD}npm run build:ios${RESET}      # Build iOS (EAS)"
echo ""
echo "  Voir ${BOLD}README.md${RESET} pour la documentation complète."
echo ""
