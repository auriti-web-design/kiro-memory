import { Database } from '../../db/index.js';
import type { DatabaseInterface } from '../../db/index.js';
import { DATA_DIR, DB_PATH, ensureDir } from '../../shared/paths.js';
import { logger } from '../../utils/logger.js';

// SQLite configuration constants
const SQLITE_MMAP_SIZE_BYTES = 256 * 1024 * 1024; // 256MB
const SQLITE_CACHE_SIZE_PAGES = 10_000;

export interface Migration {
  version: number;
  up: (db: DatabaseInterface) => void;
  down?: (db: DatabaseInterface) => void;
}



/**
 * TotalRecallDatabase - Main entry point for the sqlite module
 *
 * Sets up SQLite with optimized settings and runs all migrations.
 *
 * Usage:
 *   const db = new TotalRecallDatabase();  // uses default DB_PATH
 *   const db = new TotalRecallDatabase('/path/to/db.sqlite');
 *   const db = new TotalRecallDatabase(':memory:');  // for tests
 */
export class TotalRecallDatabase {
  private _db: DatabaseInterface;

  /**
   * Readonly accessor for the underlying Database instance.
   * Prefer using query() and run() proxy methods directly.
   */
  get db(): DatabaseInterface {
    return this._db;
  }

  /**
   * @param dbPath - Path to the SQLite file (default: DB_PATH)
   * @param skipMigrations - If true, skip the migration runner (for high-frequency hooks)
   */
  constructor(dbPath: string = DB_PATH, skipMigrations: boolean = false) {
    // Ensure data directory exists (skip for in-memory databases)
    if (dbPath !== ':memory:') {
      ensureDir(DATA_DIR);
    }

    // Create database connection
    this._db = new Database(dbPath, { create: true, readwrite: true });

    // Apply optimized SQLite settings
    this._db.run('PRAGMA journal_mode = WAL');
    this._db.run('PRAGMA busy_timeout = 5000'); // Wait up to 5s on concurrent lock (hook + worker)
    this._db.run('PRAGMA synchronous = NORMAL');
    this._db.run('PRAGMA foreign_keys = ON');
    this._db.run('PRAGMA temp_store = memory');
    this._db.run(`PRAGMA mmap_size = ${SQLITE_MMAP_SIZE_BYTES}`);
    this._db.run(`PRAGMA cache_size = ${SQLITE_CACHE_SIZE_PAGES}`);

    // Run migrations only if needed (hooks skip them for performance)
    if (!skipMigrations) {
      const migrationRunner = new MigrationRunner(this._db);
      migrationRunner.runAllMigrations();
    }
  }

  /**
   * Prepare a query (delegates to underlying Database).
   * Proxy method to avoid ctx.db.db.query() double access.
   */
  query(sql: string) {
    return this._db.query(sql);
  }

  /**
   * Execute a SQL statement without results (delegates to underlying Database).
   * Proxy method to avoid ctx.db.db.run() double access.
   */
  run(sql: string, params?: any[]) {
    return this._db.run(sql, params);
  }

  /**
   * Executes a function within an atomic transaction.
   * If fn() throws an error, the transaction is automatically rolled back.
   */
  withTransaction<T>(fn: (db: DatabaseInterface) => T): T {
    const transaction = this._db.transaction(fn);
    return transaction(this._db);
  }

  /**
   * Close the database connection
   */
  close(): void {
    this._db.close();
  }
}

/**
 * Migration runner for Total Recall
 */
class MigrationRunner {
  private db: DatabaseInterface;

  constructor(db: DatabaseInterface) {
    this.db = db;
  }

  runAllMigrations(): void {
    // Create schema_versions table if not exists
    this.db.run(`
      CREATE TABLE IF NOT EXISTS schema_versions (
        id INTEGER PRIMARY KEY,
        version INTEGER UNIQUE NOT NULL,
        applied_at TEXT NOT NULL
      )
    `);

    // Get current version
    const versionQuery = this.db.query('SELECT MAX(version) as version FROM schema_versions');
    const result = versionQuery.get() as { version: number } | null;
    const currentVersion = result?.version || 0;

    // Run migrations
    const migrations = this.getMigrations();
    for (const migration of migrations) {
      if (migration.version > currentVersion) {
        logger.info('DB', `Applying migration ${migration.version}`);
        
        const transaction = this.db.transaction(() => {
          migration.up(this.db);
          const insert = this.db.query('INSERT INTO schema_versions (version, applied_at) VALUES (?, ?)');
          insert.run(migration.version, new Date().toISOString());
        });
        
        transaction();
        logger.info('DB', `Migration ${migration.version} applied successfully`);
      }
    }
  }

