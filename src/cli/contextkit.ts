/**
 * Total Recall CLI - Command line interface
 * (shebang added automatically by the build)
 */

import { createTotalRecall } from '../sdk/index.js';
import { formatReportText, formatReportMarkdown, formatReportJson } from '../services/report-formatter.js';
import { printBanner } from './banner.js';
import {
  generateExportOutput,
  parseJsonlFile,
  getConfigPath,
  getConfigValue,
  setConfigValue,
  listConfig,
  formatStatsOutput,
  getDbFileSize,
  buildProgressBar,
  rebuildFtsIndex,
  removeOrphanedEmbeddings,
  vacuumDatabase,
} from './cli-utils.js';
import { TotalRecallDatabase } from '../services/sqlite/Database.js';
import { getObservationsByProject } from '../services/sqlite/Observations.js';
import { createBackup, listBackups, restoreBackup, rotateBackups } from '../services/sqlite/Backup.js';
import {
  loadTeamConfig,
  initTeamConfig,
  exportKnowledge,
  importKnowledge,
  pushKnowledge,
  pullKnowledge,
  getTeamStatus,
} from '../services/team/index.js';
import type { TeamConfig } from '../services/team/index.js';
import { DB_PATH, BACKUPS_DIR, DATA_DIR, KIRO_CONFIG_DIR } from '../shared/paths.js';
import { execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, unlinkSync } from 'fs';
import { join, dirname, basename } from 'path';
import { homedir, platform, release } from 'os';
import { fileURLToPath } from 'url';
import { createInterface } from 'readline';
import * as http from 'http';

const args = process.argv.slice(2);
const command = args[0];

// Legacy alias deprecation notice
const binName = basename(process.argv[1] ?? '');
if (binName === 'kiro-memory') {
  console.error('Note: "kiro-memory" is a legacy alias. The canonical command is "totalrecall".\n');
}

// Detect the dist path from the current file (bundled by esbuild)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// __dirname = .../plugin/dist/cli → go up to get plugin/dist
const DIST_DIR = dirname(__dirname);

// Version from package.json (plugin/dist/cli → ../../package.json)
let PKG_VERSION = 'unknown';
try {
  const pkgPath = join(DIST_DIR, '..', '..', 'package.json');
  PKG_VERSION = JSON.parse(readFileSync(pkgPath, 'utf8')).version;
} catch { /* fallback */ }

// ─── Embedded templates (included in the npm package, no external files needed) ───

/** Agent config template — __DIST_DIR__ is replaced at install time */
const AGENT_TEMPLATE = JSON.stringify({
  name: "totalrecall",
  description: "Agent with persistent cross-session memory. Uses Total Recall to remember context from previous sessions and automatically save what it learns.",
  model: "claude-sonnet-4",
  tools: ["read", "write", "shell", "glob", "grep", "web_search", "web_fetch", "@totalrecall"],
  mcpServers: {
    "totalrecall": {
      command: "node",
      args: ["__DIST_DIR__/servers/mcp-server.js"]
    }
  },
  hooks: {
    agentSpawn: [{ command: "node __DIST_DIR__/hooks/agentSpawn.js", timeout_ms: 10000 }],
    userPromptSubmit: [{ command: "node __DIST_DIR__/hooks/userPromptSubmit.js", timeout_ms: 5000 }],
    postToolUse: [{ command: "node __DIST_DIR__/hooks/postToolUse.js", matcher: "*", timeout_ms: 5000 }],
    stop: [{ command: "node __DIST_DIR__/hooks/stop.js", timeout_ms: 10000 }]
  },
  resources: ["file://.kiro/steering/totalrecall.md"]
}, null, 2);

/** Steering file content — embedded directly */
const STEERING_CONTENT = `# Total Recall - Persistent Memory

You have access to Total Recall, a persistent cross-session memory system.

## Available MCP Tools

### @totalrecall/search
Search previous session memory. Use when:
- The user mentions past work
- You need context on previous decisions
- You want to check if a problem was already addressed

### @totalrecall/get_context
Retrieve recent context for the current project. Use at the start of complex tasks to understand what was done before.

### @totalrecall/timeline
Show chronological context around an observation. Use to understand the sequence of events.

### @totalrecall/get_observations
Retrieve full details of specific observations. Use after \`search\` to drill down.

## Behavior

- Previous session context is automatically injected at startup
- Your actions (files written, commands run) are tracked automatically
- A summary is generated at the end of each session
- No manual saving needed: the system is fully automatic
`;

// ─── Environment diagnostics ───

interface CheckResult {
  name: string;
  ok: boolean;
  message: string;
  fix?: string;
}

/** Detect if running inside WSL */
function isWSL(): boolean {
  try {
    const rel = release().toLowerCase();
    if (rel.includes('microsoft') || rel.includes('wsl')) return true;
    if (existsSync('/proc/version')) {
      const proc = readFileSync('/proc/version', 'utf8').toLowerCase();
      return proc.includes('microsoft') || proc.includes('wsl');
    }
    return false;
  } catch {
    return false;
  }
}

