import { createRequire } from 'module';const require = createRequire(import.meta.url);
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/shims/bun-sqlite.ts
import BetterSqlite3 from "better-sqlite3";
var Database, BunQueryCompat;
var init_bun_sqlite = __esm({
  "src/shims/bun-sqlite.ts"() {
    Database = class {
      _db;
      _stmtCache = /* @__PURE__ */ new Map();
      constructor(path, options) {
        this._db = new BetterSqlite3(path, {
          // better-sqlite3 creates the file by default ('create' not needed)
          readonly: options?.readwrite === false ? true : false
        });
      }
      /**
       * Execute a SQL query without results.
       * PRAGMA statements are handled via better-sqlite3's native pragma() method.
       */
      run(sql, params) {
        const trimmed = sql.trim();
        if (/^PRAGMA\s+/i.test(trimmed)) {
          const pragmaBody = trimmed.replace(/^PRAGMA\s+/i, "").replace(/;$/, "");
          this._db.pragma(pragmaBody);
          return { lastInsertRowid: 0, changes: 0 };
        }
        const stmt = this._db.prepare(sql);
        const result = params ? stmt.run(...params) : stmt.run();
        return result;
      }
      /**
       * Prepare a query with bun:sqlite-compatible interface.
       * Returns a cached prepared statement for repeated queries.
       */
      query(sql) {
        let cached = this._stmtCache.get(sql);
        if (!cached) {
          cached = new BunQueryCompat(this._db, sql);
          this._stmtCache.set(sql, cached);
        }
        return cached;
      }
      /**
       * Create a transaction
       */
      transaction(fn) {
        return this._db.transaction(fn);
      }
      /**
       * Close the connection
       */
      close() {
        this._stmtCache.clear();
        this._db.close();
      }
    };
    BunQueryCompat = class {
      _stmt;
      constructor(db, sql) {
        this._stmt = db.prepare(sql);
      }
      /**
       * Adatta parametri named da formato bun:sqlite a better-sqlite3.
       * bun:sqlite: chiavi CON prefisso (es. { $todayStart: 123 })
       * better-sqlite3: chiavi SENZA prefisso (es. { todayStart: 123 })
       */
      _adaptParams(params) {
        if (params.length !== 1 || typeof params[0] !== "object" || params[0] === null || Array.isArray(params[0])) {
          return params;
        }
        const obj = params[0];
        const keys = Object.keys(obj);
        if (keys.length === 0) return params;
        if (!keys[0].startsWith("$") && !keys[0].startsWith("@") && !keys[0].startsWith(":")) {
          return params;
        }
        const adapted = {};
        for (const key of keys) {
          adapted[key.slice(1)] = obj[key];
        }
        return [adapted];
      }
      /**
       * Returns all rows
       */
      all(...params) {
        if (params.length === 0) return this._stmt.all();
        return this._stmt.all(...this._adaptParams(params));
      }
      /**
       * Returns the first row or null
       */
      get(...params) {
        if (params.length === 0) return this._stmt.get();
        return this._stmt.get(...this._adaptParams(params));
      }
      /**
       * Execute without results
       */
      run(...params) {
        if (params.length === 0) return this._stmt.run();
        return this._stmt.run(...this._adaptParams(params));
      }
    };
  }
});

// src/db/bun-sqlite-adapter.ts
var bun_sqlite_adapter_exports = {};
__export(bun_sqlite_adapter_exports, {
  Database: () => Database2
});
var Database2;
var init_bun_sqlite_adapter = __esm({
  "src/db/bun-sqlite-adapter.ts"() {
    "use strict";
    init_bun_sqlite();
    Database2 = class {
      _db;
      constructor(path, _options) {
        this._db = new Database(path, { create: true, readwrite: true });
      }
      /**
       * Execute a SQL query without results.
       */
      run(sql, params) {
        const stmt = this._db.query(sql);
        const result = params ? stmt.run(...params) : stmt.run();
        return {
          lastInsertRowid: result?.lastInsertRowid ?? 0,
          changes: result?.changes ?? 0
        };
      }
      /**
       * Prepare a query and return a statement wrapper.
       */
      query(sql) {
        const stmt = this._db.query(sql);
        return {
          all(...params) {
            if (params.length === 0) return stmt.all();
            return stmt.all(...params);
          },
          get(...params) {
            if (params.length === 0) return stmt.get();
            return stmt.get(...params);
          },
          run(...params) {
            if (params.length === 0) {
              const r2 = stmt.run();
              return { lastInsertRowid: r2?.lastInsertRowid ?? 0, changes: r2?.changes ?? 0 };
            }
            const r = stmt.run(...params);
            return { lastInsertRowid: r?.lastInsertRowid ?? 0, changes: r?.changes ?? 0 };
          }
        };
      }
      /**
       * Create a transaction
       */
      transaction(fn) {
        return this._db.transaction(fn);
      }
      /**
       * Close the connection
       */
      close() {
        this._db.close();
      }
    };
  }
});

