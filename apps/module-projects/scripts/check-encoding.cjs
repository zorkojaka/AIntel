/* Simple guard to fail CI/build when replacement characters (�) are present in source */
const fs = require('fs');
const path = require('path');

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, files);
    } else if (/\.(t|j)sx?$/.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

const badFiles = [];
for (const file of walk(path.join(__dirname, '..', 'src'))) {
  const content = fs.readFileSync(file, 'utf8');
  if (content.includes('\uFFFD')) {
    badFiles.push(file);
  }
}

if (badFiles.length) {
  console.error('Encoding check failed. Found replacement characters (�) in:');
  badFiles.forEach((f) => console.error(` - ${f}`));
  process.exit(1);
} else {
  console.log('Encoding check passed (no � characters found).');
}