/** Check if a command is available in PATH */
function commandExists(cmd: string): boolean {
  try {
    execSync(`which ${cmd}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/** Detect if a path points to the Windows filesystem */
function isWindowsPath(p: string): boolean {
  return p.startsWith('/mnt/c') || p.startsWith('/mnt/d')
    || /^[A-Za-z]:[\\\/]/.test(p);
}

/** Run all environment checks and return results */
function runEnvironmentChecks(): CheckResult[] {
  const checks: CheckResult[] = [];
  const wsl = isWSL();

  // 1. OS detection
  const os = platform();
  checks.push({
    name: 'Operating system',
    ok: os === 'linux' || os === 'darwin',
    message: os === 'linux'
      ? (wsl ? 'Linux (WSL)' : 'Linux')
      : os === 'darwin' ? 'macOS' : `${os} (not officially supported)`,
  });

  // 2. WSL: Node must be native Linux (not Windows mounted via /mnt/c/)
  if (wsl) {
    const nodePath = process.execPath;
    const nodeOnWindows = isWindowsPath(nodePath);
    checks.push({
      name: 'WSL: Native Node.js',
      ok: !nodeOnWindows,
      message: nodeOnWindows
        ? `Node.js points to Windows: ${nodePath}`
        : `Native Linux Node.js: ${nodePath}`,
      fix: nodeOnWindows
        ? 'Install Node.js inside WSL:\n  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -\n  sudo apt-get install -y nodejs\n  Or use nvm: https://github.com/nvm-sh/nvm'
        : undefined,
    });

    // 3. WSL: npm global prefix must not point to Windows
    // npm may return paths in Linux format (/mnt/c/...) or Windows format (C:\...)
    try {
      const npmPrefix = execSync('npm prefix -g', { encoding: 'utf8' }).trim();
      const prefixOnWindows = isWindowsPath(npmPrefix);
      checks.push({
        name: 'WSL: npm global prefix',
        ok: !prefixOnWindows,
        message: prefixOnWindows
          ? `npm global prefix points to Windows: ${npmPrefix}`
          : `npm global prefix: ${npmPrefix}`,
        fix: prefixOnWindows
          ? 'Fix npm prefix:\n  mkdir -p ~/.npm-global\n  npm config set prefix ~/.npm-global\n  echo \'export PATH="$HOME/.npm-global/bin:$PATH"\' >> ~/.bashrc\n  source ~/.bashrc\n  Then reinstall: npm install -g totalrecall'
          : undefined,
      });
    } catch {
      checks.push({
        name: 'WSL: npm global prefix',
        ok: false,
        message: 'Unable to determine npm prefix',
      });
    }

    // 3b. WSL: npm binary must be native Linux (not Windows npm)
    try {
      const npmPath = execSync('which npm', { encoding: 'utf8' }).trim();
      const npmOnWindows = isWindowsPath(npmPath);
      checks.push({
        name: 'WSL: npm binary',
        ok: !npmOnWindows,
        message: npmOnWindows
          ? `npm is the Windows version: ${npmPath}`
          : `Native Linux npm: ${npmPath}`,
        fix: npmOnWindows
          ? 'Your npm binary is the Windows version running inside WSL.\n  This causes EPERM/UNC errors when installing packages.\n  Install Node.js (includes npm) natively in WSL:\n    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash\n    source ~/.bashrc\n    nvm install 22\n  Or:\n    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -\n    sudo apt-get install -y nodejs'
          : undefined,
      });
    } catch {
      // which npm failed — non-blocking, npm is present if we got here
    }
  }

  // 4. Node.js >= 18
  const nodeVersion = parseInt(process.versions.node.split('.')[0]);
  checks.push({
    name: 'Node.js >= 18',
    ok: nodeVersion >= 18,
    message: `Node.js v${process.versions.node}`,
    fix: nodeVersion < 18
      ? 'Upgrade Node.js:\n  nvm install 22 && nvm use 22\n  Or visit: https://nodejs.org/'
      : undefined,
  });

  // 5. better-sqlite3 loadable
  let sqliteOk = false;
  let sqliteMsg = '';
  try {
    require('better-sqlite3');
    sqliteOk = true;
    sqliteMsg = 'Native module loaded successfully';
  } catch (err: any) {
    sqliteMsg = err.code === 'ERR_DLOPEN_FAILED'
      ? 'Incompatible native binary (invalid ELF header — likely platform mismatch)'
      : `Error: ${err.message}`;
  }
  checks.push({
    name: 'better-sqlite3',
    ok: sqliteOk,
    message: sqliteMsg,
    fix: !sqliteOk
      ? (wsl
        ? 'In WSL, rebuild the native module:\n  npm rebuild better-sqlite3\n  If that fails, reinstall:\n  npm install -g totalrecall --build-from-source'
        : 'Rebuild the native module:\n  npm rebuild better-sqlite3')
      : undefined,
  });

  // 6. Build tools (Linux/WSL only — needed for native module compilation)
  if (os === 'linux') {
    const hasMake = commandExists('make');
    const hasGcc = commandExists('g++') || commandExists('gcc');
    const hasPython = commandExists('python3') || commandExists('python');
    const allPresent = hasMake && hasGcc && hasPython;
    const missing: string[] = [];
    if (!hasMake || !hasGcc) missing.push('build-essential');
    if (!hasPython) missing.push('python3');

    checks.push({
      name: 'Build tools (native modules)',
      ok: allPresent,
      message: allPresent
        ? 'make, g++, python3 available'
        : `Missing: ${missing.join(', ')}`,
      fix: !allPresent
        ? `Install required packages:\n  sudo apt-get update && sudo apt-get install -y ${missing.join(' ')}\n  Then reinstall: npm install -g totalrecall --build-from-source`
        : undefined,
    });
  }

  return checks;
}

/** Print check results in a readable format */
function printChecks(checks: CheckResult[]): { hasErrors: boolean } {
  let hasErrors = false;
  console.log('');

  for (const check of checks) {
    const icon = check.ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
    console.log(`  ${icon} ${check.name}: ${check.message}`);
    if (!check.ok && check.fix) {
      console.log(`    \x1b[33m→ Fix:\x1b[0m`);
      for (const line of check.fix.split('\n')) {
        console.log(`      ${line}`);
      }
    }
    if (!check.ok) hasErrors = true;
  }

  console.log('');
  return { hasErrors };
}

// ─── Helper: interactive prompt ───

/** Ask the user for input via stdin and return the answer */
function askUser(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

/** Detect the user's current shell */
function detectShellRc(): { name: string; rcFile: string } {
  const shell = process.env.SHELL || '/bin/bash';
  if (shell.includes('zsh')) return { name: 'zsh', rcFile: join(homedir(), '.zshrc') };
  if (shell.includes('fish')) return { name: 'fish', rcFile: join(homedir(), '.config/fish/config.fish') };
  return { name: 'bash', rcFile: join(homedir(), '.bashrc') };
}

// ─── Auto-fix for detected problems ───

/** Identify which failed checks are auto-fixable */
const AUTOFIXABLE_CHECKS = new Set([
  'WSL: npm global prefix',
  'WSL: npm binary',
  'Build tools (native modules)',
  'better-sqlite3',
]);

/** Attempt automatic fix of detected problems. Returns true if something was fixed */
async function tryAutoFix(failedChecks: CheckResult[]): Promise<{ fixed: boolean; needsRestart: boolean }> {
  const fixable = failedChecks.filter(c => !c.ok && AUTOFIXABLE_CHECKS.has(c.name));
  if (fixable.length === 0) return { fixed: false, needsRestart: false };

  const { rcFile } = detectShellRc();
  let anyFixed = false;
  let needsRestart = false;

  console.log(`  \x1b[36mFound ${fixable.length} issue(s) that can be fixed automatically:\x1b[0m\n`);
  for (const check of fixable) {
    console.log(`    - ${check.name}: ${check.message}`);
  }
  console.log('');

  const answer = await askUser('  Fix automatically? [Y/n] ');
  if (answer !== '' && answer !== 'y' && answer !== 'yes') {
    console.log('\n  Skipped auto-fix. Fix manually and run: totalrecall install\n');
    return { fixed: false, needsRestart: false };
  }

  console.log('');

  // Fix 1: npm global prefix on Windows
  const prefixCheck = fixable.find(c => c.name === 'WSL: npm global prefix');
  if (prefixCheck) {
    console.log('  Fixing npm global prefix...');
    try {
      const npmGlobalDir = join(homedir(), '.npm-global');
      mkdirSync(npmGlobalDir, { recursive: true });
      const { spawnSync: spawnNpmConfig } = require('child_process');
      spawnNpmConfig('npm', ['config', 'set', 'prefix', npmGlobalDir], { stdio: 'ignore' });

      // Update rcFile if it doesn't already contain the path
      const exportLine = 'export PATH="$HOME/.npm-global/bin:$PATH"';
      let alreadyInRc = false;
      if (existsSync(rcFile)) {
        const content = readFileSync(rcFile, 'utf8');
        alreadyInRc = content.includes('.npm-global/bin');
      }
      if (!alreadyInRc) {
        appendFileSync(rcFile, `\n# npm global prefix (added by totalrecall)\n${exportLine}\n`);
      }

      // Update PATH of the current process
      process.env.PATH = `${npmGlobalDir}/bin:${process.env.PATH}`;

      console.log(`  \x1b[32m✓\x1b[0m npm prefix set to ${npmGlobalDir}`);
      console.log(`  \x1b[32m✓\x1b[0m PATH updated in ${rcFile}`);
      anyFixed = true;
    } catch (err: any) {
      console.log(`  \x1b[31m✗\x1b[0m Could not fix npm prefix: ${err.message}`);
    }
  }

  // Fix 2: npm binary is Windows → install nvm + Node 22 (no sudo)
  const npmBinaryCheck = fixable.find(c => c.name === 'WSL: npm binary');
  if (npmBinaryCheck) {
    console.log('\n  Fixing npm binary (installing nvm + Node.js 22)...');
    const nvmDir = join(homedir(), '.nvm');

    try {
      if (existsSync(nvmDir)) {
        console.log(`  nvm already installed at ${nvmDir}`);
      } else {
        console.log('  Downloading nvm...');
        execSync('curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash', {
          stdio: 'inherit',
          timeout: 60000,
        });
        console.log(`  \x1b[32m✓\x1b[0m nvm installed`);
      }

      // Install Node 22 via nvm (in a subshell that loads nvm)
      console.log('  Installing Node.js 22 via nvm...');
      execSync('bash -c "source $HOME/.nvm/nvm.sh && nvm install 22"', {
        stdio: 'inherit',
        timeout: 120000,
      });
      console.log(`  \x1b[32m✓\x1b[0m Node.js 22 installed`);
      anyFixed = true;
      needsRestart = true; // The current process still uses the old npm
    } catch (err: any) {
      console.log(`  \x1b[31m✗\x1b[0m Could not install nvm/Node: ${err.message}`);
      console.log('  Install manually:');
      console.log('    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash');
      console.log('    source ~/.bashrc');
      console.log('    nvm install 22');
    }
  }

  // Fix 3: missing build tools (requires sudo)
  const buildCheck = fixable.find(c => c.name === 'Build tools (native modules)');
  if (buildCheck) {
    console.log('\n  Fixing build tools (requires sudo)...');
    try {
      execSync('sudo apt-get update -qq && sudo apt-get install -y build-essential python3', {
        stdio: 'inherit',
        timeout: 120000,
      });
      console.log(`  \x1b[32m✓\x1b[0m Build tools installed`);
      anyFixed = true;
    } catch (err: any) {
      console.log(`  \x1b[31m✗\x1b[0m Could not install build tools: ${err.message}`);
      console.log('  Install manually: sudo apt-get install -y build-essential python3');
    }
  }

  // Fix 4: better-sqlite3 ELF error → rebuild
  const sqliteCheck = fixable.find(c => c.name === 'better-sqlite3');
  if (sqliteCheck) {
    console.log('\n  Rebuilding better-sqlite3...');
    try {
      // Find the path of the globally installed module
      const { spawnSync: spawnRebuild } = require('child_process');
      const globalDirResult = spawnRebuild('npm', ['prefix', '-g'], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
      const globalDir = (globalDirResult.stdout || '').trim();
      const sqlitePkg = join(globalDir, 'lib', 'node_modules', 'totalrecall');
      if (existsSync(sqlitePkg)) {
        spawnRebuild('npm', ['rebuild', 'better-sqlite3'], {
          cwd: sqlitePkg,
          stdio: 'inherit',
          timeout: 60000,
        });
      } else {
        spawnRebuild('npm', ['rebuild', 'better-sqlite3'], { stdio: 'inherit', timeout: 60000 });
      }
      console.log(`  \x1b[32m✓\x1b[0m better-sqlite3 rebuilt`);
      anyFixed = true;
    } catch (err: any) {
      console.log(`  \x1b[31m✗\x1b[0m Could not rebuild: ${err.message}`);
      console.log('  Try: npm install -g totalrecall --build-from-source');
    }
  }

  console.log('');
  return { fixed: anyFixed, needsRestart };
}

// ─── Install command ───

async function installKiro() {
  console.log('\n=== Total Recall - Installation ===\n');
  console.log('[1/4] Running environment checks...');

  let checks = runEnvironmentChecks();
  let { hasErrors } = printChecks(checks);

  // If there are errors, attempt auto-fix
  if (hasErrors) {
    const { fixed, needsRestart } = await tryAutoFix(checks);

    if (needsRestart) {
      // nvm/Node installed — new terminal required
      console.log('  \x1b[33m┌─────────────────────────────────────────────────────────┐\x1b[0m');
      console.log('  \x1b[33m│\x1b[0m  Node.js was installed via nvm. To activate it:         \x1b[33m│\x1b[0m');
      console.log('  \x1b[33m│\x1b[0m                                                         \x1b[33m│\x1b[0m');
      console.log('  \x1b[33m│\x1b[0m  1. Close and reopen your terminal                      \x1b[33m│\x1b[0m');
      console.log('  \x1b[33m│\x1b[0m  2. Run: \x1b[1mnpm install -g totalrecall\x1b[0m                     \x1b[33m│\x1b[0m');
      console.log('  \x1b[33m│\x1b[0m  3. Run: \x1b[1mtotalrecall install\x1b[0m                            \x1b[33m│\x1b[0m');
      console.log('  \x1b[33m└─────────────────────────────────────────────────────────┘\x1b[0m\n');
      process.exit(0);
    }

    if (fixed) {
      // Re-run checks after in-process fixes applied
      console.log('  Re-running checks...\n');
      checks = runEnvironmentChecks();
      ({ hasErrors } = printChecks(checks));
    }

    if (hasErrors) {
      console.log('\x1b[31mInstallation aborted.\x1b[0m Fix the remaining issues and retry.');
      console.log('After fixing, run: totalrecall install\n');
      process.exit(1);
    }
  }

  // dist directory (where compiled files reside)
  const distDir = DIST_DIR;

  // Destination directories
  const kiroDir = KIRO_CONFIG_DIR;
  const agentsDir = join(kiroDir, 'agents');
  const settingsDir = join(kiroDir, 'settings');
  const steeringDir = join(kiroDir, 'steering');
  const dataDir = DATA_DIR;

  console.log('[2/4] Installing Kiro configuration...\n');

  // Create directories
  for (const dir of [agentsDir, settingsDir, steeringDir, dataDir]) {
    mkdirSync(dir, { recursive: true });
  }

  // Generate agent config with absolute paths (from embedded template)
  const agentConfig = AGENT_TEMPLATE.replace(/__DIST_DIR__/g, distDir);
  const agentDestPath = join(agentsDir, 'totalrecall.json');
  writeFileSync(agentDestPath, agentConfig, 'utf8');
  console.log(`  → Agent config: ${agentDestPath}`);

  // Update/create mcp.json
  const mcpFilePath = join(settingsDir, 'mcp.json');
  let mcpConfig: any = { mcpServers: {} };

  if (existsSync(mcpFilePath)) {
    try {
      mcpConfig = JSON.parse(readFileSync(mcpFilePath, 'utf8'));
      if (!mcpConfig.mcpServers) mcpConfig.mcpServers = {};
    } catch {
      // Corrupted file, overwrite
    }
  }

  mcpConfig.mcpServers['totalrecall'] = {
    command: 'node',
    args: [join(distDir, 'servers', 'mcp-server.js')]
  };
  writeFileSync(mcpFilePath, JSON.stringify(mcpConfig, null, 2), 'utf8');
  console.log(`  → MCP config:   ${mcpFilePath}`);

  // Write steering file (from embedded content)
  const steeringDestPath = join(steeringDir, 'totalrecall.md');
  writeFileSync(steeringDestPath, STEERING_CONTENT, 'utf8');
  console.log(`  → Steering:     ${steeringDestPath}`);

  console.log(`  → Data dir:     ${dataDir}`);

  // 3. Prompt for alias creation
  console.log('\n[3/4] Shell alias setup\n');

  const { rcFile } = detectShellRc();
  const aliasLine = 'alias kiro="kiro-cli --agent totalrecall"';

  // Check if alias is already set
  let aliasAlreadySet = false;
  if (existsSync(rcFile)) {
    const rcContent = readFileSync(rcFile, 'utf8');
    aliasAlreadySet = rcContent.includes('alias kiro=') && rcContent.includes('totalrecall');
  }

  if (aliasAlreadySet) {
    console.log(`  \x1b[32m✓\x1b[0m Alias already configured in ${rcFile}`);
  } else {
    // Highlighted box for the alias
    console.log('  \x1b[36m┌─────────────────────────────────────────────────────────┐\x1b[0m');
    console.log('  \x1b[36m│\x1b[0m  Without an alias, you must type every time:            \x1b[36m│\x1b[0m');
    console.log('  \x1b[36m│\x1b[0m    \x1b[2mkiro-cli --agent totalrecall\x1b[0m                          \x1b[36m│\x1b[0m');
    console.log('  \x1b[36m│\x1b[0m                                                         \x1b[36m│\x1b[0m');
    console.log('  \x1b[36m│\x1b[0m  With the alias, just type:                              \x1b[36m│\x1b[0m');
    console.log('  \x1b[36m│\x1b[0m    \x1b[1m\x1b[32mkiro\x1b[0m                                                 \x1b[36m│\x1b[0m');
    console.log('  \x1b[36m└─────────────────────────────────────────────────────────┘\x1b[0m');
    console.log('');

    const answer = await askUser(`  Add alias to ${rcFile}? [Y/n] `);

    if (answer === '' || answer === 'y' || answer === 'yes') {
      try {
        appendFileSync(rcFile, `\n# Total Recall — persistent memory alias\n${aliasLine}\n`);
        console.log(`\n  \x1b[32m✓\x1b[0m Alias added to ${rcFile}`);
        console.log(`  \x1b[33m→\x1b[0m Run \x1b[1msource ${rcFile}\x1b[0m or open a new terminal to activate it.`);
      } catch (err: any) {
        console.log(`\n  \x1b[31m✗\x1b[0m Could not write to ${rcFile}: ${err.message}`);
        console.log(`  \x1b[33m→\x1b[0m Add manually: ${aliasLine}`);
      }
    } else {
      console.log(`\n  Skipped. You can add it manually later:`);
      console.log(`    echo '${aliasLine}' >> ${rcFile}`);
    }
  }

  // 4. Final banner
  console.log('\n[4/4] Done!\n');
  printBanner({
    editor: 'Kiro CLI',
    version: PKG_VERSION,
    dashboardUrl: 'http://localhost:3001',
    dataDir,
    configPaths: [
      `Agent:    ${agentDestPath}`,
      `MCP:      ${mcpFilePath}`,
      `Steering: ${steeringDestPath}`,
    ],
  });
  console.log('  Start Kiro with memory:');
  if (aliasAlreadySet) {
    console.log('    \x1b[1mkiro\x1b[0m\n');
  } else {
    console.log('    \x1b[1mkiro-cli --agent totalrecall\x1b[0m\n');
  }
}

// ─── Install Claude Code command ───

/** Steering content for Claude Code (injected into ~/.claude/CLAUDE.md) */
const CLAUDE_CODE_STEERING = `# Total Recall - Persistent Cross-Session Memory

You have access to Total Recall, a persistent cross-session memory system that remembers context across sessions.

## Available MCP Tools

### totalrecall/search
Search previous session memory. Use when:
- The user mentions past work or previous sessions
- You need context on previous decisions
- You want to check if a problem was already addressed

### totalrecall/get_context
Retrieve recent context for the current project. Use at the start of complex tasks.

### totalrecall/timeline
Show chronological context around an observation. Use to understand sequences of events.

### totalrecall/get_observations
Retrieve full details of specific observations by ID. Use after search to drill down.

## Behavior

- Previous session context is automatically injected at startup via hooks
- Your actions (files written, commands run, searches) are tracked automatically
- A summary is generated at the end of each session
- No manual saving needed: the system is fully automatic
`;

async function installClaudeCode() {
  console.log('\n=== Total Recall - Claude Code Installation ===\n');
  console.log('[1/3] Running environment checks...');

  const checks = runEnvironmentChecks();
  const { hasErrors } = printChecks(checks);

  if (hasErrors) {
    const { fixed, needsRestart } = await tryAutoFix(checks);

    if (needsRestart) {
      console.log('  \x1b[33mRestart your terminal and re-run: totalrecall install --claude-code\x1b[0m\n');
      process.exit(0);
    }

    if (fixed) {
      console.log('  Re-running checks...\n');
      const reChecks = runEnvironmentChecks();
      const reResult = printChecks(reChecks);
      if (reResult.hasErrors) {
        console.log('\x1b[31mInstallation aborted.\x1b[0m Fix the remaining issues and retry.\n');
        process.exit(1);
      }
    } else if (hasErrors) {
      console.log('\x1b[31mInstallation aborted.\x1b[0m Fix the issues and retry.\n');
      process.exit(1);
    }
  }

  const distDir = DIST_DIR;
  const claudeDir = join(homedir(), '.claude');
  const dataDir = DATA_DIR;

  console.log('[2/3] Installing Claude Code configuration...\n');

  // Create directories
  mkdirSync(claudeDir, { recursive: true });
  mkdirSync(dataDir, { recursive: true });

  // --- settings.json with hooks ---
  const settingsPath = join(claudeDir, 'settings.json');
  let settings: any = {};

  if (existsSync(settingsPath)) {
    try {
      settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
    } catch {
      // Corrupted file, recreate it
    }
  }

  // Map hook events → scripts (timeout in seconds for Claude Code)
  const hookMap: Record<string, { script: string; timeout: number }> = {
    'SessionStart': { script: 'hooks/agentSpawn.js', timeout: 10 },
    'UserPromptSubmit': { script: 'hooks/userPromptSubmit.js', timeout: 5 },
    'PostToolUse': { script: 'hooks/postToolUse.js', timeout: 5 },
    'Stop': { script: 'hooks/stop.js', timeout: 10 }
  };

  // Claude Code: events are TOP-LEVEL keys in settings.json (no "hooks" wrapper)
  // Format: { matcher: "...", hooks: [{ type, command, timeout }] }
  for (const [event, config] of Object.entries(hookMap)) {
    const hookEntry = {
      matcher: '',
      hooks: [{
        type: 'command' as const,
        command: `node ${join(distDir, config.script)}`,
        timeout: config.timeout
      }]
    };

    if (!settings[event]) {
      settings[event] = [hookEntry];
    } else if (Array.isArray(settings[event])) {
      // Remove any previous totalrecall hooks and add the new one
      settings[event] = settings[event].filter(
        (h: any) => !h.hooks?.some((hk: any) =>
          hk.command?.includes('totalrecall') || hk.command?.includes('contextkit')
        )
      );
      settings[event].push(hookEntry);
    }
  }

  writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
  console.log(`  → Hooks config: ${settingsPath}`);

  // --- .mcp.json in home directory (global scope) ---
  const mcpPath = join(homedir(), '.mcp.json');
  let mcpConfig: any = {};

  if (existsSync(mcpPath)) {
    try {
      mcpConfig = JSON.parse(readFileSync(mcpPath, 'utf8'));
    } catch {
      // Corrupted file
    }
  }

  if (!mcpConfig.mcpServers) mcpConfig.mcpServers = {};

  mcpConfig.mcpServers['totalrecall'] = {
    command: 'node',
    args: [join(distDir, 'servers', 'mcp-server.js')]
  };

  writeFileSync(mcpPath, JSON.stringify(mcpConfig, null, 2), 'utf8');
  console.log(`  → MCP config:   ${mcpPath}`);

  // --- CLAUDE.md steering file ---
  const steeringPath = join(claudeDir, 'CLAUDE.md');
  let existingSteering = '';

  if (existsSync(steeringPath)) {
    existingSteering = readFileSync(steeringPath, 'utf8');
  }

  // Add steering only if not already present
  if (!existingSteering.includes('Total Recall')) {
    const separator = existingSteering.length > 0 ? '\n\n---\n\n' : '';
    writeFileSync(steeringPath, existingSteering + separator + CLAUDE_CODE_STEERING, 'utf8');
    console.log(`  → Steering:     ${steeringPath}`);
  } else {
    console.log(`  → Steering:     ${steeringPath} (already configured)`);
  }

  console.log(`  → Data dir:     ${dataDir}`);

  // 3. Final banner
  console.log('\n[3/3] Done!\n');
  printBanner({
    editor: 'Claude Code',
    version: PKG_VERSION,
    dashboardUrl: 'http://localhost:3001',
    dataDir,
    configPaths: [
      `Hooks:    ${settingsPath}`,
      `MCP:      ${mcpPath}`,
      `Steering: ${steeringPath}`,
    ],
  });
}

// ─── Install Cursor command ───

async function installCursor() {
  console.log('\n=== Total Recall - Cursor Installation ===\n');
  console.log('[1/3] Running environment checks...');

  const checks = runEnvironmentChecks();
  const { hasErrors } = printChecks(checks);

  if (hasErrors) {
    const { fixed, needsRestart } = await tryAutoFix(checks);

    if (needsRestart) {
      console.log('  \x1b[33mRestart your terminal and re-run: totalrecall install --cursor\x1b[0m\n');
      process.exit(0);
    }

    if (fixed) {
      console.log('  Re-running checks...\n');
      const reChecks = runEnvironmentChecks();
      const reResult = printChecks(reChecks);
      if (reResult.hasErrors) {
        console.log('\x1b[31mInstallation aborted.\x1b[0m Fix the remaining issues and retry.\n');
        process.exit(1);
      }
    } else if (hasErrors) {
      console.log('\x1b[31mInstallation aborted.\x1b[0m Fix the issues and retry.\n');
      process.exit(1);
    }
  }

  const distDir = DIST_DIR;
  const cursorDir = join(homedir(), '.cursor');
  const dataDir = DATA_DIR;

  console.log('[2/3] Installing Cursor configuration...\n');

  // Create directories
  mkdirSync(cursorDir, { recursive: true });
  mkdirSync(dataDir, { recursive: true });

  // --- hooks.json ---
  const hooksPath = join(cursorDir, 'hooks.json');
  let hooksConfig: any = { version: 1, hooks: {} };

  if (existsSync(hooksPath)) {
    try {
      hooksConfig = JSON.parse(readFileSync(hooksPath, 'utf8'));
      if (!hooksConfig.hooks) hooksConfig.hooks = {};
      if (!hooksConfig.version) hooksConfig.version = 1;
    } catch {
      // Corrupted file, recreate it
    }
  }

  // Map Cursor events → scripts
  const cursorHookMap: Record<string, string> = {
    'sessionStart': 'hooks/agentSpawn.js',
    'beforeSubmitPrompt': 'hooks/userPromptSubmit.js',
    'afterFileEdit': 'hooks/postToolUse.js',
    'afterShellExecution': 'hooks/postToolUse.js',
    'afterMCPExecution': 'hooks/postToolUse.js',
    'stop': 'hooks/stop.js'
  };

  for (const [event, script] of Object.entries(cursorHookMap)) {
    const hookEntry = {
      command: `node ${join(distDir, script)}`
    };

    if (!hooksConfig.hooks[event]) {
      hooksConfig.hooks[event] = [hookEntry];
    } else if (Array.isArray(hooksConfig.hooks[event])) {
      // Remove previous totalrecall hooks, add the new one
      hooksConfig.hooks[event] = hooksConfig.hooks[event].filter(
        (h: any) => !h.command?.includes('totalrecall') && !h.command?.includes('contextkit')
      );
      hooksConfig.hooks[event].push(hookEntry);
    }
  }

  writeFileSync(hooksPath, JSON.stringify(hooksConfig, null, 2), 'utf8');
  console.log(`  → Hooks config: ${hooksPath}`);

  // --- mcp.json ---
  const mcpPath = join(cursorDir, 'mcp.json');
  let mcpConfig: any = {};

  if (existsSync(mcpPath)) {
    try {
      mcpConfig = JSON.parse(readFileSync(mcpPath, 'utf8'));
    } catch {
      // Corrupted file
    }
  }

  if (!mcpConfig.mcpServers) mcpConfig.mcpServers = {};

  mcpConfig.mcpServers['totalrecall'] = {
    command: 'node',
    args: [join(distDir, 'servers', 'mcp-server.js')]
  };

  writeFileSync(mcpPath, JSON.stringify(mcpConfig, null, 2), 'utf8');
  console.log(`  → MCP config:   ${mcpPath}`);
  console.log(`  → Data dir:     ${dataDir}`);

  // 3. Final banner
  console.log('\n[3/3] Done!\n');
  printBanner({
    editor: 'Cursor',
    version: PKG_VERSION,
    dashboardUrl: 'http://localhost:3001',
    dataDir,
    configPaths: [
      `Hooks: ${hooksPath}`,
      `MCP:   ${mcpPath}`,
    ],
  });
}

// ─── Install Windsurf command ───

async function installWindsurf() {
  console.log('\n=== Total Recall - Windsurf Installation ===\n');
  console.log('[1/3] Running environment checks...');

  const checks = runEnvironmentChecks();
  const { hasErrors } = printChecks(checks);

  if (hasErrors) {
    const { fixed, needsRestart } = await tryAutoFix(checks);

    if (needsRestart) {
      console.log('  \x1b[33mRestart your terminal and re-run: totalrecall install --windsurf\x1b[0m\n');
      process.exit(0);
    }

    if (fixed) {
      console.log('  Re-running checks...\n');
      const reChecks = runEnvironmentChecks();
      const reResult = printChecks(reChecks);
      if (reResult.hasErrors) {
        console.log('\x1b[31mInstallation aborted.\x1b[0m Fix the remaining issues and retry.\n');
        process.exit(1);
      }
    } else if (hasErrors) {
      console.log('\x1b[31mInstallation aborted.\x1b[0m Fix the issues and retry.\n');
      process.exit(1);
    }
  }

  const distDir = DIST_DIR;
  const dataDir = DATA_DIR;

  console.log('[2/3] Installing Windsurf configuration...\n');

  mkdirSync(dataDir, { recursive: true });

  // --- mcp_config.json ---
  const windsurfDir = join(homedir(), '.codeium', 'windsurf');
  mkdirSync(windsurfDir, { recursive: true });

  const mcpPath = join(windsurfDir, 'mcp_config.json');
  let mcpConfig: any = {};

  if (existsSync(mcpPath)) {
    try {
      mcpConfig = JSON.parse(readFileSync(mcpPath, 'utf8'));
    } catch {
      // Corrupted file, recreate it
    }
  }

  if (!mcpConfig.mcpServers) mcpConfig.mcpServers = {};

  mcpConfig.mcpServers['totalrecall'] = {
    command: 'node',
    args: [join(distDir, 'servers', 'mcp-server.js')]
  };

  writeFileSync(mcpPath, JSON.stringify(mcpConfig, null, 2), 'utf8');
  console.log(`  → MCP config:   ${mcpPath}`);
  console.log(`  → Data dir:     ${dataDir}`);

  // 3. Final banner
  console.log('\n[3/3] Done!\n');
  printBanner({
    editor: 'Windsurf',
    version: PKG_VERSION,
    dashboardUrl: 'http://localhost:3001',
    dataDir,
    configPaths: [
      `MCP: ${mcpPath}`,
    ],
  });
  console.log('  \x1b[2mTip: Add a .windsurfrules file to your project with instructions');
  console.log('  to use the totalrecall MCP tools for persistent context.\x1b[0m\n');
}

// ─── Install Cline command ───

async function installCline() {
  console.log('\n=== Total Recall - Cline Installation ===\n');
  console.log('[1/3] Running environment checks...');

  const checks = runEnvironmentChecks();
  const { hasErrors } = printChecks(checks);

  if (hasErrors) {
    const { fixed, needsRestart } = await tryAutoFix(checks);

    if (needsRestart) {
      console.log('  \x1b[33mRestart your terminal and re-run: totalrecall install --cline\x1b[0m\n');
      process.exit(0);
    }

    if (fixed) {
      console.log('  Re-running checks...\n');
      const reChecks = runEnvironmentChecks();
      const reResult = printChecks(reChecks);
      if (reResult.hasErrors) {
        console.log('\x1b[31mInstallation aborted.\x1b[0m Fix the remaining issues and retry.\n');
        process.exit(1);
      }
    } else if (hasErrors) {
      console.log('\x1b[31mInstallation aborted.\x1b[0m Fix the issues and retry.\n');
      process.exit(1);
    }
  }

  const distDir = DIST_DIR;
  const dataDir = DATA_DIR;

  console.log('[2/3] Installing Cline configuration...\n');

  mkdirSync(dataDir, { recursive: true });

  // --- cline_mcp_settings.json (path OS-dependent) ---
  const platform = process.platform;
  let clineSettingsDir: string;
  if (platform === 'darwin') {
    clineSettingsDir = join(homedir(), 'Library', 'Application Support', 'Code', 'User', 'globalStorage', 'saoudrizwan.claude-dev', 'settings');
  } else {
    // Linux e WSL
    clineSettingsDir = join(homedir(), '.config', 'Code', 'User', 'globalStorage', 'saoudrizwan.claude-dev', 'settings');
  }

  mkdirSync(clineSettingsDir, { recursive: true });

  const mcpPath = join(clineSettingsDir, 'cline_mcp_settings.json');
  let mcpConfig: any = {};

  if (existsSync(mcpPath)) {
    try {
      mcpConfig = JSON.parse(readFileSync(mcpPath, 'utf8'));
    } catch {
      // Corrupted file, recreate it
    }
  }

  if (!mcpConfig.mcpServers) mcpConfig.mcpServers = {};

  mcpConfig.mcpServers['totalrecall'] = {
    command: 'node',
    args: [join(distDir, 'servers', 'mcp-server.js')]
  };

  writeFileSync(mcpPath, JSON.stringify(mcpConfig, null, 2), 'utf8');
  console.log(`  → MCP config:   ${mcpPath}`);
  console.log(`  → Data dir:     ${dataDir}`);

  // 3. Final banner
  console.log('\n[3/3] Done!\n');
  printBanner({
    editor: 'Cline',
    version: PKG_VERSION,
    dashboardUrl: 'http://localhost:3001',
    dataDir,
    configPaths: [
      `MCP: ${mcpPath}`,
    ],
  });
  console.log('  \x1b[2mTip: Add a .clinerules file to your project with instructions');
  console.log('  to use the totalrecall MCP tools for persistent context.\x1b[0m\n');
}

// ─── Doctor command ───

async function runDoctor() {
  console.log('\n=== Total Recall - Diagnostics ===');

  const checks = runEnvironmentChecks();

  // Additional checks on installation status
  const kiroDir = KIRO_CONFIG_DIR;
  const agentPath = join(kiroDir, 'agents', 'totalrecall.json');
  const mcpPath = join(kiroDir, 'settings', 'mcp.json');
  const dataDir = DATA_DIR;

  checks.push({
    name: 'Kiro agent config',
    ok: existsSync(agentPath),
    message: existsSync(agentPath) ? agentPath : 'Not found',
    fix: !existsSync(agentPath) ? 'Run: totalrecall install' : undefined,
  });

  let mcpOk = false;
  if (existsSync(mcpPath)) {
    try {
      const mcp = JSON.parse(readFileSync(mcpPath, 'utf8'));
      mcpOk = !!mcp.mcpServers?.['totalrecall'] || !!mcp.mcpServers?.contextkit;
    } catch {}
  }
  checks.push({
    name: 'MCP server configured',
    ok: mcpOk,
    message: mcpOk ? 'totalrecall registered in mcp.json' : 'Not configured',
    fix: !mcpOk ? 'Run: totalrecall install' : undefined,
  });

  checks.push({
    name: 'Data directory',
    ok: existsSync(dataDir),
    message: existsSync(dataDir) ? dataDir : 'Not created (will be created on first use)',
  });

  // Claude Code integration check
  const claudeDir = join(homedir(), '.claude');
  const claudeSettingsPath = join(claudeDir, 'settings.json');
  let claudeHooksOk = false;
  if (existsSync(claudeSettingsPath)) {
    try {
      const claudeSettings = JSON.parse(readFileSync(claudeSettingsPath, 'utf8'));
      // Claude Code: events are top-level keys in settings.json (no "hooks" wrapper)
      claudeHooksOk = !!(claudeSettings?.SessionStart || claudeSettings?.PostToolUse);
      // Verify that hooks point to totalrecall
      if (claudeHooksOk) {
        const allSettings = JSON.stringify(claudeSettings);
        claudeHooksOk = allSettings.includes('totalrecall') || allSettings.includes('agentSpawn');
      }
    } catch {}
  }

  const claudeMcpPath = join(homedir(), '.mcp.json');
  let claudeMcpOk = false;
  if (existsSync(claudeMcpPath)) {
    try {
      const claudeMcp = JSON.parse(readFileSync(claudeMcpPath, 'utf8'));
      claudeMcpOk = !!claudeMcp.mcpServers?.['totalrecall'];
    } catch {}
  }

  checks.push({
    name: 'Claude Code hooks',
    ok: true, // Non-blocking: optional installation
    message: claudeHooksOk
      ? 'Configured in ~/.claude/settings.json'
      : 'Not configured (optional: run totalrecall install --claude-code)',
  });

  checks.push({
    name: 'Claude Code MCP',
    ok: true, // Non-blocking: optional installation
    message: claudeMcpOk
      ? 'totalrecall registered in ~/.mcp.json'
      : 'Not configured (optional: run totalrecall install --claude-code)',
  });

  // Cursor integration check
  const cursorDir = join(homedir(), '.cursor');
  const cursorHooksPath = join(cursorDir, 'hooks.json');
  let cursorHooksOk = false;
  if (existsSync(cursorHooksPath)) {
    try {
      const cursorHooks = JSON.parse(readFileSync(cursorHooksPath, 'utf8'));
      cursorHooksOk = !!(cursorHooks.hooks?.sessionStart || cursorHooks.hooks?.afterFileEdit);
      if (cursorHooksOk) {
        const allHooks = JSON.stringify(cursorHooks.hooks);
        cursorHooksOk = allHooks.includes('totalrecall') || allHooks.includes('agentSpawn');
      }
    } catch {}
  }

  const cursorMcpPath = join(cursorDir, 'mcp.json');
  let cursorMcpOk = false;
  if (existsSync(cursorMcpPath)) {
    try {
      const cursorMcp = JSON.parse(readFileSync(cursorMcpPath, 'utf8'));
      cursorMcpOk = !!cursorMcp.mcpServers?.['totalrecall'];
    } catch {}
  }

  checks.push({
    name: 'Cursor hooks',
    ok: true, // Non-blocking: optional installation
    message: cursorHooksOk
      ? 'Configured in ~/.cursor/hooks.json'
      : 'Not configured (optional: run totalrecall install --cursor)',
  });

  checks.push({
    name: 'Cursor MCP',
    ok: true, // Non-blocking: optional installation
    message: cursorMcpOk
      ? 'totalrecall registered in ~/.cursor/mcp.json'
      : 'Not configured (optional: run totalrecall install --cursor)',
  });

  // Windsurf integration check
  const windsurfMcpPath = join(homedir(), '.codeium', 'windsurf', 'mcp_config.json');
  let windsurfMcpOk = false;
  if (existsSync(windsurfMcpPath)) {
    try {
      const windsurfMcp = JSON.parse(readFileSync(windsurfMcpPath, 'utf8'));
      windsurfMcpOk = !!windsurfMcp.mcpServers?.['totalrecall'];
    } catch {}
  }

  checks.push({
    name: 'Windsurf MCP',
    ok: true, // Non-blocking: optional installation
    message: windsurfMcpOk
      ? 'totalrecall registered in ~/.codeium/windsurf/mcp_config.json'
      : 'Not configured (optional: run totalrecall install --windsurf)',
  });

  // Cline integration check
  const clinePlatform = process.platform;
  let clineSettingsBase: string;
  if (clinePlatform === 'darwin') {
    clineSettingsBase = join(homedir(), 'Library', 'Application Support', 'Code', 'User', 'globalStorage', 'saoudrizwan.claude-dev', 'settings');
  } else {
    clineSettingsBase = join(homedir(), '.config', 'Code', 'User', 'globalStorage', 'saoudrizwan.claude-dev', 'settings');
  }
  const clineMcpPath = join(clineSettingsBase, 'cline_mcp_settings.json');
  let clineMcpOk = false;
  if (existsSync(clineMcpPath)) {
    try {
      const clineMcp = JSON.parse(readFileSync(clineMcpPath, 'utf8'));
      clineMcpOk = !!clineMcp.mcpServers?.['totalrecall'];
    } catch {}
  }

  checks.push({
    name: 'Cline MCP',
    ok: true, // Non-blocking: optional installation
    message: clineMcpOk
      ? `totalrecall registered in cline_mcp_settings.json`
      : 'Not configured (optional: run totalrecall install --cline)',
  });

  // Worker status check (informational, non-blocking)
  let workerOk = false;
  try {
    const port = process.env.TOTALRECALL_WORKER_PORT || '3001';
    execSync(`curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:${port}/health`, {
      timeout: 2000,
      encoding: 'utf8'
    });
    workerOk = true;
  } catch {}
  checks.push({
    name: 'Worker service',
    ok: true,  // Non-blocking: starts automatically with Kiro
    message: workerOk ? 'Running on port 3001' : 'Not running (starts automatically with Kiro)',
  });

  const { hasErrors } = printChecks(checks);

  if (hasErrors) {
    console.log('Some checks failed. Fix the issues listed above.\n');
    process.exit(1);
  } else {
    console.log('All good! Total Recall is ready.\n');
  }
}

// ─── Main ───

async function main() {
  // Commands that don't require database
  if (command === 'install') {
    if (args.includes('--claude-code')) {
      await installClaudeCode();
    } else if (args.includes('--cursor')) {
      await installCursor();
    } else if (args.includes('--windsurf')) {
      await installWindsurf();
    } else if (args.includes('--cline')) {
      await installCline();
    } else {
      await installKiro();
    }
    return;
  }
  if (command === 'doctor') {
    // --fix gestito prima, poi fallthrough al doctor standard
    if (args.includes('--fix')) {
      await runDoctorFix();
      return;
    }
    await runDoctor();
    return;
  }

  // Comandi che non necessitano del SDK completo (accesso diretto al DB)
  if (command === 'export') {
    const sdk = createTotalRecall();
    try {
      await exportObservations(sdk, args.slice(1));
    } finally {
      sdk.close();
    }
    return;
  }

  if (command === 'import') {
    await importObservations(args.slice(1));
    return;
  }

  if (command === 'stats') {
    await showStats();
    return;
  }

  if (command === 'config') {
    await handleConfig(args.slice(1));
    return;
  }

  if (command === 'backup') {
    await handleBackup(args.slice(1));
    return;
  }

  if (command === 'share') {
    await handleShare(args.slice(1));
    return;
  }

  if (command === 'worker:start' || command === 'worker:stop' || command === 'worker:restart' || command === 'worker:status') {
    await handleWorker(command);
    return;
  }

  if (command === 'service') {
    await handleService(args.slice(1));
    return;
  }

  if (command === 'plugins') {
    await handlePlugins(args.slice(1));
    return;
  }

  if (command === 'users') {
    await handleUsers(args.slice(1));
    return;
  }

  if (command === 'team') {
    await handleTeam(args.slice(1));
    return;
  }

  const sdk = createTotalRecall();

  try {
    switch (command) {
      case 'context':
      case 'ctx':
        await showContext(sdk);
        break;

      case 'search':
        // --interactive attiva la modalità REPL
        if (args.includes('--interactive') || args.includes('-i')) {
          await searchInteractive(sdk, args.slice(1));
        } else {
          await searchContext(sdk, args[1]);
        }
        break;

      case 'observations':
      case 'obs':
        await showObservations(sdk, parseInt(args[1]) || 10);
        break;

      case 'summaries':
      case 'sum':
        await showSummaries(sdk, parseInt(args[1]) || 5);
        break;

      case 'add-observation':
      case 'add-obs':
        await addObservation(sdk, args[1], args.slice(2).join(' '));
        break;

      case 'add-summary':
      case 'add-sum':
        await addSummary(sdk, args.slice(1).join(' '));
        break;

      case 'add-knowledge':
      case 'add-k':
        await addKnowledge(sdk, args[1], args[2], args.slice(3).join(' '));
        break;

      case 'decay':
        await handleDecay(sdk, args[1]);
        break;

      case 'embeddings':
      case 'emb':
        await handleEmbeddings(sdk, args.slice(1));
        break;

      case 'semantic-search':
      case 'sem':
        await semanticSearchCli(sdk, args[1]);
        break;

      case 'resume':
        await resumeSession(sdk, args[1] ? parseInt(args[1]) : undefined);
        break;

      case 'report':
        await generateReportCli(sdk, args.slice(1));
        break;

      case 'help':
      case '--help':
      case '-h':
        showHelp();
        break;

      default:
        console.log('Total Recall CLI\n');
        showHelp();
        process.exit(1);
    }
  } finally {
    sdk.close();
  }
}

async function showContext(sdk: ReturnType<typeof createTotalRecall>) {
  const context = await sdk.getContext();
  
  console.log(`\n📁 Project: ${context.project}\n`);
  
  console.log('📝 Recent Observations:');
  context.relevantObservations.slice(0, 5).forEach((obs, i) => {
    console.log(`  ${i + 1}. ${obs.title} (${new Date(obs.created_at).toLocaleDateString()})`);
    if (obs.text) {
      console.log(`     ${obs.text.substring(0, 100)}${obs.text.length > 100 ? '...' : ''}`);
    }
  });
  
  console.log('\n📊 Recent Summaries:');
  context.relevantSummaries.slice(0, 3).forEach((sum, i) => {
    console.log(`  ${i + 1}. ${sum.request || 'No request'} (${new Date(sum.created_at).toLocaleDateString()})`);
    if (sum.learned) {
      console.log(`     Learned: ${sum.learned.substring(0, 100)}${sum.learned.length > 100 ? '...' : ''}`);
    }
  });
  
  console.log('');
}

async function searchContext(sdk: ReturnType<typeof createTotalRecall>, query: string) {
  if (!query) {
    console.error('Error: Please provide a search query');
    process.exit(1);
  }
  
  const results = await sdk.search(query);
  
  console.log(`\n🔍 Search results for: "${query}"\n`);
  
  if (results.observations.length > 0) {
    console.log(`📋 Observations (${results.observations.length}):`);
    results.observations.forEach((obs, i) => {
      console.log(`  ${i + 1}. ${obs.title}`);
      if (obs.text) {
        console.log(`     ${obs.text.substring(0, 150)}${obs.text.length > 150 ? '...' : ''}`);
      }
    });
  }
  
  if (results.summaries.length > 0) {
    console.log(`\n📊 Summaries (${results.summaries.length}):`);
    results.summaries.forEach((sum, i) => {
      console.log(`  ${i + 1}. ${sum.request || 'No request'}`);
      if (sum.learned) {
        console.log(`     ${sum.learned.substring(0, 150)}${sum.learned.length > 150 ? '...' : ''}`);
      }
    });
  }
  
  if (results.observations.length === 0 && results.summaries.length === 0) {
    console.log('No results found.\n');
  } else {
    console.log('');
  }
}

async function showObservations(sdk: ReturnType<typeof createTotalRecall>, limit: number) {
  const observations = await sdk.getRecentObservations(limit);
  
  console.log(`\n📋 Last ${limit} Observations:\n`);
  
  observations.forEach((obs, i) => {
    console.log(`${i + 1}. ${obs.title} [${obs.type}]`);
    console.log(`   Date: ${new Date(obs.created_at).toLocaleString()}`);
    if (obs.text) {
      console.log(`   Content: ${obs.text.substring(0, 200)}${obs.text.length > 200 ? '...' : ''}`);
    }
    console.log('');
  });
}

async function showSummaries(sdk: ReturnType<typeof createTotalRecall>, limit: number) {
  const summaries = await sdk.getRecentSummaries(limit);
  
  console.log(`\n📊 Last ${limit} Summaries:\n`);
  
  summaries.forEach((sum, i) => {
    console.log(`${i + 1}. ${sum.request || 'No request'}`);
    console.log(`   Date: ${new Date(sum.created_at).toLocaleString()}`);
    if (sum.learned) {
      console.log(`   Learned: ${sum.learned}`);
    }
    if (sum.completed) {
      console.log(`   Completed: ${sum.completed}`);
    }
    if (sum.next_steps) {
      console.log(`   Next Steps: ${sum.next_steps}`);
    }
    console.log('');
  });
}

async function addObservation(
  sdk: ReturnType<typeof createTotalRecall>,
  title: string,
  content: string
) {
  if (!title || !content) {
    console.error('Error: Please provide both title and content');
    process.exit(1);
  }
  
  const id = await sdk.storeObservation({
    type: 'manual',
    title,
    content
  });
  
  console.log(`✅ Observation stored with ID: ${id}\n`);
}

async function addSummary(sdk: ReturnType<typeof createTotalRecall>, content: string) {
  if (!content) {
    console.error('Error: Please provide summary content');
    process.exit(1);
  }
  
  const id = await sdk.storeSummary({
    learned: content
  });
  
  console.log(`✅ Summary stored with ID: ${id}\n`);
}

async function addKnowledge(
  sdk: ReturnType<typeof createTotalRecall>,
  knowledgeType: string,
  title: string,
  content: string
) {
  const validTypes = ['constraint', 'decision', 'heuristic', 'rejected'];
  if (!knowledgeType || !validTypes.includes(knowledgeType)) {
    console.error(`Error: knowledge type must be one of: ${validTypes.join(', ')}`);
    process.exit(1);
  }
  if (!title) {
    console.error('Error: title is required');
    process.exit(1);
  }
  if (!content) {
    console.error('Error: content is required');
    process.exit(1);
  }

  // Parse options from CLI
  const severity = args.find(a => a.startsWith('--severity='))?.split('=')[1] as 'hard' | 'soft' | undefined;
  const alternativesRaw = args.find(a => a.startsWith('--alternatives='))?.split('=')[1];
  const alternatives = alternativesRaw ? alternativesRaw.split(',').map(s => s.trim()) : undefined;
  const reason = args.find(a => a.startsWith('--reason='))?.split('=')[1];
  const context = args.find(a => a.startsWith('--context='))?.split('=')[1];
  const confidence = args.find(a => a.startsWith('--confidence='))?.split('=')[1] as 'high' | 'medium' | 'low' | undefined;
  const conceptsRaw = args.find(a => a.startsWith('--concepts='))?.split('=')[1];
  const concepts = conceptsRaw ? conceptsRaw.split(',').map(s => s.trim()) : undefined;
  const filesRaw = args.find(a => a.startsWith('--files='))?.split('=')[1];
  const files = filesRaw ? filesRaw.split(',').map(s => s.trim()) : undefined;

  // Remove options from content (--key=val options are not part of the content)
  const cleanContent = content.split(' ').filter(w => !w.startsWith('--')).join(' ');

  const id = await sdk.storeKnowledge({
    project: sdk.getProject(),
    knowledgeType: knowledgeType as any,
    title,
    content: cleanContent || content,
    concepts,
    files,
    metadata: { severity, alternatives, reason, context, confidence }
  });

  console.log(`\nKnowledge stored successfully.`);
  console.log(`  ID:   ${id}`);
  console.log(`  Type: ${knowledgeType}`);
  console.log(`  Title: ${title}\n`);
}

async function handleEmbeddings(sdk: ReturnType<typeof createTotalRecall>, subArgs: string[]) {
  const subcommand = subArgs[0];
  switch (subcommand) {
    case 'stats': {
      const stats = sdk.getEmbeddingStats();
      console.log('\nEmbedding Statistics:\n');
      console.log(`  Total observations:  ${stats.total}`);
      console.log(`  With embeddings:     ${stats.embedded}`);
      console.log(`  Coverage:            ${stats.percentage}%`);

      // Initialize to show provider info
      await sdk.initializeEmbeddings();
      const { getEmbeddingService } = await import('../services/search/EmbeddingService.js');
      const embService = getEmbeddingService();
      console.log(`  Provider:            ${embService.getProvider() || 'none'}`);
      console.log(`  Dimensions:          ${embService.getDimensions()}`);
      console.log(`  Available:           ${embService.isAvailable() ? 'yes' : 'no'}`);

      if (stats.percentage < 100 && stats.total > 0) {
        console.log(`\n  Run 'totalrecall embeddings backfill' to generate missing embeddings.`);
      }
      console.log('');
      break;
    }
    case 'backfill': {
      const isAll = subArgs.includes('--all');
      const sizeArg = subArgs.find(a => !a.startsWith('-') && a !== 'backfill');
      const batchSize = parseInt(sizeArg || '') || (isAll ? 500 : 50);

      // Initialize embedding service
      const available = await sdk.initializeEmbeddings();
      if (!available) {
        console.log('\n  No embedding provider available.');
        console.log('  Install fastembed or @huggingface/transformers:');
        console.log('    npm install fastembed');
        console.log('    npm install @huggingface/transformers\n');
        process.exit(1);
      }

      if (!isAll) {
        // Single batch (original behavior)
        console.log(`\nGenerating embeddings (batch size: ${batchSize})...\n`);
        const count = await sdk.backfillEmbeddings(batchSize);
        console.log(`  Generated ${count} embeddings.\n`);
        const stats = sdk.getEmbeddingStats();
        console.log(`  Coverage: ${stats.embedded}/${stats.total} (${stats.percentage}%)\n`);
        break;
      }

      // --all mode: loop until 100% coverage
      const startStats = sdk.getEmbeddingStats();
      const missing = startStats.total - startStats.embedded;
      if (missing <= 0) {
        console.log('\n  All observations already have embeddings (100% coverage).\n');
        break;
      }

      console.log(`\n  Backfill --all: ${missing} embeddings to generate (batch size: ${batchSize})`);
      console.log(`  Estimated time: ~${Math.ceil(missing / 160)} minutes\n`);

      let totalGenerated = 0;
      const startTime = Date.now();

      while (true) {
        const count = await sdk.backfillEmbeddings(batchSize);
        if (count === 0) break;
        totalGenerated += count;

        const stats = sdk.getEmbeddingStats();
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        const rate = totalGenerated / (elapsed || 1);
        const remaining = stats.total - stats.embedded;
        const eta = remaining > 0 ? Math.ceil(remaining / rate) : 0;
        const etaMin = Math.floor(eta / 60);
        const etaSec = eta % 60;

        // Progress line (overwrite)
        process.stdout.write(
          `\r  Progress: ${stats.embedded}/${stats.total} (${stats.percentage}%) | +${totalGenerated} | ${Math.round(rate)}/s | ETA ${etaMin}m${etaSec.toString().padStart(2, '0')}s   `
        );

        if (stats.percentage >= 100) break;
      }

      const finalStats = sdk.getEmbeddingStats();
      const totalTime = Math.floor((Date.now() - startTime) / 1000);
      console.log(`\n\n  ✓ Backfill complete: ${totalGenerated} embeddings generated in ${Math.floor(totalTime / 60)}m${(totalTime % 60).toString().padStart(2, '0')}s`);
      console.log(`  Coverage: ${finalStats.embedded}/${finalStats.total} (${finalStats.percentage}%)\n`);
      break;
    }
    default:
      console.log('\nUsage: totalrecall embeddings <subcommand>\n');
      console.log('Subcommands:');
      console.log('  stats              Show embedding statistics');
      console.log('  backfill [size]    Generate embeddings (default: 50)');
      console.log('  backfill --all     Generate ALL missing embeddings with progress\n');
  }
}

async function semanticSearchCli(sdk: ReturnType<typeof createTotalRecall>, query: string) {
  if (!query) {
    console.error('Error: Please provide a search query');
    process.exit(1);
  }

  console.log(`\nSemantic search: "${query}"...\n`);

  // Initialize embedding service
  await sdk.initializeEmbeddings();

  const results = await sdk.hybridSearch(query, { limit: 10 });

  if (results.length === 0) {
    console.log('No results found.\n');
    return;
  }

  console.log(`Found ${results.length} results:\n`);
  results.forEach((r, i) => {
    const scorePercent = Math.round(r.score * 100);
    console.log(`  ${i + 1}. [${r.source}] ${r.title} (score: ${scorePercent}%)`);
    if (r.content) {
      console.log(`     ${r.content.substring(0, 150)}${r.content.length > 150 ? '...' : ''}`);
    }
    console.log('');
  });
}

async function handleDecay(sdk: ReturnType<typeof createTotalRecall>, subcommand: string) {
  switch (subcommand) {
    case 'stats': {
      const stats = await sdk.getDecayStats();
      console.log('\nDecay Statistics:\n');
      console.log(`  Total observations:    ${stats.total}`);
      console.log(`  Stale (file changed):  ${stats.stale}`);
      console.log(`  Never accessed:        ${stats.neverAccessed}`);
      console.log(`  Recently accessed:     ${stats.recentlyAccessed} (last 48h)`);

      if (stats.total > 0) {
        const freshPercent = Math.round(((stats.total - stats.stale) / stats.total) * 100);
        console.log(`  Freshness:             ${freshPercent}%`);
      }
      console.log('');
      break;
    }
    case 'detect-stale': {
      console.log('\nDetecting stale observations...\n');
      const count = await sdk.detectStaleObservations();
      if (count > 0) {
        console.log(`  Found and marked ${count} stale observation(s).`);
        console.log(`  These observations reference files that have been modified since they were recorded.\n`);
      } else {
        console.log('  No stale observations found. All observations are fresh.\n');
      }
      break;
    }
    case 'consolidate': {
      const dryRun = args.includes('--dry-run');
      console.log(`\n${dryRun ? '[DRY RUN] ' : ''}Consolidating duplicate observations...\n`);
      const result = await sdk.consolidateObservations({ dryRun });
      if (result.merged > 0) {
        console.log(`  Merged ${result.merged} group(s), removed ${result.removed} duplicate(s).`);
        if (dryRun) {
          console.log(`  (Dry run: no changes were made. Remove --dry-run to apply.)`);
        }
      } else {
        console.log('  No duplicate observations found to consolidate.');
      }
      console.log('');
      break;
    }
    default:
      console.log('\nUsage: totalrecall decay <subcommand>\n');
      console.log('Subcommands:');
      console.log('  stats                Show decay statistics (stale, never accessed, etc.)');
      console.log('  detect-stale         Detect and mark stale observations (files changed)');
      console.log('  consolidate [--dry-run]  Consolidate duplicate observations\n');
  }
}

async function generateReportCli(sdk: ReturnType<typeof createTotalRecall>, cliArgs: string[]) {
  // Parse options
  const periodArg = cliArgs.find(a => a.startsWith('--period='))?.split('=')[1];
  const formatArg = cliArgs.find(a => a.startsWith('--format='))?.split('=')[1];
  const outputArg = cliArgs.find(a => a.startsWith('--output='))?.split('=')[1];

  const period = (periodArg === 'monthly' ? 'monthly' : 'weekly') as 'weekly' | 'monthly';
  const format = formatArg === 'md' || formatArg === 'markdown' ? 'markdown'
    : formatArg === 'json' ? 'json'
    : 'text';

  const data = await sdk.generateReport({ period });

  let output: string;
  switch (format) {
    case 'markdown':
      output = formatReportMarkdown(data);
      break;
    case 'json':
      output = formatReportJson(data);
      break;
    default:
      output = formatReportText(data);
  }

  if (outputArg) {
    writeFileSync(outputArg, output, 'utf8');
    console.log(`\n  Report saved to: ${outputArg}\n`);
  } else {
    console.log(output);
  }
}

async function resumeSession(sdk: ReturnType<typeof createTotalRecall>, sessionId?: number) {
  const checkpoint = sessionId
    ? await sdk.getCheckpoint(sessionId)
    : await sdk.getLatestProjectCheckpoint();

  if (!checkpoint) {
    console.log('\n  No checkpoint found.');
    if (sessionId) {
      console.log(`  Session ${sessionId} has no checkpoint.`);
    } else {
      console.log(`  No recent checkpoints for project "${sdk.getProject()}".`);
    }
    console.log('  Checkpoints are created automatically at the end of each session.\n');
    return;
  }

  // Header with ANSI colors
  console.log('');
  console.log(`  \x1b[36m═══ Session Checkpoint ═══\x1b[0m`);
  console.log(`  \x1b[2mProject: ${checkpoint.project} | Session: ${checkpoint.session_id}\x1b[0m`);
  console.log(`  \x1b[2m${new Date(checkpoint.created_at).toLocaleString()}\x1b[0m`);
  console.log('');

  // Task
  console.log(`  \x1b[1mTask:\x1b[0m ${checkpoint.task}`);

  // Progress
  if (checkpoint.progress) {
    console.log(`  \x1b[1mProgress:\x1b[0m ${checkpoint.progress}`);
  }

  // Next steps
  if (checkpoint.next_steps) {
    console.log(`  \x1b[1mNext Steps:\x1b[0m ${checkpoint.next_steps}`);
  }

  // Open questions
  if (checkpoint.open_questions) {
    console.log(`  \x1b[1mOpen Questions:\x1b[0m ${checkpoint.open_questions}`);
  }

  // Relevant files
  if (checkpoint.relevant_files) {
    console.log(`  \x1b[1mRelevant Files:\x1b[0m`);
    const files = checkpoint.relevant_files.split(',').map(f => f.trim());
    files.forEach(f => {
      console.log(`    - ${f}`);
    });
  }

  console.log('');
}

// ─── Comando: search --interactive ───

/**
 * Ricerca interattiva REPL con selezione del risultato.
 * Fallback non-interattivo se stdin non è un TTY.
 */
async function searchInteractive(sdk: ReturnType<typeof createTotalRecall>, cliArgs: string[]) {
  const projectArg = cliArgs.find((a, i) => cliArgs[i - 1] === '--project') ||
    cliArgs.find(a => a.startsWith('--project='))?.split('=').slice(1).join('=');
  const isInteractive = cliArgs.includes('--interactive') || cliArgs.includes('-i');

  // Fallback non-interattivo se stdin non è un TTY o se il flag non è presente
  if (!isInteractive || !process.stdin.isTTY) {
    const queryArg = cliArgs.find(a => !a.startsWith('-') && a !== 'search');
    if (!queryArg) {
      console.error('Errore: fornisci un termine di ricerca o usa --interactive con un TTY');
      process.exit(1);
    }
    const results = projectArg
      ? await sdk.searchAdvanced(queryArg, { project: projectArg })
      : await sdk.search(queryArg);
    const obs = results.observations.slice(0, 20);
    if (obs.length === 0) {
      console.log('\nNessun risultato trovato.\n');
      return;
    }
    console.log(`\nRisultati per: "${queryArg}"\n`);
    obs.forEach((o, i) => {
      const date = new Date(o.created_at).toLocaleDateString('it-IT');
      console.log(`  ${i + 1}. [${o.type}] ${o.title} — ${o.project} (${date})`);
    });
    console.log('');
    return;
  }

  // Modalità REPL interattiva
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  const prompt = (question: string): Promise<string> =>
    new Promise(resolve => rl.question(question, answer => resolve(answer.trim())));

  const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
  const cyan = (s: string) => useColor ? `\x1b[36m${s}\x1b[0m` : s;
  const bold = (s: string) => useColor ? `\x1b[1m${s}\x1b[0m` : s;
  const dim = (s: string) => useColor ? `\x1b[2m${s}\x1b[0m` : s;

  console.log(`\n${cyan('=== Total Recall — Ricerca Interattiva ===')}`);
  if (projectArg) console.log(dim(`  Filtro progetto: ${projectArg}`));
  console.log(dim('  Premi Ctrl+C o digita "exit" per uscire.\n'));

  // Loop REPL
  while (true) {
    let query: string;
    try {
      query = await prompt(cyan('> '));
    } catch {
      break;
    }

    if (!query || query.toLowerCase() === 'exit' || query.toLowerCase() === 'quit') break;

    const results = projectArg
      ? await sdk.searchAdvanced(query, { project: projectArg })
      : await sdk.search(query);
    const obs = results.observations.slice(0, 20);

    if (obs.length === 0) {
      console.log(dim('\n  Nessun risultato trovato.\n'));
      continue;
    }

    console.log(`\n  ${bold(`${obs.length} risultato/i:`)}\n`);
    obs.forEach((o, i) => {
      const date = new Date(o.created_at).toLocaleDateString('it-IT');
      console.log(`    ${bold(`${i + 1}.`)} [${o.type}] ${o.title}`);
      console.log(dim(`       ${o.project} — ${date}`));
    });
    console.log('');

    // Seleziona un risultato per i dettagli
    const selRaw = await prompt(`  Numero per dettagli (Invio per saltare): `);
    const selIdx = parseInt(selRaw) - 1;

    if (!isNaN(selIdx) && selIdx >= 0 && selIdx < obs.length) {
      const o = obs[selIdx];
      console.log('');
      console.log(`  ${bold('Titolo:')}     ${o.title}`);
      console.log(`  ${bold('Tipo:')}       ${o.type}`);
      console.log(`  ${bold('Progetto:')}   ${o.project}`);
      console.log(`  ${bold('Data:')}       ${new Date(o.created_at).toLocaleString('it-IT')}`);
      if (o.text) {
        console.log(`  ${bold('Contenuto:')}`);
        console.log(`    ${o.text.substring(0, 500)}${o.text.length > 500 ? '...' : ''}`);
      }
      if (o.narrative) {
        console.log(`  ${bold('Narrativa:')}`);
        console.log(`    ${o.narrative.substring(0, 300)}${o.narrative.length > 300 ? '...' : ''}`);
      }
      console.log('');
    }
  }

  rl.close();
  console.log('\n  Uscita dalla modalità interattiva.\n');
}

// ─── Comando: export ───

/**
 * Esporta le observations di un progetto nel formato specificato.
 * Supporta JSONL, JSON e Markdown. Output su stdout o su file.
 */
async function exportObservations(sdk: ReturnType<typeof createTotalRecall>, cliArgs: string[]) {
  // Parsing degli argomenti
  const formatArg = (cliArgs.find(a => a.startsWith('--format='))?.split('=').slice(1).join('=')
    || cliArgs.find((a, i) => cliArgs[i - 1] === '--format')) as string | undefined;
  const projectArg = cliArgs.find(a => a.startsWith('--project='))?.split('=').slice(1).join('=')
    || cliArgs.find((a, i) => cliArgs[i - 1] === '--project');
  const outputArg = cliArgs.find(a => a.startsWith('-o='))?.split('=').slice(1).join('=')
    || cliArgs.find(a => a.startsWith('--output='))?.split('=').slice(1).join('=')
    || cliArgs.find((a, i) => (cliArgs[i - 1] === '--output' || cliArgs[i - 1] === '-o') && !a.startsWith('-'));
  const fromArg = cliArgs.find(a => a.startsWith('--from='))?.split('=').slice(1).join('=')
    || cliArgs.find((a, i) => cliArgs[i - 1] === '--from' && !a.startsWith('-'));
  const toArg = cliArgs.find(a => a.startsWith('--to='))?.split('=').slice(1).join('=')
    || cliArgs.find((a, i) => cliArgs[i - 1] === '--to' && !a.startsWith('-'));
  const typeArg = cliArgs.find(a => a.startsWith('--type='))?.split('=').slice(1).join('=')
    || cliArgs.find((a, i) => cliArgs[i - 1] === '--type' && !a.startsWith('-'));

  const validFormats = ['jsonl', 'json', 'md'] as const;
  const format = (validFormats.includes(formatArg as any) ? formatArg : 'jsonl') as 'jsonl' | 'json' | 'md';

  // Per il formato legacy (json/md) usa la vecchia implementazione
  if (format === 'json' || format === 'md') {
    if (!projectArg) {
      console.error('Errore: --project <nome> è obbligatorio per il formato json/md');
      process.exit(1);
    }

    const kmDb = new TotalRecallDatabase();
    let observations;
    try {
      observations = getObservationsByProject(kmDb.db, projectArg, 10_000);
    } finally {
      kmDb.close();
    }

    if (observations.length === 0) {
      console.error(`Nessuna observation trovata per il progetto "${projectArg}"`);
      process.exit(1);
    }

    const output = generateExportOutput(observations, format);

    if (outputArg) {
      writeFileSync(outputArg, output, 'utf8');
      console.error(`\n  Esportate ${observations.length} observations in: ${outputArg}\n`);
    } else {
      process.stdout.write(output + '\n');
    }
    return;
  }

  // Formato JSONL: usa il nuovo sistema completo con streaming e filtri
  const { generateMetaRecord, exportObservationsStreaming, exportSummariesStreaming, exportPromptsStreaming } =
    await import('../services/sqlite/ImportExport.js');

  const filters: import('../services/sqlite/ImportExport.js').ExportFilters = {};
  if (projectArg) filters.project = projectArg;
  if (typeArg) filters.type = typeArg;
  if (fromArg) filters.from = fromArg;
  if (toArg) filters.to = toArg;

  const kmDb = new TotalRecallDatabase();

  try {
    // Modalità streaming su file oppure su stdout
    if (outputArg) {
      // Scrivi su file (append line per line)
      const { createWriteStream } = await import('fs');
      const stream = createWriteStream(outputArg, { encoding: 'utf8' });

      let obsCount = 0;
      let sumCount = 0;
      let promptCount = 0;

      // Prima riga: metadati
      stream.write(generateMetaRecord(kmDb.db, filters) + '\n');

      // Export observations
      obsCount = exportObservationsStreaming(kmDb.db, filters, (line) => {
        stream.write(line + '\n');
      });

      // Export summaries
      sumCount = exportSummariesStreaming(kmDb.db, filters, (line) => {
        stream.write(line + '\n');
      });

      // Export prompts
      promptCount = exportPromptsStreaming(kmDb.db, filters, (line) => {
        stream.write(line + '\n');
      });

      await new Promise<void>((resolve, reject) => {
        stream.end((err?: Error | null) => err ? reject(err) : resolve());
      });

      console.error(`\n  Export JSONL completato:`);
      console.error(`    Observations: ${obsCount}`);
      console.error(`    Summaries:    ${sumCount}`);
      console.error(`    Prompts:      ${promptCount}`);
      console.error(`    File:         ${outputArg}\n`);
    } else {
      // Streaming su stdout
      process.stdout.write(generateMetaRecord(kmDb.db, filters) + '\n');
      exportObservationsStreaming(kmDb.db, filters, (line) => process.stdout.write(line + '\n'));
      exportSummariesStreaming(kmDb.db, filters, (line) => process.stdout.write(line + '\n'));
      exportPromptsStreaming(kmDb.db, filters, (line) => process.stdout.write(line + '\n'));
    }
  } finally {
    kmDb.close();
  }
}

// ─── Comando: import ───

/**
 * Importa observations, summaries e prompts da un file JSONL.
 * Supporta deduplication, dry-run, e import adapters per formati esterni.
 *
 * Usage:
 *   totalrecall import <file.jsonl> [--dry-run] [--source <adapter>] [--project <name>]
 *
 * --source: Specify the source format adapter (e.g. "claude-mem").
 *           If omitted, auto-detection is attempted. Falls back to native JSONL.
 * --project: Default project name for records missing a project field.
 */
async function importObservations(cliArgs: string[]) {
  // Parse arguments
  const filePath = cliArgs.find(a => !a.startsWith('-'));
  const dryRun = cliArgs.includes('--dry-run');
  const sourceIdx = cliArgs.indexOf('--source');
  const sourceName = sourceIdx >= 0 ? cliArgs[sourceIdx + 1] : undefined;
  const projectIdx = cliArgs.indexOf('--project');
  const projectName = projectIdx >= 0 ? cliArgs[projectIdx + 1] : undefined;

  // Color helpers (TTY-aware)
  const isTTY = process.stdout.isTTY ?? false;
  const green = (s: string) => isTTY ? `\x1b[32m${s}\x1b[0m` : s;
  const yellow = (s: string) => isTTY ? `\x1b[33m${s}\x1b[0m` : s;
  const red = (s: string) => isTTY ? `\x1b[31m${s}\x1b[0m` : s;
  const bold = (s: string) => isTTY ? `\x1b[1m${s}\x1b[0m` : s;
  const dim = (s: string) => isTTY ? `\x1b[2m${s}\x1b[0m` : s;

  if (!filePath) {
    console.error(
      'Errore: specifica il percorso del file JSONL\n' +
      '  totalrecall import <file.jsonl> [--dry-run] [--source <adapter>] [--project <name>]\n' +
      '  Adapters disponibili: claude-mem'
    );
    process.exit(1);
  }

  if (!existsSync(filePath)) {
    console.error(`Errore: file non trovato: ${filePath}`);
    process.exit(1);
  }

  let content: string;
  try {
    content = readFileSync(filePath, 'utf8');
  } catch (err: any) {
    console.error(`Errore lettura file: ${err.message}`);
    process.exit(1);
  }

  // Determine if we should use an adapter
  const { getAdapter, detectAdapter, listAdapters } = await import('../services/sqlite/adapters/index.js');
  const { importJsonl } = await import('../services/sqlite/ImportExport.js');

  let adapter = sourceName ? getAdapter(sourceName) : undefined;

  // If --source was specified but adapter not found, error out
  if (sourceName && !adapter) {
    const available = listAdapters();
    console.error(
      `Errore: adapter "${sourceName}" non trovato.\n` +
      `  Adapters disponibili: ${available.join(', ')}`
    );
    process.exit(1);
  }

  // Auto-detect if no --source specified
  if (!adapter) {
    adapter = detectAdapter(content);
    if (adapter) {
      console.log(`\n  ${green('✓')} Detected format: ${bold(adapter.name)}`);
    } else if (!looksLikeNativeJsonl(content)) {
      // Autodetect failed and it's not native JSONL — show helpful message and exit
      const available = listAdapters();
      console.error(
        `\n  ${red('✗')} Could not auto-detect the file format.\n\n` +
        `  The file does not match any known import format.\n` +
        `  Available adapters:\n` +
        available.map(name => `    • ${name}`).join('\n') + '\n\n' +
        `  To specify the format manually:\n` +
        `    totalrecall import ${filePath} --source <adapter>\n\n` +
        `  If this is a native Total Recall JSONL file, ensure it contains\n` +
        `  records with a "_type" field (observation, summary, or prompt).`
      );
      process.exit(1);
    }
    // else: native JSONL — proceed without adapter
  }

  if (dryRun) {
    console.log(`\n  ${dim('[DRY RUN]')} Analisi di "${filePath}"...`);
  } else {
    console.log(`\n  Importazione di "${filePath}"...`);
  }

  const kmDb = new TotalRecallDatabase();
  let result;

  try {
    if (adapter) {
      // Use adapter to transform, then import via standard pipeline
      console.log(`  Adapter: ${adapter.name}\n`);
      const adapted = adapter.adapt(content, { defaultProject: projectName });

      // Enhanced dry-run reporting
      if (dryRun) {
        printDryRunReport(adapted, {
          filePath,
          adapterName: adapter.name,
          green, yellow, red, bold, dim,
        });
      }

      // Report skipped records (non-dry-run still gets brief info)
      if (!dryRun && adapted.skipped.length > 0) {
        console.log(`  Record saltati dall'adapter: ${adapted.skipped.length}`);
        for (const skip of adapted.skipped.slice(0, 10)) {
          console.log(`    Riga ${skip.line}: ${skip.reason}`);
        }
        if (adapted.skipped.length > 10) {
          console.log(`    ... e altri ${adapted.skipped.length - 10}`);
        }
        console.log('');
      }

      // Convert adapted records back to JSONL for the standard import pipeline
      const jsonlLines: string[] = [];
      for (const obs of adapted.observations) {
        jsonlLines.push(JSON.stringify(obs));
      }
      for (const sum of adapted.summaries) {
        jsonlLines.push(JSON.stringify(sum));
      }
      for (const pmt of adapted.prompts) {
        jsonlLines.push(JSON.stringify(pmt));
      }

      const jsonlContent = jsonlLines.join('\n');
      result = importJsonl(kmDb.db, jsonlContent, dryRun);

      // Augment result with adapter-level counts for summary
      (result as any)._adapterCounts = {
        observations: adapted.observations.length,
        summaries: adapted.summaries.length,
        prompts: adapted.prompts.length,
        rejected: adapted.skipped.length,
      };

      // Add adapter-skipped to the error count for reporting
      result.total += adapted.skipped.length;
      result.errors += adapted.skipped.length;
      for (const skip of adapted.skipped) {
        result.errorDetails.push({ line: skip.line, error: skip.reason });
      }
    } else {
      // Native Total Recall JSONL format
      console.log('');
      result = importJsonl(kmDb.db, content, dryRun);
    }
  } finally {
    kmDb.close();
  }

  // Print final summary
  if (dryRun) {
    // For dry-run with adapter, the detailed report was already printed above.
    // Just add a footer note.
    if (!adapter) {
      // Native JSONL dry-run — use existing format
      const { formatImportResult } = await import('./cli-utils.js');
      console.log(formatImportResult({
        imported: result.imported,
        skipped: result.skipped,
        errors: result.errors,
        total: result.total,
        dryRun,
        errorDetails: result.errorDetails,
      }));
    } else {
      console.log(`\n  ${dim('(Dry run: nessun dato inserito. Rimuovi --dry-run per applicare.)')}\n`);
    }
  } else {
    // Non-dry-run — print colored import summary
    const counts = (result as any)._adapterCounts as
      | { observations: number; summaries: number; prompts: number; rejected: number }
      | undefined;

    if (counts) {
      // Adapter-aware summary
      const imported = counts.observations + counts.summaries + counts.prompts;
      const lines = [
        '',
        `  ${bold('Import complete.')}`,
        `  Imported: ${green(String(counts.observations))} observations, ${green(String(counts.summaries))} summaries, ${green(String(counts.prompts))} prompts`,
        `  Skipped:  ${result.skipped > 0 ? yellow(String(result.skipped)) : String(result.skipped)} duplicates`,
        `  Rejected: ${counts.rejected > 0 ? red(String(counts.rejected)) : String(counts.rejected)} unsupported`,
        '',
      ];
      console.log(lines.join('\n'));
    } else {
      // Native JSONL summary
      console.log([
        '',
        `  ${bold('Import complete.')}`,
        `  Imported: ${green(String(result.imported))} records`,
        `  Skipped:  ${result.skipped > 0 ? yellow(String(result.skipped)) : String(result.skipped)} duplicates`,
        `  Errors:   ${result.errors > 0 ? red(String(result.errors)) : String(result.errors)}`,
        '',
      ].join('\n'));
    }
  }

  // Exit con codice 1 se ci sono solo errori e nessun import
  if (result.imported === 0 && result.errors > 0 && result.skipped === 0) {
    process.exit(1);
  }
}

/**
 * Print a detailed dry-run report showing breakdown by type,
 * what would be imported vs skipped, and rejection details.
 */
function printDryRunReport(
  adapted: import('../services/sqlite/adapters/index.js').AdaptedImport,
  opts: {
    filePath: string;
    adapterName: string;
    green: (s: string) => string;
    yellow: (s: string) => string;
    red: (s: string) => string;
    bold: (s: string) => string;
    dim: (s: string) => string;
  }
) {
  const { green, yellow, red, bold, dim } = opts;

  const totalRecords = adapted.observations.length + adapted.summaries.length + adapted.prompts.length + adapted.skipped.length;
  const importable = adapted.observations.length + adapted.summaries.length + adapted.prompts.length;

  // Count rejections by reason category
  const rejectionsByReason = new Map<string, number>();
  for (const skip of adapted.skipped) {
    const key = categorizeSkipReason(skip.reason);
    rejectionsByReason.set(key, (rejectionsByReason.get(key) ?? 0) + 1);
  }

  console.log(`  ${bold('─── Dry Run Report ───')}`);
  console.log('');
  console.log(`  Source:   ${opts.filePath}`);
  console.log(`  Adapter:  ${opts.adapterName}`);
  console.log('');
  console.log(`  ${bold('Records found:')}        ${totalRecords}`);
  console.log('');
  console.log(`  ${bold('By type:')}`);
  console.log(`    Observations:       ${green(String(adapted.observations.length))}`);
  console.log(`    Summaries:          ${green(String(adapted.summaries.length))}`);
  console.log(`    Prompts:            ${green(String(adapted.prompts.length))}`);
  console.log('');
  console.log(`  ${bold('Would be imported:')}    ${green(String(importable))}`);
  console.log(`  ${bold('Would be rejected:')}    ${adapted.skipped.length > 0 ? red(String(adapted.skipped.length)) : String(adapted.skipped.length)}`);
  console.log('');

  if (rejectionsByReason.size > 0) {
    console.log(`  ${bold('Rejection reasons:')}`);
    for (const [reason, count] of rejectionsByReason.entries()) {
      console.log(`    ${yellow(String(count).padStart(4))}  ${reason}`);
    }
    console.log('');

    // Show first few rejected records as examples
    const examples = adapted.skipped.slice(0, 5);
    if (examples.length > 0) {
      console.log(`  ${dim('Examples of rejected records:')}`);
      for (const skip of examples) {
        const idPart = skip.originalId ? ` (${skip.originalId})` : '';
        const typePart = skip.type ? ` [type=${skip.type}]` : '';
        console.log(`    Line ${skip.line}${idPart}${typePart}: ${skip.reason}`);
      }
      if (adapted.skipped.length > 5) {
        console.log(`    ${dim(`... and ${adapted.skipped.length - 5} more`)}`);
      }
      console.log('');
    }
  }

  // Show project breakdown if multiple projects detected
  const projects = new Map<string, number>();
  for (const obs of adapted.observations) {
    projects.set(obs.project, (projects.get(obs.project) ?? 0) + 1);
  }
  for (const sum of adapted.summaries) {
    projects.set(sum.project, (projects.get(sum.project) ?? 0) + 1);
  }
  for (const pmt of adapted.prompts) {
    projects.set(pmt.project, (projects.get(pmt.project) ?? 0) + 1);
  }

  if (projects.size > 1) {
    console.log(`  ${bold('By project:')}`);
    for (const [proj, count] of [...projects.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`    ${String(count).padStart(4)}  ${proj}`);
    }
    console.log('');
  }
}

/** Categorize a skip reason into a human-friendly bucket */
function categorizeSkipReason(reason: string): string {
  if (reason.startsWith('Unsupported type:')) return 'Unsupported record type';
  if (reason.includes('Empty content')) return 'Empty content field';
  if (reason.includes('Invalid JSON')) return 'Invalid JSON line';
  if (reason.includes('not a JSON object')) return 'Non-object JSON value';
  return reason;
}

/**
 * Quick check if content looks like native Total Recall JSONL.
 * Checks first few non-empty lines for `_type` or `_meta` fields.
 */
function looksLikeNativeJsonl(content: string): boolean {
  if (!content || content.trim().length === 0) return false;
  const lines = content.split('\n');
  let checked = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object' && ('_type' in parsed || '_meta' in parsed)) {
        return true;
      }
    } catch { /* skip */ }
    checked++;
    if (checked >= 5) break;
  }
  return false;
}

// ─── Comando: doctor --fix ───

/**
 * Estende la diagnostica doctor con la riparazione automatica (--fix).
 */
async function runDoctorFix() {
  console.log('\n=== Total Recall — Riparazione Database ===\n');

  const kmDb = new TotalRecallDatabase();
  const db = kmDb.db;
  const messages: string[] = [];

  try {
    // 1. Ricostruzione indice FTS5
    process.stdout.write('  [1/5] Ricostruzione indice FTS5... ');
    const ftsOk = rebuildFtsIndex(db);
    if (ftsOk) {
      console.log('\x1b[32m✓\x1b[0m');
      messages.push('Indice FTS5 ricostruito');
    } else {
      console.log('\x1b[33m~\x1b[0m (FTS non disponibile o gia\' integro)');
    }

    // 2. Rimozione embeddings orfani
    process.stdout.write('  [2/5] Rimozione embeddings orfani... ');
    const removed = removeOrphanedEmbeddings(db);
    console.log(`\x1b[32m✓\x1b[0m (${removed} rimossi)`);
    if (removed > 0) messages.push(`${removed} embedding/s orfani rimossi`);

    // 3. Fix embedding storage: remove corrupted TEXT-type embeddings
    //    TEXT-stored embeddings are irrecoverably corrupted (UTF-8 mangled binary data).
    //    They must be deleted and regenerated via backfill.
    process.stdout.write('  [3/5] Remove corrupted TEXT embeddings...');
    try {
      const textCount = (db.query(
        "SELECT COUNT(*) as c FROM observation_embeddings WHERE typeof(embedding) = 'text'"
      ).get() as { c: number })?.c || 0;

      if (textCount > 0) {
        db.query(
          "DELETE FROM observation_embeddings WHERE typeof(embedding) = 'text'"
        ).run();
        console.log(` \x1b[32m✓\x1b[0m (${textCount} rimossi — run 'totalrecall embeddings backfill' to regenerate)`);
        messages.push(`${textCount} embedding corrotti (TEXT) rimossi — rigenerare con backfill`);
      } else {
        console.log(' \x1b[33m~\x1b[0m (nessun TEXT corrotto)');
      }
    } catch (err) {
      console.log(` \x1b[31m✗\x1b[0m (${err})`);
    }

    // 4. Cleanup zero-length embeddings
    process.stdout.write('  [4/5] Cleanup zero-length embeddings...');
    try {
      const zeroResult = db.query(
        "DELETE FROM observation_embeddings WHERE length(embedding) = 0"
      ).run();
      const zeroCount = zeroResult.changes;
      if (zeroCount > 0) {
        console.log(` \x1b[32m✓\x1b[0m (${zeroCount} rimossi)`);
        messages.push(`${zeroCount} embedding zero-length rimossi`);
      } else {
        console.log(' \x1b[33m~\x1b[0m (nessuno)');
      }
    } catch (err) {
      console.log(` \x1b[31m✗\x1b[0m (${err})`);
    }

    // 5. VACUUM database
    process.stdout.write('  [5/5] VACUUM database...             ');
    const vacuumOk = vacuumDatabase(db);
    if (vacuumOk) {
      console.log('\x1b[32m✓\x1b[0m');
      messages.push('VACUUM completato');
    } else {
      console.log('\x1b[31m✗\x1b[0m');
    }
  } finally {
    kmDb.close();
  }

  if (messages.length > 0) {
    console.log('\n  Operazioni completate:');
    for (const msg of messages) {
      console.log(`    \x1b[32m✓\x1b[0m ${msg}`);
    }
  }
  console.log('');
}

// ─── Comando: stats ───

/**
 * Mostra statistiche aggregate del database.
 */
async function showStats() {
  const kmDb = new TotalRecallDatabase();
  const db = kmDb.db;

  try {
    // Query aggregate semplici compatibili con bun:sqlite e better-sqlite3
    const obsRow = db.query(
      'SELECT COUNT(*) as total FROM observations'
    ).get() as { total: number } | null;

    const sessRow = db.query(
      'SELECT COUNT(*) as total FROM sessions'
    ).get() as { total: number } | null;

    const projRow = db.query(
      'SELECT COUNT(DISTINCT project) as cnt FROM observations'
    ).get() as { cnt: number } | null;

    // Progetto piu' attivo
    const topProject = db.query(
      `SELECT project, COUNT(*) as cnt
       FROM observations
       GROUP BY project
       ORDER BY cnt DESC
       LIMIT 1`
    ).get() as { project: string; cnt: number } | null;

    // Copertura embeddings (LEFT JOIN su tabella opzionale)
    let embCoverage = 0;
    try {
      const embStats = db.query(
        `SELECT
           (SELECT COUNT(*) FROM observations) as total,
           COUNT(DISTINCT observation_id) as embedded
         FROM observation_embeddings`
      ).get() as { total: number; embedded: number } | null;

      if (embStats && embStats.total > 0) {
        embCoverage = Math.round((embStats.embedded / embStats.total) * 100);
      }
    } catch {
      // La tabella potrebbe non esistere — coverage resta 0
    }

    // Dimensione file DB
    const dbSize = getDbFileSize(DB_PATH);

    const stats = {
      totalObservations: obsRow?.total || 0,
      totalSessions: sessRow?.total || 0,
      totalProjects: projRow?.cnt || 0,
      dbSizeBytes: dbSize,
      mostActiveProject: topProject?.project || null,
      embeddingCoverage: embCoverage,
    };

    console.log(formatStatsOutput(stats));
  } finally {
    kmDb.close();
  }
}

// ─── Comando: config ───

/**
 * Gestisce la configurazione del sistema (list|get|set).
 */
async function handleConfig(subArgs: string[]) {
  const subcommand = subArgs[0];
  const configPath = getConfigPath();

  switch (subcommand) {
    case 'list': {
      const config = listConfig(configPath);
      console.log('\n=== Configurazione Total Recall ===\n');
      console.log(`  File: ${configPath}\n`);

      for (const [key, value] of Object.entries(config)) {
        const displayValue = value === null ? '(non impostato)' : String(value);
        console.log(`  ${key.padEnd(35)} ${displayValue}`);
      }
      console.log('');
      break;
    }

    case 'get': {
      const key = subArgs[1];
      if (!key) {
        console.error('Errore: specifica una chiave\n  totalrecall config get <chiave>');
        process.exit(1);
      }
      const val = getConfigValue(key, configPath);
      if (val === null) {
        console.log(`\n  "${key}" non impostato (nessun valore di default)\n`);
      } else {
        console.log(`\n  ${key} = ${val}\n`);
      }
      break;
    }

    case 'set': {
      const key = subArgs[1];
      const rawValue = subArgs[2];

      if (!key) {
        console.error('Errore: specifica chiave e valore\n  totalrecall config set <chiave> <valore>');
        process.exit(1);
      }
      if (rawValue === undefined) {
        console.error(`Errore: valore mancante per "${key}"\n  totalrecall config set ${key} <valore>`);
        process.exit(1);
      }

      const saved = setConfigValue(key, rawValue, configPath);
      console.log(`\n  Impostato: ${key} = ${saved}\n`);
      break;
    }

    default:
      console.log('\nUtilizzo: totalrecall config <subcommand>\n');
      console.log('Subcommands:');
      console.log('  list                         Mostra tutte le impostazioni');
      console.log('  get <chiave>                 Legge un valore');
      console.log('  set <chiave> <valore>        Imposta un valore\n');
      console.log('Esempio:');
      console.log('  totalrecall config list');
      console.log('  totalrecall config get worker.port');
      console.log('  totalrecall config set log.level DEBUG\n');
  }
}

// ─── Backup CLI ───

/**
 * Gestisce i sottocomandi del comando `backup`.
 *   backup create                — crea backup manuale
 *   backup list                  — elenca backup
 *   backup restore <file>        — ripristina (con conferma interattiva)
 */
async function handleBackup(subArgs: string[]): Promise<void> {
  const subCommand = subArgs[0];

  if (!subCommand || subCommand === 'help') {
    console.log(`
Uso: totalrecall backup <sottocomando>

Sottocomandi:
  create              Crea un backup manuale del database
  list                Elenca i backup disponibili con metadata
  restore <file>      Ripristina il database da un file backup
`);
    return;
  }

  if (subCommand === 'create') {
    // Crea un backup e ruota i vecchi
    const maxKeep = Number(getConfigValue('backup.maxKeep')) || 7;
    const db = new TotalRecallDatabase(DB_PATH, true); // skipMigrations=true
    try {
      const entry = createBackup(DB_PATH, BACKUPS_DIR, db.db);
      const deleted = rotateBackups(BACKUPS_DIR, maxKeep);

      console.log(`\n=== Total Recall — Backup Creato ===\n`);
      console.log(`  File:        ${entry.metadata.filename}`);
      console.log(`  Timestamp:   ${entry.metadata.timestamp}`);
      console.log(`  Schema v.:   ${entry.metadata.schemaVersion}`);
      console.log(`  Obs.:        ${entry.metadata.stats.observations}`);
      console.log(`  Sessioni:    ${entry.metadata.stats.sessions}`);
      console.log(`  Dimensione:  ${(entry.metadata.stats.dbSizeBytes / 1024).toFixed(1)} KB`);
      if (deleted > 0) {
        console.log(`  Rotazione:   ${deleted} backup rimossi (max ${maxKeep} mantenuti)`);
      }
      console.log(`\n  Directory:  ${BACKUPS_DIR}\n`);
    } finally {
      db.close();
    }
    return;
  }

  if (subCommand === 'list') {
    const entries = listBackups(BACKUPS_DIR);

    if (entries.length === 0) {
      console.log('\n  Nessun backup trovato in: ' + BACKUPS_DIR + '\n');
      return;
    }

    console.log(`\n=== Total Recall — Backup Disponibili ===\n`);
    console.log(`  Directory: ${BACKUPS_DIR}\n`);

    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      const size = (e.metadata.stats.dbSizeBytes / 1024).toFixed(1);
      const date = new Date(e.metadata.timestampEpoch).toLocaleString('it-IT');
      console.log(`  ${i + 1}. ${e.metadata.filename}`);
      console.log(`     Data:      ${date}`);
      console.log(`     Schema:    v${e.metadata.schemaVersion}`);
      console.log(`     Obs.:      ${e.metadata.stats.observations} | Sessioni: ${e.metadata.stats.sessions}`);
      console.log(`     Dimensione: ${size} KB`);
      console.log('');
    }
    return;
  }

  if (subCommand === 'restore') {
    const file = subArgs[1];
    if (!file) {
      console.error('\n  Errore: specifica il nome del file backup da ripristinare.');
      console.error('  Esempio: totalrecall backup restore backup-2026-02-27-150000.db\n');
      process.exit(1);
    }

    // Validazione nome file: accetta solo nomi backup validi (con o senza millisecondi)
    const backupPattern = /^backup-\d{4}-\d{2}-\d{2}-\d{6}(-\d{3})?\.db$/;
    if (file.includes('/') || file.includes('..') || !backupPattern.test(file)) {
      console.error(`\n  Errore: nome file non valido: ${file}`);
      console.error('  Il file deve essere nel formato "backup-YYYY-MM-DD-HHmmss[-mmm].db"\n');
      process.exit(1);
    }

    // Verifica che il backup esista
    const entries = listBackups(BACKUPS_DIR);
    const found = entries.find(e => e.metadata.filename === file);
    if (!found) {
      console.error(`\n  Errore: backup non trovato: ${file}`);
      console.error(`  Usa "totalrecall backup list" per vedere i backup disponibili.\n`);
      process.exit(1);
    }

    // Conferma interattiva
    const date = new Date(found.metadata.timestampEpoch).toLocaleString('it-IT');
    console.log(`\n  ATTENZIONE: questa operazione sovrascrive il database corrente!`);
    console.log(`  Backup da ripristinare: ${file}`);
    console.log(`  Data backup:            ${date}`);
    console.log(`  Obs. nel backup:        ${found.metadata.stats.observations}`);
    console.log('');

    // Usa readline per la conferma
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const confirmed = await new Promise<boolean>(resolve => {
      rl.question('  Confermi il ripristino? (digita "si" per confermare): ', answer => {
        rl.close();
        resolve(answer.trim().toLowerCase() === 'si');
      });
    });

    if (!confirmed) {
      console.log('\n  Ripristino annullato.\n');
      return;
    }

    restoreBackup(found.filePath, DB_PATH);
    console.log(`\n  Database ripristinato da: ${file}`);
    console.log('  Riavvia il worker per applicare le modifiche.\n');
    return;
  }

  console.error(`\n  Sottocomando backup non riconosciuto: ${subCommand}`);
  console.error('  Usa: create | list | restore\n');
  process.exit(1);
}

