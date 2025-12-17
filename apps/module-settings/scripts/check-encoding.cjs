/* Guard to fail CI/build when replacement characters or suspicious dashes are present in source */
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

const letterClass = 'A-Za-zČŠŽčšž';
const dashBetweenLetters = new RegExp(`[${letterClass}][\\u2013\\u2014][${letterClass}]`, 'u');
const issues = [];

for (const file of walk(path.join(__dirname, '..', 'src'))) {
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split(/\r?\n/);
  lines.forEach((line, index) => {
    if (line.includes('\uFFFD')) {
      issues.push({ file, line: index + 1, reason: 'replacement character (�) detected', snippet: line.trim() });
    }
    if (/[\u0096\u0097]/.test(line)) {
      issues.push({ file, line: index + 1, reason: 'control dash character (\\u0096/\\u0097) detected', snippet: line.trim() });
    }
    if (dashBetweenLetters.test(line)) {
      issues.push({ file, line: index + 1, reason: 'suspicious dash between letters (\\u2013/\\u2014)', snippet: line.trim() });
    }
  });
}

if (issues.length) {
  console.error('Encoding check failed due to suspicious characters:');
  issues.forEach(({ file, line, reason, snippet }) => {
    console.error(` - ${file}:${line} -> ${reason}`);
    if (snippet) {
      console.error(`     ${snippet}`);
    }
  });
  process.exit(1);
} else {
  console.log('Encoding check passed (no replacement or suspicious dash characters found).');
}
