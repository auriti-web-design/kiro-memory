/**
 * TeamSync — Core team synchronization logic.
 * Exports knowledge to a Git repo and imports from it.
 * Uses child_process for git commands (no git library dependency).
 */

import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { join, basename } from 'node:path';
import { homedir } from 'node:os';
import type { Database } from '../../db/types.js';
import type { Observation } from '../../types/worker-types.js';
import type { KnowledgeMetadata } from '../../types/worker-types.js';
import {
  knowledgeToMarkdown,
  markdownToKnowledge,
  generateFilename,
  generateKnowledgeHash,
} from './TeamFormatter.js';
import type { KnowledgeExportItem, KnowledgeImportItem } from './TeamFormatter.js';

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface TeamConfig {
  repoUrl: string;
  localPath: string;
  syncInterval: number;
  lastSync: string | null;
  /** Filter: minimum importance to export (default: 3) */
  minImportance: number;
}

export interface SyncResult {
  exported: number;
  imported: number;
  conflicts: string[];
  errors: string[];
}

// ─── Constants ──────────────────────────────────────────────────────────────────

const TEAM_CONFIG_DIR = join(homedir(), '.totalrecall');
const TEAM_CONFIG_PATH = join(TEAM_CONFIG_DIR, 'team.json');
const DEFAULT_LOCAL_PATH = join(TEAM_CONFIG_DIR, 'team-repo');
const KNOWLEDGE_DIR_NAME = 'knowledge';

const KNOWLEDGE_TYPES = ['constraint', 'decision', 'heuristic', 'rejected'];

// ─── Config Management ──────────────────────────────────────────────────────────

/** Load team config from disk. Returns null if not initialized. */
export function loadTeamConfig(): TeamConfig | null {
  if (!existsSync(TEAM_CONFIG_PATH)) return null;
  try {
    const raw = readFileSync(TEAM_CONFIG_PATH, 'utf8');
    return JSON.parse(raw) as TeamConfig;
  } catch {
    return null;
  }
}

/** Save team config to disk. */
export function saveTeamConfig(config: TeamConfig): void {
  if (!existsSync(TEAM_CONFIG_DIR)) {
    mkdirSync(TEAM_CONFIG_DIR, { recursive: true });
  }
  writeFileSync(TEAM_CONFIG_PATH, JSON.stringify(config, null, 2) + '\n', 'utf8');
}

// ─── Init ───────────────────────────────────────────────────────────────────────

/**
 * Initialize team sync: clone the remote repo (or init a new one) and save config.
 */
export function initTeamConfig(repoUrl: string, options?: { localPath?: string; syncInterval?: number }): TeamConfig {
  const localPath = options?.localPath ?? DEFAULT_LOCAL_PATH;
  const syncInterval = options?.syncInterval ?? 60;

  // Clone or init
  if (!existsSync(localPath)) {
    mkdirSync(localPath, { recursive: true });
    try {
      execSync(`git clone "${repoUrl}" "${localPath}"`, { stdio: 'pipe', encoding: 'utf8' });
    } catch {
      // If clone fails (empty repo), init locally and set remote
      execSync('git init', { cwd: localPath, stdio: 'pipe' });
      execSync(`git remote add origin "${repoUrl}"`, { cwd: localPath, stdio: 'pipe' });
    }
  }

  // Ensure knowledge directory exists
  const knowledgeDir = join(localPath, KNOWLEDGE_DIR_NAME);
  if (!existsSync(knowledgeDir)) {
    mkdirSync(knowledgeDir, { recursive: true });
  }

  const config: TeamConfig = {
    repoUrl,
    localPath,
    syncInterval,
    lastSync: null,
    minImportance: 3,
  };

  saveTeamConfig(config);
  return config;
}

// ─── Export ─────────────────────────────────────────────────────────────────────

/**
 * Export knowledge items from the database to markdown files.
 * Only exports items with type in KNOWLEDGE_TYPES and importance >= minImportance.
 */
export function exportKnowledge(db: Database, targetDir: string, minImportance: number = 3): number {
  const knowledgeDir = join(targetDir, KNOWLEDGE_DIR_NAME);
  if (!existsSync(knowledgeDir)) {
    mkdirSync(knowledgeDir, { recursive: true });
  }

  // Query all knowledge-type observations
  const placeholders = KNOWLEDGE_TYPES.map(() => '?').join(',');
  const rows = db.query(
    `SELECT * FROM observations WHERE type IN (${placeholders}) ORDER BY created_at_epoch DESC`
  ).all(...KNOWLEDGE_TYPES) as Observation[];

  let exported = 0;

  for (const row of rows) {
    const item = observationToExportItem(row);
    if (item.importance < minImportance) continue;

    const filename = generateFilename(item.project, item.title, item.type);
    const filepath = join(knowledgeDir, filename);
    const markdown = knowledgeToMarkdown(item);
    writeFileSync(filepath, markdown, 'utf8');
    exported++;
  }

  return exported;
}

