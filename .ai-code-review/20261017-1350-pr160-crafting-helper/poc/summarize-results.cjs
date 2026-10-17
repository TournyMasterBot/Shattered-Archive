// Turns a `jest --json --outputFile=...` report into a compact markdown table: one row per test, grouped by
// the top-level describe (= finding id), with the first meaningful line of the failure for red tests.
// Usage: node summarize-results.cjs <jest.json> <out.md> "<title>"
const fs = require('fs');

const [, , jsonPath, outPath, title] = process.argv;
const report = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
const ANSI = /\x1b\[[0-9;?]*[A-Za-z]/g;

const groups = new Map();
let passed = 0;
let failed = 0;
for (const suite of report.testResults) {
  for (const t of suite.assertionResults) {
    const top = t.ancestorTitles[0] || '(no group)';
    if (!groups.has(top)) groups.set(top, []);
    const ok = t.status === 'passed';
    ok ? passed++ : failed++;
    let why = '';
    if (!ok) {
      const lines = (t.failureMessages[0] || '').replace(ANSI, '').split('\n').map((l) => l.trim()).filter(Boolean);
      // prefer the assertion line ("Expected ...") over the matcher header
      why = (lines.find((l) => /^(Expected|Received|expect\()/.test(l)) || lines[0] || '').slice(0, 140);
      const exp = lines.find((l) => /^Expected/.test(l));
      const rec = lines.find((l) => /^Received/.test(l));
      if (exp && rec) why = `${exp.slice(0, 70)} | ${rec.slice(0, 70)}`;
    }
    groups.get(top).push({ name: t.fullName.replace(top + ' ', ''), ok, why });
  }
}

const out = [];
out.push(`# ${title}`, '');
out.push(`${passed + failed} tests: **${passed} passed**, **${failed} failed** (${new Date().toISOString()})`, '');
for (const [group, rows] of groups) {
  const f = rows.filter((r) => !r.ok).length;
  out.push(`## ${group}`, '', `${rows.length - f} passed, ${f} failed`, '', '| result | test | first failure line |', '|---|---|---|');
  for (const r of rows) out.push(`| ${r.ok ? 'pass' : '**FAIL**'} | ${r.name.replace(/\|/g, '\\|')} | ${r.why.replace(/\|/g, '\\|')} |`);
  out.push('');
}
fs.writeFileSync(outPath, out.join('\n'));
console.log(`${passed} passed, ${failed} failed -> ${outPath}`);
