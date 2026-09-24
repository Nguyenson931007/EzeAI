const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '../..');
const backendDir = path.join(projectRoot, 'backend');
const envPath = path.join(projectRoot, '.env');

function loadProjectEnv() {
  if (!fs.existsSync(envPath)) {
    throw new Error(`Missing project env file: ${envPath}`);
  }

  const values = {};
  for (const rawLine of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    values[key] = value;
  }
  return values;
}

function resolveSqlitePath(env) {
  const configured = env.SQLITE_PATH || 'storage/ezefloor.db';
  return path.isAbsolute(configured)
    ? configured
    : path.resolve(backendDir, configured);
}

module.exports = { loadProjectEnv, resolveSqlitePath, backendDir, projectRoot };
