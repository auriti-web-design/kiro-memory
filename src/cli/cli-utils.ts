/**
 * Funzioni CLI testabili estratte dal CLI principale.
 * Questo modulo non ha dipendenze da process.argv e non chiama process.exit,
 * rendendolo adatto per i test unitari.
 */

import { existsSync, statSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { Observation } from '../types/worker-types.js';
import { DATA_DIR } from '../shared/paths.js';

// ─── Tipi pubblici ───

export type ExportFormat = 'jsonl' | 'json' | 'md';

export interface ExportOptions {
  format: ExportFormat;
  project: string;
  output?: string;         // percorso file; se omesso, ritorna la stringa
  outputFn?: (line: string) => void; // intercetta l'output per i test
}

export interface ImportResult {
  imported: number;
  total: number;
  duplicates: number;
}

export interface DoctorFixResult {
  ftsRebuilt: boolean;
  embeddingsRemoved: number;
  vacuumed: boolean;
  messages: string[];
}

export interface StatsResult {
  totalObservations: number;
  totalSessions: number;
  totalProjects: number;
  dbSizeBytes: number;
  mostActiveProject: string | null;
  embeddingCoverage: number;
}

export interface ConfigValue {
  key: string;
  value: string | number | boolean | null;
}

// ─── Export: generatori di formato ───

/**
 * Converte un'observation in una riga JSONL.
 * Una riga per observation — compatibile con stream e import successivo.
 */
export function observationToJsonl(obs: Observation): string {
  return JSON.stringify(obs);
}

/**
 * Converte un array di observations in un blocco JSONL (una riga per obs).
 */
export function generateJsonlOutput(observations: Observation[]): string {
  return observations.map(observationToJsonl).join('\n');
}

/**
 * Converte un array di observations in JSON compatto (array completo).
 */
export function generateJsonOutput(observations: Observation[]): string {
  return JSON.stringify(observations, null, 2);
}

/**
 * Converte un'observation in markdown.
 * Formato: ## titolo + metadati + contenuto.
 */
export function observationToMarkdown(obs: Observation): string {
  const date = new Date(obs.created_at).toLocaleDateString('it-IT', {
    year: 'numeric', month: 'long', day: 'numeric'
  });

  const lines: string[] = [
    `## ${obs.title}`,
    '',
    `- **Tipo:** ${obs.type}`,
    `- **Progetto:** ${obs.project}`,
    `- **Data:** ${date}`,
  ];

  if (obs.subtitle) lines.push(`- **Sottotitolo:** ${obs.subtitle}`);
  if (obs.files_modified) lines.push(`- **File modificati:** ${obs.files_modified}`);
  if (obs.files_read) lines.push(`- **File letti:** ${obs.files_read}`);

  if (obs.text) {
    lines.push('', '### Contenuto', '', obs.text);
  }

  if (obs.narrative) {
    lines.push('', '### Narrativa', '', obs.narrative);
  }

  if (obs.facts) {
    lines.push('', '### Fatti', '', obs.facts);
  }

  lines.push('');
  return lines.join('\n');
}

/**
 * Converte un array di observations in markdown con separatori.
 */
export function generateMarkdownOutput(observations: Observation[]): string {
  if (observations.length === 0) return '# Nessuna observation trovata\n';

  const header = [
    '# Total Recall — Export Observations',
    '',
    `> Progetto: ${observations[0].project} | Totale: ${observations.length}`,
    '',
    '---',
    '',
  ].join('\n');

  return header + observations.map(observationToMarkdown).join('\n---\n\n');
}

/**
 * Seleziona la funzione di generazione in base al formato.
 */
export function generateExportOutput(observations: Observation[], format: ExportFormat): string {
  switch (format) {
    case 'jsonl':
      return generateJsonlOutput(observations);
    case 'json':
      return generateJsonOutput(observations);
    case 'md':
      return generateMarkdownOutput(observations);
  }
}

// ─── Import: validazione e parsing ───

/**
 * Interfaccia minima per un record importabile da JSONL.
 * I campi obbligatori sono project, type e title.
 */
export interface ImportRecord {
  project: string;
  type: string;
  title: string;
  memory_session_id?: string;
  subtitle?: string | null;
  text?: string | null;
  narrative?: string | null;
  facts?: string | null;
  concepts?: string | null;
  files_read?: string | null;
  files_modified?: string | null;
  prompt_number?: number;
  content_hash?: string | null;
  discovery_tokens?: number;
}

/**
 * Valida un record importato da JSONL.
 * Ritorna null se il record è valido, altrimenti la descrizione dell'errore.
 */
export function validateImportRecord(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object') {
    return 'Record non è un oggetto JSON valido';
  }

  const rec = raw as Record<string, unknown>;

  if (!rec.project || typeof rec.project !== 'string' || rec.project.trim() === '') {
    return 'Campo "project" obbligatorio (stringa non vuota)';
  }
  if (!rec.type || typeof rec.type !== 'string' || rec.type.trim() === '') {
    return 'Campo "type" obbligatorio (stringa non vuota)';
  }
  if (!rec.title || typeof rec.title !== 'string' || rec.title.trim() === '') {
    return 'Campo "title" obbligatorio (stringa non vuota)';
  }

  // Lunghezze massime di sicurezza
  if ((rec.project as string).length > 200) return '"project" troppo lungo (max 200 caratteri)';
  if ((rec.type as string).length > 100) return '"type" troppo lungo (max 100 caratteri)';
  if ((rec.title as string).length > 500) return '"title" troppo lungo (max 500 caratteri)';

  // Campi opzionali: se presenti, devono essere stringa o null
  for (const field of ['subtitle', 'text', 'narrative', 'facts', 'concepts', 'files_read', 'files_modified', 'content_hash']) {
    const val = rec[field];
    if (val !== undefined && val !== null && typeof val !== 'string') {
      return `Campo "${field}" deve essere stringa o null`;
    }
  }

  return null; // record valido
}

