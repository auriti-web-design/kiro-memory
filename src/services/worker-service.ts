/**
 * Total Recall Worker Service
 *
 * Lean orchestrator: configures Express, mounts modular routers,
 * manages lifecycle (PID, shutdown, error handling).
 *
 * Routes defined in src/services/routes/:
 *   core.ts         — health, SSE, notify
 *   observations.ts — CRUD observations, knowledge, memory save
 *   summaries.ts    — CRUD summaries
 *   search.ts       — FTS5, hybrid search, timeline
 *   analytics.ts    — overview, timeline, types, sessions
 *   sessions.ts     — sessions, checkpoint, prompts
 *   projects.ts     — project list, aliases, stats
 *   data.ts         — embeddings, retention, export, report
 *   backup.ts       — backup create, list, restore
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import crypto from 'crypto';
import { join, dirname } from 'path';
import { existsSync, mkdirSync, writeFileSync, unlinkSync, chmodSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { TotalRecallDatabase } from './sqlite/Database.js';
import { getHybridSearch } from './search/HybridSearch.js';
import { createWorkerContext, getClients } from './worker-context.js';
import { applyRetention, buildRetentionConfig } from './sqlite/Retention.js';
import { createBackup, rotateBackups } from './sqlite/Backup.js';
import { listConfig, getConfigValue } from '../cli/cli-utils.js';
import { logger } from '../utils/logger.js';
import { DATA_DIR, DB_PATH, BACKUPS_DIR } from '../shared/paths.js';

// Plugin system
import { PluginLoader } from './plugins/PluginLoader.js';
import { PluginRegistry } from './plugins/PluginRegistry.js';

// Modular routers
import { createCoreRouter } from './routes/core.js';
import { createObservationsRouter } from './routes/observations.js';
import { createSummariesRouter } from './routes/summaries.js';
import { createSearchRouter } from './routes/search.js';
import { createAnalyticsRouter } from './routes/analytics.js';
import { createSessionsRouter } from './routes/sessions.js';
import { createProjectsRouter } from './routes/projects.js';
import { createDataRouter } from './routes/data.js';
// Router webhook GitHub
import { createWebhooksRouter } from './routes/webhooks.js';
// Router import/export JSONL
import { createImportExportRouter } from './routes/importexport.js';
// Router documentazione OpenAPI
import { createDocsRouter } from './openapi/index.js';
// Router backup database
import { createBackupRouter } from './routes/backup.js';
// Router plugin system
import { createPluginsRouter } from './routes/plugins.js';
// Router auth + users (multi-user)
import { createAuthRouter } from './routes/auth.js';
import { createUsersRouter } from './routes/users.js';
// Router sharing (read-only JWT access)
import { createSharingRouter } from './routes/sharing.js';

// ── Configuration ──

const __worker_dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.TOTALRECALL_WORKER_PORT || process.env.CONTEXTKIT_WORKER_PORT || 3001;
const HOST = process.env.TOTALRECALL_WORKER_HOST || process.env.CONTEXTKIT_WORKER_HOST || '127.0.0.1';
const PID_FILE = join(DATA_DIR, 'worker.pid');
const TOKEN_FILE = join(DATA_DIR, 'worker.token');

// ── Initialization ──

if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true });
}

// Authentication token for hook → worker communication
const WORKER_TOKEN = crypto.randomBytes(32).toString('hex');
writeFileSync(TOKEN_FILE, WORKER_TOKEN, 'utf-8');
try {
  chmodSync(TOKEN_FILE, 0o600);
} catch (err) {
  if (process.platform !== 'win32') {
    logger.warn('WORKER', `chmod 600 failed on ${TOKEN_FILE}`, {}, err as Error);
  }
}

// Database
const db = new TotalRecallDatabase();
logger.info('WORKER', 'Database initialized');

// Embedding service (lazy, non bloccante)
getHybridSearch().initialize().catch(err => {
  logger.warn('WORKER', 'Embedding initialization failed, FTS5 search only', {}, err as Error);
});

// Shared context for all routers
const ctx = createWorkerContext(db);

// ── Express app ──

const app = express();

// Security: protective HTTP headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      frameSrc: ["'none'"]
    }
  }
}));

// CORS restricted to localhost
app.use(cors({
  origin: [
    `http://localhost:${PORT}`,
    `http://127.0.0.1:${PORT}`,
    `http://${HOST}:${PORT}`
  ],
  credentials: true,
  maxAge: 86400
}));

// Body size limit: 50MB (per supportare import JSONL grandi)
app.use(express.json({ limit: '50mb' }));
// Supporto text/plain per endpoint import JSONL
app.use(express.text({ limit: '50mb', type: 'text/plain' }));

// Global rate limiting: 200 req/min per IP
app.use('/api/', rateLimit({
  windowMs: 60_000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, retry later' }
}));

// ── Mount modular routers ──

app.use(createCoreRouter(ctx, WORKER_TOKEN));
app.use(createObservationsRouter(ctx));
app.use(createSummariesRouter(ctx));
app.use(createSearchRouter(ctx));
app.use(createAnalyticsRouter(ctx));
app.use(createSessionsRouter(ctx));
app.use(createProjectsRouter(ctx));
app.use(createDataRouter(ctx, WORKER_TOKEN));
// Webhook GitHub e API query link
app.use(createWebhooksRouter(ctx));
// Import/export JSONL
app.use(createImportExportRouter(ctx));
// Documentazione OpenAPI interattiva (Swagger UI + spec JSON)
app.use(createDocsRouter());
// Backup database
app.use(createBackupRouter(ctx, WORKER_TOKEN));
// Plugin system
app.use(createPluginsRouter(ctx));
// Auth + Users (multi-user)
app.use(createAuthRouter(ctx));
app.use(createUsersRouter(ctx));
// Sharing (read-only JWT access)
app.use(createSharingRouter(ctx, WORKER_TOKEN));

// ── Static files and viewer ──

app.use(express.static(__worker_dirname, {
  index: false,
  maxAge: '1h'
}));

app.get('/', (_req, res) => {
  const viewerPath = join(__worker_dirname, 'viewer.html');
  if (existsSync(viewerPath)) {
    try {
      res.type('html').send(readFileSync(viewerPath, 'utf-8'));
    } catch {
      res.status(500).json({ error: 'Failed to read viewer.html' });
    }
  } else {
    res.status(404).json({ error: 'Viewer not found. Run npm run build first.' });
  }
});

// ── Job schedulato: cleanup retention automatico ──

/**
 * Avvia il cleanup retention periodico se abilitato nella configurazione.
 * Usa setInterval con intervallo configurabile (default: 24 ore).
 * Il primo run avviene 30 secondi dopo lo startup per non rallentare l'avvio.
 */
