import { execFileSync } from 'node:child_process';
import { repoRoot } from './shared.mjs';

const args = process.argv.slice(2);
const moduleIndex = args.indexOf('--module');
const moduleName = moduleIndex >= 0 ? args[moduleIndex + 1] : 'settings';
const apply = args.includes('--apply');

if (moduleName !== 'settings') {
  console.error(`Unsupported module for v1 pipeline: ${moduleName}`);
  process.exit(1);
}

const steps = [
  { name: 'inventory', file: 'tools/ui-migration/inventory.mjs', args: [] },
  {
    name: 'codemod-settings',
    file: 'tools/ui-migration/codemod-settings.mjs',
    args: [apply ? '--apply' : '--dry-run']
  },
  { name: 'verify', file: 'tools/ui-migration/verify.mjs', args: [], continueOnError: true },
  { name: 'report', file: 'tools/ui-migration/report.mjs', args: [] }
];

let failed = false;

for (const step of steps) {
  process.stdout.write(`\n[ui-migration] ${step.name}\n`);
  try {
    if (process.platform === 'win32') {
      const cmd = ['node', step.file, ...step.args].join(' ');
      execFileSync('powershell.exe', ['-NoProfile', '-Command', cmd], { cwd: repoRoot, stdio: 'inherit' });
    } else {
      execFileSync('node', [step.file, ...step.args], { cwd: repoRoot, stdio: 'inherit' });
    }
  } catch (error) {
    failed = true;
    if (!step.continueOnError) {
      throw error;
    }
  }
}

const mode = apply ? 'apply' : 'dry-run';
console.log(`\nUI migration pipeline finished for module=${moduleName}, mode=${mode}`);
if (failed) {
  process.exitCode = 1;
}
