# YouMe 🌿💬

# Installation

## 1. Dépendances

```bash
npm install @supabase/supabase-js @google-cloud/vertexai
```

## 2. Variables d'environnement

Copier `.env.example` en `.env.local` et remplir les valeurs (Supabase + Google Cloud).

## 3. Base de données

Copier le contenu de `sql/schema.sql` dans Supabase Dashboard > SQL Editor, et exécuter.

## 4. Google Cloud

1. Activer l'API : `gcloud services enable aiplatform.googleapis.com`
2. Créer un compte de service avec le rôle **Vertex AI User**
3. Télécharger la clé JSON, la placer à la racine (ex: `gcp-service-account.json`)
4. Vérifier que `GOOGLE_APPLICATION_CREDENTIALS` pointe vers ce fichier dans `.env.local`

## Structure du projet

```
lib/
  supabaseClient.js   → client Supabase FRONTEND (clé publique)
  supabaseAdmin.js    → client Supabase BACKEND (clé secrète, jamais exposée)
  gemini.js           → client Vertex AI / Gemini 2.5 Flash

services/
  consentement.js     → gestion du consentement RGPD
  profils.js          → génération de réponse + mise à jour du profil de personnalité
  audio.js            → transcription + analyse émotionnelle des messages vocaux
  analyse.js          → analyse tous les 10 messages (comportements, scores redflag/greenflag)

components/
  Inscription.jsx     → formulaire d'inscription avec case de consentement obligatoire

pages/api/
  inscription.js      → route serveur qui enregistre le consentement (Next.js)

sql/
  schema.sql           → tout le schéma de base de données à exécuter dans Supabase
```

## Points d'attention

- Gemini 2.5 Flash est prévu pour être déprécié le 16/10/2026 — envisagez `gemini-3-flash` pour un nouveau projet.
- `supabaseAdmin.js` utilise la clé `service_role` : ne jamais l'importer dans du code exécuté côté navigateur.
- L'analyse psychologique reste probabiliste, pas un diagnostic clinique : garder le prompt nuancé (voir `analyse.js`).