// ─── Worker command ───

async function handleWorker(commandName: 'worker:start' | 'worker:stop' | 'worker:restart' | 'worker:status'): Promise<void> {
  const host = String(process.env.TOTALRECALL_WORKER_HOST || process.env.CONTEXTKIT_WORKER_HOST || '127.0.0.1');
  const port = String(process.env.TOTALRECALL_WORKER_PORT || process.env.CONTEXTKIT_WORKER_PORT || '3001');
  const pidFile = join(DATA_DIR, 'worker.pid');
  const workerPath = join(DIST_DIR, 'worker-service.js');
  const healthUrl = `http://${host}:${port}/health`;

  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  async function isHealthy(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 1200);
      const resp = await fetch(healthUrl, { signal: controller.signal });
      clearTimeout(timeout);
      return resp.ok;
    } catch {
      return false;
    }
  }

  function readPid(): number | null {
    try {
      if (!existsSync(pidFile)) return null;
      const raw = readFileSync(pidFile, 'utf8').trim();
      const pid = Number(raw);
      return Number.isInteger(pid) && pid > 0 ? pid : null;
    } catch {
      return null;
    }
  }

  function processExists(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  async function stopWorker(): Promise<boolean> {
    const pid = readPid();
    if (!pid) {
      if (existsSync(pidFile)) {
        try { unlinkSync(pidFile); } catch {}
      }
      return false;
    }

    if (!processExists(pid)) {
      try { unlinkSync(pidFile); } catch {}
      return false;
    }

    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      return false;
    }

    for (let i = 0; i < 20; i++) {
      if (!processExists(pid)) {
        try { if (existsSync(pidFile)) unlinkSync(pidFile); } catch {}
        return true;
      }
      await sleep(250);
    }

    try {
      process.kill(pid, 'SIGKILL');
    } catch {}

    for (let i = 0; i < 10; i++) {
      if (!processExists(pid)) {
        try { if (existsSync(pidFile)) unlinkSync(pidFile); } catch {}
        return true;
      }
      await sleep(100);
    }

    return false;
  }

  async function startWorker(): Promise<void> {
    if (await isHealthy()) {
      console.log(`\n  Worker already running on ${healthUrl}\n`);
      return;
    }

    const stalePid = readPid();
    if (stalePid && !processExists(stalePid)) {
      try { unlinkSync(pidFile); } catch {}
    }

    const child = require('child_process').spawn(process.execPath, [workerPath], {
      detached: true,
      stdio: 'ignore',
      env: { ...process.env }
    });
    child.unref();

    for (let i = 0; i < 20; i++) {
      if (await isHealthy()) {
        console.log(`\n  Worker started on ${healthUrl}\n`);
        return;
      }
      await sleep(250);
    }

    console.error(`\n  Worker did not become healthy on ${healthUrl}. Check logs with: npm run worker:logs\n`);
    process.exit(1);
  }

  switch (commandName) {
    case 'worker:start':
      await startWorker();
      return;
    case 'worker:stop': {
      const stopped = await stopWorker();
      console.log(stopped ? '\n  Worker stopped.\n' : '\n  Worker is not running.\n');
      return;
    }
    case 'worker:restart':
      await stopWorker();
      await startWorker();
      return;
    case 'worker:status': {
      const healthy = await isHealthy();
      if (healthy) {
        const pid = readPid();
        console.log(`\n  Worker is running on ${healthUrl}${pid ? ` (pid ${pid})` : ''}.\n`);
        return;
      }
      const pid = readPid();
      if (pid && !processExists(pid)) {
        try { unlinkSync(pidFile); } catch {}
      }
      console.log(`\n  Worker is not running on ${healthUrl}.\n`);
      process.exit(1);
    }
  }
}

