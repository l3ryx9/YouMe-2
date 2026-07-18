/**
 * Supabase Edge Function — daily-psychological-analysis
 *
 * DEUX MODES D'APPEL :
 *
 * 1. Mode "cron" (body vide `{}`, appelé par pg_cron toutes les heures avec
 *    la Service Key — voir migration 20260720_daily_psychological_analysis.sql) :
 *    ne fait quelque chose que si l'heure actuelle à Paris est minuit, et
 *    balaie TOUTES les conversations actives des dernières 24h.
 *
 * 2. Mode "rattrapage" (body `{ "conversationId": "..." }`, appelé par le
 *    client avec le JWT de l'utilisateur connecté) : déclenché quand l'app
 *    était fermée à minuit et que le cron n'a donc pas pu être vu ouvrir —
 *    en réalité pg_cron tourne côté serveur indépendamment de l'app, mais ce
 *    mode sert de filet de sécurité si pg_cron/pg_net ne sont pas configurés
 *    sur le projet Supabase, ou si l'analyse a échoué. Le serveur vérifie que
 *    l'appelant est bien participant de la conversation, et n'exécute
 *    l'analyse QUE si elle n'a pas déjà tourné aujourd'hui (heure de Paris)
 *    pour cette conversation — jamais de re-calcul inutile.
 *
 * Ce que fait l'analyse, pour chaque conversation traitée :
 *   1. Transcrit les messages vocaux pas encore transcrits (audio → texte
 *      + émotion, écrit dans messages.ai_analysis)
 *   2. Met à jour le profil psychologique de chaque personne (traits, ton,
 *      sujets récurrents, conseils comportementaux) à partir de TOUTE la
 *      journée de messages (texte + audio transcrit), horodatés.
 *   3. Extrait les faits clés datés de la journée (`faits_cles`) et les
 *      compare aux faits déjà connus pour détecter des incohérences /
 *      contradictions dans le temps (`incoherences`) — toujours formulées
 *      comme des signaux probabilistes, jamais comme des preuves.
 *   4. Repère les variations d'humeur de la journée et des signes possibles
 *      de déni (changement de sujet, négation d'un fait déjà établi...),
 *      et en déduit une estimation prudente du risque d'incohérence globale
 *      du discours (PAS un "détecteur de mensonge" — un indicateur parmi
 *      d'autres, à vérifier humainement).
 *   5. Génère un résumé quotidien de la conversation.
 *   6. Purge la table `comportements` (liste détaillée red/green flags)
 *      globalement — la jauge (`scores_relationnels`), les profils, les
 *      faits clés et les incohérences ne sont JAMAIS purgés : c'est la
 *      mémoire longue qui permet au profil de s'affiner au fil du temps.
 *      La purge n'a lieu qu'en mode cron, à minuit pile.
 *
 * Variables d'environnement requises (mêmes que gemini-proxy) :
 *   SUPABASE_URL, SERVICE_KEY, GEMINI_API_KEY, GEMINI_MODEL (optionnel)
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_MODEL = 'gemini-2.5-flash';

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

function getParisHour(date: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Paris',
    hour12: false,
    hour: '2-digit',
  }).formatToParts(date);
  return Number(parts.find((p) => p.type === 'hour')?.value ?? '-1');
}

function getParisDateString(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(date); // YYYY-MM-DD
}

function getParisTimeString(date: Date): string {
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date); // HH:MM
}

/** 'YYYY-MM' en heure de Paris. */
function getParisMonthString(date: Date): string {
  return getParisDateString(date).slice(0, 7);
}

/** Mois précédent 'YYYY-MM' à partir d'un mois 'YYYY-MM'. */
function moisPrecedent(mois: string): string {
  const [y, m] = mois.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1)); // m est 1-indexé, -2 => mois précédent
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function getParisDayOfMonth(date: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Paris',
    day: '2-digit',
  }).formatToParts(date);
  return Number(parts.find((p) => p.type === 'day')?.value ?? '0');
}

/** Décode le JWT (déjà vérifié par la plateforme) sans appel réseau. */
function getAuthClaims(req: Request): { sub: string | null; role: string | null } {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return { sub: null, role: null };
  const token = authHeader.slice('Bearer '.length);
  try {
    const payloadB64 = token.split('.')[1];
    const normalized = payloadB64.replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(normalized));
    return { sub: typeof payload.sub === 'string' ? payload.sub : null, role: typeof payload.role === 'string' ? payload.role : null };
  } catch {
    return { sub: null, role: null };
  }
}

