import { useState } from 'react';
import { supabase } from '../lib/supabaseClient.js';

export default function Inscription() {
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [consentement, setConsentement] = useState(false);
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(false);

  async function handleInscription(e) {
    e.preventDefault();
    setErreur('');

    if (!consentement) {
      setErreur("Vous devez accepter la collecte de données par l'IA pour créer un compte.");
      return;
    }

    setChargement(true);

    const { data, error } = await supabase.auth.signUp({
      email,
      password: motDePasse,
    });

    if (error) {
      setErreur(error.message);
      setChargement(false);
      return;
    }

    // Le consentement est enregistré côté serveur via /api/inscription
    // (ne jamais faire confiance uniquement au frontend)
    const reponse = await fetch('/api/inscription', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: data.user.id, consentementIA: consentement }),
    });

    if (!reponse.ok) {
      setErreur("Erreur lors de l'enregistrement du consentement.");
    }

    setChargement(false);
  }

  return (
    <form onSubmit={handleInscription} className="space-y-4 max-w-md">
      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        className="w-full border rounded px-3 py-2"
      />
      <input
        type="password"
        placeholder="Mot de passe"
        value={motDePasse}
        onChange={(e) => setMotDePasse(e.target.value)}
        required
        className="w-full border rounded px-3 py-2"
      />

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={consentement}
          onChange={(e) => setConsentement(e.target.checked)}
          className="mt-1"
        />
        <span>
          J'accepte que l'IA collecte, analyse et conserve mes messages
          (texte et audio) pour générer un profil de personnalité et
          une analyse psychologique visible par l'autre personne de la
          conversation.{' '}
          <a href="/confidentialite" target="_blank" className="underline">
            En savoir plus
          </a>.
        </span>
      </label>

      {erreur && <p className="text-red-600 text-sm">{erreur}</p>}

      <button
        type="submit"
        disabled={!consentement || chargement}
        className="w-full bg-black text-white rounded px-3 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {chargement ? 'Création...' : 'Créer mon compte'}
      </button>
    </form>
  );
}
