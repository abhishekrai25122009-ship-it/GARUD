const fs = require('fs');
const css = fs.readFileSync('src/index.css', 'utf8');
const lines = css.split('\n');
lines.forEach((line, idx) => {
  if (line.includes('====') || (line.startsWith('/*') && line.includes('---'))) {
    console.log(`${idx + 1}: ${line.trim()}`);
  }
});