  private getMigrations(): Migration[] {
    return [
      {
        version: 1,
        up: (db) => {
          // Sessions table
          db.run(`
            CREATE TABLE IF NOT EXISTS sessions (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              content_session_id TEXT NOT NULL UNIQUE,
              project TEXT NOT NULL,
              user_prompt TEXT NOT NULL,
              memory_session_id TEXT,
              status TEXT DEFAULT 'active',
              started_at TEXT NOT NULL,
              started_at_epoch INTEGER NOT NULL,
              completed_at TEXT,
              completed_at_epoch INTEGER
            )
          `);

          // Observations table
          db.run(`
            CREATE TABLE IF NOT EXISTS observations (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              memory_session_id TEXT NOT NULL,
              project TEXT NOT NULL,
              type TEXT NOT NULL,
              title TEXT NOT NULL,
              subtitle TEXT,
              text TEXT,
              narrative TEXT,
              facts TEXT,
              concepts TEXT,
              files_read TEXT,
              files_modified TEXT,
              prompt_number INTEGER NOT NULL,
              created_at TEXT NOT NULL,
              created_at_epoch INTEGER NOT NULL
            )
          `);

          // Summaries table
          db.run(`
            CREATE TABLE IF NOT EXISTS summaries (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              session_id TEXT NOT NULL,
              project TEXT NOT NULL,
              request TEXT,
              investigated TEXT,
              learned TEXT,
              completed TEXT,
              next_steps TEXT,
              notes TEXT,
              created_at TEXT NOT NULL,
              created_at_epoch INTEGER NOT NULL
            )
          `);

          // Prompts table
          db.run(`
            CREATE TABLE IF NOT EXISTS prompts (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              content_session_id TEXT NOT NULL,
              project TEXT NOT NULL,
              prompt_number INTEGER NOT NULL,
              prompt_text TEXT NOT NULL,
              created_at TEXT NOT NULL,
              created_at_epoch INTEGER NOT NULL
            )
          `);

          // Pending messages table
          db.run(`
            CREATE TABLE IF NOT EXISTS pending_messages (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              content_session_id TEXT NOT NULL,
              type TEXT NOT NULL,
              data TEXT NOT NULL,
              created_at TEXT NOT NULL,
              created_at_epoch INTEGER NOT NULL
            )
          `);

          // Indexes
          db.run('CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project)');
          db.run('CREATE INDEX IF NOT EXISTS idx_observations_project ON observations(project)');
          db.run('CREATE INDEX IF NOT EXISTS idx_observations_session ON observations(memory_session_id)');
          db.run('CREATE INDEX IF NOT EXISTS idx_summaries_session ON summaries(session_id)');
          db.run('CREATE INDEX IF NOT EXISTS idx_prompts_session ON prompts(content_session_id)');
        }
      },
      {
        version: 2,
        up: (db) => {
          // FTS5 table for full-text search on observations
          db.run(`
            CREATE VIRTUAL TABLE IF NOT EXISTS observations_fts USING fts5(
              title, text, narrative, concepts,
              content='observations',
              content_rowid='id'
            )
          `);

          // Triggers to keep FTS5 synchronized
          db.run(`
            CREATE TRIGGER IF NOT EXISTS observations_ai AFTER INSERT ON observations BEGIN
              INSERT INTO observations_fts(rowid, title, text, narrative, concepts)
              VALUES (new.id, new.title, new.text, new.narrative, new.concepts);
            END
          `);

          db.run(`
            CREATE TRIGGER IF NOT EXISTS observations_ad AFTER DELETE ON observations BEGIN
              INSERT INTO observations_fts(observations_fts, rowid, title, text, narrative, concepts)
              VALUES ('delete', old.id, old.title, old.text, old.narrative, old.concepts);
            END
          `);

          db.run(`
            CREATE TRIGGER IF NOT EXISTS observations_au AFTER UPDATE ON observations BEGIN
              INSERT INTO observations_fts(observations_fts, rowid, title, text, narrative, concepts)
              VALUES ('delete', old.id, old.title, old.text, old.narrative, old.concepts);
              INSERT INTO observations_fts(rowid, title, text, narrative, concepts)
              VALUES (new.id, new.title, new.text, new.narrative, new.concepts);
            END
          `);

          // Backfill existing observations into the FTS5 table
          db.run(`
            INSERT INTO observations_fts(rowid, title, text, narrative, concepts)
            SELECT id, title, text, narrative, concepts FROM observations
          `);

          // Additional indexes for search performance
          db.run('CREATE INDEX IF NOT EXISTS idx_observations_type ON observations(type)');
          db.run('CREATE INDEX IF NOT EXISTS idx_observations_epoch ON observations(created_at_epoch)');
          db.run('CREATE INDEX IF NOT EXISTS idx_summaries_project ON summaries(project)');
          db.run('CREATE INDEX IF NOT EXISTS idx_summaries_epoch ON summaries(created_at_epoch)');
          db.run('CREATE INDEX IF NOT EXISTS idx_prompts_project ON prompts(project)');
        }
      },
      {
        version: 3,
        up: (db) => {
          // Alias table for renaming projects in the UI
          db.run(`
            CREATE TABLE IF NOT EXISTS project_aliases (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              project_name TEXT NOT NULL UNIQUE,
              display_name TEXT NOT NULL,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            )
          `);

          db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_project_aliases_name ON project_aliases(project_name)');
        }
      },
      {
        version: 4,
        up: (db) => {
          // Embeddings table for local semantic search
          db.run(`
            CREATE TABLE IF NOT EXISTS observation_embeddings (
              observation_id INTEGER PRIMARY KEY,
              embedding BLOB NOT NULL,
              model TEXT NOT NULL,
              dimensions INTEGER NOT NULL,
              created_at TEXT NOT NULL,
              FOREIGN KEY (observation_id) REFERENCES observations(id) ON DELETE CASCADE
            )
          `);

          db.run('CREATE INDEX IF NOT EXISTS idx_embeddings_model ON observation_embeddings(model)');
        }
      },
      {
        version: 5,
        up: (db) => {
          // Track last access (search that found the observation)
          db.run('ALTER TABLE observations ADD COLUMN last_accessed_epoch INTEGER');
          // Stale flag: 0 = fresh, 1 = file modified after the observation
          db.run('ALTER TABLE observations ADD COLUMN is_stale INTEGER DEFAULT 0');
          // Index for decay queries
          db.run('CREATE INDEX IF NOT EXISTS idx_observations_last_accessed ON observations(last_accessed_epoch)');
          // Index for stale queries
          db.run('CREATE INDEX IF NOT EXISTS idx_observations_stale ON observations(is_stale)');
        }
      },
      {
        version: 6,
        up: (db) => {
          // Checkpoint table for session resume
          db.run(`
            CREATE TABLE IF NOT EXISTS checkpoints (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              session_id INTEGER NOT NULL,
              project TEXT NOT NULL,
              task TEXT NOT NULL,
              progress TEXT,
              next_steps TEXT,
              open_questions TEXT,
              relevant_files TEXT,
              context_snapshot TEXT,
              created_at TEXT NOT NULL,
              created_at_epoch INTEGER NOT NULL,
              FOREIGN KEY (session_id) REFERENCES sessions(id)
            )
          `);
          db.run('CREATE INDEX IF NOT EXISTS idx_checkpoints_session ON checkpoints(session_id)');
          db.run('CREATE INDEX IF NOT EXISTS idx_checkpoints_project ON checkpoints(project)');
          db.run('CREATE INDEX IF NOT EXISTS idx_checkpoints_epoch ON checkpoints(created_at_epoch)');
        }
      },
      {
        version: 7,
        up: (db) => {
          // Content hash for content-based deduplication (SHA256)
          db.run('ALTER TABLE observations ADD COLUMN content_hash TEXT');
          db.run('CREATE INDEX IF NOT EXISTS idx_observations_hash ON observations(content_hash)');
        }
      },
      {
        version: 8,
        up: (db) => {
          // Token economics: tokens spent to generate the observation (discovery cost)
          db.run('ALTER TABLE observations ADD COLUMN discovery_tokens INTEGER DEFAULT 0');
          // Token economics on summaries
          db.run('ALTER TABLE summaries ADD COLUMN discovery_tokens INTEGER DEFAULT 0');
        }
      },
      {
        version: 9,
        up: (db) => {
          // Composite indexes for pagination and project filters
          db.run('CREATE INDEX IF NOT EXISTS idx_observations_project_epoch ON observations(project, created_at_epoch DESC)');
          db.run('CREATE INDEX IF NOT EXISTS idx_observations_project_type ON observations(project, type)');
          db.run('CREATE INDEX IF NOT EXISTS idx_summaries_project_epoch ON summaries(project, created_at_epoch DESC)');
          db.run('CREATE INDEX IF NOT EXISTS idx_prompts_project_epoch ON prompts(project, created_at_epoch DESC)');
        }
      },
      {
        version: 10,
        up: (db) => {
          // Async job queue for background processing (embeddings, consolidation, backups)
          db.run(`
            CREATE TABLE IF NOT EXISTS job_queue (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              type TEXT NOT NULL,
              status TEXT NOT NULL DEFAULT 'pending',
              payload TEXT,
              result TEXT,
              error TEXT,
              retry_count INTEGER DEFAULT 0,
              max_retries INTEGER DEFAULT 3,
              priority INTEGER DEFAULT 0,
              created_at TEXT NOT NULL,
              created_at_epoch INTEGER NOT NULL,
              started_at_epoch INTEGER,
              completed_at_epoch INTEGER
            )
          `);
          db.run('CREATE INDEX IF NOT EXISTS idx_jobs_status ON job_queue(status)');
          db.run('CREATE INDEX IF NOT EXISTS idx_jobs_type ON job_queue(type)');
          // Composite index for priority-based polling: pending jobs ordered by priority DESC, then FIFO
          db.run('CREATE INDEX IF NOT EXISTS idx_jobs_priority ON job_queue(status, priority DESC, created_at_epoch ASC)');
        }
      },
      {
        version: 11,
        up: (db) => {
          // Colonna auto-category per classificazione basata su keyword
          db.run('ALTER TABLE observations ADD COLUMN auto_category TEXT');
          db.run('CREATE INDEX IF NOT EXISTS idx_observations_category ON observations(auto_category)');
        }
      },
      {
        version: 12,
        up: (db) => {
          // Tabella per i link GitHub (webhook events: issues, PR, push)
          db.run(`
            CREATE TABLE IF NOT EXISTS github_links (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              observation_id INTEGER,
              session_id TEXT,
              repo TEXT NOT NULL,
              issue_number INTEGER,
              pr_number INTEGER,
              event_type TEXT NOT NULL,
              action TEXT,
              title TEXT,
              url TEXT,
              author TEXT,
              created_at TEXT NOT NULL,
              created_at_epoch INTEGER NOT NULL,
              FOREIGN KEY (observation_id) REFERENCES observations(id)
            )
          `);
          // Indice per query per repository
          db.run('CREATE INDEX IF NOT EXISTS idx_github_links_repo ON github_links(repo)');
          // Indice per join con observations
          db.run('CREATE INDEX IF NOT EXISTS idx_github_links_obs ON github_links(observation_id)');
          // Indice per ricerche per tipo di evento
          db.run('CREATE INDEX IF NOT EXISTS idx_github_links_event ON github_links(event_type)');
          // Indice composto per query per issue/PR all\'interno di un repo
          db.run('CREATE INDEX IF NOT EXISTS idx_github_links_repo_issue ON github_links(repo, issue_number)');
          db.run('CREATE INDEX IF NOT EXISTS idx_github_links_repo_pr ON github_links(repo, pr_number)');
        }
      },
      {
        version: 13,
        up: (db) => {
          // Indici compositi (created_at_epoch DESC, id DESC) per keyset pagination efficiente.
          // Permettono WHERE (created_at_epoch, id) < (?, ?) senza full-scan.
          db.run('CREATE INDEX IF NOT EXISTS idx_observations_keyset ON observations(created_at_epoch DESC, id DESC)');
          db.run('CREATE INDEX IF NOT EXISTS idx_observations_project_keyset ON observations(project, created_at_epoch DESC, id DESC)');
          db.run('CREATE INDEX IF NOT EXISTS idx_summaries_keyset ON summaries(created_at_epoch DESC, id DESC)');
          db.run('CREATE INDEX IF NOT EXISTS idx_summaries_project_keyset ON summaries(project, created_at_epoch DESC, id DESC)');
          db.run('CREATE INDEX IF NOT EXISTS idx_prompts_keyset ON prompts(created_at_epoch DESC, id DESC)');
          db.run('CREATE INDEX IF NOT EXISTS idx_prompts_project_keyset ON prompts(project, created_at_epoch DESC, id DESC)');
        }
      },
      {
        version: 14,
        up: (db) => {
          // Messaggi conversazionali persistiti per la ricostruzione del thread completo.
          db.run(`
            CREATE TABLE IF NOT EXISTS conversation_messages (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              content_session_id TEXT NOT NULL,
              project TEXT NOT NULL,
              role TEXT NOT NULL,
              message_index INTEGER NOT NULL,
              content TEXT NOT NULL,
              created_at TEXT NOT NULL,
              created_at_epoch INTEGER NOT NULL,
              UNIQUE(content_session_id, message_index)
            )
          `);
          db.run('CREATE INDEX IF NOT EXISTS idx_conversation_messages_session ON conversation_messages(content_session_id, message_index ASC)');
          db.run('CREATE INDEX IF NOT EXISTS idx_conversation_messages_project_epoch ON conversation_messages(project, created_at_epoch DESC)');
        }
      },
      {
        version: 15,
        up: (db) => {
          // Shared tokens for read-only JWT-based sharing (issue #33)
          db.run(`
            CREATE TABLE IF NOT EXISTS shared_tokens (
              id TEXT PRIMARY KEY,
              token TEXT NOT NULL UNIQUE,
              project TEXT,
              label TEXT,
              created_at TEXT NOT NULL,
              expires_at TEXT NOT NULL,
              revoked_at TEXT
            )
          `);
          db.run('CREATE INDEX IF NOT EXISTS idx_shared_tokens_token ON shared_tokens(token)');
          db.run('CREATE INDEX IF NOT EXISTS idx_shared_tokens_project ON shared_tokens(project)');
        }
      },
      {
        version: 16,
        up: (db) => {
          // Multi-user: users table
          db.run(`
            CREATE TABLE IF NOT EXISTS users (
              id TEXT PRIMARY KEY,
              email TEXT NOT NULL UNIQUE,
              password_hash TEXT NOT NULL,
              role TEXT NOT NULL DEFAULT 'viewer',
              display_name TEXT NOT NULL,
              avatar_url TEXT,
              is_active INTEGER NOT NULL DEFAULT 1,
              created_at TEXT NOT NULL,
              last_login TEXT
            )
          `);
          db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email)');
          db.run('CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)');

          // Multi-user: auth sessions
          db.run(`
            CREATE TABLE IF NOT EXISTS sessions_auth (
              id TEXT PRIMARY KEY,
              user_id TEXT NOT NULL,
              token TEXT NOT NULL,
              refresh_token TEXT NOT NULL UNIQUE,
              expires_at TEXT NOT NULL,
              refresh_expires_at TEXT NOT NULL,
              created_at TEXT NOT NULL,
              FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
          `);
          db.run('CREATE INDEX IF NOT EXISTS idx_sessions_auth_user ON sessions_auth(user_id)');
          db.run('CREATE INDEX IF NOT EXISTS idx_sessions_auth_token ON sessions_auth(token)');
          db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_auth_refresh ON sessions_auth(refresh_token)');

          // Multi-user: audit log
          db.run(`
            CREATE TABLE IF NOT EXISTS audit_log (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              user_id TEXT NOT NULL,
              action TEXT NOT NULL,
              target TEXT,
              details TEXT,
              ip_address TEXT,
              timestamp TEXT NOT NULL
            )
          `);
          db.run('CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id)');
          db.run('CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON audit_log(timestamp DESC)');
          db.run('CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action)');
        }
      }
    ];
  }
}

// Re-export Database type from adapter
export { Database };