// src/db/better-sqlite3-adapter.ts
var better_sqlite3_adapter_exports = {};
__export(better_sqlite3_adapter_exports, {
  Database: () => Database3
});
import BetterSqlite32 from "better-sqlite3";
var Database3, PreparedStatement;
var init_better_sqlite3_adapter = __esm({
  "src/db/better-sqlite3-adapter.ts"() {
    "use strict";
    Database3 = class {
      _db;
      _stmtCache = /* @__PURE__ */ new Map();
      constructor(path, options) {
        this._db = new BetterSqlite32(path, {
          // better-sqlite3 creates the file by default ('create' not needed)
          readonly: options?.readwrite === false ? true : false
        });
      }
      /**
       * Execute a SQL query without results.
       * PRAGMA statements are handled via better-sqlite3's native pragma() method.
       */
      run(sql, params) {
        const trimmed = sql.trim();
        if (/^PRAGMA\s+/i.test(trimmed)) {
          const pragmaBody = trimmed.replace(/^PRAGMA\s+/i, "").replace(/;$/, "");
          this._db.pragma(pragmaBody);
          return { lastInsertRowid: 0, changes: 0 };
        }
        const stmt = this._db.prepare(sql);
        const result = params ? stmt.run(...params) : stmt.run();
        return result;
      }
      /**
       * Prepare a query and return a cached prepared statement.
       * Returns a cached prepared statement for repeated queries.
       */
      query(sql) {
        let cached = this._stmtCache.get(sql);
        if (!cached) {
          cached = new PreparedStatement(this._db, sql);
          this._stmtCache.set(sql, cached);
        }
        return cached;
      }
      /**
       * Create a transaction
       */
      transaction(fn) {
        return this._db.transaction(fn);
      }
      /**
       * Close the connection
       */
      close() {
        this._stmtCache.clear();
        this._db.close();
      }
    };
    PreparedStatement = class {
      _stmt;
      constructor(db, sql) {
        this._stmt = db.prepare(sql);
      }
      /**
       * Adapt named parameters from $-prefixed format to plain keys.
       * Input:  { $todayStart: 123 }
       * Output: { todayStart: 123 }
       * (better-sqlite3 expects keys without the $ prefix)
       */
      _adaptParams(params) {
        if (params.length !== 1 || typeof params[0] !== "object" || params[0] === null || Array.isArray(params[0])) {
          return params;
        }
        const obj = params[0];
        const keys = Object.keys(obj);
        if (keys.length === 0) return params;
        if (!keys[0].startsWith("$") && !keys[0].startsWith("@") && !keys[0].startsWith(":")) {
          return params;
        }
        const adapted = {};
        for (const key of keys) {
          adapted[key.slice(1)] = obj[key];
        }
        return [adapted];
      }
      /**
       * Returns all rows
       */
      all(...params) {
        if (params.length === 0) return this._stmt.all();
        return this._stmt.all(...this._adaptParams(params));
      }
      /**
       * Returns the first row or null
       */
      get(...params) {
        if (params.length === 0) return this._stmt.get();
        return this._stmt.get(...this._adaptParams(params));
      }
      /**
       * Execute without results
       */
      run(...params) {
        if (params.length === 0) return this._stmt.run();
        return this._stmt.run(...this._adaptParams(params));
      }
    };
  }
});

// src/db/index.ts
var isBun = "Bun" in globalThis;
var DatabaseClass;
if (isBun) {
  const mod = await Promise.resolve().then(() => (init_bun_sqlite_adapter(), bun_sqlite_adapter_exports));
  DatabaseClass = mod.Database;
} else {
  const mod = await Promise.resolve().then(() => (init_better_sqlite3_adapter(), better_sqlite3_adapter_exports));
  DatabaseClass = mod.Database;
}
var Database4 = DatabaseClass;