async function appelerGemini(apiKey: string, model: string, contents: unknown[]): Promise<string> {
  const url = `${GEMINI_API_URL}/${model}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Gemini error: ${JSON.stringify(data)}`);
  const texte = data.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') ?? '';
  return texte;
}

function parseJSON<T>(texte: string): T {
  const nettoye = texte.replace(/^```json\s*|```\s*$/g, '').trim();
  return JSON.parse(nettoye) as T;
}

function mimeTypeDepuisExtension(extension: string | null): string {
  const map: Record<string, string> = {
    mp3: 'audio/mp3', m4a: 'audio/mp4', wav: 'audio/wav', ogg: 'audio/ogg', aac: 'audio/aac', webm: 'audio/webm',
  };
  return map[(extension ?? '').toLowerCase()] ?? 'audio/mp4';
}

interface SyntheseMensuelle {
  synthese: string;
  traits_stables: Record<string, unknown>;
  faits_marquants: string[];
}

/**
 * Condense les faits_cles d'un mois révolu en un résumé compact — appelée le
 * 1er jour du mois, avant l'analyse du jour, pour éviter que le contexte
 * envoyé à Gemini chaque jour ne grossisse indéfiniment. Ne fait rien si le
 * mois a déjà été consolidé, ou s'il n'y a aucun fait à condenser.
 */
async function consoliderMoisPrecedentSiNecessaire(
  supabase: ReturnType<typeof createClient>,
  apiKey: string,
  model: string,
  conversationId: string,
  personneId: string,
  now: Date
): Promise<void> {
  if (getParisDayOfMonth(now) !== 1) return; // uniquement le 1er du mois

  const moisACondenser = moisPrecedent(getParisMonthString(now));

  const { data: dejaFait } = await supabase
    .from('resumes_mensuels')
    .select('id')
    .eq('conversation_id', conversationId)
    .eq('personne_id', personneId)
    .eq('mois', moisACondenser)
    .maybeSingle();
  if (dejaFait) return;

  const debutMois = `${moisACondenser}-01T00:00:00.000Z`;
  const [y, m] = moisACondenser.split('-').map(Number);
  const finMois = new Date(Date.UTC(y, m, 1)).toISOString();

  const { data: faitsDuMois } = await supabase
    .from('faits_cles')
    .select('fait, citation, prononce_le')
    .eq('conversation_id', conversationId)
    .eq('personne_id', personneId)
    .gte('prononce_le', debutMois)
    .lt('prononce_le', finMois)
    .order('prononce_le', { ascending: true });

  if (!faitsDuMois?.length) return; // rien à condenser ce mois-là

  const { data: profilActuel } = await supabase
    .from('profils_personnalite')
    .select('traits, ton, sujets_recurrents')
    .eq('conversation_id', conversationId)
    .eq('personne_id', personneId)
    .maybeSingle();

  const faitsTexte = faitsDuMois
    .map((f: any) => `- (${new Date(f.prononce_le).toLocaleDateString('fr-FR')}) ${f.fait}${f.citation ? ` — « ${f.citation} »` : ''}`)
    .join('\n');

  const prompt = `Condense ces faits d'un mois entier en un résumé factuel COMPACT, en ne gardant que ce qui est vraiment durable et important (projets, décisions majeures, habitudes récurrentes) — pas les détails anecdotiques ponctuels. Objectif : réduire la quantité d'information à relire chaque jour par la suite, sans perdre ce qui compte vraiment. Ton neutre, aucun jugement.

Profil actuel (traits, ton, sujets récurrents) : ${JSON.stringify(profilActuel ?? {})}

Faits du mois (${moisACondenser}) :
${faitsTexte}

Réponds UNIQUEMENT en JSON :
{
  "synthese": "résumé factuel en 3-5 phrases des éléments durables du mois",
  "traits_stables": {},
  "faits_marquants": ["fait important 1 à retenir sur le long terme", "fait important 2"]
}`;

  try {
    const texte = await appelerGemini(apiKey, model, [{ role: 'user', parts: [{ text: prompt }] }]);
    const synthese = parseJSON<SyntheseMensuelle>(texte);

    await supabase.from('resumes_mensuels').upsert({
      conversation_id: conversationId,
      personne_id: personneId,
      mois: moisACondenser,
      synthese: synthese.synthese,
      traits_stables: synthese.traits_stables ?? {},
      faits_marquants: synthese.faits_marquants ?? [],
    }, { onConflict: 'conversation_id,personne_id,mois' });
  } catch (err) {
    console.error(`[daily-analysis] Consolidation mensuelle échouée pour ${personneId} (${moisACondenser}):`, err);
  }
}

