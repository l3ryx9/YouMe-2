/**
 * Supabase Edge Function — gemini-proxy
 *
 * Point d'entrée unique côté serveur pour tous les appels Gemini de l'app
 * (GeminiMessageAnalyzer, GeminiFlagAnalysis, GeminiInconsistencyModule,
 * DailyAnalysisService).
 *
 * FIX SÉCURITÉ : la clé Gemini était auparavant lue côté client via
 * `EXPO_PUBLIC_GEMINI_API_KEY` — ce préfixe `EXPO_PUBLIC_` signifie qu'Expo
 * l'inline directement dans le bundle JS embarqué dans l'APK/IPA. N'importe
 * qui peut extraire cette clé d'un build public et l'utiliser à volonté, aux
 * frais du projet (quota, facturation). La clé vit désormais uniquement ici,
 * côté serveur, jamais envoyée au client.
 *
 * Le client envoie uniquement le prompt + la config de génération ; cette
 * fonction ajoute la clé et le nom du modèle (tous deux définis côté
 * serveur, jamais choisis par le client) puis relaie la réponse brute de
 * l'API Gemini telle quelle, pour que le code de parsing existant côté
 * client (candidates[0].content.parts[0].text) n'ait pas à changer.
 *
 * Authentification : le vérificateur JWT intégré des Edge Functions
 * Supabase est actif par défaut (pas de config désactivant verify_jwt) —
 * seul un utilisateur connecté à l'app peut donc atteindre cette fonction.
 * On ajoute par-dessus un rate limit serveur (même mécanisme que
 * anti-bot-guard) comme filet de sécurité si un client contournait le
 * throttling applicatif (4s entre appels, voir les modules Gemini).
 *
 * Variables d'environnement requises (Supabase Dashboard → Edge Functions) :
 *   SUPABASE_URL   — injectée automatiquement par Supabase
 *   SERVICE_KEY    — service role key (⚠️ pas de préfixe SUPABASE_)
 *   GEMINI_API_KEY — clé API Gemini (https://aistudio.google.com)
 *   GEMINI_MODEL   — optionnel, défaut "gemini-2.5-flash"
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_MODEL = 'gemini-2.5-flash';

// Filet de sécurité serveur — généreux par rapport au débit déjà respecté
// côté client (1 appel/3-4s par module), pour ne jamais gêner un usage
// normal tout en protégeant le quota du projet contre un client malveillant.
const RATE_LIMIT_WINDOW_SECONDS = 60;
const RATE_LIMIT_MAX_CALLS = 30;

interface ProxyRequest {
  prompt: string;
  generationConfig?: Record<string, unknown>;
  safetySettings?: Array<{ category: string; threshold: string }>;
}

function corsHeaders(): HeadersInit {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}

/**
 * Extrait le user id (`sub`) du JWT déjà vérifié par la plateforme avant que
 * cette fonction ne soit invoquée. Pas de round-trip réseau supplémentaire
 * nécessaire — la signature a déjà été validée en amont.
 */
function getUserIdFromAuthHeader(req: Request): string | null {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length);
  try {
    const payloadB64 = token.split('.')[1];
    const normalized = payloadB64.replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(normalized));
    return typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders() });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'method_not_allowed' }, 405);
  }

  const userId = getUserIdFromAuthHeader(req);
  if (!userId) {
    return jsonResponse({ error: 'unauthorized' }, 401);
  }

  let body: ProxyRequest;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'invalid_payload' }, 400);
  }

  if (!body.prompt || typeof body.prompt !== 'string') {
    return jsonResponse({ error: 'missing_prompt' }, 400);
  }

  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) {
    console.error('[gemini-proxy] GEMINI_API_KEY manquante côté serveur.');
    return jsonResponse({ error: 'server_not_configured' }, 500);
  }
  const model = Deno.env.get('GEMINI_MODEL') ?? DEFAULT_MODEL;

  // ── Rate limit serveur (filet de sécurité) ──────────────────────────────
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SERVICE_KEY')!
    );
    const { data: attemptCount, error: rlError } = await supabase.rpc('record_and_count_rate_limit', {
      p_action: 'gemini_proxy',
      p_identifier: userId,
      p_window_seconds: RATE_LIMIT_WINDOW_SECONDS,
    });
    if (rlError) {
      console.error('[gemini-proxy] rate limit RPC error:', rlError.message);
    } else if (typeof attemptCount === 'number' && attemptCount > RATE_LIMIT_MAX_CALLS) {
      return jsonResponse({ error: 'rate_limited' }, 429);
    }
  } catch (err) {
    console.error('[gemini-proxy] rate limit check failed:', err);
    // On ne bloque pas l'utilisateur si l'infra de rate limiting est
    // indisponible — le quota Gemini reste protégé par sa propre limite API.
  }

  // ── Appel Gemini côté serveur ────────────────────────────────────────────
  try {
    const url = `${GEMINI_API_URL}/${model}:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: body.prompt }] }],
        generationConfig: body.generationConfig ?? {},
        ...(body.safetySettings ? { safetySettings: body.safetySettings } : {}),
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[gemini-proxy] Erreur API Gemini :', data);
      return jsonResponse({ error: 'gemini_error', details: data }, response.status);
    }

    // Réponse brute de l'API Gemini, inchangée — le parsing côté client
    // (candidates[0].content.parts[0].text) reste identique.
    return jsonResponse(data, 200);
  } catch (err) {
    console.error('[gemini-proxy] Appel Gemini échoué :', err);
    return jsonResponse({ error: 'upstream_failure' }, 502);
  }
});