// src/shared/paths.ts
import { join, dirname, basename } from "path";
import { homedir } from "os";
import { existsSync, mkdirSync, statSync } from "fs";
import { fileURLToPath } from "url";
function getDirname() {
  if (typeof __dirname !== "undefined") {
    return __dirname;
  }
  return dirname(fileURLToPath(import.meta.url));
}
var _dirname = getDirname();
var _legacyV1Dir = join(homedir(), ".contextkit");
var _canonicalDir = join(homedir(), ".totalrecall");
function getFileSize(path) {
  try {
    return existsSync(path) ? statSync(path).size : -1;
  } catch {
    return -1;
  }
}
function resolveDataDir() {
  const canonicalDb = join(_canonicalDir, "totalrecall.db");
  const legacyCanonicalNamedDb = join(_legacyV1Dir, "totalrecall.db");
  const legacyDb = join(_legacyV1Dir, "contextkit.db");
  const canonicalSize = getFileSize(canonicalDb);
  const legacySize = Math.max(getFileSize(legacyCanonicalNamedDb), getFileSize(legacyDb));
  if (canonicalSize > 0 && legacySize > 0) {
    return legacySize > canonicalSize ? _legacyV1Dir : _canonicalDir;
  }
  if (legacySize > 0) return _legacyV1Dir;
  if (canonicalSize > 0) return _canonicalDir;
  if (existsSync(_canonicalDir)) return _canonicalDir;
  if (existsSync(_legacyV1Dir)) return _legacyV1Dir;
  return _canonicalDir;
}
var DATA_DIR = process.env.TOTALRECALL_DATA_DIR || process.env.CONTEXTKIT_DATA_DIR || resolveDataDir();
var KIRO_CONFIG_DIR = process.env.KIRO_CONFIG_DIR || join(homedir(), ".kiro");
var PLUGIN_ROOT = join(KIRO_CONFIG_DIR, "plugins", "totalrecall");
var ARCHIVES_DIR = join(DATA_DIR, "archives");
var LOGS_DIR = join(DATA_DIR, "logs");
var TRASH_DIR = join(DATA_DIR, "trash");
var BACKUPS_DIR = join(DATA_DIR, "backups");
var MODES_DIR = join(DATA_DIR, "modes");
var USER_SETTINGS_PATH = join(DATA_DIR, "settings.json");
var _legacyDbV1 = join(DATA_DIR, "contextkit.db");
var _legacyDbV3 = join(DATA_DIR, "totalrecall.db");
function resolveDbPath() {
  if (existsSync(join(DATA_DIR, "totalrecall.db"))) return join(DATA_DIR, "totalrecall.db");
  if (existsSync(_legacyDbV3)) return _legacyDbV3;
  if (existsSync(_legacyDbV1)) return _legacyDbV1;
  return join(DATA_DIR, "totalrecall.db");
}
var DB_PATH = resolveDbPath();
var VECTOR_DB_DIR = join(DATA_DIR, "vector-db");
var OBSERVER_SESSIONS_DIR = join(DATA_DIR, "observer-sessions");
var KIRO_SETTINGS_PATH = join(KIRO_CONFIG_DIR, "settings.json");
var KIRO_CONTEXT_PATH = join(KIRO_CONFIG_DIR, "context.md");
function ensureDir(dirPath) {
  mkdirSync(dirPath, { recursive: true });
}