// ─── Plugins command ───

/**
 * Gestisce il comando `totalrecall plugins <sottocomando>`.
 *
 * Comunica con il worker via HTTP per evitare di caricare il registry
 * nel processo CLI (il registry vive nel worker).
 *
 * Sottocomandi:
 *   list              — elenca tutti i plugin con stato
 *   enable <nome>     — abilita un plugin registrato
 *   disable <nome>    — disabilita un plugin attivo
 */
async function handlePlugins(subArgs: string[]): Promise<void> {
  const subCommand = subArgs[0];
  const port = process.env.TOTALRECALL_WORKER_PORT || process.env.CONTEXTKIT_WORKER_PORT || '3001';
  const baseUrl = `http://127.0.0.1:${port}`;

  // Helper HTTP GET sincrono via Node http
  async function apiGet(path: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const req = http.get(`${baseUrl}${path}`, (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          try { resolve({ status: res.statusCode, data: JSON.parse(body) }); }
          catch { reject(new Error(`Risposta non JSON: ${body}`)); }
        });
      });
      req.on('error', reject);
      req.setTimeout(5000, () => { req.destroy(new Error('Timeout')); });
    });
  }

  // Helper HTTP POST
  async function apiPost(path: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: '127.0.0.1',
        port: parseInt(port, 10),
        path,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': 0 }
      };
      const req = http.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          try { resolve({ status: res.statusCode, data: JSON.parse(body) }); }
          catch { reject(new Error(`Risposta non JSON: ${body}`)); }
        });
      });
      req.on('error', reject);
      req.setTimeout(10_000, () => { req.destroy(new Error('Timeout')); });
      req.end();
    });
  }

  if (!subCommand || subCommand === 'list') {
    try {
      const result = await apiGet('/api/plugins');
      const { plugins } = result.data;

      console.log('\n=== Total Recall — Plugin ===\n');

      if (!plugins || plugins.length === 0) {
        console.log('  Nessun plugin registrato.\n');
        return;
      }

      for (const p of plugins) {
        const stateColor = p.state === 'active' ? '\x1b[32m' : p.state === 'error' ? '\x1b[31m' : '\x1b[33m';
        console.log(`  ${p.name}@${p.version}`);
        console.log(`    Stato:    ${stateColor}${p.state}\x1b[0m`);
        if (p.description) console.log(`    Desc.:    ${p.description}`);
        if (p.error) console.log(`    Errore:   \x1b[31m${p.error}\x1b[0m`);
        console.log('');
      }
    } catch {
      console.error('\n  Errore: impossibile contattare il worker. Avvialo con: totalrecall worker start\n');
      process.exit(1);
    }
    return;
  }

  if (subCommand === 'enable') {
    const name = subArgs[1];
    if (!name) {
      console.error('\n  Errore: specifica il nome del plugin.\n  Esempio: totalrecall plugins enable mio-plugin\n');
      process.exit(1);
    }

    try {
      const result = await apiPost(`/api/plugins/${encodeURIComponent(name)}/enable`);
      if (result.status === 200) {
        console.log(`\n  Plugin "${name}" abilitato con successo.`);
        if (result.data.plugin?.state === 'error') {
          console.log(`  Attenzione: stato corrente = error: ${result.data.plugin.error}`);
        }
        console.log('');
      } else {
        console.error(`\n  Errore: ${result.data.error}\n`);
        process.exit(1);
      }
    } catch {
      console.error('\n  Errore: impossibile contattare il worker.\n');
      process.exit(1);
    }
    return;
  }

  if (subCommand === 'disable') {
    const name = subArgs[1];
    if (!name) {
      console.error('\n  Errore: specifica il nome del plugin.\n  Esempio: totalrecall plugins disable mio-plugin\n');
      process.exit(1);
    }

    try {
      const result = await apiPost(`/api/plugins/${encodeURIComponent(name)}/disable`);
      if (result.status === 200) {
        console.log(`\n  Plugin "${name}" disabilitato.\n`);
      } else {
        console.error(`\n  Errore: ${result.data.error}\n`);
        process.exit(1);
      }
    } catch {
      console.error('\n  Errore: impossibile contattare il worker.\n');
      process.exit(1);
    }
    return;
  }

  console.error(`\n  Sottocomando plugins non riconosciuto: ${subCommand}`);
  console.error('  Usa: list | enable <nome> | disable <nome>\n');
  process.exit(1);
}