interface ProfilEtendu {
  traits: Record<string, unknown>;
  ton: string;
  sujets_recurrents: string[];
  conseils_comportementaux: string[];
  nouveaux_faits: Array<{ fait: string; citation?: string; heure?: string }>;
  incoherences_detectees: Array<{
    citation1: string; heure1?: string;
    citation2: string; heure2?: string;
    explication: string; gravite?: 'faible' | 'modérée' | 'élevée';
  }>;
  variations_humeur: Array<{ heure?: string; emotion: string; intensite?: number; contexte?: string }>;
  signes_possibles_deni: string[];
  risque_tromperie_estime: number;
  risque_tromperie_label: 'faible' | 'modéré' | 'élevé';
}

/**
 * Convertit une heure "HH:MM" du jour analysé en timestamp ISO complet.
 * Si le format est invalide ou absent, retombe sur `fallback`.
 */
function heureVersISO(heure: string | undefined, parisDate: string, fallback: Date): string {
  if (heure && /^\d{1,2}:\d{2}$/.test(heure)) {
    const [h, m] = heure.split(':').map(Number);
    // Construit un instant en heure de Paris de façon approximative (offset
    // fixe non géré ici) — suffisant pour l'ordre chronologique affiché,
    // la source de vérité pour l'horodatage réel reste `messages.created_at`.
    const iso = `${parisDate}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
    const d = new Date(iso);
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  return fallback.toISOString();
}

/**
 * Traite une conversation : transcription audio, profil psychologique
 * (+ faits clés, incohérences, humeur, signes de déni), résumé quotidien.
 * Utilisée aussi bien par le balayage cron que par le rattrapage ciblé.
 */
async function traiterConversation(
  supabase: ReturnType<typeof createClient>,
  apiKey: string,
  model: string,
  conversationId: string,
  now: Date,
  parisDate: string
): Promise<{ messagesTraites: number; personnes: number }> {
  const dayStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const { data: messagesConv, error: errMsgs } = await supabase
    .from('messages')
    .select('id, conversation_id, sender_id, receiver_id, type, content, storage_url, extension, ai_analysis, is_deleted, created_at')
    .eq('conversation_id', conversationId)
    .gte('created_at', dayStart.toISOString())
    .lte('created_at', now.toISOString())
    .eq('is_deleted', false)
    .order('created_at', { ascending: true });

  if (errMsgs) throw errMsgs;
  const msgs = messagesConv ?? [];
  const personnesIds: string[] = [...new Set(msgs.flatMap((m: any) => [m.sender_id, m.receiver_id]))] as string[];
  const risquesParPersonne: Record<string, { estime: number; label: string; deni: string[]; humeur: unknown[] }> = {};

  // 1. Transcription des messages vocaux pas encore analysés
  for (const msg of msgs as any[]) {
    if (msg.type === 'voice' && msg.storage_url && !msg.ai_analysis?.transcription) {
      try {
        const audioRes = await fetch(msg.storage_url);
        const audioBuffer = await audioRes.arrayBuffer();
        const audioBase64 = btoa(String.fromCharCode(...new Uint8Array(audioBuffer)));
        const mimeType = mimeTypeDepuisExtension(msg.extension);

        const texte = await appelerGemini(apiKey, model, [{
          role: 'user',
          parts: [
            { inlineData: { mimeType, data: audioBase64 } },
            { text: 'Transcris ce message audio et analyse son ton émotionnel. Réponds en JSON: {"transcription": "...", "emotion": "...", "intensite": 0}' },
          ],
        }]);
        const analyse = parseJSON<{ transcription: string; emotion: string; intensite: number }>(texte);

        await supabase.from('messages').update({ ai_analysis: analyse }).eq('id', msg.id);
        msg.ai_analysis = analyse;
      } catch (err) {
        console.error(`[daily-analysis] Transcription échouée pour message ${msg.id}:`, err);
      }
    }
  }

  // 2. Profil psychologique + faits clés + incohérences + humeur, par personne
  for (const personneId of personnesIds) {
    const messagesPersonne = (msgs as any[])
      .filter((m) => m.sender_id === personneId)
      .map((m) => {
        const texte = m.type === 'voice' ? (m.ai_analysis?.transcription ?? '[audio non transcrit]') : m.content;
        if (!texte) return null;
        return `[${getParisTimeString(new Date(m.created_at))}] ${texte}`;
      })
      .filter(Boolean);

    if (messagesPersonne.length === 0) continue;

    await consoliderMoisPrecedentSiNecessaire(supabase, apiKey, model, conversationId, personneId, now);

    const { data: profilActuel } = await supabase
      .from('profils_personnalite')
      .select('*')
      .eq('conversation_id', conversationId)
      .eq('personne_id', personneId)
      .maybeSingle();

    // Faits bruts : uniquement depuis le début du mois en cours (borné dans
    // le temps) — l'historique plus ancien est déjà condensé dans
    // resumes_mensuels, ce qui évite un contexte qui grossit indéfiniment.
    const debutMoisEnCours = `${getParisMonthString(now)}-01T00:00:00.000Z`;
    const { data: faitsConnus } = await supabase
      .from('faits_cles')
      .select('fait, citation, prononce_le')
      .eq('conversation_id', conversationId)
      .eq('personne_id', personneId)
      .gte('prononce_le', debutMoisEnCours)
      .order('prononce_le', { ascending: false })
      .limit(50);

    const { data: resumesMensuels } = await supabase
      .from('resumes_mensuels')
      .select('mois, synthese, faits_marquants')
      .eq('conversation_id', conversationId)
      .eq('personne_id', personneId)
      .order('mois', { ascending: false })
      .limit(3); // les 3 derniers mois consolidés suffisent comme mémoire longue

    const resumesMensuelsTexte = (resumesMensuels ?? [])
      .map((r: any) => `[${r.mois}] ${r.synthese}${r.faits_marquants?.length ? ` (à retenir : ${r.faits_marquants.join(' ; ')})` : ''}`)
      .join('\n') || '(aucun résumé mensuel pour l\'instant)';

    const faitsConnusTexte = (faitsConnus ?? [])
      .map((f: any) => `- (${new Date(f.prononce_le).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}) ${f.fait}${f.citation ? ` — « ${f.citation} »` : ''}`)
      .join('\n') || '(aucun fait connu ce mois-ci)';

    const prompt = `Tu es un assistant d'analyse comportementale factuelle et nuancée pour une app de couple. Tu ne poses JAMAIS de diagnostic clinique, n'utilises AUCUN vocabulaire accusatoire ("menteur", "manipulateur"...) et ne présentes jamais une hypothèse comme une certitude. Chaque affirmation doit être vérifiable par une citation exacte.

Profil actuel de cette personne : ${JSON.stringify(profilActuel ?? {})}

Mémoire long terme — résumés des mois précédents (condensés) :
${resumesMensuelsTexte}

Faits connus depuis le début du mois en cours (avec date/heure) :
${faitsConnusTexte}

Messages de la journée de cette personne (horodatés, heure de Paris) :
${messagesPersonne.join('\n')}

Tâches :
1. Met à jour le profil (traits, ton, sujets récurrents, conseils comportementaux bienveillants et actionnables).
2. Extrait les nouveaux faits clés factuels mentionnés aujourd'hui (ex: un projet, un rendez-vous, une localisation, une décision) avec citation exacte et heure.
3. Compare les faits d'aujourd'hui à la mémoire long terme ET aux faits récents ci-dessus : signale UNIQUEMENT les contradictions factuelles claires et vérifiables (ex: une heure, un lieu, une version des faits qui change), jamais un simple changement d'avis ou d'humeur. Formule l'explication comme un signal à vérifier, jamais comme une accusation.
4. Repère les variations d'humeur notables au cours de la journée (avec heure approximative).
5. Repère des signes comportementaux OBSERVABLES pouvant évoquer un évitement ou un déni (ex: change de sujet après une question précise, dément un fait qu'elle avait elle-même écrit plus tôt) — décris uniquement le comportement observé, jamais une interprétation psychologique.
6. À partir du nombre et de la gravité des incohérences/signes relevés (pas de leur seule existence), donne une estimation prudente "risque_tromperie_estime" (0.0 à 1.0) et son libellé — à utiliser comme un indicateur parmi d'autres, jamais comme une preuve.

Réponds UNIQUEMENT en JSON, au format exact :
{
  "traits": {},
  "ton": "description courte du ton général",
  "sujets_recurrents": ["..."],
  "conseils_comportementaux": ["conseil concret et bienveillant 1", "conseil 2"],
  "nouveaux_faits": [{"fait": "...", "citation": "...", "heure": "HH:MM"}],
  "incoherences_detectees": [{"citation1": "...", "heure1": "HH:MM ou date si fait ancien", "citation2": "...", "heure2": "HH:MM", "explication": "...", "gravite": "faible|modérée|élevée"}],
  "variations_humeur": [{"heure": "HH:MM", "emotion": "...", "intensite": 0.0, "contexte": "..."}],
  "signes_possibles_deni": ["description factuelle du comportement observé"],
  "risque_tromperie_estime": 0.0,
  "risque_tromperie_label": "faible|modéré|élevé"
}
N'invente rien : si un champ ne s'applique pas, renvoie un tableau vide.`;

    try {
      const texte = await appelerGemini(apiKey, model, [{ role: 'user', parts: [{ text: prompt }] }]);
      const analyse = parseJSON<ProfilEtendu>(texte);

      await supabase.from('profils_personnalite').upsert({
        conversation_id: conversationId,
        personne_id: personneId,
        traits: analyse.traits,
        ton: analyse.ton,
        sujets_recurrents: analyse.sujets_recurrents,
        conseils_comportementaux: analyse.conseils_comportementaux,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'conversation_id,personne_id' });

      if (analyse.nouveaux_faits?.length) {
        await supabase.from('faits_cles').insert(
          analyse.nouveaux_faits
            .filter((f) => f?.fait)
            .map((f) => ({
              conversation_id: conversationId,
              personne_id: personneId,
              fait: f.fait,
              citation: f.citation ?? null,
              prononce_le: heureVersISO(f.heure, parisDate, now),
            }))
        );
      }

      if (analyse.incoherences_detectees?.length) {
        await supabase.from('incoherences').insert(
          analyse.incoherences_detectees
            .filter((i) => i?.citation1 && i?.citation2 && i?.explication)
            .map((i) => ({
              conversation_id: conversationId,
              personne_id: personneId,
              citation1: i.citation1,
              date1: heureVersISO(i.heure1, parisDate, now),
              citation2: i.citation2,
              date2: heureVersISO(i.heure2, parisDate, now),
              explication: i.explication,
              gravite: i.gravite ?? 'faible',
            }))
        );
      }

      if (analyse.variations_humeur?.length || profilActuel) {
        const historique = Array.isArray((profilActuel as any)?.historique_emotions) ? (profilActuel as any).historique_emotions : [];
        const nouvelHistorique = [
          ...historique,
          ...(analyse.variations_humeur ?? []).map((v) => ({ ...v, date: parisDate })),
        ].slice(-200); // garde un historique borné
        await supabase.from('profils_personnalite')
          .update({ historique_emotions: nouvelHistorique })
          .eq('conversation_id', conversationId)
          .eq('personne_id', personneId);
      }

      risquesParPersonne[personneId] = {
        estime: analyse.risque_tromperie_estime ?? 0,
        label: analyse.risque_tromperie_label ?? 'faible',
        deni: analyse.signes_possibles_deni ?? [],
        humeur: analyse.variations_humeur ?? [],
      };
    } catch (err) {
      console.error(`[daily-analysis] Analyse profil échouée pour ${personneId}:`, err);
    }
  }

  // 3. Résumé quotidien de la conversation + agrégation du risque
  const transcriptComplet = (msgs as any[])
    .map((m) => `${m.sender_id}: [${getParisTimeString(new Date(m.created_at))}] ${m.type === 'voice' ? (m.ai_analysis?.transcription ?? '[audio]') : m.content}`)
    .join('\n');

  if (transcriptComplet.trim()) {
    try {
      const promptResume = `Résume factuellement cette conversation de couple en 2-4 phrases, sans jugement :\n\n${transcriptComplet}`;
      const resume = await appelerGemini(apiKey, model, [{ role: 'user', parts: [{ text: promptResume }] }]);

      const risques = Object.values(risquesParPersonne);
      const risqueMax = risques.reduce((max, r) => Math.max(max, r.estime ?? 0), 0);
      const labelMax = risques.find((r) => r.estime === risqueMax)?.label ?? 'faible';
      const tousLesDenis = risques.flatMap((r) => r.deni ?? []);
      const toutesLesHumeurs = risques.flatMap((r) => r.humeur ?? []);

      await supabase.from('resumes_quotidiens').upsert({
        conversation_id: conversationId,
        date: parisDate,
        resume: resume.trim(),
        variations_humeur: toutesLesHumeurs,
        signes_possibles_deni: tousLesDenis,
        risque_tromperie_estime: risqueMax,
        risque_tromperie_label: labelMax,
      }, { onConflict: 'conversation_id,date' });
    } catch (err) {
      console.error(`[daily-analysis] Résumé échoué pour conversation ${conversationId}:`, err);
    }
  }

  return { messagesTraites: msgs.length, personnes: personnesIds.length };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders() });
  }

  const now = new Date();
  const parisDate = getParisDateString(now);

  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) {
    return jsonResponse({ error: 'GEMINI_API_KEY manquante' }, 500);
  }
  const model = Deno.env.get('GEMINI_MODEL') ?? DEFAULT_MODEL;

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SERVICE_KEY')!
  );

  let body: { conversationId?: string } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  // ── Mode rattrapage : une conversation précise, déclenchée par le client ──
  if (body.conversationId) {
    const { sub: callerId } = getAuthClaims(req);
    if (!callerId) return jsonResponse({ error: 'unauthorized' }, 401);

    const { data: conv, error: convErr } = await supabase
      .from('conversations')
      .select('participant_ids')
      .eq('id', body.conversationId)
      .maybeSingle();

    if (convErr || !conv || !(conv as any).participant_ids?.includes(callerId)) {
      return jsonResponse({ error: 'forbidden' }, 403);
    }

    const { data: dejaFait } = await supabase
      .from('resumes_quotidiens')
      .select('id')
      .eq('conversation_id', body.conversationId)
      .eq('date', parisDate)
      .maybeSingle();

    if (dejaFait) {
      return jsonResponse({ ok: true, skipped: true, reason: 'déjà analysé aujourd\'hui' }, 200);
    }

    try {
      const resultat = await traiterConversation(supabase, apiKey, model, body.conversationId, now, parisDate);
      return jsonResponse({ ok: true, mode: 'rattrapage', date: parisDate, resultat }, 200);
    } catch (err) {
      console.error('[daily-analysis] Rattrapage échoué:', err);
      return jsonResponse({ error: String(err) }, 500);
    }
  }

  // ── Mode cron : balayage complet, réservé à la Service Key (minuit Paris) ─
  const { role: callerRole } = getAuthClaims(req);
  if (callerRole !== 'service_role') {
    return jsonResponse({ error: 'forbidden' }, 403);
  }

  if (getParisHour(now) !== 0) {
    return jsonResponse({ skipped: true, reason: 'pas minuit à Paris' }, 200);
  }

  const dayStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const resultatParConversation: Record<string, unknown> = {};

  try {
    const { data: messagesRecents, error: errMsgs } = await supabase
      .from('messages')
      .select('conversation_id')
      .gte('created_at', dayStart.toISOString())
      .lte('created_at', now.toISOString())
      .eq('is_deleted', false);

    if (errMsgs) throw errMsgs;

    const conversationIds: string[] = [...new Set((messagesRecents ?? []).map((m: any) => m.conversation_id))] as string[];

    for (const conversationId of conversationIds) {
      try {
        resultatParConversation[conversationId] = await traiterConversation(supabase, apiKey, model, conversationId, now, parisDate);
      } catch (err) {
        console.error(`[daily-analysis] Échec pour conversation ${conversationId}:`, err);
        resultatParConversation[conversationId] = { error: String(err) };
      }
    }

    // Purge de la liste détaillée des flags — uniquement en mode cron, à minuit
    await supabase.rpc('purger_comportements_du_jour');

    return jsonResponse({ ok: true, mode: 'cron', date: parisDate, conversations: resultatParConversation }, 200);
  } catch (err) {
    console.error('[daily-analysis] Échec global:', err);
    return jsonResponse({ error: String(err) }, 500);
  }
});
