const fs = require('fs');
const path = require('path');

function getAllFiles(dir, all = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '.git' && entry.name !== 'dist' && entry.name !== 'scratch') {
        getAllFiles(full, all);
      }
    } else {
      all.push(full);
    }
  }
  return all;
}

const root = path.resolve('.');
const files = getAllFiles(root);
console.log('Total files checked:', files.length);

// Also collect actual casing for every path on disk
function checkExactPathExists(filePath) {
  const parts = path.relative(root, filePath).split(path.sep);
  let current = root;
  for (const part of parts) {
    if (!part || part === '.') continue;
    const entries = fs.readdirSync(current);
    if (!entries.includes(part)) {
      return { exists: false, failedPart: part, current, entries };
    }
    current = path.join(current, part);
  }
  return { exists: true };
}

let errors = [];

for (const file of files) {
  if (!file.endsWith('.ts') && !file.endsWith('.tsx') && !file.endsWith('.html') && !file.endsWith('.css')) continue;
  const content = fs.readFileSync(file, 'utf8');
  
  // match import ... from '...' or import '...'
  const importRegex = /(?:import|from)\s+['"](\.[^'"]+)['"]/g;
  let match;
  while ((match = importRegex.exec(content)) !== null) {
    const importPath = match[1];
    const dir = path.dirname(file);
    const resolvedBase = path.resolve(dir, importPath);

    // Try extensions
    const candidates = [
      resolvedBase,
      resolvedBase + '.ts',
      resolvedBase + '.tsx',
      resolvedBase + '.d.ts',
      resolvedBase + '.js',
      resolvedBase + '.jsx',
      resolvedBase + '.css',
      resolvedBase + '.svg',
      resolvedBase + '.png',
      path.join(resolvedBase, 'index.ts'),
      path.join(resolvedBase, 'index.tsx'),
    ];

    let found = null;
    for (const cand of candidates) {
      if (fs.existsSync(cand)) {
        found = cand;
        break;
      }
    }

    if (!found) {
      errors.push({ file, importPath, reason: 'File does not exist' });
    } else {
      const exactCheck = checkExactPathExists(found);
      if (!exactCheck.exists) {
        errors.push({
          file,
          importPath,
          reason: `Case mismatch: part "${exactCheck.failedPart}" in ${exactCheck.current}`,
          entries: exactCheck.entries
        });
      }
    }
  }

  // Also check <script src="..."> and <link href="..."> in html files
  if (file.endsWith('.html')) {
    const htmlRegex = /(?:src|href)=['"](\/[^'"]+|\.[^'"]+)['"]/g;
    let hMatch;
    while ((hMatch = htmlRegex.exec(content)) !== null) {
      const srcPath = hMatch[1];
      if (srcPath.startsWith('http') || srcPath.startsWith('data:')) continue;
      const target = srcPath.startsWith('/') ? path.join(root, srcPath) : path.resolve(path.dirname(file), srcPath);
      if (!fs.existsSync(target)) {
        errors.push({ file, importPath: srcPath, reason: 'HTML reference does not exist' });
      } else {
        const exactCheck = checkExactPathExists(target);
        if (!exactCheck.exists) {
          errors.push({ file, importPath: srcPath, reason: `HTML case mismatch: ${exactCheck.failedPart}` });
        }
      }
    }
  }
}

console.log('Errors found:', JSON.stringify(errors, null, 2));