function scheduleRetentionCleanup(): void {
  const enabled = getConfigValue('retention.autoCleanupEnabled');
  if (!enabled) {
    logger.info('WORKER', 'Retention automatico disabilitato (retention.autoCleanupEnabled=false)');
    return;
  }

  const intervalHours = Number(getConfigValue('retention.autoCleanupIntervalHours') ?? 24);
  const intervalMs = intervalHours * 3_600_000;

  // Funzione di cleanup riutilizzabile
  function runRetentionCleanup(): void {
    try {
      const config = buildRetentionConfig(listConfig());
      const result = applyRetention(db.db, config);
      if (result.total > 0) {
        logger.info('WORKER', `Retention schedulata: ${result.total} record eliminati (obs=${result.observations}, sum=${result.summaries}, prompts=${result.prompts}, knowledge=${result.knowledge})`);
      } else {
        logger.debug('WORKER', 'Retention schedulata: nessun record da eliminare');
      }
    } catch (err) {
      logger.error('WORKER', 'Retention schedulata fallita', {}, err as Error);
    }
  }

  logger.info('WORKER', `Retention automatica attiva (ogni ${intervalHours}h)`);

  // Esegui alla prima occasione con un ritardo iniziale di 30s per stabilizzare il server
  const startupDelay = setTimeout(runRetentionCleanup, 30_000);

  // Poi esegui periodicamente all'intervallo configurato
  const retentionInterval = setInterval(runRetentionCleanup, intervalMs);

  // Pulisci i timer al termine del processo
  process.once('beforeExit', () => {
    clearTimeout(startupDelay);
    clearInterval(retentionInterval);
  });
}

scheduleRetentionCleanup();

// ── Job schedulato: backup automatico ──

/**
 * Avvia il backup automatico periodico se abilitato nella configurazione.
 * Usa setInterval con intervallo configurabile (default: 24 ore).
 * Il primo run avviene 60 secondi dopo lo startup.
 */