/**
 * Convert an Observation row to a KnowledgeExportItem.
 * Extracts metadata from the `facts` JSON column.
 */
function observationToExportItem(obs: Observation): KnowledgeExportItem {
  let metadata: Partial<KnowledgeMetadata & { importance?: number }> = {};
  if (obs.facts) {
    try {
      metadata = JSON.parse(obs.facts);
    } catch { /* ignore malformed JSON */ }
  }

  // Importance: from facts JSON, or default to 3 for knowledge types
  const importance = typeof metadata.importance === 'number' ? metadata.importance : 3;

  // Concepts: stored as comma-separated string in the `concepts` column
  const concepts = obs.concepts
    ? obs.concepts.split(',').map(c => c.trim()).filter(Boolean)
    : [];

  const item: KnowledgeExportItem = {
    id: obs.id,
    type: obs.type,
    project: obs.project,
    title: obs.title,
    content: obs.text || '',
    created_at: obs.created_at,
    importance,
    concepts,
  };

  // Type-specific metadata
  if ('reason' in metadata && metadata.reason) {
    item.reason = metadata.reason;
  }
  if ('alternatives' in metadata && Array.isArray(metadata.alternatives)) {
    item.alternatives = metadata.alternatives;
  }
  if ('severity' in metadata && metadata.severity) {
    item.severity = metadata.severity;
  }
  if ('confidence' in metadata && metadata.confidence) {
    item.confidence = metadata.confidence;
  }
  if ('context' in metadata && metadata.context) {
    item.context = metadata.context;
  }

  return item;
}

// ─── Import ─────────────────────────────────────────────────────────────────────

/**
 * Import knowledge from markdown files in sourceDir into the database.
 * Merge strategy: local (DB) has priority — if an item with the same hash exists, skip it.
 * Returns the import result with conflict details.
 */
export function importKnowledge(db: Database, sourceDir: string): SyncResult {
  const knowledgeDir = join(sourceDir, KNOWLEDGE_DIR_NAME);
  if (!existsSync(knowledgeDir)) {
    return { exported: 0, imported: 0, conflicts: [], errors: [] };
  }

  const files = readdirSync(knowledgeDir).filter(f => f.endsWith('.md'));
  const result: SyncResult = { exported: 0, imported: 0, conflicts: [], errors: [] };

  for (const file of files) {
    const filepath = join(knowledgeDir, file);
    try {
      const content = readFileSync(filepath, 'utf8');
      const item = markdownToKnowledge(content, file);
      if (!item) {
        result.errors.push(`${file}: invalid format`);
        continue;
      }

      // Check for existing item with same hash (project + title + type)
      const existingHash = generateKnowledgeHash(item.project, item.title, item.type);
      const existing = findKnowledgeByHash(db, item.project, item.title, item.type);

      if (existing) {
        // Local wins — report conflict
        result.conflicts.push(`${file}: "${item.title}" already exists locally (local wins)`);
        continue;
      }

      // Import the item
      insertKnowledgeFromImport(db, item);
      result.imported++;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      result.errors.push(`${file}: ${msg}`);
    }
  }

  return result;
}

/** Check if knowledge with same project+title+type exists in DB */
function findKnowledgeByHash(db: Database, project: string, title: string, type: string): boolean {
  const row = db.query(
    'SELECT id FROM observations WHERE project = ? AND title = ? AND type = ? LIMIT 1'
  ).get(project, title, type);
  return !!row;
}

