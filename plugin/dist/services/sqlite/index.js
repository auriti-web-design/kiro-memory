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

// src/services/sqlite/cursor.ts
function encodeCursor(id, epoch) {
  const raw = `${epoch}:${id}`;
  return Buffer.from(raw, "utf8").toString("base64url");
}
function decodeCursor(cursor) {
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const colonIdx = raw.indexOf(":");
    if (colonIdx === -1) return null;
    const epochStr = raw.substring(0, colonIdx);
    const idStr = raw.substring(colonIdx + 1);
    const epoch = parseInt(epochStr, 10);
    const id = parseInt(idStr, 10);
    if (!Number.isInteger(epoch) || epoch <= 0) return null;
    if (!Number.isInteger(id) || id <= 0) return null;
    return { epoch, id };
  } catch {
    return null;
  }
}
function buildNextCursor(rows, limit) {
  if (rows.length < limit) return null;
  const last = rows[rows.length - 1];
  if (!last) return null;
  return encodeCursor(last.id, last.created_at_epoch);
}

// src/services/sqlite/Sessions.ts
function createSession(db, contentSessionId, project, userPrompt) {
  const now = /* @__PURE__ */ new Date();
  const result = db.run(
    `INSERT INTO sessions (content_session_id, project, user_prompt, status, started_at, started_at_epoch)
     VALUES (?, ?, ?, 'active', ?, ?)`,
    [contentSessionId, project, userPrompt, now.toISOString(), now.getTime()]
  );
  return Number(result.lastInsertRowid);
}
function getSessionByContentId(db, contentSessionId) {
  const query = db.query("SELECT * FROM sessions WHERE content_session_id = ?");
  return query.get(contentSessionId);
}
function getSessionById(db, id) {
  const query = db.query("SELECT * FROM sessions WHERE id = ?");
  return query.get(id);
}
function updateSessionMemoryId(db, id, memorySessionId) {
  db.run(
    "UPDATE sessions SET memory_session_id = ? WHERE id = ?",
    [memorySessionId, id]
  );
}
function updateSessionUserPrompt(db, contentSessionId, userPrompt) {
  db.run(
    "UPDATE sessions SET user_prompt = ? WHERE content_session_id = ?",
    [userPrompt, contentSessionId]
  );
}
function completeSession(db, id) {
  const now = /* @__PURE__ */ new Date();
  db.run(
    `UPDATE sessions 
     SET status = 'completed', completed_at = ?, completed_at_epoch = ?
     WHERE id = ?`,
    [now.toISOString(), now.getTime(), id]
  );
}
function failSession(db, id) {
  const now = /* @__PURE__ */ new Date();
  db.run(
    `UPDATE sessions 
     SET status = 'failed', completed_at = ?, completed_at_epoch = ?
     WHERE id = ?`,
    [now.toISOString(), now.getTime(), id]
  );
}
function getActiveSessions(db) {
  const query = db.query("SELECT * FROM sessions WHERE status = 'active' ORDER BY started_at_epoch DESC");
  return query.all();
}
function getAllSessions(db, limit = 100) {
  const query = db.query("SELECT * FROM sessions ORDER BY started_at_epoch DESC LIMIT ?");
  return query.all(limit);
}
function getSessionsByProject(db, project, limit = 100) {
  const query = db.query("SELECT * FROM sessions WHERE project = ? ORDER BY started_at_epoch DESC LIMIT ?");
  return query.all(project, limit);
}

