import fs from 'node:fs';
import path from 'node:path';
import { ensureDir, nowStamp, outDir, repoRoot, relativeToRepo, specPath, readJson, walkFiles } from './shared.mjs';

const includeExtensions = new Set(['.ts', '.tsx', '.css', '.scss', '.html']);
const appRoot = path.join(repoRoot, 'apps');
const timestamp = nowStamp();
const runDir = path.join(outDir, timestamp);
ensureDir(runDir);

const files = walkFiles(appRoot, (full) => includeExtensions.has(path.extname(full)));
const modules = new Map();

for (const file of files) {
  const rel = relativeToRepo(file);
  const parts = rel.split('/');
  const moduleName = parts[1] ?? 'unknown';
  const raw = fs.readFileSync(file, 'utf8');
  const lines = raw.split(/\r?\n/).length;
  const imports = (raw.match(/from\s+['"]/g) ?? []).length;
  const cssVars = (raw.match(/var\(--/g) ?? []).length;
  const hardcodedHex = (raw.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).length;
  const tailwindClasses = (raw.match(/className=["'`][^"'`]*["'`]/g) ?? []).length;

  if (!modules.has(moduleName)) {
    modules.set(moduleName, {
      module: moduleName,
      files: 0,
      lines: 0,
      imports: 0,
      cssVars: 0,
      hardcodedHex: 0,
      tailwindClassAttrs: 0
    });
  }
  const item = modules.get(moduleName);
  item.files += 1;
  item.lines += lines;
  item.imports += imports;
  item.cssVars += cssVars;
  item.hardcodedHex += hardcodedHex;
  item.tailwindClassAttrs += tailwindClasses;
}

const spec = readJson(specPath);
const summary = {
  generatedAt: new Date().toISOString(),
  appRoot: relativeToRepo(appRoot),
  fileCount: files.length,
  moduleCount: modules.size,
  selectedConcept: spec.selectedConcept,
  modules: Array.from(modules.values()).sort((a, b) => a.module.localeCompare(b.module))
};

const outFile = path.join(runDir, 'inventory.json');
fs.writeFileSync(outFile, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
fs.writeFileSync(path.join(outDir, 'latest-inventory.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');

console.log(`Inventory written: ${relativeToRepo(outFile)}`);
