const fs = require('fs');
let css = fs.readFileSync('src/index.css', 'utf8');

// Replacement map for hardcoded colors
const replacements = [
  // Backgrounds: old green/black shades -> new navy/aerospace shades
  ['#050b08', 'var(--bg-secondary)'],
  ['#040706', 'var(--bg-main)'],
  ['#020403', 'var(--bg-main)'],
  ['#060e0a', 'var(--bg-panel)'],
  ['#070e0a', 'var(--bg-panel)'],
  ['#091610', 'var(--bg-interactive)'],
  ['#08140e', 'var(--bg-interactive)'],
  ['#0b1510', 'var(--bg-interactive)'],
  ['#0e1b15', 'var(--bg-interactive)'],
  ['#040906', 'var(--bg-main)'],
  ['#08120d', 'var(--bg-panel)'],
  ['#091a18', 'var(--bg-panel)'],
  ['#081610', 'var(--bg-interactive)'],
  ['#08110c', 'var(--bg-secondary)'],
  ['#060d09', 'var(--bg-secondary)'],
  ['#030805', 'var(--bg-main)'],
  ['#091510', 'var(--bg-interactive)'],
  ['#0c2017', 'var(--bg-hover)'],
  ['#020604', 'var(--bg-main)'],
  ['#020503', 'var(--bg-main)'],
  ['#040807', 'var(--bg-main)'],
  ['#050a08', 'var(--bg-main)'],
  ['#050e09', 'var(--bg-secondary)'],
  ['#07130d', 'var(--bg-secondary)'],
  ['#07100b', 'var(--bg-secondary)'],
  ['#0a1813', 'var(--bg-panel)'],
  ['#0a1c14', 'var(--bg-panel)'],
  ['#0d1a15', 'var(--bg-panel)'],
  ['#0d1e17', 'var(--bg-interactive)'],
  ['#10221a', 'var(--bg-interactive)'],
  ['#11251c', 'var(--bg-interactive)'],
  ['#142b20', 'var(--bg-hover)'],

  // Old borders
  ['#162c20', 'var(--border)'],
  ['#244934', 'var(--border-bright)'],
  ['#1a3527', 'var(--border)'],
  ['#1e3d2d', 'var(--border)'],
  ['#183626', 'var(--border)'],
  ['#1a3d32', 'var(--border)'],
  ['#13271d', 'var(--border)'],

  // Old greens used as text or outlines
  ['#e2f0ea', 'var(--text-primary)'],
  ['#8fa89b', 'var(--text-secondary)'],
  ['#536b5e', 'var(--text-muted)'],
  ['#9fb8ab', 'var(--text-secondary)'],
  ['#22c55e', 'var(--confirmed-positive)'],
  ['#4ade80', 'var(--friendly-normal)'],
  ['#10b981', 'var(--confirmed-positive)'],

  // Cyans: old pure cyan -> brand cyan
  ['#00f0ff', 'var(--brand-cyan)'],
  ['#00c4d1', 'var(--brand-cyan)'],

  // Ambers / Oranges: caution / warning
  ['#f59e0b', 'var(--caution)'],
  ['#d97706', 'var(--warning)'],
  ['#f97316', 'var(--warning)'],

  // Reds: critical
  ['#ef4444', 'var(--critical)'],
  ['#dc2626', 'var(--critical)'],
  ['#f87171', 'var(--critical)'],
];

console.log('Original CSS length:', css.length);
for (const [target, replacement] of replacements) {
  // Replace case-insensitively for hexes
  const re = new RegExp(target.replace('#', '#'), 'gi');
  css = css.replace(re, replacement);
}
console.log('Processed CSS length:', css.length);
fs.writeFileSync('src/index.css', css, 'utf8');
console.log('Wrote updated src/index.css');
