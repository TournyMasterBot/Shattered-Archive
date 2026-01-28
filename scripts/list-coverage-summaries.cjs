/* eslint-disable no-console */
const fs = require('fs');

const files = [
  ['server', './coverage/server/coverage-summary.json'],
  ['client', './coverage/client/coverage-summary.json'],
];

const out = [];
for (const [title, p] of files) {
  if (fs.existsSync(p)) out.push(`${title}, ${p}`);
}

if (!out.length) {
  console.error('No coverage summaries found at coverage/server or coverage/client.');
  process.exit(1);
}

console.log(out.join('\n'));