// src/utils/secrets.ts
var SECRET_PATTERNS = [
  // AWS Access Keys (AKIA, ABIA, ACCA, ASIA prefixes + 16 alphanumeric chars)
  { name: "aws-key", pattern: /(?:AKIA|ABIA|ACCA|ASIA)[A-Z0-9]{16}/g },
  // JWT tokens (three base64url segments separated by dots)
  { name: "jwt", pattern: /eyJ[a-zA-Z0-9_-]{10,}\.eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g },
  // Generic API keys in key=value or key: value assignments
  { name: "api-key", pattern: /(?:api[_-]?key|apikey|api[_-]?secret)\s*[:=]\s*['"]?([a-zA-Z0-9_\-]{20,})['"]?/gi },
  // Password/secret/token in variable assignments
  { name: "credential", pattern: /(?:password|passwd|pwd|secret|token|auth[_-]?token|access[_-]?token|bearer)\s*[:=]\s*['"]?([^\s'"]{8,})['"]?/gi },
  // Credentials embedded in URLs (user:pass@host)
  { name: "url-credential", pattern: /(?:https?:\/\/)([^:]+):([^@]+)@/g },
  // PEM-encoded private keys (RSA, EC, DSA, OpenSSH)
  { name: "private-key", pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g },
  // GitHub personal access tokens (ghp_, gho_, ghu_, ghs_, ghr_ prefixes)
  { name: "github-token", pattern: /gh[pousr]_[a-zA-Z0-9]{36,}/g },
  // Slack bot/user/app tokens
  { name: "slack-token", pattern: /xox[bpoas]-[a-zA-Z0-9-]{10,}/g },
  // HTTP Authorization Bearer header values
  { name: "bearer-header", pattern: /\bBearer\s+([a-zA-Z0-9_\-\.]{20,})/g },
  // Generic hex secrets (32+ hex chars after a key/secret/token/password label)
  { name: "hex-secret", pattern: /(?:key|secret|token|password)\s*[:=]\s*['"]?([0-9a-f]{32,})['"]?/gi }
];
function redactSecrets(text) {
  if (!text) return text;
  let redacted = text;
  for (const { pattern } of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    redacted = redacted.replace(pattern, (match) => {
      const prefix = match.substring(0, Math.min(4, match.length));
      return `${prefix}***REDACTED***`;
    });
  }
  return redacted;
}

// src/utils/categorizer.ts
var CATEGORY_RULES = [
  {
    category: "security",
    keywords: [
      "security",
      "vulnerability",
      "cve",
      "xss",
      "csrf",
      "injection",
      "sanitize",
      "escape",
      "auth",
      "authentication",
      "authorization",
      "permission",
      "helmet",
      "cors",
      "rate-limit",
      "token",
      "encrypt",
      "decrypt",
      "secret",
      "redact",
      "owasp"
    ],
    filePatterns: [/security/i, /auth/i, /secrets?\.ts/i],
    weight: 10
  },
  {
    category: "testing",
    keywords: [
      "test",
      "spec",
      "expect",
      "assert",
      "mock",
      "stub",
      "fixture",
      "coverage",
      "jest",
      "vitest",
      "bun test",
      "unit test",
      "integration test",
      "e2e"
    ],
    types: ["test"],
    filePatterns: [/\.test\./i, /\.spec\./i, /tests?\//i, /__tests__/i],
    weight: 8
  },
  {
    category: "debugging",
    keywords: [
      "debug",
      "fix",
      "bug",
      "error",
      "crash",
      "stacktrace",
      "stack trace",
      "exception",
      "breakpoint",
      "investigate",
      "root cause",
      "troubleshoot",
      "diagnose",
      "bisect",
      "regression"
    ],
    types: ["bugfix"],
    weight: 8
  },
  {
    category: "architecture",
    keywords: [
      "architect",
      "design",
      "pattern",
      "modular",
      "migration",
      "schema",
      "database",
      "api design",
      "abstract",
      "dependency injection",
      "singleton",
      "factory",
      "observer",
      "middleware",
      "pipeline",
      "microservice",
      "monolith"
    ],
    types: ["decision", "constraint"],
    weight: 7
  },
  {
    category: "refactoring",
    keywords: [
      "refactor",
      "rename",
      "extract",
      "inline",
      "move",
      "split",
      "merge",
      "simplify",
      "cleanup",
      "clean up",
      "dead code",
      "consolidate",
      "reorganize",
      "restructure",
      "decouple"
    ],
    weight: 6
  },
  {
    category: "config",
    keywords: [
      "config",
      "configuration",
      "env",
      "environment",
      "dotenv",
      ".env",
      "settings",
      "tsconfig",
      "eslint",
      "prettier",
      "webpack",
      "vite",
      "esbuild",
      "docker",
      "ci/cd",
      "github actions",
      "deploy",
      "build",
      "bundle",
      "package.json"
    ],
    filePatterns: [
      /\.config\./i,
      /\.env/i,
      /tsconfig/i,
      /\.ya?ml/i,
      /Dockerfile/i,
      /docker-compose/i
    ],
    weight: 5
  },
  {
    category: "docs",
    keywords: [
      "document",
      "readme",
      "changelog",
      "jsdoc",
      "comment",
      "explain",
      "guide",
      "tutorial",
      "api doc",
      "openapi",
      "swagger"
    ],
    types: ["docs"],
    filePatterns: [/\.md$/i, /docs?\//i, /readme/i, /changelog/i],
    weight: 5
  },
  {
    category: "feature-dev",
    keywords: [
      "feature",
      "implement",
      "add",
      "create",
      "new",
      "endpoint",
      "component",
      "module",
      "service",
      "handler",
      "route",
      "hook",
      "plugin",
      "integration"
    ],
    types: ["feature", "file-write"],
    weight: 3
    // lowest — generic catch-all for development
  }
];
function categorize(input) {
  const scores = /* @__PURE__ */ new Map();
  const searchText = [
    input.title,
    input.text || "",
    input.narrative || "",
    input.concepts || ""
  ].join(" ").toLowerCase();
  const allFiles = [input.filesModified || "", input.filesRead || ""].join(",");
  for (const rule of CATEGORY_RULES) {
    let score = 0;
    for (const kw of rule.keywords) {
      if (searchText.includes(kw.toLowerCase())) {
        score += rule.weight;
      }
    }
    if (rule.types && rule.types.includes(input.type)) {
      score += rule.weight * 2;
    }
    if (rule.filePatterns && allFiles) {
      for (const pattern of rule.filePatterns) {
        if (pattern.test(allFiles)) {
          score += rule.weight;
        }
      }
    }
    if (score > 0) {
      scores.set(rule.category, (scores.get(rule.category) || 0) + score);
    }
  }
  let bestCategory = "general";
  let bestScore = 0;
  for (const [category, score] of scores) {
    if (score > bestScore) {
      bestScore = score;
      bestCategory = category;
    }
  }
  return bestCategory;
}

// src/services/sqlite/Observations.ts
function escapeLikePattern(input) {
  return input.replace(/[%_\\]/g, "\\$&");
}
function isDuplicateObservation(db, contentHash, windowMs = 3e4) {
  if (!contentHash) return false;
  const threshold = Date.now() - windowMs;
  const result = db.query(
    "SELECT id FROM observations WHERE content_hash = ? AND created_at_epoch > ? LIMIT 1"
  ).get(contentHash, threshold);
  return !!result;
}
function createObservation(db, memorySessionId, project, type, title, subtitle, text, narrative, facts, concepts, filesRead, filesModified, promptNumber, contentHash = null, discoveryTokens = 0) {
  const now = /* @__PURE__ */ new Date();
  const safeTitle = redactSecrets(title);
  const safeText = text ? redactSecrets(text) : text;
  const safeNarrative = narrative ? redactSecrets(narrative) : narrative;
  const autoCategory = categorize({
    type,
    title: safeTitle,
    text: safeText,
    narrative: safeNarrative,
    concepts,
    filesModified,
    filesRead
  });
  const result = db.run(
    `INSERT INTO observations
     (memory_session_id, project, type, title, subtitle, text, narrative, facts, concepts, files_read, files_modified, prompt_number, created_at, created_at_epoch, content_hash, discovery_tokens, auto_category)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [memorySessionId, project, type, safeTitle, subtitle, safeText, safeNarrative, facts, concepts, filesRead, filesModified, promptNumber, now.toISOString(), now.getTime(), contentHash, discoveryTokens, autoCategory]
  );
  return Number(result.lastInsertRowid);
}
function getObservationsBySession(db, memorySessionId) {
  const query = db.query(
    "SELECT * FROM observations WHERE memory_session_id = ? ORDER BY prompt_number ASC"
  );
  return query.all(memorySessionId);
}
function getObservationsByProject(db, project, limit = 100) {
  const query = db.query(
    "SELECT * FROM observations WHERE project = ? ORDER BY created_at_epoch DESC, id DESC LIMIT ?"
  );
  return query.all(project, limit);
}
function searchObservations(db, searchTerm, project) {
  const sql = project ? `SELECT * FROM observations
       WHERE project = ? AND (title LIKE ? ESCAPE '\\' OR text LIKE ? ESCAPE '\\' OR narrative LIKE ? ESCAPE '\\')
       ORDER BY created_at_epoch DESC, id DESC` : `SELECT * FROM observations
       WHERE title LIKE ? ESCAPE '\\' OR text LIKE ? ESCAPE '\\' OR narrative LIKE ? ESCAPE '\\'
       ORDER BY created_at_epoch DESC, id DESC`;
  const pattern = `%${escapeLikePattern(searchTerm)}%`;
  const query = db.query(sql);
  if (project) {
    return query.all(project, pattern, pattern, pattern);
  }
  return query.all(pattern, pattern, pattern);
}
function deleteObservation(db, id) {
  db.run("DELETE FROM observations WHERE id = ?", [id]);
}
function updateLastAccessed(db, ids) {
  if (!Array.isArray(ids) || ids.length === 0) return;
  const validIds = ids.filter((id) => typeof id === "number" && Number.isInteger(id) && id > 0).slice(0, 500);
  if (validIds.length === 0) return;
  const now = Date.now();
  const placeholders = validIds.map(() => "?").join(",");
  db.run(
    `UPDATE observations SET last_accessed_epoch = ? WHERE id IN (${placeholders})`,
    [now, ...validIds]
  );
}
function consolidateObservations(db, project, options = {}) {
  const minGroupSize = options.minGroupSize || 3;
  const groups = db.query(`
    SELECT type, files_modified, COUNT(*) as cnt, GROUP_CONCAT(id) as ids
    FROM observations
    WHERE project = ? AND files_modified IS NOT NULL AND files_modified != ''
    GROUP BY type, files_modified
    HAVING cnt >= ?
    ORDER BY cnt DESC
  `).all(project, minGroupSize);
  if (groups.length === 0) return { merged: 0, removed: 0 };
  if (options.dryRun) {
    let totalMerged = 0;
    let totalRemoved = 0;
    for (const group of groups) {
      const obsIds = group.ids.split(",").map(Number);
      const placeholders = obsIds.map(() => "?").join(",");
      const count = db.query(
        `SELECT COUNT(*) as cnt FROM observations WHERE id IN (${placeholders})`
      ).get(...obsIds)?.cnt || 0;
      if (count >= minGroupSize) {
        totalMerged += 1;
        totalRemoved += count - 1;
      }
    }
    return { merged: totalMerged, removed: totalRemoved };
  }
  const runConsolidation = db.transaction(() => {
    let merged = 0;
    let removed = 0;
    for (const group of groups) {
      const obsIds = group.ids.split(",").map(Number);
      const placeholders = obsIds.map(() => "?").join(",");
      const observations = db.query(
        `SELECT * FROM observations WHERE id IN (${placeholders}) ORDER BY created_at_epoch DESC, id DESC`
      ).all(...obsIds);
      if (observations.length < minGroupSize) continue;
      const keeper = observations[0];
      const others = observations.slice(1);
      const uniqueTexts = /* @__PURE__ */ new Set();
      if (keeper.text) uniqueTexts.add(keeper.text);
      for (const obs of others) {
        if (obs.text && !uniqueTexts.has(obs.text)) {
          uniqueTexts.add(obs.text);
        }
      }
      const consolidatedText = Array.from(uniqueTexts).join("\n---\n").substring(0, 1e5);
      db.run(
        "UPDATE observations SET text = ?, title = ? WHERE id = ?",
        [consolidatedText, `[consolidated x${observations.length}] ${keeper.title}`, keeper.id]
      );
      const removeIds = others.map((o) => o.id);
      const removePlaceholders = removeIds.map(() => "?").join(",");
      db.run(`DELETE FROM observations WHERE id IN (${removePlaceholders})`, removeIds);
      db.run(`DELETE FROM observation_embeddings WHERE observation_id IN (${removePlaceholders})`, removeIds);
      merged += 1;
      removed += removeIds.length;
    }
    return { merged, removed };
  });
  return runConsolidation();
}

// src/services/sqlite/Summaries.ts
function escapeLikePattern2(input) {
  return input.replace(/[%_\\]/g, "\\$&");
}
function createSummary(db, sessionId, project, request, investigated, learned, completed, nextSteps, notes) {
  const now = /* @__PURE__ */ new Date();
  const result = db.run(
    `INSERT INTO summaries 
     (session_id, project, request, investigated, learned, completed, next_steps, notes, created_at, created_at_epoch)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [sessionId, project, request, investigated, learned, completed, nextSteps, notes, now.toISOString(), now.getTime()]
  );
  return Number(result.lastInsertRowid);
}
function getSummaryBySession(db, sessionId) {
  const query = db.query("SELECT * FROM summaries WHERE session_id = ? ORDER BY created_at_epoch DESC, id DESC LIMIT 1");
  return query.get(sessionId);
}
function getSummariesByProject(db, project, limit = 50) {
  const query = db.query(
    "SELECT * FROM summaries WHERE project = ? ORDER BY created_at_epoch DESC, id DESC LIMIT ?"
  );
  return query.all(project, limit);
}
function searchSummaries(db, searchTerm, project) {
  const sql = project ? `SELECT * FROM summaries
       WHERE project = ? AND (request LIKE ? ESCAPE '\\' OR learned LIKE ? ESCAPE '\\' OR completed LIKE ? ESCAPE '\\' OR notes LIKE ? ESCAPE '\\')
       ORDER BY created_at_epoch DESC, id DESC` : `SELECT * FROM summaries
       WHERE request LIKE ? ESCAPE '\\' OR learned LIKE ? ESCAPE '\\' OR completed LIKE ? ESCAPE '\\' OR notes LIKE ? ESCAPE '\\'
       ORDER BY created_at_epoch DESC, id DESC`;
  const pattern = `%${escapeLikePattern2(searchTerm)}%`;
  const query = db.query(sql);
  if (project) {
    return query.all(project, pattern, pattern, pattern, pattern);
  }
  return query.all(pattern, pattern, pattern, pattern);
}
function deleteSummary(db, id) {
  db.run("DELETE FROM summaries WHERE id = ?", [id]);
}

// src/services/sqlite/Prompts.ts
function createPrompt(db, contentSessionId, project, promptNumber, promptText) {
  const now = /* @__PURE__ */ new Date();
  const result = db.run(
    `INSERT INTO prompts 
     (content_session_id, project, prompt_number, prompt_text, created_at, created_at_epoch)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [contentSessionId, project, promptNumber, promptText, now.toISOString(), now.getTime()]
  );
  return Number(result.lastInsertRowid);
}
function getPromptsBySession(db, contentSessionId) {
  const query = db.query(
    "SELECT * FROM prompts WHERE content_session_id = ? ORDER BY prompt_number ASC"
  );
  return query.all(contentSessionId);
}
function getPromptsByProject(db, project, limit = 100) {
  const query = db.query(
    "SELECT * FROM prompts WHERE project = ? ORDER BY created_at_epoch DESC, id DESC LIMIT ?"
  );
  return query.all(project, limit);
}
function getLatestPrompt(db, contentSessionId) {
  const query = db.query(
    "SELECT * FROM prompts WHERE content_session_id = ? ORDER BY prompt_number DESC LIMIT 1"
  );
  return query.get(contentSessionId);
}
function deletePrompt(db, id) {
  db.run("DELETE FROM prompts WHERE id = ?", [id]);
}

// src/services/sqlite/ConversationMessages.ts
function createConversationMessage(db, contentSessionId, project, role, messageIndex, content, createdAt, createdAtEpoch) {
  const timestamp = createdAt || (/* @__PURE__ */ new Date()).toISOString();
  const epoch = createdAtEpoch ?? Date.now();
  const result = db.run(
    `INSERT OR IGNORE INTO conversation_messages
     (content_session_id, project, role, message_index, content, created_at, created_at_epoch)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [contentSessionId, project, role, messageIndex, content, timestamp, epoch]
  );
  return Number(result.lastInsertRowid || 0);
}
function getConversationMessagesBySession(db, contentSessionId) {
  const query = db.query(
    `SELECT * FROM conversation_messages
     WHERE content_session_id = ?
     ORDER BY message_index ASC, id ASC`
  );
  return query.all(contentSessionId);
}
function getConversationMessageCountBySession(db, contentSessionId) {
  const query = db.query(
    "SELECT COUNT(*) as total FROM conversation_messages WHERE content_session_id = ?"
  );
  const result = query.get(contentSessionId);
  return result?.total || 0;
}

// src/services/sqlite/Checkpoints.ts
function createCheckpoint(db, sessionId, project, data) {
  const now = /* @__PURE__ */ new Date();
  const result = db.run(
    `INSERT INTO checkpoints (session_id, project, task, progress, next_steps, open_questions, relevant_files, context_snapshot, created_at, created_at_epoch)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      sessionId,
      project,
      data.task,
      data.progress || null,
      data.nextSteps || null,
      data.openQuestions || null,
      data.relevantFiles || null,
      data.contextSnapshot || null,
      now.toISOString(),
      now.getTime()
    ]
  );
  return Number(result.lastInsertRowid);
}
function getLatestCheckpoint(db, sessionId) {
  const query = db.query(
    "SELECT * FROM checkpoints WHERE session_id = ? ORDER BY created_at_epoch DESC, id DESC LIMIT 1"
  );
  return query.get(sessionId);
}
function getLatestCheckpointByProject(db, project) {
  const query = db.query(
    "SELECT * FROM checkpoints WHERE project = ? ORDER BY created_at_epoch DESC, id DESC LIMIT 1"
  );
  return query.get(project);
}
function getCheckpointsBySession(db, sessionId) {
  const query = db.query(
    "SELECT * FROM checkpoints WHERE session_id = ? ORDER BY created_at_epoch DESC, id DESC"
  );
  return query.all(sessionId);
}

// src/services/sqlite/Reports.ts
function getReportData(db, project, startEpoch, endEpoch) {
  const startDate = new Date(startEpoch);
  const endDate = new Date(endEpoch);
  const days = Math.ceil((endEpoch - startEpoch) / (24 * 60 * 60 * 1e3));
  const label = days <= 7 ? "Weekly" : days <= 31 ? "Monthly" : "Custom";
  const countInRange = (table, epochCol = "created_at_epoch") => {
    const sql = project ? `SELECT COUNT(*) as count FROM ${table} WHERE project = ? AND ${epochCol} >= ? AND ${epochCol} <= ?` : `SELECT COUNT(*) as count FROM ${table} WHERE ${epochCol} >= ? AND ${epochCol} <= ?`;
    const stmt = db.query(sql);
    const row = project ? stmt.get(project, startEpoch, endEpoch) : stmt.get(startEpoch, endEpoch);
    return row?.count || 0;
  };
  const observations = countInRange("observations");
  const summaries = countInRange("summaries");
  const prompts = countInRange("prompts");
  const sessions = countInRange("sessions", "started_at_epoch");
  const timelineSql = project ? `SELECT DATE(datetime(created_at_epoch / 1000, 'unixepoch')) as day, COUNT(*) as count
       FROM observations
       WHERE project = ? AND created_at_epoch >= ? AND created_at_epoch <= ?
       GROUP BY day ORDER BY day ASC` : `SELECT DATE(datetime(created_at_epoch / 1000, 'unixepoch')) as day, COUNT(*) as count
       FROM observations
       WHERE created_at_epoch >= ? AND created_at_epoch <= ?
       GROUP BY day ORDER BY day ASC`;
  const timelineStmt = db.query(timelineSql);
  const timeline = project ? timelineStmt.all(project, startEpoch, endEpoch) : timelineStmt.all(startEpoch, endEpoch);
  const typeSql = project ? `SELECT type, COUNT(*) as count FROM observations
       WHERE project = ? AND created_at_epoch >= ? AND created_at_epoch <= ?
       GROUP BY type ORDER BY count DESC` : `SELECT type, COUNT(*) as count FROM observations
       WHERE created_at_epoch >= ? AND created_at_epoch <= ?
       GROUP BY type ORDER BY count DESC`;
  const typeStmt = db.query(typeSql);
  const typeDistribution = project ? typeStmt.all(project, startEpoch, endEpoch) : typeStmt.all(startEpoch, endEpoch);
  const sessionTotalSql = project ? `SELECT COUNT(*) as count FROM sessions WHERE project = ? AND started_at_epoch >= ? AND started_at_epoch <= ?` : `SELECT COUNT(*) as count FROM sessions WHERE started_at_epoch >= ? AND started_at_epoch <= ?`;
  const sessionTotal = (project ? db.query(sessionTotalSql).get(project, startEpoch, endEpoch)?.count : db.query(sessionTotalSql).get(startEpoch, endEpoch)?.count) || 0;
  const sessionCompletedSql = project ? `SELECT COUNT(*) as count FROM sessions WHERE project = ? AND started_at_epoch >= ? AND started_at_epoch <= ? AND status = 'completed'` : `SELECT COUNT(*) as count FROM sessions WHERE started_at_epoch >= ? AND started_at_epoch <= ? AND status = 'completed'`;
  const sessionCompleted = (project ? db.query(sessionCompletedSql).get(project, startEpoch, endEpoch)?.count : db.query(sessionCompletedSql).get(startEpoch, endEpoch)?.count) || 0;
  const sessionAvgSql = project ? `SELECT AVG((completed_at_epoch - started_at_epoch) / 1000.0 / 60.0) as avg_min
       FROM sessions
       WHERE project = ? AND started_at_epoch >= ? AND started_at_epoch <= ?
         AND status = 'completed' AND completed_at_epoch IS NOT NULL AND completed_at_epoch > started_at_epoch` : `SELECT AVG((completed_at_epoch - started_at_epoch) / 1000.0 / 60.0) as avg_min
       FROM sessions
       WHERE started_at_epoch >= ? AND started_at_epoch <= ?
         AND status = 'completed' AND completed_at_epoch IS NOT NULL AND completed_at_epoch > started_at_epoch`;
  const avgRow = project ? db.query(sessionAvgSql).get(project, startEpoch, endEpoch) : db.query(sessionAvgSql).get(startEpoch, endEpoch);
  const avgDurationMinutes = Math.round((avgRow?.avg_min || 0) * 10) / 10;
  const knowledgeSql = project ? `SELECT COUNT(*) as count FROM observations
       WHERE project = ? AND created_at_epoch >= ? AND created_at_epoch <= ?
         AND type IN ('constraint', 'decision', 'heuristic', 'rejected')` : `SELECT COUNT(*) as count FROM observations
       WHERE created_at_epoch >= ? AND created_at_epoch <= ?
         AND type IN ('constraint', 'decision', 'heuristic', 'rejected')`;
  const knowledgeCount = (project ? db.query(knowledgeSql).get(project, startEpoch, endEpoch)?.count : db.query(knowledgeSql).get(startEpoch, endEpoch)?.count) || 0;
  const staleSql = project ? `SELECT COUNT(*) as count FROM observations
       WHERE project = ? AND created_at_epoch >= ? AND created_at_epoch <= ? AND is_stale = 1` : `SELECT COUNT(*) as count FROM observations
       WHERE created_at_epoch >= ? AND created_at_epoch <= ? AND is_stale = 1`;
  const staleCount = (project ? db.query(staleSql).get(project, startEpoch, endEpoch)?.count : db.query(staleSql).get(startEpoch, endEpoch)?.count) || 0;
  const summarySql = project ? `SELECT learned, completed, next_steps FROM summaries
       WHERE project = ? AND created_at_epoch >= ? AND created_at_epoch <= ?
       ORDER BY created_at_epoch DESC, id DESC` : `SELECT learned, completed, next_steps FROM summaries
       WHERE created_at_epoch >= ? AND created_at_epoch <= ?
       ORDER BY created_at_epoch DESC, id DESC`;
  const summaryRows = project ? db.query(summarySql).all(project, startEpoch, endEpoch) : db.query(summarySql).all(startEpoch, endEpoch);
  const topLearnings = [];
  const completedTasks = [];
  const nextStepsArr = [];
  for (const row of summaryRows) {
    if (row.learned) {
      const parts = row.learned.split("; ").filter(Boolean);
      topLearnings.push(...parts);
    }
    if (row.completed) {
      const parts = row.completed.split("; ").filter(Boolean);
      completedTasks.push(...parts);
    }
    if (row.next_steps) {
      const parts = row.next_steps.split("; ").filter(Boolean);
      nextStepsArr.push(...parts);
    }
  }
  const filesSql = project ? `SELECT files_modified FROM observations
       WHERE project = ? AND created_at_epoch >= ? AND created_at_epoch <= ?
         AND files_modified IS NOT NULL AND files_modified != ''` : `SELECT files_modified FROM observations
       WHERE created_at_epoch >= ? AND created_at_epoch <= ?
         AND files_modified IS NOT NULL AND files_modified != ''`;
  const fileRows = project ? db.query(filesSql).all(project, startEpoch, endEpoch) : db.query(filesSql).all(startEpoch, endEpoch);
  const fileCounts = /* @__PURE__ */ new Map();
  for (const row of fileRows) {
    const files = row.files_modified.split(",").map((f) => f.trim()).filter(Boolean);
    for (const file of files) {
      fileCounts.set(file, (fileCounts.get(file) || 0) + 1);
    }
  }
  const fileHotspots = Array.from(fileCounts.entries()).map(([file, count]) => ({ file, count })).sort((a, b) => b.count - a.count).slice(0, 15);
  return {
    period: {
      start: startDate.toISOString().split("T")[0],
      end: endDate.toISOString().split("T")[0],
      days,
      label
    },
    overview: {
      observations,
      summaries,
      sessions,
      prompts,
      knowledgeCount,
      staleCount
    },
    timeline,
    typeDistribution,
    sessionStats: {
      total: sessionTotal,
      completed: sessionCompleted,
      avgDurationMinutes
    },
    topLearnings: [...new Set(topLearnings)].slice(0, 10),
    completedTasks: [...new Set(completedTasks)].slice(0, 10),
    nextSteps: [...new Set(nextStepsArr)].slice(0, 10),
    fileHotspots
  };
}

// src/services/sqlite/Search.ts
import { existsSync as existsSync3, statSync as statSync2 } from "fs";
var BM25_WEIGHTS = "10.0, 1.0, 5.0, 3.0";
function escapeLikePattern3(input) {
  return input.replace(/[%_\\]/g, "\\$&");
}
function sanitizeFTS5Query(query) {
  const trimmed = query.length > 1e4 ? query.substring(0, 1e4) : query;
  const terms = trimmed.replace(/[""\u0022]/g, "").split(/\s+/).filter((t) => t.length > 0).slice(0, 100).map((t) => `"${t}"`);
  return terms.join(" ");
}
function searchObservationsFTS(db, query, filters = {}) {
  const limit = filters.limit || 50;
  try {
    const safeQuery = sanitizeFTS5Query(query);
    if (!safeQuery) return searchObservationsLIKE(db, query, filters);
    let sql = `
      SELECT o.* FROM observations o
      JOIN observations_fts fts ON o.id = fts.rowid
      WHERE observations_fts MATCH ?
    `;
    const params = [safeQuery];
    if (filters.project) {
      sql += " AND o.project = ?";
      params.push(filters.project);
    }
    if (filters.type) {
      sql += " AND o.type = ?";
      params.push(filters.type);
    }
    if (filters.dateStart) {
      sql += " AND o.created_at_epoch >= ?";
      params.push(filters.dateStart);
    }
    if (filters.dateEnd) {
      sql += " AND o.created_at_epoch <= ?";
      params.push(filters.dateEnd);
    }
    sql += ` ORDER BY bm25(observations_fts, ${BM25_WEIGHTS}) LIMIT ?`;
    params.push(limit);
    const stmt = db.query(sql);
    return stmt.all(...params);
  } catch {
    return searchObservationsLIKE(db, query, filters);
  }
}
function searchObservationsFTSWithRank(db, query, filters = {}) {
  const limit = filters.limit || 50;
  try {
    const safeQuery = sanitizeFTS5Query(query);
    if (!safeQuery) return [];
    let sql = `
      SELECT o.*, bm25(observations_fts, ${BM25_WEIGHTS}) as fts5_rank FROM observations o
      JOIN observations_fts fts ON o.id = fts.rowid
      WHERE observations_fts MATCH ?
    `;
    const params = [safeQuery];
    if (filters.project) {
      sql += " AND o.project = ?";
      params.push(filters.project);
    }
    if (filters.type) {
      sql += " AND o.type = ?";
      params.push(filters.type);
    }
    if (filters.dateStart) {
      sql += " AND o.created_at_epoch >= ?";
      params.push(filters.dateStart);
    }
    if (filters.dateEnd) {
      sql += " AND o.created_at_epoch <= ?";
      params.push(filters.dateEnd);
    }
    sql += ` ORDER BY bm25(observations_fts, ${BM25_WEIGHTS}) LIMIT ?`;
    params.push(limit);
    const stmt = db.query(sql);
    return stmt.all(...params);
  } catch {
    return [];
  }
}
function searchObservationsLIKE(db, query, filters = {}) {
  const limit = filters.limit || 50;
  const pattern = `%${escapeLikePattern3(query)}%`;
  let sql = `
    SELECT * FROM observations
    WHERE (title LIKE ? ESCAPE '\\' OR text LIKE ? ESCAPE '\\' OR narrative LIKE ? ESCAPE '\\' OR concepts LIKE ? ESCAPE '\\')
  `;
  const params = [pattern, pattern, pattern, pattern];
  if (filters.project) {
    sql += " AND project = ?";
    params.push(filters.project);
  }
  if (filters.type) {
    sql += " AND type = ?";
    params.push(filters.type);
  }
  if (filters.dateStart) {
    sql += " AND created_at_epoch >= ?";
    params.push(filters.dateStart);
  }
  if (filters.dateEnd) {
    sql += " AND created_at_epoch <= ?";
    params.push(filters.dateEnd);
  }
  sql += " ORDER BY created_at_epoch DESC, id DESC LIMIT ?";
  params.push(limit);
  const stmt = db.query(sql);
  return stmt.all(...params);
}
function searchSummariesFiltered(db, query, filters = {}) {
  const limit = filters.limit || 20;
  const pattern = `%${escapeLikePattern3(query)}%`;
  let sql = `
    SELECT * FROM summaries
    WHERE (request LIKE ? ESCAPE '\\' OR learned LIKE ? ESCAPE '\\' OR completed LIKE ? ESCAPE '\\' OR notes LIKE ? ESCAPE '\\' OR next_steps LIKE ? ESCAPE '\\')
  `;
  const params = [pattern, pattern, pattern, pattern, pattern];
  if (filters.project) {
    sql += " AND project = ?";
    params.push(filters.project);
  }
  if (filters.dateStart) {
    sql += " AND created_at_epoch >= ?";
    params.push(filters.dateStart);
  }
  if (filters.dateEnd) {
    sql += " AND created_at_epoch <= ?";
    params.push(filters.dateEnd);
  }
  sql += " ORDER BY created_at_epoch DESC, id DESC LIMIT ?";
  params.push(limit);
  const stmt = db.query(sql);
  return stmt.all(...params);
}
function getObservationsByIds(db, ids) {
  if (!Array.isArray(ids) || ids.length === 0) return [];
  const validIds = ids.filter((id) => typeof id === "number" && Number.isInteger(id) && id > 0).slice(0, 500);
  if (validIds.length === 0) return [];
  const placeholders = validIds.map(() => "?").join(",");
  const sql = `SELECT * FROM observations WHERE id IN (${placeholders}) ORDER BY created_at_epoch DESC, id DESC`;
  const stmt = db.query(sql);
  return stmt.all(...validIds);
}
function getTimeline(db, anchorId, depthBefore = 5, depthAfter = 5) {
  const anchorStmt = db.query("SELECT created_at_epoch FROM observations WHERE id = ?");
  const anchor = anchorStmt.get(anchorId);
  if (!anchor) return [];
  const anchorEpoch = anchor.created_at_epoch;
  const beforeStmt = db.query(`
    SELECT id, 'observation' as type, title, text as content, project, created_at, created_at_epoch
    FROM observations
    WHERE (created_at_epoch < ? OR (created_at_epoch = ? AND id < ?))
    ORDER BY created_at_epoch DESC, id DESC
    LIMIT ?
  `);
  const before = beforeStmt.all(anchorEpoch, anchorEpoch, anchorId, depthBefore).reverse();
  const selfStmt = db.query(`
    SELECT id, 'observation' as type, title, text as content, project, created_at, created_at_epoch
    FROM observations WHERE id = ?
  `);
  const self = selfStmt.all(anchorId);
  const afterStmt = db.query(`
    SELECT id, 'observation' as type, title, text as content, project, created_at, created_at_epoch
    FROM observations
    WHERE (created_at_epoch > ? OR (created_at_epoch = ? AND id > ?))
    ORDER BY created_at_epoch ASC, id ASC
    LIMIT ?
  `);
  const after = afterStmt.all(anchorEpoch, anchorEpoch, anchorId, depthAfter);
  return [...before, ...self, ...after];
}
function getProjectStats(db, project) {
  const sql = `
    WITH
      obs_stats AS (
        SELECT
          COUNT(*) as count,
          COALESCE(SUM(discovery_tokens), 0) as discovery_tokens,
          COALESCE(SUM(
            CAST((LENGTH(COALESCE(title, '')) + LENGTH(COALESCE(narrative, ''))) / 4 AS INTEGER)
          ), 0) as read_tokens
        FROM observations WHERE project = ?
      ),
      sum_count AS (SELECT COUNT(*) as count FROM summaries WHERE project = ?),
      ses_count AS (SELECT COUNT(*) as count FROM sessions WHERE project = ?),
      prm_count AS (SELECT COUNT(*) as count FROM prompts WHERE project = ?)
    SELECT
      obs_stats.count as observations,
      obs_stats.discovery_tokens,
      obs_stats.read_tokens,
      sum_count.count as summaries,
      ses_count.count as sessions,
      prm_count.count as prompts
    FROM obs_stats, sum_count, ses_count, prm_count
  `;
  const row = db.query(sql).get(project, project, project, project);
  const discoveryTokens = row?.discovery_tokens || 0;
  const readTokens = row?.read_tokens || 0;
  const savings = Math.max(0, discoveryTokens - readTokens);
  return {
    observations: row?.observations || 0,
    summaries: row?.summaries || 0,
    sessions: row?.sessions || 0,
    prompts: row?.prompts || 0,
    tokenEconomics: { discoveryTokens, readTokens, savings }
  };
}
function getStaleObservations(db, project) {
  const rows = db.query(`
    SELECT * FROM observations
    WHERE project = ? AND files_modified IS NOT NULL AND files_modified != ''
    ORDER BY created_at_epoch DESC, id DESC
    LIMIT 500
  `).all(project);
  const staleObs = [];
  for (const obs of rows) {
    if (!obs.files_modified) continue;
    const files = obs.files_modified.split(",").map((f) => f.trim()).filter(Boolean);
    let isStale = false;
    for (const filepath of files) {
      try {
        if (!existsSync3(filepath)) continue;
        const stat = statSync2(filepath);
        if (stat.mtimeMs > obs.created_at_epoch) {
          isStale = true;
          break;
        }
      } catch {
      }
    }
    if (isStale) {
      staleObs.push(obs);
    }
  }
  return staleObs;
}
function markObservationsStale(db, ids, stale) {
  if (!Array.isArray(ids) || ids.length === 0) return;
  const validIds = ids.filter((id) => typeof id === "number" && Number.isInteger(id) && id > 0).slice(0, 500);
  if (validIds.length === 0) return;
  const placeholders = validIds.map(() => "?").join(",");
  db.run(
    `UPDATE observations SET is_stale = ? WHERE id IN (${placeholders})`,
    [stale ? 1 : 0, ...validIds]
  );
}

// src/services/sqlite/GithubLinks.ts
function createGithubLink(db, data) {
  const now = /* @__PURE__ */ new Date();
  const result = db.run(
    `INSERT INTO github_links
     (observation_id, session_id, repo, issue_number, pr_number, event_type,
      action, title, url, author, created_at, created_at_epoch)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.observation_id ?? null,
      data.session_id ?? null,
      data.repo,
      data.issue_number ?? null,
      data.pr_number ?? null,
      data.event_type,
      data.action ?? null,
      data.title ?? null,
      data.url ?? null,
      data.author ?? null,
      now.toISOString(),
      now.getTime()
    ]
  );
  return Number(result.lastInsertRowid);
}
function getGithubLinksByObservation(db, observationId) {
  return db.query(
    `SELECT * FROM github_links
     WHERE observation_id = ?
     ORDER BY created_at_epoch DESC, id DESC`
  ).all(observationId);
}
function getGithubLinksByRepo(db, repo, limit = 50) {
  return db.query(
    `SELECT * FROM github_links
     WHERE repo = ?
     ORDER BY created_at_epoch DESC, id DESC
     LIMIT ?`
  ).all(repo, limit);
}
function getGithubLinksByIssue(db, repo, issueNumber) {
  return db.query(
    `SELECT * FROM github_links
     WHERE repo = ? AND issue_number = ?
     ORDER BY created_at_epoch DESC, id DESC`
  ).all(repo, issueNumber);
}
function getGithubLinksByPR(db, repo, prNumber) {
  return db.query(
    `SELECT * FROM github_links
     WHERE repo = ? AND pr_number = ?
     ORDER BY created_at_epoch DESC, id DESC`
  ).all(repo, prNumber);
}
function searchGithubLinks(db, query, options = {}) {
  const { repo, event_type, limit = 50 } = options;
  const safeLimit = Math.min(Math.max(1, limit), 200);
  const conditions = [];
  const params = [];
  if (query && query.trim().length > 0) {
    const pattern = `%${query.replace(/[%_\\]/g, "\\$&")}%`;
    conditions.push(`(title LIKE ? ESCAPE '\\' OR url LIKE ? ESCAPE '\\')`);
    params.push(pattern, pattern);
  }
  if (repo) {
    conditions.push("repo = ?");
    params.push(repo);
  }
  if (event_type) {
    conditions.push("event_type = ?");
    params.push(event_type);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  params.push(safeLimit);
  return db.query(
    `SELECT * FROM github_links
     ${where}
     ORDER BY created_at_epoch DESC, id DESC
     LIMIT ?`
  ).all(...params);
}
function listReposWithLinkCount(db) {
  return db.query(
    `SELECT repo,
            COUNT(*) as count,
            MAX(created_at) as last_event_at
     FROM github_links
     GROUP BY repo
     ORDER BY count DESC, repo ASC`
  ).all();
}

// src/services/sqlite/ImportExport.ts
import { createHash } from "crypto";
var JSONL_SCHEMA_VERSION = "2.5.0";
var IMPORT_BATCH_SIZE = 100;
function countExportRecords(db, filters) {
  const { fromEpoch, toEpoch } = filtersToEpoch(filters);
  const obsConds = buildConditions({ project: filters.project, type: filters.type, fromEpoch, toEpoch });
  const sumConds = buildConditions({ project: filters.project, fromEpoch, toEpoch });
  const promptConds = buildConditions({ project: filters.project, fromEpoch, toEpoch });
  const obsCount = db.query(
    `SELECT COUNT(*) as c FROM observations WHERE ${obsConds.where}`
  ).get(...obsConds.params).c;
  const sumCount = db.query(
    `SELECT COUNT(*) as c FROM summaries WHERE ${sumConds.where}`
  ).get(...sumConds.params).c;
  const promptCount = db.query(
    `SELECT COUNT(*) as c FROM prompts WHERE ${promptConds.where}`
  ).get(...promptConds.params).c;
  return { observations: obsCount, summaries: sumCount, prompts: promptCount };
}
function generateMetaRecord(db, filters) {
  const counts = countExportRecords(db, filters);
  const meta = {
    _meta: {
      version: JSONL_SCHEMA_VERSION,
      exported_at: (/* @__PURE__ */ new Date()).toISOString(),
      counts,
      filters: Object.keys(filters).length > 0 ? filters : void 0
    }
  };
  return JSON.stringify(meta);
}
function exportObservationsStreaming(db, filters, onRow, batchSize = 200) {
  const { fromEpoch, toEpoch } = filtersToEpoch(filters);
  const conds = buildConditions({ project: filters.project, type: filters.type, fromEpoch, toEpoch });
  let offset = 0;
  let total = 0;
  while (true) {
    const rows = db.query(
      `SELECT id, memory_session_id, project, type, title, subtitle, text, narrative, facts, concepts,
              files_read, files_modified, prompt_number, content_hash, discovery_tokens, auto_category,
              created_at, created_at_epoch
       FROM observations
       WHERE ${conds.where}
       ORDER BY created_at_epoch ASC, id ASC
       LIMIT ? OFFSET ?`
    ).all(...conds.params, batchSize, offset);
    if (rows.length === 0) break;
    for (const row of rows) {
      const record = {
        _type: "observation",
        id: row.id,
        memory_session_id: row.memory_session_id,
        project: row.project,
        type: row.type,
        title: row.title,
        subtitle: row.subtitle,
        text: row.text,
        narrative: row.narrative,
        facts: row.facts,
        concepts: row.concepts,
        files_read: row.files_read,
        files_modified: row.files_modified,
        prompt_number: row.prompt_number,
        content_hash: row.content_hash,
        discovery_tokens: row.discovery_tokens ?? 0,
        auto_category: row.auto_category,
        created_at: row.created_at,
        created_at_epoch: row.created_at_epoch
      };
      onRow(JSON.stringify(record));
      total++;
    }
    offset += rows.length;
    if (rows.length < batchSize) break;
  }
  return total;
}
function exportSummariesStreaming(db, filters, onRow, batchSize = 200) {
  const { fromEpoch, toEpoch } = filtersToEpoch(filters);
  const conds = buildConditions({ project: filters.project, fromEpoch, toEpoch });
  let offset = 0;
  let total = 0;
  while (true) {
    const rows = db.query(
      `SELECT id, session_id, project, request, investigated, learned, completed, next_steps, notes,
              discovery_tokens, created_at, created_at_epoch
       FROM summaries
       WHERE ${conds.where}
       ORDER BY created_at_epoch ASC, id ASC
       LIMIT ? OFFSET ?`
    ).all(...conds.params, batchSize, offset);
    if (rows.length === 0) break;
    for (const row of rows) {
      const record = {
        _type: "summary",
        id: row.id,
        session_id: row.session_id,
        project: row.project,
        request: row.request,
        investigated: row.investigated,
        learned: row.learned,
        completed: row.completed,
        next_steps: row.next_steps,
        notes: row.notes,
        discovery_tokens: row.discovery_tokens ?? 0,
        created_at: row.created_at,
        created_at_epoch: row.created_at_epoch
      };
      onRow(JSON.stringify(record));
      total++;
    }
    offset += rows.length;
    if (rows.length < batchSize) break;
  }
  return total;
}
function exportPromptsStreaming(db, filters, onRow, batchSize = 200) {
  const { fromEpoch, toEpoch } = filtersToEpoch(filters);
  const conds = buildConditions({ project: filters.project, fromEpoch, toEpoch });
  let offset = 0;
  let total = 0;
  while (true) {
    const rows = db.query(
      `SELECT id, content_session_id, project, prompt_number, prompt_text, created_at, created_at_epoch
       FROM prompts
       WHERE ${conds.where}
       ORDER BY created_at_epoch ASC, id ASC
       LIMIT ? OFFSET ?`
    ).all(...conds.params, batchSize, offset);
    if (rows.length === 0) break;
    for (const row of rows) {
      const record = {
        _type: "prompt",
        id: row.id,
        content_session_id: row.content_session_id,
        project: row.project,
        prompt_number: row.prompt_number,
        prompt_text: row.prompt_text,
        created_at: row.created_at,
        created_at_epoch: row.created_at_epoch
      };
      onRow(JSON.stringify(record));
      total++;
    }
    offset += rows.length;
    if (rows.length < batchSize) break;
  }
  return total;
}
function validateJsonlRow(raw) {
  if (!raw || typeof raw !== "object") {
    return "Il record non \xE8 un oggetto JSON valido";
  }
  const rec = raw;
  if ("_meta" in rec) return null;
  const validTypes = ["observation", "summary", "prompt"];
  if (!rec._type || typeof rec._type !== "string" || !validTypes.includes(rec._type)) {
    return `Campo "_type" obbligatorio, uno di: ${validTypes.join(", ")}`;
  }
  if (rec._type === "observation") {
    if (!rec.project || typeof rec.project !== "string") return 'observation: campo "project" obbligatorio';
    if (!rec.type || typeof rec.type !== "string") return 'observation: campo "type" obbligatorio';
    if (!rec.title || typeof rec.title !== "string") return 'observation: campo "title" obbligatorio';
    if (rec.project.length > 200) return 'observation: "project" troppo lungo (max 200)';
    if (rec.title.length > 500) return 'observation: "title" troppo lungo (max 500)';
  } else if (rec._type === "summary") {
    if (!rec.project || typeof rec.project !== "string") return 'summary: campo "project" obbligatorio';
    if (!rec.session_id || typeof rec.session_id !== "string") return 'summary: campo "session_id" obbligatorio';
  } else if (rec._type === "prompt") {
    if (!rec.project || typeof rec.project !== "string") return 'prompt: campo "project" obbligatorio';
    if (!rec.content_session_id || typeof rec.content_session_id !== "string") return 'prompt: campo "content_session_id" obbligatorio';
    if (!rec.prompt_text || typeof rec.prompt_text !== "string") return 'prompt: campo "prompt_text" obbligatorio';
  }
  return null;
}
function computeImportHash(rec) {
  const payload = [
    rec.project ?? "",
    rec.type ?? "",
    rec.title ?? "",
    rec.narrative ?? ""
  ].join("|");
  return createHash("sha256").update(payload).digest("hex");
}
function hashExistsInObservations(db, hash) {
  const result = db.query(
    "SELECT id FROM observations WHERE content_hash = ? LIMIT 1"
  ).get(hash);
  return !!result;
}
function importObservationBatch(db, records, dryRun) {
  let imported = 0;
  let skipped = 0;
  for (let i = 0; i < records.length; i += IMPORT_BATCH_SIZE) {
    const batch = records.slice(i, i + IMPORT_BATCH_SIZE);
    if (dryRun) {
      for (const rec of batch) {
        const hash = rec.content_hash || computeImportHash(rec);
        if (hashExistsInObservations(db, hash)) {
          skipped++;
        } else {
          imported++;
        }
      }
      continue;
    }
    const insertBatch = db.transaction(() => {
      for (const rec of batch) {
        const hash = rec.content_hash || computeImportHash(rec);
        if (hashExistsInObservations(db, hash)) {
          skipped++;
          continue;
        }
        const now = (/* @__PURE__ */ new Date()).toISOString();
        db.run(
          `INSERT INTO observations
           (memory_session_id, project, type, title, subtitle, text, narrative, facts, concepts,
            files_read, files_modified, prompt_number, content_hash, discovery_tokens, auto_category,
            created_at, created_at_epoch)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            rec.memory_session_id || "imported",
            rec.project,
            rec.type,
            rec.title,
            rec.subtitle ?? null,
            rec.text ?? null,
            rec.narrative ?? null,
            rec.facts ?? null,
            rec.concepts ?? null,
            rec.files_read ?? null,
            rec.files_modified ?? null,
            rec.prompt_number ?? 0,
            hash,
            rec.discovery_tokens ?? 0,
            rec.auto_category ?? null,
            rec.created_at || now,
            rec.created_at_epoch || Date.now()
          ]
        );
        imported++;
      }
    });
    insertBatch();
  }
  return { imported, skipped };
}
function importSummaryBatch(db, records, dryRun) {
  let imported = 0;
  let skipped = 0;
  for (let i = 0; i < records.length; i += IMPORT_BATCH_SIZE) {
    const batch = records.slice(i, i + IMPORT_BATCH_SIZE);
    if (dryRun) {
      for (const rec of batch) {
        const exists = db.query(
          "SELECT id FROM summaries WHERE session_id = ? AND project = ? AND created_at_epoch = ? LIMIT 1"
        ).get(rec.session_id, rec.project, rec.created_at_epoch ?? 0);
        if (exists) skipped++;
        else imported++;
      }
      continue;
    }
    const insertBatch = db.transaction(() => {
      for (const rec of batch) {
        const exists = db.query(
          "SELECT id FROM summaries WHERE session_id = ? AND project = ? AND created_at_epoch = ? LIMIT 1"
        ).get(rec.session_id, rec.project, rec.created_at_epoch ?? 0);
        if (exists) {
          skipped++;
          continue;
        }
        const now = (/* @__PURE__ */ new Date()).toISOString();
        db.run(
          `INSERT INTO summaries
           (session_id, project, request, investigated, learned, completed, next_steps, notes,
            discovery_tokens, created_at, created_at_epoch)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            rec.session_id,
            rec.project,
            rec.request ?? null,
            rec.investigated ?? null,
            rec.learned ?? null,
            rec.completed ?? null,
            rec.next_steps ?? null,
            rec.notes ?? null,
            rec.discovery_tokens ?? 0,
            rec.created_at || now,
            rec.created_at_epoch || Date.now()
          ]
        );
        imported++;
      }
    });
    insertBatch();
  }
  return { imported, skipped };
}
function importPromptBatch(db, records, dryRun) {
  let imported = 0;
  let skipped = 0;
  for (let i = 0; i < records.length; i += IMPORT_BATCH_SIZE) {
    const batch = records.slice(i, i + IMPORT_BATCH_SIZE);
    if (dryRun) {
      for (const rec of batch) {
        const exists = db.query(
          "SELECT id FROM prompts WHERE content_session_id = ? AND prompt_number = ? LIMIT 1"
        ).get(rec.content_session_id, rec.prompt_number ?? 0);
        if (exists) skipped++;
        else imported++;
      }
      continue;
    }
    const insertBatch = db.transaction(() => {
      for (const rec of batch) {
        const exists = db.query(
          "SELECT id FROM prompts WHERE content_session_id = ? AND prompt_number = ? LIMIT 1"
        ).get(rec.content_session_id, rec.prompt_number ?? 0);
        if (exists) {
          skipped++;
          continue;
        }
        const now = (/* @__PURE__ */ new Date()).toISOString();
        db.run(
          `INSERT INTO prompts
           (content_session_id, project, prompt_number, prompt_text, created_at, created_at_epoch)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            rec.content_session_id,
            rec.project,
            rec.prompt_number ?? 0,
            rec.prompt_text,
            rec.created_at || now,
            rec.created_at_epoch || Date.now()
          ]
        );
        imported++;
      }
    });
    insertBatch();
  }
  return { imported, skipped };
}
function importJsonl(db, content, dryRun = false) {
  const lines = content.split("\n");
  const result = {
    imported: 0,
    skipped: 0,
    errors: 0,
    total: 0,
    errorDetails: []
  };
  const obsBuf = [];
  const sumBuf = [];
  const promptBuf = [];
  const flushBuffers = () => {
    if (obsBuf.length > 0) {
      const r = importObservationBatch(db, obsBuf.splice(0), dryRun);
      result.imported += r.imported;
      result.skipped += r.skipped;
    }
    if (sumBuf.length > 0) {
      const r = importSummaryBatch(db, sumBuf.splice(0), dryRun);
      result.imported += r.imported;
      result.skipped += r.skipped;
    }
    if (promptBuf.length > 0) {
      const r = importPromptBatch(db, promptBuf.splice(0), dryRun);
      result.imported += r.imported;
      result.skipped += r.skipped;
    }
  };
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (!raw || raw.startsWith("#")) continue;
    result.total++;
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      result.errors++;
      result.errorDetails.push({ line: i + 1, error: `JSON non valido: ${raw.substring(0, 60)}` });
      continue;
    }
    if (parsed && typeof parsed === "object" && "_meta" in parsed) {
      result.total--;
      continue;
    }
    const validErr = validateJsonlRow(parsed);
    if (validErr) {
      result.errors++;
      result.errorDetails.push({ line: i + 1, error: validErr });
      continue;
    }
    const rec = parsed;
    if (rec._type === "observation") {
      obsBuf.push(rec);
    } else if (rec._type === "summary") {
      sumBuf.push(rec);
    } else if (rec._type === "prompt") {
      promptBuf.push(rec);
    }
    const totalBuf = obsBuf.length + sumBuf.length + promptBuf.length;
    if (totalBuf >= IMPORT_BATCH_SIZE) {
      flushBuffers();
    }
  }
  flushBuffers();
  return result;
}
function filtersToEpoch(filters) {
  return {
    fromEpoch: filters.from ? new Date(filters.from).getTime() : void 0,
    toEpoch: filters.to ? new Date(filters.to).getTime() : void 0
  };
}
function buildConditions(params) {
  const conditions = ["1=1"];
  const values = [];
  if (params.project) {
    conditions.push("project = ?");
    values.push(params.project);
  }
  if (params.type) {
    conditions.push("type = ?");
    values.push(params.type);
  }
  if (params.fromEpoch !== void 0) {
    conditions.push("created_at_epoch >= ?");
    values.push(params.fromEpoch);
  }
  if (params.toEpoch !== void 0) {
    conditions.push("created_at_epoch <= ?");
    values.push(params.toEpoch);
  }
  return { where: conditions.join(" AND "), params: values };
}

// src/types/worker-types.ts
var KNOWLEDGE_TYPES = ["constraint", "decision", "heuristic", "rejected"];

// src/services/sqlite/Retention.ts
var KNOWLEDGE_TYPE_LIST = KNOWLEDGE_TYPES;
var KNOWLEDGE_PLACEHOLDERS = KNOWLEDGE_TYPE_LIST.map(() => "?").join(", ");
function toEpochThreshold(maxAgeDays) {
  if (maxAgeDays <= 0) return null;
  return Date.now() - maxAgeDays * 864e5;
}
function buildKnowledgeImportanceExemptionClause() {
  return `AND NOT (
    facts IS NOT NULL AND (
      facts LIKE '%"importance":4%'
      OR facts LIKE '%"importance": 4%'
      OR facts LIKE '%"importance":5%'
      OR facts LIKE '%"importance": 5%'
    )
  )`;
}
function getRetentionStats(db, config) {
  const obsThreshold = toEpochThreshold(config.observationsMaxAgeDays);
  const sumThreshold = toEpochThreshold(config.summariesMaxAgeDays);
  const promptThreshold = toEpochThreshold(config.promptsMaxAgeDays);
  const knowledgeThreshold = toEpochThreshold(config.knowledgeMaxAgeDays);
  const importanceExemption = buildKnowledgeImportanceExemptionClause();
  let observations = 0;
  if (obsThreshold !== null) {
    const row = db.query(
      `SELECT COUNT(*) as c FROM observations
       WHERE created_at_epoch < ?
         AND type NOT IN (${KNOWLEDGE_PLACEHOLDERS})`
    ).get(obsThreshold, ...KNOWLEDGE_TYPE_LIST);
    observations = row?.c ?? 0;
  }
  let summaries = 0;
  if (sumThreshold !== null) {
    const row = db.query(
      "SELECT COUNT(*) as c FROM summaries WHERE created_at_epoch < ?"
    ).get(sumThreshold);
    summaries = row?.c ?? 0;
  }
  let prompts = 0;
  if (promptThreshold !== null) {
    const row = db.query(
      "SELECT COUNT(*) as c FROM prompts WHERE created_at_epoch < ?"
    ).get(promptThreshold);
    prompts = row?.c ?? 0;
  }
  let knowledge = 0;
  if (knowledgeThreshold !== null) {
    const row = db.query(
      `SELECT COUNT(*) as c FROM observations
       WHERE created_at_epoch < ?
         AND type IN (${KNOWLEDGE_PLACEHOLDERS})
         ${importanceExemption}`
    ).get(knowledgeThreshold, ...KNOWLEDGE_TYPE_LIST);
    knowledge = row?.c ?? 0;
  }
  const total = observations + summaries + prompts + knowledge;
  return { observations, summaries, prompts, knowledge, total };
}
function countRows(db, sql, params) {
  const row = db.query(sql).get(...params);
  return row?.c ?? 0;
}
function applyRetention(db, config) {
  const obsThreshold = toEpochThreshold(config.observationsMaxAgeDays);
  const sumThreshold = toEpochThreshold(config.summariesMaxAgeDays);
  const promptThreshold = toEpochThreshold(config.promptsMaxAgeDays);
  const knowledgeThreshold = toEpochThreshold(config.knowledgeMaxAgeDays);
  const importanceExemption = buildKnowledgeImportanceExemptionClause();
  const deleteAll = db.transaction(() => {
    let observations = 0;
    let summaries = 0;
    let prompts = 0;
    let knowledge = 0;
    if (obsThreshold !== null) {
      const obsParams = [obsThreshold, ...KNOWLEDGE_TYPE_LIST];
      const obsWhere = `WHERE created_at_epoch < ? AND type NOT IN (${KNOWLEDGE_PLACEHOLDERS})`;
      observations = countRows(
        db,
        `SELECT COUNT(*) as c FROM observations ${obsWhere}`,
        obsParams
      );
      if (observations > 0) {
        db.run(
          `DELETE FROM observation_embeddings
           WHERE observation_id IN (
             SELECT id FROM observations ${obsWhere}
           )`,
          obsParams
        );
        db.run(
          `DELETE FROM observations ${obsWhere}`,
          obsParams
        );
      }
    }
    if (sumThreshold !== null) {
      summaries = countRows(
        db,
        "SELECT COUNT(*) as c FROM summaries WHERE created_at_epoch < ?",
        [sumThreshold]
      );
      if (summaries > 0) {
        db.run("DELETE FROM summaries WHERE created_at_epoch < ?", [sumThreshold]);
      }
    }
    if (promptThreshold !== null) {
      prompts = countRows(
        db,
        "SELECT COUNT(*) as c FROM prompts WHERE created_at_epoch < ?",
        [promptThreshold]
      );
      if (prompts > 0) {
        db.run("DELETE FROM prompts WHERE created_at_epoch < ?", [promptThreshold]);
      }
    }
    if (knowledgeThreshold !== null) {
      const kParams = [knowledgeThreshold, ...KNOWLEDGE_TYPE_LIST];
      const kWhere = `WHERE created_at_epoch < ? AND type IN (${KNOWLEDGE_PLACEHOLDERS}) ${importanceExemption}`;
      knowledge = countRows(
        db,
        `SELECT COUNT(*) as c FROM observations ${kWhere}`,
        kParams
      );
      if (knowledge > 0) {
        db.run(
          `DELETE FROM observation_embeddings
           WHERE observation_id IN (
             SELECT id FROM observations ${kWhere}
           )`,
          kParams
        );
        db.run(
          `DELETE FROM observations ${kWhere}`,
          kParams
        );
      }
    }
    return { observations, summaries, prompts, knowledge };
  });
  const counts = deleteAll();
  const total = counts.observations + counts.summaries + counts.prompts + counts.knowledge;
  return {
    ...counts,
    total,
    executedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
function buildRetentionConfig(config) {
  function getNum(key, fallback) {
    const v = config[key];
    if (v === null || v === void 0) return fallback;
    const n = Number(v);
    return isNaN(n) ? fallback : n;
  }
  return {
    observationsMaxAgeDays: getNum("retention.observations.maxAgeDays", 90),
    summariesMaxAgeDays: getNum("retention.summaries.maxAgeDays", 365),
    promptsMaxAgeDays: getNum("retention.prompts.maxAgeDays", 30),
    knowledgeMaxAgeDays: getNum("retention.knowledge.maxAgeDays", 0)
  };
}

// src/services/sqlite/Backup.ts
import {
  existsSync as existsSync4,
  mkdirSync as mkdirSync3,
  copyFileSync,
  readdirSync,
  statSync as statSync3,
  unlinkSync,
  readFileSync as readFileSync2,
  writeFileSync
} from "fs";
import { join as join3, basename as basename2 } from "path";
function formatTimestamp(date) {
  const pad = (n, len = 2) => String(n).padStart(len, "0");
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const mins = pad(date.getMinutes());
  const secs = pad(date.getSeconds());
  const ms = pad(date.getMilliseconds(), 3);
  return `${year}-${month}-${day}-${hours}${mins}${secs}-${ms}`;
}
function resolveUniqueBackupTarget(backupDir, baseDate) {
  for (let attempt = 0; attempt < 1e4; attempt++) {
    const date = new Date(baseDate.getTime() + attempt);
    const ts = formatTimestamp(date);
    const filename = `backup-${ts}.db`;
    const filePath = join3(backupDir, filename);
    const metaPath = join3(backupDir, `backup-${ts}.meta.json`);
    if (!existsSync4(filePath) && !existsSync4(metaPath)) {
      return { date, filename, filePath, metaPath };
    }
  }
  throw new Error(`Impossibile risolvere un nome backup univoco in ${backupDir}`);
}
function collectStats(db, dbPath) {
  const countTable = (table) => {
    try {
      const row = db.query(`SELECT COUNT(*) as c FROM ${table}`).get();
      return row?.c ?? 0;
    } catch {
      return 0;
    }
  };
  const dbSizeBytes = existsSync4(dbPath) ? statSync3(dbPath).size : 0;
  return {
    observations: countTable("observations"),
    sessions: countTable("sessions"),
    summaries: countTable("summaries"),
    prompts: countTable("prompts"),
    dbSizeBytes
  };
}
function getSchemaVersion(db) {
  try {
    const row = db.query("SELECT MAX(version) as v FROM schema_versions").get();
    return row?.v ?? 0;
  } catch {
    return 0;
  }
}
function createBackup(dbPath, backupDir, db) {
  mkdirSync3(backupDir, { recursive: true });
  const { date: now, filename, filePath: destPath, metaPath } = resolveUniqueBackupTarget(backupDir, /* @__PURE__ */ new Date());
  if (!existsSync4(dbPath)) {
    throw new Error(`Database non trovato: ${dbPath}`);
  }
  copyFileSync(dbPath, destPath);
  logger.info("BACKUP", `File DB copiato: ${dbPath} \u2192 ${destPath}`);
  const walPath = `${dbPath}-wal`;
  const shmPath = `${dbPath}-shm`;
  if (existsSync4(walPath)) {
    copyFileSync(walPath, `${destPath}-wal`);
    logger.debug("BACKUP", "File WAL copiato");
  }
  if (existsSync4(shmPath)) {
    copyFileSync(shmPath, `${destPath}-shm`);
    logger.debug("BACKUP", "File SHM copiato");
  }
  const stats = collectStats(db, dbPath);
  const schemaVersion = getSchemaVersion(db);
  const metadata = {
    timestamp: now.toISOString(),
    timestampEpoch: now.getTime(),
    schemaVersion,
    stats,
    sourcePath: dbPath,
    filename
  };
  writeFileSync(metaPath, JSON.stringify(metadata, null, 2), "utf8");
  logger.info("BACKUP", `Metadata scritto: ${metaPath}`);
  return {
    filePath: destPath,
    metaPath,
    metadata
  };
}
function listBackups(backupDir) {
  if (!existsSync4(backupDir)) {
    return [];
  }
  const entries = [];
  let files;
  try {
    files = readdirSync(backupDir);
  } catch (err) {
    logger.warn("BACKUP", `Impossibile leggere la directory backup: ${backupDir}`, {}, err);
    return [];
  }
  const metaFiles = files.filter((f) => f.startsWith("backup-") && f.endsWith(".meta.json"));
  for (const metaFile of metaFiles) {
    const metaPath = join3(backupDir, metaFile);
    const dbFilename = metaFile.replace(/\.meta\.json$/, ".db");
    const filePath = join3(backupDir, dbFilename);
    let metadata;
    try {
      const raw = readFileSync2(metaPath, "utf8");
      metadata = JSON.parse(raw);
    } catch (err) {
      logger.warn("BACKUP", `Metadata non leggibile: ${metaPath}`, {}, err);
      continue;
    }
    if (!existsSync4(filePath)) {
      logger.warn("BACKUP", `File backup mancante per metadata: ${filePath}`);
      continue;
    }
    entries.push({ filePath, metaPath, metadata });
  }
  entries.sort((a, b) => b.metadata.timestampEpoch - a.metadata.timestampEpoch);
  return entries;
}
function restoreBackup(backupFile, dbPath) {
  if (!existsSync4(backupFile)) {
    throw new Error(`File backup non trovato: ${backupFile}`);
  }
  copyFileSync(backupFile, dbPath);
  logger.info("BACKUP", `Database ripristinato: ${backupFile} \u2192 ${dbPath}`);
  const walBackup = `${backupFile}-wal`;
  const shmBackup = `${backupFile}-shm`;
  const walDest = `${dbPath}-wal`;
  const shmDest = `${dbPath}-shm`;
  if (existsSync4(walBackup)) {
    copyFileSync(walBackup, walDest);
    logger.debug("BACKUP", "File WAL ripristinato");
  } else if (existsSync4(walDest)) {
    unlinkSync(walDest);
    logger.debug("BACKUP", "File WAL corrente rimosso (non presente nel backup)");
  }
  if (existsSync4(shmBackup)) {
    copyFileSync(shmBackup, shmDest);
    logger.debug("BACKUP", "File SHM ripristinato");
  } else if (existsSync4(shmDest)) {
    unlinkSync(shmDest);
    logger.debug("BACKUP", "File SHM corrente rimosso (non presente nel backup)");
  }
}
function rotateBackups(backupDir, maxKeep) {
  if (maxKeep <= 0) {
    throw new Error(`maxKeep deve essere > 0, ricevuto: ${maxKeep}`);
  }
  const entries = listBackups(backupDir);
  if (entries.length <= maxKeep) {
    logger.debug("BACKUP", `Rotazione non necessaria: ${entries.length}/${maxKeep} backup presenti`);
    return 0;
  }
  const toDelete = entries.slice(maxKeep);
  let deleted = 0;
  for (const entry of toDelete) {
    try {
      if (existsSync4(entry.filePath)) {
        unlinkSync(entry.filePath);
      }
    } catch (err) {
      logger.warn("BACKUP", `Impossibile eliminare: ${entry.filePath}`, {}, err);
    }
    for (const extra of [`${entry.filePath}-wal`, `${entry.filePath}-shm`]) {
      try {
        if (existsSync4(extra)) unlinkSync(extra);
      } catch {
      }
    }
    try {
      if (existsSync4(entry.metaPath)) {
        unlinkSync(entry.metaPath);
      }
    } catch (err) {
      logger.warn("BACKUP", `Impossibile eliminare metadata: ${entry.metaPath}`, {}, err);
    }
    logger.info("BACKUP", `Backup rimosso (rotazione): ${basename2(entry.filePath)}`);
    deleted++;
  }
  logger.info("BACKUP", `Rotazione completata: ${deleted} backup eliminati, ${maxKeep} mantenuti`);
  return deleted;
}
export {
  JSONL_SCHEMA_VERSION,
  TotalRecallDatabase,
  applyRetention,
  buildNextCursor,
  buildRetentionConfig,
  completeSession,
  computeImportHash,
  consolidateObservations,
  countExportRecords,
  createBackup,
  createCheckpoint,
  createConversationMessage,
  createGithubLink,
  createObservation,
  createPrompt,
  createSession,
  createSummary,
  decodeCursor,
  deleteObservation,
  deletePrompt,
  deleteSummary,
  encodeCursor,
  exportObservationsStreaming,
  exportPromptsStreaming,
  exportSummariesStreaming,
  failSession,
  generateMetaRecord,
  getActiveSessions,
  getAllSessions,
  getCheckpointsBySession,
  getConversationMessageCountBySession,
  getConversationMessagesBySession,
  getGithubLinksByIssue,
  getGithubLinksByObservation,
  getGithubLinksByPR,
  getGithubLinksByRepo,
  getLatestCheckpoint,
  getLatestCheckpointByProject,
  getLatestPrompt,
  getObservationsByIds,
  getObservationsByProject,
  getObservationsBySession,
  getProjectStats,
  getPromptsByProject,
  getPromptsBySession,
  getReportData,
  getRetentionStats,
  getSessionByContentId,
  getSessionById,
  getSessionsByProject,
  getStaleObservations,
  getSummariesByProject,
  getSummaryBySession,
  getTimeline,
  hashExistsInObservations,
  importJsonl,
  isDuplicateObservation,
  listBackups,
  listReposWithLinkCount,
  markObservationsStale,
  restoreBackup,
  rotateBackups,
  searchGithubLinks,
  searchObservations,
  searchObservationsFTS,
  searchObservationsFTSWithRank,
  searchObservationsLIKE,
  searchSummaries,
  searchSummariesFiltered,
  updateLastAccessed,
  updateSessionMemoryId,
  updateSessionUserPrompt,
  validateJsonlRow
};
