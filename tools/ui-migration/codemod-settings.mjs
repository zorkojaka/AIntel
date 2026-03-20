import fs from 'node:fs';
import path from 'node:path';
import { backupsDir, ensureDir, nowStamp, outDir, readJson, repoRoot, relativeToRepo, specPath, writeJson } from './shared.mjs';

const args = new Set(process.argv.slice(2));
const isApply = args.has('--apply');
const isDryRun = args.has('--dry-run') || !isApply;

const spec = readJson(specPath);
const timestamp = nowStamp();
const runDir = path.join(outDir, timestamp);
ensureDir(runDir);

const moduleRoot = path.join(repoRoot, 'apps', 'module-settings', 'src');
const globalsCssPath = path.join(moduleRoot, 'globals.css');
const indexCssPath = path.join(moduleRoot, 'index.css');
const tokensPath = path.join(moduleRoot, 'theme.tokens.css');

const changes = [];

function backupFile(filePath) {
  const rel = relativeToRepo(filePath);
  const backupFilePath = path.join(backupsDir, timestamp, rel);
  ensureDir(path.dirname(backupFilePath));
  fs.copyFileSync(filePath, backupFilePath);
  return backupFilePath;
}

function safeWrite(filePath, nextContent, reason) {
  const prev = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
  if (prev === nextContent) return;

  changes.push({
    file: relativeToRepo(filePath),
    reason,
    mode: isDryRun ? 'dry-run' : 'apply'
  });

  if (isDryRun) return;
  if (fs.existsSync(filePath)) backupFile(filePath);
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, nextContent, 'utf8');
}

const t = spec.tokens;
const tokenCss = `:root {
  --app-bg: ${t.color.bg};
  --app-surface: ${t.color.surface};
  --app-border: ${t.color.border};
  --app-text: ${t.color.text};
  --app-muted-text: ${t.color.mutedText};
  --app-brand: ${t.color.brand};
  --app-brand-contrast: ${t.color.brandContrast};
  --app-success: ${t.color.success};
  --app-warning: ${t.color.warning};
  --app-danger: ${t.color.danger};

  --app-radius-sm: ${t.radius.sm};
  --app-radius-md: ${t.radius.md};
  --app-radius-lg: ${t.radius.lg};
  --app-radius-xl: ${t.radius.xl};

  --app-space-xs: ${t.spacing.xs};
  --app-space-sm: ${t.spacing.sm};
  --app-space-md: ${t.spacing.md};
  --app-space-lg: ${t.spacing.lg};
  --app-space-xl: ${t.spacing.xl};

  --app-shadow-card: ${t.shadow.card};
}
`;

safeWrite(tokensPath, tokenCss, 'Create module settings tokens based on target spec');

if (fs.existsSync(indexCssPath)) {
  const current = fs.readFileSync(indexCssPath, 'utf8');
  const importLine = "@import url('./theme.tokens.css');";
  const next = current.includes(importLine) ? current : `${importLine}\n${current}`;
  safeWrite(indexCssPath, next, 'Import generated theme tokens');
}

if (fs.existsSync(globalsCssPath)) {
  const current = fs.readFileSync(globalsCssPath, 'utf8');
  const existing = current.includes('--app-bg');
  if (!existing) {
    const append = `
/* ui-migration: bridge old vars to new tokens */
:root {
  --background: var(--app-bg);
  --foreground: var(--app-text);
  --card: var(--app-surface);
  --card-foreground: var(--app-text);
  --border: var(--app-border);
  --muted-foreground: var(--app-muted-text);
  --primary: var(--app-brand);
  --primary-foreground: var(--app-brand-contrast);
  --success: var(--app-success);
  --destructive: var(--app-danger);
}
`;
    safeWrite(globalsCssPath, `${current.trimEnd()}\n${append}`, 'Bridge legacy CSS vars to target tokens');
  }
}

const result = {
  module: 'settings',
  mode: isDryRun ? 'dry-run' : 'apply',
  generatedAt: new Date().toISOString(),
  changes
};

const outFile = path.join(runDir, `codemod-settings-${result.mode}.json`);
writeJson(outFile, result);
writeJson(path.join(outDir, 'latest-codemod-settings.json'), result);
console.log(`Codemod (${result.mode}) completed. Changes: ${changes.length}`);