async function handleService(subArgs: string[]): Promise<void> {
  const { install, uninstall, status, detectStrategy } = await import('../services/service-installer.js');
  const sub = subArgs[0];

  if (!sub || sub === 'status') {
    const s = status();
    console.log('\n=== Total Recall — Service Status ===\n');
    console.log(`  Installed:  ${s.installed ? 'yes' : 'no'}`);
    console.log(`  Strategy:   ${s.strategy}`);
    console.log(`  Details:    ${s.details}`);
    if (!s.installed) {
      console.log(`\n  Detected:   ${detectStrategy()} available`);
      console.log('  Run: totalrecall service install');
    }
    console.log('');
    return;
  }

  if (sub === 'install') {
    const result = install();
    console.log(`\n  ${result.success ? '✓' : '✗'} ${result.message}`);
    if (result.success) {
      console.log(`  Strategy: ${result.strategy}`);
    }
    console.log('');
    return;
  }

  if (sub === 'uninstall') {
    const result = uninstall();
    console.log(`\n  ${result.success ? '✓' : '✗'} ${result.message}\n`);
    return;
  }

  console.error(`\n  Unknown service subcommand: ${sub}`);
  console.error('  Usage: totalrecall service install|uninstall|status\n');
  process.exit(1);
}

// ─── Share command ───

