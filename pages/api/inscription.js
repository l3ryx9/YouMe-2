import { enregistrerConsentement } from '../../services/consentement.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  const { userId, consentementIA } = req.body;

  try {
    await enregistrerConsentement(userId, consentementIA);
    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
}