// src/utils/logger.ts
import { appendFileSync, existsSync as existsSync2, mkdirSync as mkdirSync2, readFileSync } from "fs";
import { join as join2 } from "path";
var LogLevel = /* @__PURE__ */ ((LogLevel2) => {
  LogLevel2[LogLevel2["DEBUG"] = 0] = "DEBUG";
  LogLevel2[LogLevel2["INFO"] = 1] = "INFO";
  LogLevel2[LogLevel2["WARN"] = 2] = "WARN";
  LogLevel2[LogLevel2["ERROR"] = 3] = "ERROR";
  LogLevel2[LogLevel2["SILENT"] = 4] = "SILENT";
  return LogLevel2;
})(LogLevel || {});
var Logger = class {
  level = null;
  useColor;
  logFilePath = null;
  logFileInitialized = false;
  constructor() {
    this.useColor = process.stdout.isTTY ?? false;
  }
  /**
   * Initialize log file path and ensure directory exists (lazy initialization)
   */
  ensureLogFileInitialized() {
    if (this.logFileInitialized) return;
    this.logFileInitialized = true;
    try {
      if (!existsSync2(LOGS_DIR)) {
        mkdirSync2(LOGS_DIR, { recursive: true });
      }
      const date = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
      this.logFilePath = join2(LOGS_DIR, `totalrecall-${date}.log`);
    } catch (error) {
      console.error("[LOGGER] Failed to initialize log file:", error);
      this.logFilePath = null;
    }
  }
  /**
   * Lazy-load log level from settings file
   */
  getLevel() {
    if (this.level === null) {
      try {
        if (existsSync2(USER_SETTINGS_PATH)) {
          const settingsData = readFileSync(USER_SETTINGS_PATH, "utf-8");
          const settings = JSON.parse(settingsData);
          const envLevel = (settings.TOTALRECALL_LOG_LEVEL || settings.CONTEXTKIT_LOG_LEVEL || "INFO").toUpperCase();
          this.level = LogLevel[envLevel] ?? 1 /* INFO */;
        } else {
          this.level = 1 /* INFO */;
        }
      } catch (error) {
        this.level = 1 /* INFO */;
      }
    }
    return this.level;
  }
  /**
   * Create correlation ID for tracking an observation through the pipeline
   */
  correlationId(sessionId, observationNum) {
    return `obs-${sessionId}-${observationNum}`;
  }
  /**
   * Create session correlation ID
   */
  sessionId(sessionId) {
    return `session-${sessionId}`;
  }
  /**
   * Format data for logging - create compact summaries instead of full dumps
   */
  formatData(data) {
    if (data === null || data === void 0) return "";
    if (typeof data === "string") return data;
    if (typeof data === "number") return data.toString();
    if (typeof data === "boolean") return data.toString();
    if (typeof data === "object") {
      if (data instanceof Error) {
        return this.getLevel() === 0 /* DEBUG */ ? `${data.message}
${data.stack}` : data.message;
      }
      if (Array.isArray(data)) {
        return `[${data.length} items]`;
      }
      const keys = Object.keys(data);
      if (keys.length === 0) return "{}";
      if (keys.length <= 3) {
        return JSON.stringify(data);
      }
      return `{${keys.length} keys: ${keys.slice(0, 3).join(", ")}...}`;
    }
    return String(data);
  }
  /**
   * Format timestamp in local timezone (YYYY-MM-DD HH:MM:SS.mmm)
   */
  formatTimestamp(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const seconds = String(date.getSeconds()).padStart(2, "0");
    const ms = String(date.getMilliseconds()).padStart(3, "0");
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${ms}`;
  }
  /**
   * Core logging method
   */
  log(level, component, message, context, data) {
    if (level < this.getLevel()) return;
    this.ensureLogFileInitialized();
    const timestamp = this.formatTimestamp(/* @__PURE__ */ new Date());
    const levelStr = LogLevel[level].padEnd(5);
    const componentStr = component.padEnd(6);
    let correlationStr = "";
    if (context?.correlationId) {
      correlationStr = `[${context.correlationId}] `;
    } else if (context?.sessionId) {
      correlationStr = `[session-${context.sessionId}] `;
    }
    let dataStr = "";
    if (data !== void 0 && data !== null) {
      if (data instanceof Error) {
        dataStr = this.getLevel() === 0 /* DEBUG */ ? `
${data.message}
${data.stack}` : ` ${data.message}`;
      } else if (this.getLevel() === 0 /* DEBUG */ && typeof data === "object") {
        dataStr = "\n" + JSON.stringify(data, null, 2);
      } else {
        dataStr = " " + this.formatData(data);
      }
    }
    let contextStr = "";
    if (context) {
      const { sessionId, memorySessionId, correlationId, ...rest } = context;
      if (Object.keys(rest).length > 0) {
        const pairs = Object.entries(rest).map(([k, v]) => `${k}=${v}`);
        contextStr = ` {${pairs.join(", ")}}`;
      }
    }
    const logLine = `[${timestamp}] [${levelStr}] [${componentStr}] ${correlationStr}${message}${contextStr}${dataStr}`;
    if (this.logFilePath) {
      try {
        appendFileSync(this.logFilePath, logLine + "\n", "utf8");
      } catch (error) {
        process.stderr.write(`[LOGGER] Failed to write to log file: ${error}
`);
      }
    } else {
      process.stderr.write(logLine + "\n");
    }
  }
  // Public logging methods
  debug(component, message, context, data) {
    this.log(0 /* DEBUG */, component, message, context, data);
  }
  info(component, message, context, data) {
    this.log(1 /* INFO */, component, message, context, data);
  }
  warn(component, message, context, data) {
    this.log(2 /* WARN */, component, message, context, data);
  }
  error(component, message, context, data) {
    this.log(3 /* ERROR */, component, message, context, data);
  }
  /**
   * Log data flow: input → processing
   */
  dataIn(component, message, context, data) {
    this.info(component, `\u2192 ${message}`, context, data);
  }
  /**
   * Log data flow: processing → output
   */
  dataOut(component, message, context, data) {
    this.info(component, `\u2190 ${message}`, context, data);
  }
  /**
   * Log successful completion
   */
  success(component, message, context, data) {
    this.info(component, `\u2713 ${message}`, context, data);
  }
  /**
   * Log failure
   */
  failure(component, message, context, data) {
    this.error(component, `\u2717 ${message}`, context, data);
  }
  /**
   * Log timing information
   */
  timing(component, message, durationMs, context) {
    this.info(component, `\u23F1 ${message}`, context, { duration: `${durationMs}ms` });
  }
  /**
   * Happy Path Error - logs when the expected "happy path" fails but we have a fallback
   */
  happyPathError(component, message, context, data, fallback = "") {
    const stack = new Error().stack || "";
    const stackLines = stack.split("\n");
    const callerLine = stackLines[2] || "";
    const callerMatch = callerLine.match(/at\s+(?:.*\s+)?\(?([^:]+):(\d+):(\d+)\)?/);
    const location = callerMatch ? `${callerMatch[1].split("/").pop()}:${callerMatch[2]}` : "unknown";
    const enhancedContext = {
      ...context,
      location
    };
    this.warn(component, `[HAPPY-PATH] ${message}`, enhancedContext, data);
    return fallback;
  }
};
var logger = new Logger();

// src/services/sqlite/Database.ts
var SQLITE_MMAP_SIZE_BYTES = 256 * 1024 * 1024;
var SQLITE_CACHE_SIZE_PAGES = 1e4;
var TotalRecallDatabase = class {
  _db;
  /**
   * Readonly accessor for the underlying Database instance.
   * Prefer using query() and run() proxy methods directly.
   */
  get db() {
    return this._db;
  }
  /**
   * @param dbPath - Path to the SQLite file (default: DB_PATH)
   * @param skipMigrations - If true, skip the migration runner (for high-frequency hooks)
   */
  constructor(dbPath = DB_PATH, skipMigrations = false) {
    if (dbPath !== ":memory:") {
      ensureDir(DATA_DIR);
    }
    this._db = new Database4(dbPath, { create: true, readwrite: true });
    this._db.run("PRAGMA journal_mode = WAL");
    this._db.run("PRAGMA busy_timeout = 5000");
    this._db.run("PRAGMA synchronous = NORMAL");
    this._db.run("PRAGMA foreign_keys = ON");
    this._db.run("PRAGMA temp_store = memory");
    this._db.run(`PRAGMA mmap_size = ${SQLITE_MMAP_SIZE_BYTES}`);
    this._db.run(`PRAGMA cache_size = ${SQLITE_CACHE_SIZE_PAGES}`);
    if (!skipMigrations) {
      const migrationRunner = new MigrationRunner(this._db);
      migrationRunner.runAllMigrations();
    }
  }
  /**
   * Prepare a query (delegates to underlying Database).
   * Proxy method to avoid ctx.db.db.query() double access.
   */
  query(sql) {
    return this._db.query(sql);
  }
  /**
   * Execute a SQL statement without results (delegates to underlying Database).
   * Proxy method to avoid ctx.db.db.run() double access.
   */
  run(sql, params) {
    return this._db.run(sql, params);
  }
  /**
   * Executes a function within an atomic transaction.
   * If fn() throws an error, the transaction is automatically rolled back.
   */
  withTransaction(fn) {
    const transaction = this._db.transaction(fn);
    return transaction(this._db);
  }
  /**
   * Close the database connection
   */
  close() {
    this._db.close();
  }
};
var MigrationRunner = class {
  db;
  constructor(db) {
    this.db = db;
  }
  runAllMigrations() {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS schema_versions (
        id INTEGER PRIMARY KEY,
        version INTEGER UNIQUE NOT NULL,
        applied_at TEXT NOT NULL
      )
    `);
    const versionQuery = this.db.query("SELECT MAX(version) as version FROM schema_versions");
    const result = versionQuery.get();
    const currentVersion = result?.version || 0;
    const migrations = this.getMigrations();
    for (const migration of migrations) {
      if (migration.version > currentVersion) {
        logger.info("DB", `Applying migration ${migration.version}`);
        const transaction = this.db.transaction(() => {
          migration.up(this.db);
          const insert = this.db.query("INSERT INTO schema_versions (version, applied_at) VALUES (?, ?)");
          insert.run(migration.version, (/* @__PURE__ */ new Date()).toISOString());
        });
        transaction();
        logger.info("DB", `Migration ${migration.version} applied successfully`);
      }
    }
  }
  getMigrations() {
    return [
      {
        version: 1,
        up: (db) => {
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
          db.run("CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project)");
          db.run("CREATE INDEX IF NOT EXISTS idx_observations_project ON observations(project)");
          db.run("CREATE INDEX IF NOT EXISTS idx_observations_session ON observations(memory_session_id)");
          db.run("CREATE INDEX IF NOT EXISTS idx_summaries_session ON summaries(session_id)");
          db.run("CREATE INDEX IF NOT EXISTS idx_prompts_session ON prompts(content_session_id)");
        }
      },
      {
        version: 2,
        up: (db) => {
          db.run(`
            CREATE VIRTUAL TABLE IF NOT EXISTS observations_fts USING fts5(
              title, text, narrative, concepts,
              content='observations',
              content_rowid='id'
            )
          `);
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
          db.run(`
            INSERT INTO observations_fts(rowid, title, text, narrative, concepts)
            SELECT id, title, text, narrative, concepts FROM observations
          `);
          db.run("CREATE INDEX IF NOT EXISTS idx_observations_type ON observations(type)");
          db.run("CREATE INDEX IF NOT EXISTS idx_observations_epoch ON observations(created_at_epoch)");
          db.run("CREATE INDEX IF NOT EXISTS idx_summaries_project ON summaries(project)");
          db.run("CREATE INDEX IF NOT EXISTS idx_summaries_epoch ON summaries(created_at_epoch)");
          db.run("CREATE INDEX IF NOT EXISTS idx_prompts_project ON prompts(project)");
        }
      },
      {
        version: 3,
        up: (db) => {
          db.run(`
            CREATE TABLE IF NOT EXISTS project_aliases (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              project_name TEXT NOT NULL UNIQUE,
              display_name TEXT NOT NULL,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            )
          `);
          db.run("CREATE UNIQUE INDEX IF NOT EXISTS idx_project_aliases_name ON project_aliases(project_name)");
        }
      },
      {
        version: 4,
        up: (db) => {
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
          db.run("CREATE INDEX IF NOT EXISTS idx_embeddings_model ON observation_embeddings(model)");
        }
      },
      {
        version: 5,
        up: (db) => {
          db.run("ALTER TABLE observations ADD COLUMN last_accessed_epoch INTEGER");
          db.run("ALTER TABLE observations ADD COLUMN is_stale INTEGER DEFAULT 0");
          db.run("CREATE INDEX IF NOT EXISTS idx_observations_last_accessed ON observations(last_accessed_epoch)");
          db.run("CREATE INDEX IF NOT EXISTS idx_observations_stale ON observations(is_stale)");
        }
      },
      {
        version: 6,
        up: (db) => {
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
          db.run("CREATE INDEX IF NOT EXISTS idx_checkpoints_session ON checkpoints(session_id)");
          db.run("CREATE INDEX IF NOT EXISTS idx_checkpoints_project ON checkpoints(project)");
          db.run("CREATE INDEX IF NOT EXISTS idx_checkpoints_epoch ON checkpoints(created_at_epoch)");
        }
      },
      {
        version: 7,
        up: (db) => {
          db.run("ALTER TABLE observations ADD COLUMN content_hash TEXT");
          db.run("CREATE INDEX IF NOT EXISTS idx_observations_hash ON observations(content_hash)");
        }
      },
      {
        version: 8,
        up: (db) => {
          db.run("ALTER TABLE observations ADD COLUMN discovery_tokens INTEGER DEFAULT 0");
          db.run("ALTER TABLE summaries ADD COLUMN discovery_tokens INTEGER DEFAULT 0");
        }
      },
      {
        version: 9,
        up: (db) => {
          db.run("CREATE INDEX IF NOT EXISTS idx_observations_project_epoch ON observations(project, created_at_epoch DESC)");
          db.run("CREATE INDEX IF NOT EXISTS idx_observations_project_type ON observations(project, type)");
          db.run("CREATE INDEX IF NOT EXISTS idx_summaries_project_epoch ON summaries(project, created_at_epoch DESC)");
          db.run("CREATE INDEX IF NOT EXISTS idx_prompts_project_epoch ON prompts(project, created_at_epoch DESC)");
        }
      },
      {
        version: 10,
        up: (db) => {
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
          db.run("CREATE INDEX IF NOT EXISTS idx_jobs_status ON job_queue(status)");
          db.run("CREATE INDEX IF NOT EXISTS idx_jobs_type ON job_queue(type)");
          db.run("CREATE INDEX IF NOT EXISTS idx_jobs_priority ON job_queue(status, priority DESC, created_at_epoch ASC)");
        }
      },
      {
        version: 11,
        up: (db) => {
          db.run("ALTER TABLE observations ADD COLUMN auto_category TEXT");
          db.run("CREATE INDEX IF NOT EXISTS idx_observations_category ON observations(auto_category)");
        }
      },
      {
        version: 12,
        up: (db) => {
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
          db.run("CREATE INDEX IF NOT EXISTS idx_github_links_repo ON github_links(repo)");
          db.run("CREATE INDEX IF NOT EXISTS idx_github_links_obs ON github_links(observation_id)");
          db.run("CREATE INDEX IF NOT EXISTS idx_github_links_event ON github_links(event_type)");
          db.run("CREATE INDEX IF NOT EXISTS idx_github_links_repo_issue ON github_links(repo, issue_number)");
          db.run("CREATE INDEX IF NOT EXISTS idx_github_links_repo_pr ON github_links(repo, pr_number)");
        }
      },
      {
        version: 13,
        up: (db) => {
          db.run("CREATE INDEX IF NOT EXISTS idx_observations_keyset ON observations(created_at_epoch DESC, id DESC)");
          db.run("CREATE INDEX IF NOT EXISTS idx_observations_project_keyset ON observations(project, created_at_epoch DESC, id DESC)");
          db.run("CREATE INDEX IF NOT EXISTS idx_summaries_keyset ON summaries(created_at_epoch DESC, id DESC)");
          db.run("CREATE INDEX IF NOT EXISTS idx_summaries_project_keyset ON summaries(project, created_at_epoch DESC, id DESC)");
          db.run("CREATE INDEX IF NOT EXISTS idx_prompts_keyset ON prompts(created_at_epoch DESC, id DESC)");
          db.run("CREATE INDEX IF NOT EXISTS idx_prompts_project_keyset ON prompts(project, created_at_epoch DESC, id DESC)");
        }
      },
      {
        version: 14,
        up: (db) => {
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
          db.run("CREATE INDEX IF NOT EXISTS idx_conversation_messages_session ON conversation_messages(content_session_id, message_index ASC)");
          db.run("CREATE INDEX IF NOT EXISTS idx_conversation_messages_project_epoch ON conversation_messages(project, created_at_epoch DESC)");
        }
      },
      {
        version: 15,
        up: (db) => {
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
          db.run("CREATE INDEX IF NOT EXISTS idx_shared_tokens_token ON shared_tokens(token)");
          db.run("CREATE INDEX IF NOT EXISTS idx_shared_tokens_project ON shared_tokens(project)");
        }
      },
      {
        version: 16,
        up: (db) => {
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
          db.run("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email)");
          db.run("CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)");
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
          db.run("CREATE INDEX IF NOT EXISTS idx_sessions_auth_user ON sessions_auth(user_id)");
          db.run("CREATE INDEX IF NOT EXISTS idx_sessions_auth_token ON sessions_auth(token)");
          db.run("CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_auth_refresh ON sessions_auth(refresh_token)");
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
          db.run("CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id)");
          db.run("CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON audit_log(timestamp DESC)");
          db.run("CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action)");
        }
      }
    ];
  }
};
export {
  Database4 as Database,
  TotalRecallDatabase
};
