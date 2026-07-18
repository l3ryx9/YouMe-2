/**
 * Supabase Edge Function — anti-bot-guard
 *
 * Point d'entrée unique côté serveur pour la protection anti-bot
 * du formulaire d'inscription et de connexion, sans CAPTCHA payant.
 *
 * Vérifications appliquées (dans l'ordre du document de spec) :
 *   1. Honeypot        — le champ caché "website" doit rester vide.
 *   2. Délai minimum   — un humain met plus de 3s à remplir le formulaire.
 *   3. Rate limiting    — 5 inscriptions/min par IP, 10 connexions/min par compte.
 *   4. Score de risque  — combine les signaux ci-dessus + un email suspect.
 *   5. Journalisation   — chaque tentative bloquée/suspecte est enregistrée.
 *
 * L'inscription exige déjà une vérification email via Supabase Auth
 * (lien envoyé automatiquement, expire après 24h — configuré dans le
 * dashboard Supabase Auth), ce qui couvre l'étape "vérification email"
 * du document de spec.
 *
 * Variables d'environnement requises (déjà utilisées par les autres
 * Edge Functions du projet) :
 *   SUPABASE_URL — injectée automatiquement par Supabase
 *   SERVICE_KEY  — service role key (⚠️ pas de préfixe SUPABASE_)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type GuardAction = 'register' | 'login';

interface GuardRequest {
  action: GuardAction;
  email?: string;
  honeypot?: string;
  /** Timestamp (ms epoch) auquel le formulaire a été ouvert côté client. */
  formOpenedAt?: number;
}

interface GuardResponse {
  allowed: boolean;
  score: number;
  decision: 'allow' | 'verify' | 'block';
  reason: string;
}

const WINDOW_SECONDS = 60;
const LIMITS: Record<GuardAction, number> = {
  register: 5,   // 5 inscriptions / minute / IP
  login: 10,     // 10 tentatives de connexion / minute / compte
};

const MIN_SUBMIT_MS = 3000; // délai minimum humain plausible

// Domaines email jetables/suspects les plus courants — liste minimale,
// pensée pour être étendue facilement au fil des observations dans
// security_logs.
const DISPOSABLE_EMAIL_DOMAINS = new Set([
  'mailinator.com',
  'tempmail.com',
  'temp-mail.org',
  'guerrillamail.com',
  'yopmail.com',
  '10minutemail.com',
  'trashmail.com',
  'discard.email',
  'throwawaymail.com',
  'fakeinbox.com',
]);

function corsHeaders(): HeadersInit {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

function jsonResponse(body: GuardResponse, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}

function getClientIp(req: Request): string {
  // Supabase Edge Functions tournent derrière un proxy qui renseigne
  // x-forwarded-for ; on prend la première IP (client d'origine).
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.headers.get('cf-connecting-ip') ?? req.headers.get('x-real-ip') ?? 'unknown';
}

function isSuspiciousEmail(email: string | undefined): boolean {
  if (!email) return false;
  const at = email.lastIndexOf('@');
  if (at === -1) return false;
  const domain = email.slice(at + 1).toLowerCase().trim();
  const localPart = email.slice(0, at);
  if (DISPOSABLE_EMAIL_DOMAINS.has(domain)) return true;
  // Heuristique simple : local-part très long et purement alphanumérique
  // aléatoire (ex: "kf83jsldk2m9x@...") — typique des bots de masse.
  if (/^[a-z0-9]{16,}$/i.test(localPart)) return true;
  return false;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders() });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ allowed: false, score: 100, decision: 'block', reason: 'method_not_allowed' }, 405);
  }

  let body: GuardRequest;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ allowed: false, score: 100, decision: 'block', reason: 'invalid_payload' }, 400);
  }

  const action = body.action;
  if (action !== 'register' && action !== 'login') {
    return jsonResponse({ allowed: false, score: 100, decision: 'block', reason: 'invalid_action' }, 400);
  }

  const ip = getClientIp(req);
  const email = body.email?.toLowerCase().trim();
  const honeypot = body.honeypot ?? '';
  const formOpenedAt = body.formOpenedAt;

  let score = 0;
  const reasons: string[] = [];

  // 1. Honeypot rempli → quasi-certitude d'un bot.
  if (honeypot.trim().length > 0) {
    score += 100;
    reasons.push('honeypot');
  }

  // 2. Soumission trop rapide pour être humaine.
  if (typeof formOpenedAt === 'number' && formOpenedAt > 0) {
    const elapsed = Date.now() - formOpenedAt;
    if (elapsed < MIN_SUBMIT_MS) {
      score += 30;
      reasons.push('too_fast');
    }
  }

  // 3. Rate limiting — identifiant différent selon l'action.
  const identifier = action === 'register' ? ip : (email || ip);
  const limit = LIMITS[action];

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SERVICE_KEY')!
  );

  try {
    const { data: attemptCount, error: rlError } = await supabase.rpc('record_and_count_rate_limit', {
      p_action: action,
      p_identifier: identifier,
      p_window_seconds: WINDOW_SECONDS,
    });

    if (rlError) {
      console.error('[anti-bot-guard] rate limit RPC error:', rlError.message);
    } else if (typeof attemptCount === 'number' && attemptCount > limit) {
      score += 50;
      reasons.push('rate_limit_exceeded');
    }
  } catch (err) {
    console.error('[anti-bot-guard] rate limit check failed:', err);
    // On ne bloque pas l'utilisateur si l'infra de rate limiting est
    // indisponible — on continue avec les autres signaux.
  }

  // 4. Email suspect (jetable ou pattern de bot).
  if (isSuspiciousEmail(email)) {
    score += 20;
    reasons.push('suspicious_email');
  }

  score = Math.min(score, 100);

  let decision: GuardResponse['decision'];
  if (score >= 81) {
    decision = 'block';
  } else if (score >= 51) {
    // L'inscription exige déjà une vérification email (Supabase Auth) ;
    // pour la connexion, on laisse passer mais on journalise pour
    // surveillance/ajustement des règles (pas de compte à "re-vérifier"
    // à la connexion).
    decision = 'verify';
  } else {
    decision = 'allow';
  }

  const reason = reasons.length > 0 ? reasons.join(',') : 'none';

  if (decision !== 'allow') {
    try {
      await supabase.rpc('log_security_event', {
        p_action: action,
        p_ip: ip,
        p_email: email ?? null,
        p_risk_score: score,
        p_decision: decision,
        p_reason: reason,
      });
    } catch (err) {
      console.error('[anti-bot-guard] logging failed:', err);
    }
  }

  return jsonResponse({
    allowed: decision !== 'block',
    score,
    decision,
    reason,
  });
});