/**
 * Handles `totalrecall share <subcommand>`.
 * Manages read-only sharing tokens via the worker API.
 */
async function handleShare(subArgs: string[]): Promise<void> {
  const subCommand = subArgs[0];
  const port = process.env.TOTALRECALL_WORKER_PORT || process.env.CONTEXTKIT_WORKER_PORT || '3001';
  const host = process.env.TOTALRECALL_WORKER_HOST || process.env.CONTEXTKIT_WORKER_HOST || '127.0.0.1';
  const baseUrl = `http://${host}:${port}`;
  const tokenFile = join(DATA_DIR, 'worker.token');

  // Read the worker auth token
  let workerToken: string;
  try {
    workerToken = readFileSync(tokenFile, 'utf-8').trim();
  } catch {
    console.error('\n  Error: Cannot read worker token. Is the worker running?');
    console.error('  Start with: totalrecall worker:start\n');
    process.exit(1);
  }

  // HTTP helpers with worker auth
  async function apiGet(path: string): Promise<{ status: number; data: any }> {
    return new Promise((resolve, reject) => {
      const req = http.get(`${baseUrl}${path}`, { headers: { 'X-Worker-Token': workerToken } }, (res) => {
        let body = '';
        res.on('data', (chunk: string) => { body += chunk; });
        res.on('end', () => {
          try { resolve({ status: res.statusCode!, data: JSON.parse(body) }); }
          catch { reject(new Error(`Non-JSON response: ${body}`)); }
        });
      });
      req.on('error', reject);
      req.setTimeout(5000, () => { req.destroy(new Error('Timeout')); });
    });
  }

  async function apiPost(path: string, bodyData: Record<string, unknown>): Promise<{ status: number; data: any }> {
    return new Promise((resolve, reject) => {
      const payload = JSON.stringify(bodyData);
      const options = {
        hostname: host,
        port: parseInt(port, 10),
        path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          'X-Worker-Token': workerToken,
        }
      };
      const req = http.request(options, (res) => {
        let body = '';
        res.on('data', (chunk: string) => { body += chunk; });
        res.on('end', () => {
          try { resolve({ status: res.statusCode!, data: JSON.parse(body) }); }
          catch { reject(new Error(`Non-JSON response: ${body}`)); }
        });
      });
      req.on('error', reject);
      req.setTimeout(10_000, () => { req.destroy(new Error('Timeout')); });
      req.write(payload);
      req.end();
    });
  }

  async function apiDelete(path: string): Promise<{ status: number; data: any }> {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: host,
        port: parseInt(port, 10),
        path,
        method: 'DELETE',
        headers: { 'X-Worker-Token': workerToken }
      };
      const req = http.request(options, (res) => {
        let body = '';
        res.on('data', (chunk: string) => { body += chunk; });
        res.on('end', () => {
          try { resolve({ status: res.statusCode!, data: JSON.parse(body) }); }
          catch { reject(new Error(`Non-JSON response: ${body}`)); }
        });
      });
      req.on('error', reject);
      req.setTimeout(5000, () => { req.destroy(new Error('Timeout')); });
      req.end();
    });
  }

  if (!subCommand || subCommand === 'help') {
    console.log(`
Usage: totalrecall share <subcommand>

Subcommands:
  create [options]     Create a new read-only sharing token
  list                 List all sharing tokens
  revoke <id>          Revoke a sharing token

Options for 'create':
  --project <name>     Scope token to a specific project (default: all projects)
  --expires <duration> Token expiration (default: 7d). Format: 7d, 24h, 30m
  --label <text>       Optional label for the token
`);
    return;
  }

  if (subCommand === 'create') {
    // Parse flags
    let project: string | undefined;
    let expires: string | undefined;
    let label: string | undefined;

    for (let i = 1; i < subArgs.length; i++) {
      const arg = subArgs[i]!;
      if (arg === '--project' && subArgs[i + 1]) {
        project = subArgs[++i];
      } else if (arg === '--expires' && subArgs[i + 1]) {
        expires = subArgs[++i];
      } else if (arg === '--label' && subArgs[i + 1]) {
        label = subArgs[++i];
      }
    }

    try {
      const result = await apiPost('/api/sharing/tokens', {
        project: project || null,
        expires: expires || '7d',
        label: label || null,
      });

      if (result.status !== 201) {
        console.error(`\n  Error: ${result.data.error || 'Failed to create token'}\n`);
        process.exit(1);
      }

      const { id, url, expires_at } = result.data;
      console.log(`\n=== Total Recall — Share Token Created ===\n`);
      console.log(`  ID:        ${id}`);
      console.log(`  Project:   ${project || '(all projects)'}`);
      console.log(`  Expires:   ${new Date(expires_at).toLocaleString()}`);
      if (label) console.log(`  Label:     ${label}`);
      console.log(`\n  Share URL:`);
      console.log(`  ${url}\n`);
    } catch {
      console.error('\n  Error: Cannot connect to worker. Start with: totalrecall worker:start\n');
      process.exit(1);
    }
    return;
  }

  if (subCommand === 'list') {
    try {
      const result = await apiGet('/api/sharing/tokens');

      if (result.status !== 200) {
        console.error(`\n  Error: ${result.data.error || 'Failed to list tokens'}\n`);
        process.exit(1);
      }

      const { tokens } = result.data;
      console.log('\n=== Total Recall — Sharing Tokens ===\n');

      if (!tokens || tokens.length === 0) {
        console.log('  No sharing tokens found.\n');
        console.log('  Create one with: totalrecall share create --project myapp\n');
        return;
      }

      for (const t of tokens) {
        const statusIcon = t.is_revoked ? '🚫' : t.is_expired ? '⏰' : '✅';
        const status = t.is_revoked ? 'revoked' : t.is_expired ? 'expired' : 'active';
        console.log(`  ${statusIcon} ${t.id}`);
        console.log(`     Project:  ${t.project || '(all)'}`);
        console.log(`     Status:   ${status}`);
        console.log(`     Expires:  ${new Date(t.expires_at).toLocaleString()}`);
        console.log(`     Created:  ${new Date(t.created_at).toLocaleString()}`);
        if (t.label) console.log(`     Label:    ${t.label}`);
        console.log('');
      }
    } catch {
      console.error('\n  Error: Cannot connect to worker. Start with: totalrecall worker:start\n');
      process.exit(1);
    }
    return;
  }

  if (subCommand === 'revoke') {
    const tokenId = subArgs[1];
    if (!tokenId) {
      console.error('\n  Error: Token ID is required.');
      console.error('  Usage: totalrecall share revoke <id>\n');
      process.exit(1);
    }

    try {
      const result = await apiDelete(`/api/sharing/tokens/${encodeURIComponent(tokenId)}`);

      if (result.status === 404) {
        console.error(`\n  Error: Token not found or already revoked.\n`);
        process.exit(1);
      }
      if (result.status !== 200) {
        console.error(`\n  Error: ${result.data.error || 'Failed to revoke token'}\n`);
        process.exit(1);
      }

      console.log(`\n  ✅ Token ${tokenId} revoked successfully.\n`);
    } catch {
      console.error('\n  Error: Cannot connect to worker. Start with: totalrecall worker:start\n');
      process.exit(1);
    }
    return;
  }

  console.error(`\n  Unknown share subcommand: ${subCommand}`);
  console.error('  Usage: totalrecall share create|list|revoke\n');
  process.exit(1);
}

