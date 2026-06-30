/**
 * Team Sync module — export/import shared knowledge base via Git.
 */

export {
  loadTeamConfig,
  saveTeamConfig,
  initTeamConfig,
  exportKnowledge,
  importKnowledge,
  pushKnowledge,
  pullKnowledge,
  syncFromRemote,
  getTeamStatus,
} from './TeamSync.js';
export type { TeamConfig, SyncResult } from './TeamSync.js';

export {
  knowledgeToMarkdown,
  markdownToKnowledge,
  generateFilename,
  generateKnowledgeHash,
} from './TeamFormatter.js';
export type { KnowledgeExportItem, KnowledgeImportItem } from './TeamFormatter.js';
