import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { ensureDir, nowStamp, outDir, repoRoot, writeJson } from './shared.mjs';

const timestamp = nowStamp();
const runDir = path.join(outDir, timestamp);
ensureDir(runDir);

const checks = [
  { name: 'settings-build', cmd: 'pnpm', args: ['--filter', '@aintel/module-settings', 'build'] },
  { name: 'core-shell-build', cmd: 'pnpm', args: ['--filter', '@aintel/core-shell', 'build'] }
];

const results = [];
function runCheck(check) {
  if (process.platform === 'win32') {
    const psCmd = `pnpm ${check.args.join(' ')}`;
    return execFileSync('powershell.exe', ['-NoProfile', '-Command', psCmd], {
      cwd: repoRoot,
      stdio: 'pipe',
      encoding: 'utf8'
    });
  }
  return execFileSync('pnpm', check.args, { cwd: repoRoot, stdio: 'pipe', encoding: 'utf8' });
}

for (const check of checks) {
  try {
    runCheck(check);
    results.push({ ...check, status: 'passed' });
  } catch (error) {
    results.push({
      ...check,
      status: 'failed',
      error: error instanceof Error ? error.message.slice(0, 5000) : String(error)
    });
  }
}

const passed = results.every((r) => r.status === 'passed');
const summary = {
  generatedAt: new Date().toISOString(),
  passed,
  results
};

writeJson(path.join(runDir, 'verify.json'), summary);
writeJson(path.join(outDir, 'latest-verify.json'), summary);
console.log(`Verify completed: ${passed ? 'passed' : 'failed'}`);
if (!passed) process.exitCode = 1;