/** Insert a knowledge item from an import into the database */
function insertKnowledgeFromImport(db: Database, item: KnowledgeImportItem): void {
  // Rebuild the facts/metadata JSON
  const metadata: Record<string, unknown> = {
    knowledgeType: item.type,
    importance: item.importance,
  };
  if (item.reason) metadata['reason'] = item.reason;
  if (item.alternatives) metadata['alternatives'] = item.alternatives;
  if (item.severity) metadata['severity'] = item.severity;
  if (item.confidence) metadata['confidence'] = item.confidence;
  if (item.context) metadata['context'] = item.context;

  const now = new Date();
  const createdAt = item.created || now.toISOString();
  const createdAtEpoch = new Date(createdAt).getTime() || now.getTime();
  const conceptsStr = item.concepts.length > 0 ? item.concepts.join(', ') : null;

  db.run(
    `INSERT INTO observations
     (memory_session_id, project, type, title, subtitle, text, narrative, facts, concepts, files_read, files_modified, prompt_number, created_at, created_at_epoch, content_hash, discovery_tokens, auto_category)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      `team-sync-${Date.now()}`,
      item.project,
      item.type,
      item.title,
      null,
      item.content,
      null,
      JSON.stringify(metadata),
      conceptsStr,
      null,
      null,
      0,
      createdAt,
      createdAtEpoch,
      null,
      0,
      'knowledge',
    ]
  );
}

// ─── Git Sync ───────────────────────────────────────────────────────────────────

/** Execute a git command in the team repo directory */
function git(localPath: string, command: string): string {
  return execSync(`git ${command}`, {
    cwd: localPath,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
}

/** Check if there are uncommitted changes in the repo */
function hasLocalChanges(localPath: string): boolean {
  const status = git(localPath, 'status --porcelain');
  return status.length > 0;
}

/**
 * Push local knowledge to the configured remote.
 * Export → commit → push.
 */
export function pushKnowledge(db: Database, config: TeamConfig): SyncResult {
  const result: SyncResult = { exported: 0, imported: 0, conflicts: [], errors: [] };

  try {
    // Export knowledge to the local repo
    result.exported = exportKnowledge(db, config.localPath, config.minImportance);

    if (result.exported === 0 && !hasLocalChanges(config.localPath)) {
      return result;
    }

    // Stage, commit, push
    git(config.localPath, 'add -A');

    if (hasLocalChanges(config.localPath)) {
      const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
      git(config.localPath, `commit -m "team-sync: export ${result.exported} items (${timestamp})"`);
    }

    try {
      git(config.localPath, 'push origin HEAD');
    } catch (pushErr) {
      const msg = pushErr instanceof Error ? pushErr.message : String(pushErr);
      result.errors.push(`Push failed: ${msg}`);
    }

    // Update last sync timestamp
    config.lastSync = new Date().toISOString();
    saveTeamConfig(config);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    result.errors.push(`Export failed: ${msg}`);
  }

  return result;
}

/**
 * Pull knowledge from the configured remote.
 * Pull → import (local wins on conflict).
 */
export function pullKnowledge(db: Database, config: TeamConfig): SyncResult {
  const result: SyncResult = { exported: 0, imported: 0, conflicts: [], errors: [] };

  try {
    // Pull from remote
    try {
      git(config.localPath, 'pull origin HEAD --rebase');
    } catch (pullErr) {
      // Pull may fail on empty repos or no upstream
      const msg = pullErr instanceof Error ? pullErr.message : String(pullErr);
      if (!msg.includes("Couldn't find remote ref") && !msg.includes('no tracking information')) {
        result.errors.push(`Pull failed: ${msg}`);
        return result;
      }
    }

    // Import from the local copy
    const importResult = importKnowledge(db, config.localPath);
    result.imported = importResult.imported;
    result.conflicts = importResult.conflicts;
    result.errors.push(...importResult.errors);

    // Update last sync timestamp
    config.lastSync = new Date().toISOString();
    saveTeamConfig(config);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    result.errors.push(`Pull failed: ${msg}`);
  }

  return result;
}

/**
 * Full sync: pull → import → export → push.
 */
export function syncFromRemote(db: Database, config: TeamConfig): SyncResult {
  const pullResult = pullKnowledge(db, config);
  const pushResult = pushKnowledge(db, config);

  return {
    exported: pushResult.exported,
    imported: pullResult.imported,
    conflicts: [...pullResult.conflicts, ...pushResult.conflicts],
    errors: [...pullResult.errors, ...pushResult.errors],
  };
}

/**
 * Get team sync status information.
 */
export function getTeamStatus(config: TeamConfig): {
  configured: boolean;
  repoUrl: string;
  localPath: string;
  lastSync: string | null;
  syncInterval: number;
  localKnowledgeCount: number;
} {
  const knowledgeDir = join(config.localPath, KNOWLEDGE_DIR_NAME);
  let localKnowledgeCount = 0;
  if (existsSync(knowledgeDir)) {
    localKnowledgeCount = readdirSync(knowledgeDir).filter(f => f.endsWith('.md')).length;
  }

  return {
    configured: true,
    repoUrl: config.repoUrl,
    localPath: config.localPath,
    lastSync: config.lastSync,
    syncInterval: config.syncInterval,
    localKnowledgeCount,
  };
}