function showHelp() {
  console.log(`Usage: totalrecall <command> [options]

Setup:
  install                   Install for Kiro CLI (default)
  install --claude-code     Install hooks and MCP server for Claude Code
  install --cursor          Install hooks and MCP server for Cursor IDE
  install --windsurf        Install MCP server for Windsurf IDE
  install --cline           Install MCP server for Cline (VS Code)
  doctor                    Run environment diagnostics (checks Node, build tools, WSL, etc.)
  doctor --fix              Auto-repair: rebuild FTS5, remove orphaned embeddings, VACUUM

Commands:
  context, ctx              Show current project context
  resume [session-id]       Resume previous session (shows checkpoint)
  report [options]          Generate activity report
    --period=weekly|monthly   Time period (default: weekly)
    --format=text|md|json     Output format (default: text)
    --output=<file>           Write to file instead of stdout
  stats                     Quick database overview (totals, size, active project, embeddings)
  search <query>            Search across all context (keyword FTS5)
  search --interactive      Interactive REPL search with result selection
    --project <name>          Filter results by project
  semantic-search <query>   Hybrid search: vector + keyword (semantic)
  export --project <name>   Export observations to JSONL/JSON/Markdown
    --format=jsonl|json|md    Output format (default: jsonl)
    --output=<file>           Write to file instead of stdout
  import <file>             Import observations from JSONL file (deduplication by content_hash)
  config list               Show all configuration settings
  config get <key>          Show a single configuration value
  config set <key> <value>  Set a configuration value
  observations [limit]      Show recent observations (default: 10)
  summaries [limit]         Show recent summaries (default: 5)
  add-observation <title> <content>   Add a new observation
  add-summary <content>     Add a new summary
  add-knowledge <type> <title> <content>  Store structured knowledge
    Types: constraint, decision, heuristic, rejected
    Options: --severity=hard|soft  --alternatives=a,b,c  --reason=...
             --context=...  --confidence=high|medium|low
             --concepts=a,b  --files=path1,path2
  embeddings stats          Show embedding statistics
  embeddings backfill [n]   Generate embeddings for unprocessed observations
  decay stats               Show decay statistics (stale, never accessed, etc.)
  decay detect-stale        Detect and mark stale observations
  decay consolidate [--dry-run]  Consolidate duplicate observations
  backup create             Crea un backup manuale del database
  backup list               Elenca tutti i backup disponibili con metadata
  backup restore <file>     Ripristina il database da un backup (con conferma)
  worker:start              Start the background worker
  worker:stop               Stop the background worker
  worker:restart            Restart the background worker
  worker:status             Check worker health and PID
  service install           Auto-start worker on boot (crontab or systemd)
  service uninstall         Remove auto-start configuration
  service status            Show auto-start status
  plugins list              Elenca tutti i plugin registrati con stato
  plugins enable <nome>     Abilita un plugin registrato
  plugins disable <nome>    Disabilita un plugin attivo
  share create [options]    Create a read-only sharing token
  share list                List all sharing tokens
  share revoke <id>         Revoke a sharing token
  help                      Show this help message

Examples:
  totalrecall install
  totalrecall doctor
  totalrecall doctor --fix
  totalrecall stats
  totalrecall context
  totalrecall resume
  totalrecall resume 42
  totalrecall report
  totalrecall report --period=monthly --format=md --output=report.md
  totalrecall search "authentication"
  totalrecall search --interactive --project myapp
  totalrecall semantic-search "how did I fix the auth bug"
  totalrecall export --project myapp --format jsonl --output backup.jsonl
  totalrecall export --project myapp --format md > notes.md
  totalrecall import backup.jsonl
  totalrecall backup create
  totalrecall backup list
  totalrecall backup restore backup-2026-02-27-150000.db
  totalrecall worker:start
  totalrecall worker:status
  totalrecall worker:restart
  totalrecall config list
  totalrecall config get worker.port
  totalrecall config set log.level DEBUG
  totalrecall add-knowledge constraint "No any in TypeScript" "Never use any type" --severity=hard
  totalrecall add-knowledge decision "PostgreSQL over MongoDB" "Chosen for ACID" --alternatives=MongoDB,DynamoDB
  totalrecall embeddings stats
  totalrecall embeddings backfill 100
  totalrecall decay stats
  totalrecall decay detect-stale
  totalrecall decay consolidate --dry-run
  totalrecall observations 20
  totalrecall share create --project myapp --expires 7d
  totalrecall share list
  totalrecall share revoke <token-id>
`);
}