/**
 * Analizza un file JSONL e ritorna array di record con errori per riga.
 * Filtra le righe vuote e i commenti (#).
 */
export function parseJsonlFile(content: string): Array<{ line: number; record?: ImportRecord; error?: string }> {
  const lines = content.split('\n');
  const results: Array<{ line: number; record?: ImportRecord; error?: string }> = [];

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trim();

    // Salta righe vuote e commenti
    if (!raw || raw.startsWith('#')) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      results.push({ line: i + 1, error: `JSON non valido: ${raw.substring(0, 50)}` });
      continue;
    }

    const validationError = validateImportRecord(parsed);
    if (validationError) {
      results.push({ line: i + 1, error: validationError });
      continue;
    }

    results.push({ line: i + 1, record: parsed as ImportRecord });
  }

  return results;
}

// ─── Config: gestione <data-dir>/config.json ───

/** Percorso di default del file di configurazione */
export function getConfigPath(): string {
  return join(DATA_DIR, 'config.json');
}

/** Valori di configurazione predefiniti */
export const CONFIG_DEFAULTS: Record<string, string | number | boolean> = {
  'worker.port': 3001,
  'worker.host': '127.0.0.1',
  'log.level': 'INFO',
  'search.limit': 20,
  'embeddings.enabled': false,
  'decay.staleThresholdDays': 30,
  // Politiche di retention: età massima in giorni (0 = mai eliminare)
  'retention.observations.maxAgeDays': 90,
  'retention.summaries.maxAgeDays': 365,
  'retention.prompts.maxAgeDays': 30,
  'retention.knowledge.maxAgeDays': 0,
  // Cleanup automatico schedulato
  'retention.autoCleanupEnabled': true,
  'retention.autoCleanupIntervalHours': 24,
  // Backup automatico schedulato
  'backup.enabled': true,
  'backup.intervalHours': 24,
  'backup.maxKeep': 7,
  'backup.compress': false,
  // Multi-user authentication (disabled by default = single-user mode)
  'auth.enabled': false,
  'auth.jwt_secret': '',
};

/**
 * Legge la configurazione da file.
 * Ritorna oggetto vuoto se il file non esiste.
 */
export function readConfig(configPath?: string): Record<string, string | number | boolean | null> {
  const path = configPath || getConfigPath();

  if (!existsSync(path)) return {};

  try {
    const raw = readFileSync(path, 'utf8');
    const parsed = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null) return parsed;
    return {};
  } catch {
    return {};
  }
}

/**
 * Scrive la configurazione su file.
 * Crea la directory se non esiste.
 */
export function writeConfig(
  config: Record<string, string | number | boolean | null>,
  configPath?: string
): void {
  const path = configPath || getConfigPath();
  const dir = path.substring(0, path.lastIndexOf('/'));

  mkdirSync(dir, { recursive: true });
  writeFileSync(path, JSON.stringify(config, null, 2), 'utf8');
}

/**
 * Legge un singolo valore dalla configurazione.
 * Fallback ai valori di default se non trovato.
 */
export function getConfigValue(
  key: string,
  configPath?: string
): string | number | boolean | null {
  const config = readConfig(configPath);

  if (key in config) return config[key];
  if (key in CONFIG_DEFAULTS) return CONFIG_DEFAULTS[key];
  return null;
}

/**
 * Imposta un singolo valore nella configurazione.
 * Converte automaticamente il tipo (numero, booleano, stringa).
 */
export function setConfigValue(
  key: string,
  rawValue: string,
  configPath?: string
): string | number | boolean {
  const config = readConfig(configPath);

  // Prova a convertire nel tipo appropriato
  let value: string | number | boolean = rawValue;

  if (rawValue === 'true') value = true;
  else if (rawValue === 'false') value = false;
  else {
    const num = Number(rawValue);
    if (!isNaN(num) && rawValue.trim() !== '') value = num;
  }

  config[key] = value;
  writeConfig(config, configPath);
  return value;
}

/**
 * Lista tutte le chiavi di configurazione (merge default + file).
 */
export function listConfig(configPath?: string): Record<string, string | number | boolean | null> {
  const config = readConfig(configPath);

  // Merge: default sovrascritta da config file
  const merged: Record<string, string | number | boolean | null> = { ...CONFIG_DEFAULTS };
  for (const [k, v] of Object.entries(config)) {
    merged[k] = v;
  }

  return merged;
}

