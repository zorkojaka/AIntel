import fs from 'node:fs';
import path from 'node:path';
import { gitCurrentBranch, gitShortSha, gitStatusShort, outDir, readJson, repoRoot, specPath } from './shared.mjs';

function maybeRead(file) {
  if (!fs.existsSync(file)) return null;
  return readJson(file);
}

const spec = readJson(specPath);
const inventory = maybeRead(path.join(outDir, 'latest-inventory.json'));
const codemod = maybeRead(path.join(outDir, 'latest-codemod-settings.json'));
const verify = maybeRead(path.join(outDir, 'latest-verify.json'));
const branch = gitCurrentBranch();
const sha = gitShortSha();
const status = gitStatusShort().trim() || '(clean)';

const lines = [];
lines.push('# UI Migration Report');
lines.push('');
lines.push(`- Generated: ${new Date().toISOString()}`);
lines.push(`- Branch: ${branch}`);
lines.push(`- Base SHA: ${sha}`);
lines.push(`- Selected concept: ${spec.selectedConcept}`);
lines.push('');
lines.push('## Inventory');
if (inventory) {
  lines.push(`- Files scanned: ${inventory.fileCount}`);
  lines.push(`- Modules scanned: ${inventory.moduleCount}`);
} else {
  lines.push('- Missing inventory output');
}
lines.push('');
lines.push('## Codemod (settings)');
if (codemod) {
  lines.push(`- Mode: ${codemod.mode}`);
  lines.push(`- Files changed: ${codemod.changes.length}`);
  for (const change of codemod.changes) {
    lines.push(`- ${change.file}: ${change.reason}`);
  }
} else {
  lines.push('- Missing codemod output');
}
lines.push('');
lines.push('## Verification');
if (verify) {
  lines.push(`- Result: ${verify.passed ? 'PASS' : 'FAIL'}`);
  for (const res of verify.results) {
    lines.push(`- ${res.name}: ${res.status.toUpperCase()}`);
  }
} else {
  lines.push('- Missing verify output');
}
lines.push('');
lines.push('## Git Status');
lines.push('```text');
lines.push(status);
lines.push('```');
lines.push('');
lines.push('## Next Step');
lines.push('- If verify fails, inspect output under `tools/ui-migration/out` and rerun only failed checks.');
lines.push('- If verify passes, commit this step and continue with dashboard module pipeline.');

const outFile = path.join(repoRoot, 'tools', 'ui-migration', 'MIGRATION_REPORT.md');
fs.writeFileSync(outFile, `${lines.join('\n')}\n`, 'utf8');
console.log(`Report written: tools/ui-migration/MIGRATION_REPORT.md`);