// ─── Users Commands (Multi-user Management) ─────────────────────────────────────

/**
 * Handles `totalrecall users <subcommand>`.
 *
 * Subcommands:
 *   create <email> --role admin|editor|viewer  — create user with generated password
 *   list                                        — show all users
 *   role <email> <role>                         — change user role
 *   delete <email>                              — deactivate user
 */
async function handleUsers(subArgs: string[]): Promise<void> {
  const subCommand = subArgs[0];
  const port = process.env.TOTALRECALL_WORKER_PORT || process.env.CONTEXTKIT_WORKER_PORT || '3001';
  const baseUrl = `http://127.0.0.1:${port}`;

  // For users commands, we operate directly on the database (no auth needed for local CLI)
  if (!subCommand || subCommand === 'help') {
    console.log(`
Usage: totalrecall users <subcommand>

Subcommands:
  create <email> [options]  Create a new user
  list                      List all users
  role <email> <role>       Change user role (admin|editor|viewer)
  delete <email>            Deactivate a user

Options for 'create':
  --role <role>     Role: admin, editor, viewer (default: viewer)
  --name <name>     Display name (default: derived from email)
  --password <pwd>  Set password (default: auto-generated)

Examples:
  totalrecall users create admin@example.com --role admin
  totalrecall users list
  totalrecall users role user@example.com editor
  totalrecall users delete old@example.com
`);
    return;
  }

  if (subCommand === 'create') {
    const email = subArgs[1];
    if (!email || !email.includes('@')) {
      console.error('\n  Error: valid email is required.\n  Usage: totalrecall users create <email> --role <role>\n');
      process.exit(1);
    }

    let role = 'viewer';
    let displayName = '';
    let password = '';

    for (let i = 2; i < subArgs.length; i++) {
      const arg = subArgs[i];
      if (arg === '--role' && subArgs[i + 1]) {
        role = subArgs[++i]!;
      } else if (arg === '--name' && subArgs[i + 1]) {
        displayName = subArgs[++i]!;
      } else if (arg === '--password' && subArgs[i + 1]) {
        password = subArgs[++i]!;
      }
    }

    if (!['admin', 'editor', 'viewer'].includes(role)) {
      console.error(`\n  Error: invalid role "${role}". Must be admin, editor, or viewer.\n`);
      process.exit(1);
    }

    // Direct DB access for CLI user creation (no auth needed locally)
    const db = new TotalRecallDatabase();
    try {
      const { getUserByEmail, createUser, countAdmins } = await import('../services/sqlite/Users.js');

      const normalizedEmail = email.toLowerCase().trim();
      const existing = getUserByEmail(db.db, normalizedEmail);
      if (existing) {
        console.error(`\n  Error: user "${normalizedEmail}" already exists.\n`);
        process.exit(1);
      }

      // Hash password
      const crypto = await import('crypto');
      let plainPassword = password || crypto.randomBytes(16).toString('base64url');
      let passwordHash: string;
      try {
        const bcrypt = await import('bcryptjs');
        passwordHash = bcrypt.hashSync(plainPassword, 10);
      } catch {
        passwordHash = crypto.createHash('sha256').update(plainPassword).digest('hex');
      }

      const name = displayName || normalizedEmail.split('@')[0] || normalizedEmail;
      const user = createUser(db.db, normalizedEmail, passwordHash, role as any, name);

      console.log('\n=== User Created ===\n');
      console.log(`  Email:     ${user.email}`);
      console.log(`  Role:      ${user.role}`);
      console.log(`  Name:      ${user.display_name}`);
      if (!password) {
        console.log(`  Password:  ${plainPassword}`);
        console.log('');
        console.log('  ⚠️  Save this password — it will not be shown again.');
      }
      console.log('');
    } finally {
      db.close();
    }
    return;
  }

  if (subCommand === 'list') {
    const db = new TotalRecallDatabase();
    try {
      const { listUsers } = await import('../services/sqlite/Users.js');
      const users = listUsers(db.db);

      if (users.length === 0) {
        console.log('\n  No users found. Create one with: totalrecall users create <email> --role admin\n');
        return;
      }

      console.log('\n=== Total Recall — Users ===\n');
      console.log('  ' + 'Email'.padEnd(30) + 'Role'.padEnd(10) + 'Name'.padEnd(20) + 'Active' + '  Last Login');
      console.log('  ' + '-'.repeat(90));

      for (const user of users) {
        const active = user.is_active ? '✓' : '✗';
        const lastLogin = user.last_login
          ? new Date(user.last_login).toLocaleString()
          : 'never';
        console.log(
          '  ' +
          user.email.padEnd(30) +
          user.role.padEnd(10) +
          (user.display_name || '').padEnd(20) +
          active.padEnd(8) +
          lastLogin
        );
      }
      console.log('');
    } finally {
      db.close();
    }
    return;
  }

  if (subCommand === 'role') {
    const email = subArgs[1];
    const newRole = subArgs[2];

    if (!email || !newRole) {
      console.error('\n  Usage: totalrecall users role <email> <admin|editor|viewer>\n');
      process.exit(1);
    }

    if (!['admin', 'editor', 'viewer'].includes(newRole)) {
      console.error(`\n  Error: invalid role "${newRole}". Must be admin, editor, or viewer.\n`);
      process.exit(1);
    }

    const db = new TotalRecallDatabase();
    try {
      const { getUserByEmail, updateUserRole, countAdmins } = await import('../services/sqlite/Users.js');

      const user = getUserByEmail(db.db, email.toLowerCase().trim());
      if (!user) {
        console.error(`\n  Error: user "${email}" not found.\n`);
        process.exit(1);
      }

      // Prevent removing last admin
      if (user.role === 'admin' && newRole !== 'admin') {
        const adminCount = countAdmins(db.db);
        if (adminCount <= 1) {
          console.error('\n  Error: cannot remove the last admin.\n');
          process.exit(1);
        }
      }

      updateUserRole(db.db, user.id, newRole as any);
      console.log(`\n  Updated: ${user.email} role changed from "${user.role}" to "${newRole}"\n`);
    } finally {
      db.close();
    }
    return;
  }

  if (subCommand === 'delete') {
    const email = subArgs[1];
    if (!email) {
      console.error('\n  Usage: totalrecall users delete <email>\n');
      process.exit(1);
    }

    const db = new TotalRecallDatabase();
    try {
      const { getUserByEmail, deactivateUser, countAdmins } = await import('../services/sqlite/Users.js');

      const user = getUserByEmail(db.db, email.toLowerCase().trim());
      if (!user) {
        console.error(`\n  Error: user "${email}" not found.\n`);
        process.exit(1);
      }

      if (user.role === 'admin') {
        const adminCount = countAdmins(db.db);
        if (adminCount <= 1) {
          console.error('\n  Error: cannot deactivate the last admin.\n');
          process.exit(1);
        }
      }

      deactivateUser(db.db, user.id);
      console.log(`\n  Deactivated: ${user.email}\n`);
    } finally {
      db.close();
    }
    return;
  }

  console.error(`\n  Unknown subcommand: ${subCommand}`);
  console.error('  Use: totalrecall users help\n');
  process.exit(1);
}

// ─── Team Sync Commands ─────────────────────────────────────────────────────────

async function handleTeam(subArgs: string[]): Promise<void> {
  const subCommand = subArgs[0];

  if (!subCommand || subCommand === 'help') {
    console.log(`
  totalrecall team — Sync shared knowledge with your team via Git

  Commands:
    init <repo-url>    Initialize team sync (clone repo, save config)
    push               Export knowledge → commit → push to remote
    pull               Pull from remote → import new knowledge (local wins)
    status             Show sync configuration and state

  Options (init):
    --interval <min>   Auto-sync interval in minutes (default: 60)

  Examples:
    totalrecall team init git@github.com:my-org/shared-knowledge.git
    totalrecall team push
    totalrecall team pull
    totalrecall team status
`);
    return;
  }

  if (subCommand === 'init') {
    const repoUrl = subArgs[1];
    if (!repoUrl) {
      console.error('  Error: Please provide a repository URL.\n  Example: totalrecall team init git@github.com:org/repo.git\n');
      process.exit(1);
    }

    const intervalIdx = subArgs.indexOf('--interval');
    const syncInterval = intervalIdx >= 0 ? parseInt(subArgs[intervalIdx + 1] ?? '60', 10) : 60;

    try {
      const config = initTeamConfig(repoUrl, { syncInterval });
      console.log(`\n  ✅ Team sync initialized.`);
      console.log(`     Repo: ${config.repoUrl}`);
      console.log(`     Local: ${config.localPath}`);
      console.log(`     Sync interval: ${config.syncInterval} min\n`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`  ❌ Failed to initialize team sync: ${msg}\n`);
      process.exit(1);
    }
    return;
  }

  if (subCommand === 'push') {
    const config = loadTeamConfig();
    if (!config) {
      console.error('  ❌ Team sync not initialized. Run: totalrecall team init <repo-url>\n');
      process.exit(1);
    }

    const db = new TotalRecallDatabase();
    try {
      console.log('  Exporting knowledge and pushing...');
      const result = pushKnowledge(db.db, config);

      console.log(`\n  ✅ Push complete.`);
      console.log(`     Exported: ${result.exported} items`);
      if (result.errors.length > 0) {
        console.log(`     ⚠️  Errors:`);
        for (const err of result.errors) {
          console.log(`        - ${err}`);
        }
      }
      console.log('');
    } finally {
      db.close();
    }
    return;
  }

  if (subCommand === 'pull') {
    const config = loadTeamConfig();
    if (!config) {
      console.error('  ❌ Team sync not initialized. Run: totalrecall team init <repo-url>\n');
      process.exit(1);
    }

    const db = new TotalRecallDatabase();
    try {
      console.log('  Pulling from remote and importing...');
      const result = pullKnowledge(db.db, config);

      console.log(`\n  ✅ Pull complete.`);
      console.log(`     Imported: ${result.imported} items`);
      if (result.conflicts.length > 0) {
        console.log(`     ℹ️  Conflicts (local wins):`);
        for (const conflict of result.conflicts) {
          console.log(`        - ${conflict}`);
        }
      }
      if (result.errors.length > 0) {
        console.log(`     ⚠️  Errors:`);
        for (const err of result.errors) {
          console.log(`        - ${err}`);
        }
      }
      console.log('');
    } finally {
      db.close();
    }
    return;
  }

  if (subCommand === 'status') {
    const config = loadTeamConfig();
    if (!config) {
      console.log('\n  Team sync: not configured');
      console.log('  Run: totalrecall team init <repo-url>\n');
      return;
    }

    const status = getTeamStatus(config);
    console.log(`\n  📡 Team Sync Status`);
    console.log(`     Repo:       ${status.repoUrl}`);
    console.log(`     Local path: ${status.localPath}`);
    console.log(`     Last sync:  ${status.lastSync || 'never'}`);
    console.log(`     Interval:   ${status.syncInterval} min`);
    console.log(`     Shared items: ${status.localKnowledgeCount} files\n`);
    return;
  }

  console.error(`  Unknown team subcommand: ${subCommand}`);
  console.error('  Use: init | push | pull | status\n');
  process.exit(1);
}

main().catch(console.error);