// ─── Stats: formato output ───

/**
 * Formatta il numero di byte in una stringa leggibile (KB, MB, GB).
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/**
 * Recupera la dimensione del file del database.
 * Ritorna 0 se il file non esiste.
 */
export function getDbFileSize(dbPath: string): number {
  try {
    if (!existsSync(dbPath)) return 0;
    return statSync(dbPath).size;
  } catch {
    return 0;
  }
}

/**
 * Formatta il risultato delle statistiche in testo leggibile.
 */
export function formatStatsOutput(stats: StatsResult): string {
  const lines: string[] = [
    '',
    '=== Total Recall — Statistiche Database ===',
    '',
    `  Observations totali:   ${stats.totalObservations}`,
    `  Sessioni totali:       ${stats.totalSessions}`,
    `  Progetti distinti:     ${stats.totalProjects}`,
    `  Dimensione DB:         ${formatBytes(stats.dbSizeBytes)}`,
  ];

  if (stats.mostActiveProject) {
    lines.push(`  Progetto piu' attivo:  ${stats.mostActiveProject}`);
  }

  const coverage = stats.embeddingCoverage;
  const coverageBar = buildProgressBar(coverage, 20);
  lines.push(`  Copertura embeddings:  ${coverageBar} ${coverage}%`);

  lines.push('');
  return lines.join('\n');
}

/**
 * Costruisce una barra di avanzamento ASCII.
 */
export function buildProgressBar(percent: number, width: number = 20): string {
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;
  return `[${'#'.repeat(filled)}${'-'.repeat(empty)}]`;
}

// ─── Import/Export JSONL: opzioni CLI ───

/** Opzioni per il comando CLI export JSONL */
export interface JsonlExportOptions {
  output?: string;         // percorso file output; se omesso, stampa su stdout
  project?: string;        // filtra per progetto
  type?: string;           // filtra per tipo observation
  from?: string;           // data inizio ISO
  to?: string;             // data fine ISO
}

/** Opzioni per il comando CLI import JSONL */
export interface JsonlImportOptions {
  dryRun?: boolean;        // dry-run: mostra conteggio senza inserire
}

/**
 * Formatta il risultato di un import JSONL in testo leggibile.
 */
export function formatImportResult(result: {
  imported: number;
  skipped: number;
  errors: number;
  total: number;
  dryRun: boolean;
  errorDetails?: Array<{ line: number; error: string }>;
}): string {
  const prefix = result.dryRun ? '[DRY RUN] ' : '';
  const lines: string[] = [
    '',
    `=== ${prefix}Total Recall — Import JSONL ===`,
    '',
    `  Record totali analizzati: ${result.total}`,
    `  Importati:                ${result.imported}`,
    `  Saltati (duplicati):      ${result.skipped}`,
    `  Errori di validazione:    ${result.errors}`,
  ];

  if (result.dryRun) {
    lines.push('');
    lines.push('  (Dry run: nessun dato inserito. Rimuovi --dry-run per applicare.)');
  }

  if (result.errorDetails && result.errorDetails.length > 0) {
    lines.push('');
    lines.push('  Errori:');
    for (const err of result.errorDetails.slice(0, 20)) {
      lines.push(`    Riga ${err.line}: ${err.error}`);
    }
    if (result.errorDetails.length > 20) {
      lines.push(`    ... e altri ${result.errorDetails.length - 20} errori`);
    }
  }

  lines.push('');
  return lines.join('\n');
}

// ─── Doctor fix: operazioni riparazione ───

/**
 * Verifica se un indice FTS5 è danneggiato eseguendo una query di integrità.
 * Ritorna true se l'indice è integro.
 */
export function checkFtsIntegrity(db: import('../db/types.js').Database): boolean {
  try {
    // fts5 integrity check: eseguire insert fittizio su tabella shadow causa errore se corrotta
    db.query("INSERT INTO observations_fts(observations_fts) VALUES('integrity-check')").run();
    return true;
  } catch {
    return false;
  }
}

/**
 * Ricostruisce l'indice FTS5 per le observations.
 * Ritorna true se l'operazione è riuscita.
 */
export function rebuildFtsIndex(db: import('../db/types.js').Database): boolean {
  try {
    db.run("INSERT INTO observations_fts(observations_fts) VALUES('rebuild')");
    return true;
  } catch {
    return false;
  }
}

/**
 * Rimuove gli embeddings orfani (observation_id non più presente).
 * Ritorna il numero di record rimossi.
 */
export function removeOrphanedEmbeddings(db: import('../db/types.js').Database): number {
  try {
    const result = db.run(
      `DELETE FROM observation_embeddings
       WHERE observation_id NOT IN (SELECT id FROM observations)`
    );
    return Number(result.changes);
  } catch {
    return 0;
  }
}

/**
 * Esegue VACUUM sul database per recuperare spazio.
 * Ritorna true se l'operazione è riuscita.
 */
export function vacuumDatabase(db: import('../db/types.js').Database): boolean {
  try {
    db.run('VACUUM');
    return true;
  } catch {
    return false;
  }
}
