app/                  ← Écrans Expo Router
  (app)/              ← Écrans authentifiés
    (tabs)/           ← Onglets principaux (discussions, partenaires, recherche, paramètres)
    chat/[id].tsx     ← Écran de chat avec jauge IA
    flags/[id].tsx    ← Signaux relationnels (red/green flags)
    analysis/[id].tsx ← Analyse IA détaillée
  (auth)/             ← Écrans de connexion / inscription
src/
  ai/                 ← Moteurs IA (Whisper, DistilBERT, Qwen, Gemini)
  domain/             ← Entités et interfaces (Clean Architecture)
  infrastructure/     ← Supabase, stockage local, notifications
  presentation/       ← Composants, hooks, stores Zustand
assets/
  ai-models/          ← Modèles IA embarqués
  images/             ← Assets visuels
supabase/
  migrations/         ← Schéma SQL
