import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
export const repoRoot = path.resolve(path.dirname(currentFile), '..', '..');
export const outDir = path.join(repoRoot, 'tools', 'ui-migration', 'out');
export const backupsDir = path.join(repoRoot, 'tools', 'ui-migration', 'backups');
export const specPath = path.join(repoRoot, 'tools', 'ui-migration', 'target-spec.json');

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function writeJson(file, data) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

export function nowStamp() {
  const now = new Date();
  const iso = now.toISOString().replace(/[:.]/g, '-');
  return iso;
}

export function gitCurrentBranch() {
  return execFileSync('git', ['branch', '--show-current'], { cwd: repoRoot, encoding: 'utf8' }).trim();
}

export function gitShortSha() {
  return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim();
}

export function gitStatusShort() {
  return execFileSync('git', ['status', '--short'], { cwd: repoRoot, encoding: 'utf8' });
}

export function walkFiles(dir, include) {
  const files = [];
  if (!fs.existsSync(dir)) return files;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(full, include));
    } else if (include(full)) {
      files.push(full);
    }
  }
  return files;
}

export function relativeToRepo(absPath) {
  return path.relative(repoRoot, absPath).replace(/\\/g, '/');
}