function scheduleBackupJob(): void {
  const enabled = getConfigValue('backup.enabled');
  if (!enabled) {
    logger.info('WORKER', 'Backup automatico disabilitato (backup.enabled=false)');
    return;
  }

  const intervalHours = Number(getConfigValue('backup.intervalHours') ?? 24);
  const maxKeep = Number(getConfigValue('backup.maxKeep') ?? 7);
  const intervalMs = intervalHours * 3_600_000;

  // Funzione di backup riutilizzabile
  function runBackup(): void {
    try {
      const entry = createBackup(DB_PATH, BACKUPS_DIR, db.db);
      logger.info('WORKER', `Backup schedulato creato: ${entry.metadata.filename} (obs=${entry.metadata.stats.observations})`);

      // Rotazione automatica dopo ogni backup
      const deleted = rotateBackups(BACKUPS_DIR, maxKeep);
      if (deleted > 0) {
        logger.info('WORKER', `Rotazione backup: ${deleted} file rimossi, ${maxKeep} mantenuti`);
      }
    } catch (err) {
      logger.error('WORKER', 'Backup schedulato fallito', {}, err as Error);
    }
  }

  logger.info('WORKER', `Backup automatico attivo (ogni ${intervalHours}h, max ${maxKeep} backup)`);

  // Prima esecuzione 60 secondi dopo lo startup (dopo la retention)
  const startupDelay = setTimeout(runBackup, 60_000);

  // Poi esegui periodicamente all'intervallo configurato
  const backupInterval = setInterval(runBackup, intervalMs);

  // Pulisci i timer al termine del processo
  process.once('beforeExit', () => {
    clearTimeout(startupDelay);
    clearInterval(backupInterval);
  });
}

scheduleBackupJob();

// ── Plugin system: discovery e caricamento ──

/**
 * Avvia il plugin loader in modo asincrono e non bloccante.
 * I plugin vengono scoperti e caricati dopo lo startup del server
 * per non ritardare l'avvio. Gli errori di singoli plugin sono isolati.
 */
async function initializePlugins(): Promise<void> {
  try {
    const registry = PluginRegistry.getInstance();

    // Adattatore IPluginRegistry (duck-type per PluginLoader)
    // Il PluginLoader registra plugin via IPlugin del PluginLoader (con PluginContext locale).
    // Questi plugin vengono poi abilitati dal PluginRegistry singleton con il contesto SDK.
    const loaderRegistryAdapter = {
      register: (p: any) => {
        try { registry.register(p as any); }
        catch { /* plugin già registrato, ignora */ }
      },
      unregister: (name: string) => { registry.unregister(name).catch(() => {}); },
      get: (name: string) => registry.get(name) as any
    };

    const pluginLoader = new PluginLoader(loaderRegistryAdapter as any);
    const result = await pluginLoader.loadAll();

    if (result.loaded.length > 0) {
      logger.info('WORKER', `Plugin caricati: ${result.loaded.join(', ')}`);
    }
    if (result.failed.length > 0) {
      for (const { name, error } of result.failed) {
        logger.warn('WORKER', `Plugin "${name}" non caricato: ${error}`);
      }
    }
  } catch (err) {
    // Errore non fatale: il worker continua senza plugin
    logger.warn('WORKER', 'Inizializzazione plugin system fallita', {}, err as Error);
  }
}

// ── Server startup ──

const server = app.listen(Number(PORT), HOST, () => {
  logger.info('WORKER', `Total Recall worker started on http://${HOST}:${PORT}`);
  writeFileSync(PID_FILE, String(process.pid), 'utf-8');

  // Avvia il plugin system in background dopo che il server è attivo.
  // Non bloccante: errori di plugin non impattano il server.
  initializePlugins().catch(err => {
    logger.warn('WORKER', 'Plugin system: errore non gestito', {}, err as Error);
  });
});

// ── Graceful shutdown ──

function shutdown(signal: string): void {
  logger.info('WORKER', `Received ${signal}, shutting down...`);

  // Close all SSE clients to unblock server.close()
  const sseClients = getClients();
  for (const client of sseClients) {
    try { client.end(); } catch { /* ignora errori su client già chiusi */ }
  }

  // Force timeout: if server.close() doesn't complete in 5s, force exit
  const forceTimeout = setTimeout(() => {
    logger.warn('WORKER', 'Forced shutdown after 5s timeout');
    if (existsSync(PID_FILE)) unlinkSync(PID_FILE);
    db.close();
    process.exit(1);
  }, 5000);

  server.close(() => {
    clearTimeout(forceTimeout);
    logger.info('WORKER', 'Server closed');

    if (existsSync(PID_FILE)) {
      unlinkSync(PID_FILE);
    }

    db.close();
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('uncaughtException', (error) => {
  logger.error('WORKER', 'Uncaught exception', {}, error);
  shutdown('uncaughtException');
});

process.on('unhandledRejection', (reason) => {
  logger.error('WORKER', 'Unhandled promise rejection', { reason }, reason as Error);
});
