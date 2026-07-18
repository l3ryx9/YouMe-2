/**
 * Logger centralisé — YouMe
 *
 * Toute erreur, requête échouée ou événement Supabase passe par ici.
 * Fonctions exportées :
 *   logInfo(context, details?)  — requête réussie, événement normal
 *   logWarn(context, details?)  — situation anormale non bloquante
 *   logError(context, error)    — erreur / requête échouée
 *   installGlobalErrorHandlers() — capture les crashes JS non gérés (appeler au démarrage)
 *   getLogs() / subscribeToLogs() / clearLogs() — consultation du journal
 *   formatErrorForUser(error, fallback?) — message lisible pour l'utilisateur
 */

export type LogLevel = 'info' | 'warn' | 'error';

export interface AppLogEntry {
  timestamp: string;
  level: LogLevel;
  context: string;
  code: string;
  message: string;
  stack?: string;
}

/** Métadonnées envoyées avec chaque entrée distante. */
export interface RemoteLogMeta {
  userId?: string;
  platform?: string;
  appVersion?: string;
}

/**
 * Handler injecté par l'application pour envoyer les erreurs vers Supabase.
 * Doit être fire-and-forget (ne jamais throw).
 */
type RemoteHandler = (entry: AppLogEntry, meta: RemoteLogMeta) => void;

let _remoteHandler: RemoteHandler | null = null;
let _getRemoteMeta: (() => RemoteLogMeta) | null = null;

/**
 * Configure l'envoi distant des logs (warn + error) vers Supabase.
 * À appeler une seule fois au démarrage depuis _layout.tsx.
 *
 * @param handler    Fonction fire-and-forget qui insère l'entrée en base.
 * @param getMeta    Retourne les métadonnées dynamiques (userId, platform…).
 */
export function configureRemoteLogging(
  handler: RemoteHandler,
  getMeta: () => RemoteLogMeta
): void {
  _remoteHandler = handler;
  _getRemoteMeta = getMeta;
}

const MAX_LOGS = 300;
const logs: AppLogEntry[] = [];
type Listener = (logs: AppLogEntry[]) => void;
const listeners = new Set<Listener>();

function extractCode(error: any): string {
  if (!error) return 'unknown';
  if (typeof error.code === 'string' && error.code.length > 0) return error.code;
  if (typeof error.name === 'string' && error.name !== 'Error') return error.name;
  return 'unknown';
}

function extractMessage(error: any): string {
  if (!error) return 'Erreur inconnue';
  if (typeof error.message === 'string' && error.message.length > 0) return error.message;
  return String(error);
}

function extractStack(error: any): string | undefined {
  if (error && typeof error.stack === 'string' && error.stack.length > 0) return error.stack;
  return undefined;
}

function push(entry: AppLogEntry, sendRemote = false): AppLogEntry {
  logs.unshift(entry);
  if (logs.length > MAX_LOGS) logs.length = MAX_LOGS;
  listeners.forEach((l) => l(logs));

  // Envoi distant (fire-and-forget) pour warn et error uniquement
  if (sendRemote && _remoteHandler && _getRemoteMeta) {
    try {
      _remoteHandler(entry, _getRemoteMeta());
    } catch {
      // Silencieux — ne jamais laisser le logger planter l'app
    }
  }

  return entry;
}

// ─── API publique ──────────────────────────────────────────────────────────────

/**
 * Trace un événement normal (requête réussie, souscription démarrée, etc.).
 */
export function logInfo(context: string, details?: Record<string, unknown>): AppLogEntry {
  const entry: AppLogEntry = {
    timestamp: new Date().toISOString(),
    level: 'info',
    context,
    code: 'info',
    message: details ? JSON.stringify(details) : 'ok',
  };
  // eslint-disable-next-line no-console
  console.log(`[${entry.context}] ${entry.message}`);
  return push(entry);
}

/**
 * Trace une situation anormale non bloquante (fallback utilisé, valeur inattendue, etc.).
 * Envoyé vers Supabase si le handler distant est configuré.
 */
export function logWarn(context: string, details?: Record<string, unknown>): AppLogEntry {
  const entry: AppLogEntry = {
    timestamp: new Date().toISOString(),
    level: 'warn',
    context,
    code: 'warn',
    message: details ? JSON.stringify(details) : 'warning',
  };
  // eslint-disable-next-line no-console
  console.warn(`[${entry.context}] ${entry.message}`);
  return push(entry, true);
}

/**
 * Enregistre une erreur : requête échouée, exception, crash.
 * Affiche le code technique dans la console, garde l'entrée en mémoire
 * et l'envoie vers Supabase si le handler distant est configuré.
 */
export function logError(context: string, error: any): AppLogEntry {
  const entry: AppLogEntry = {
    timestamp: new Date().toISOString(),
    level: 'error',
    context,
    code: extractCode(error),
    message: extractMessage(error),
    stack: extractStack(error),
  };
  // eslint-disable-next-line no-console
  console.error(`[${entry.context}] (${entry.code}) ${entry.message}`, error);
  return push(entry, true);
}

/**
 * Formate un message d'erreur lisible incluant le code technique,
 * à utiliser dans les Alert.alert() affichées à l'utilisateur.
 */
export function formatErrorForUser(error: any, fallbackMessage?: string): string {
  const code = extractCode(error);
  const message = fallbackMessage ?? extractMessage(error);
  return code !== 'unknown' ? `${message}\n\n(code: ${code})` : message;
}

export function getLogs(): AppLogEntry[] {
  return logs;
}

export function subscribeToLogs(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function clearLogs(): void {
  logs.length = 0;
  listeners.forEach((l) => l(logs));
}

// ─── Gestionnaires globaux ─────────────────────────────────────────────────────

let globalHandlersInstalled = false;

/**
 * Capture TOUS les problèmes de l'application dans le journal :
 *  - exceptions JS non interceptées (plantages) ;
 *  - promesses rejetées sans .catch() (sinon totalement silencieuses).
 * À appeler une seule fois, au démarrage de l'app (voir app/_layout.tsx).
 */
export function installGlobalErrorHandlers(): void {
  if (globalHandlersInstalled) return;
  globalHandlersInstalled = true;

  const errorUtils = (global as any).ErrorUtils;
  if (errorUtils?.setGlobalHandler) {
    const defaultHandler = errorUtils.getGlobalHandler?.();
    errorUtils.setGlobalHandler((error: any, isFatal?: boolean) => {
      logError(isFatal ? 'UncaughtException [FATAL]' : 'UncaughtException', error);
      defaultHandler?.(error, isFatal);
    });
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const rejectionTracking = require('promise/setimmediate/rejection-tracking');
    rejectionTracking.enable({
      allRejections: true,
      onUnhandled: (_id: number, error: any) => {
        logError('UnhandledPromiseRejection', error);
      },
      onHandled: () => {},
    });
  } catch {
    // Module de suivi des promesses indisponible sur cette version de RN : non bloquant.
  }
}
