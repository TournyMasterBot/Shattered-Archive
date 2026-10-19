// Corpus evidence for the PR #160 review.
//
// Measures how the plugin's trigger lines REALLY appear in game output: whole line vs prompt-prefixed vs
// embedded in player speech, the observed range of Condition % and skill-up levels, which command precedes
// "You stop crafting.", and craft->outcome latency.
//
// Two corpora, one script:
//   node corpus-scan.cjs jsonl <docker game-server root> <out.json>
//       wire-order jsonl (game:remote-server:raw + game:client:input). Raw payloads may not be line aligned,
//       so lines are rebuilt by buffering and splitting on \n. Gives command/latency evidence too.
//   node corpus-scan.cjs txt <GameLogs folder> <out.json>
//       the older GameLog-DSL_*.txt player logs (one logical line per line, no input echo).
//
// Method (project log-search rules): strip ANSI, unescape JSON (JSON.parse does it), match UNQUOTED needles,
// report counts + ONE redacted sample per shape, never raw dumps. Player names are redacted in samples.
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const mode = process.argv[2];
const root = process.argv[3];
const outFile = process.argv[4];

const ANSI = /\x1b\[[0-9;?]*[A-Za-z]/g;
const SPEECH =
  /\b(says?|tells? you|gossips?|shouts?|yells?|asks?|exclaims?|chats?|auctions?|grats|OOC|clan|group|newbie)\b/i;

// The strings / patterns the plugin matches today (crafting-helper.plugin.ts:657-694).
const NEEDLES = {
  craftSuccess: 'You were successful.',
  craftDestroyed: 'You failed and destroyed some materials in the process.',
  craftNoLoss: 'You failed but did not lose any materials.',
  vaultFailure: 'I see nothing like that in the vault.',
  craftInterrupted: 'You stop crafting.',
  copyover: 'Copyover recovery complete.',
  skillUp: /Your crafting skill has improved\.\s*\((\d+)\)/,
  condition: /Condition:\s*[^(]+\(\s*(\d+)%\s*\)/,
};

const stats = {};
for (const k of Object.keys(NEEDLES)) {
  stats[k] = { total: 0, whole: 0, promptPrefixed: 0, speech: 0, otherPrefixOrSuffix: 0, shapes: {}, samples: {} };
}
const extra = {
  filesScanned: 0, lines: 0,
  skillUpValues: { min: null, max: null, over1001: 0, count: 0 },
  conditionValues: { min: null, max: null, over100: 0, count: 0 },
  precedingCommandForInterrupt: {},
  interruptDeltaMs: [], craftToOutcomeMs: [], craftInputs: 0, doubleCraftWithin30s: 0,
};

function redact(s) {
  return s
    .replace(/^([A-Z][A-Za-z']{1,20})(\s+(?:says?|tells? you|gossips?|shouts?|yells?|asks?|exclaims?|chats?|auctions?|grats|OOC)\b)/, '<Name>$2')
    .slice(0, 160);
}
function shape(p) { return redact(p.replace(/\d+/g, 'N')).replace(/\s+/g, ' ').slice(0, 80) || '(none)'; }
function bump(map, key) { map[key] = (map[key] || 0) + 1; }
function minmax(o, v) { o.count++; o.min = o.min == null ? v : Math.min(o.min, v); o.max = o.max == null ? v : Math.max(o.max, v); }
function quantiles(a) {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return { n: s.length, min: s[0], p50: q(0.5), p95: q(0.95), max: s[s.length - 1] };
}
function findNeedle(key, line) {
  const n = NEEDLES[key];
  if (typeof n === 'string') { const i = line.indexOf(n); return i < 0 ? null : { index: i, len: n.length, m: null }; }
  const m = line.match(n);
  return m ? { index: m.index, len: m[0].length, m } : null;
}
function classify(key, line, hit) {
  const s = stats[key];
  s.total++;
  const prefix = line.slice(0, hit.index).trim();
  const suffix = line.slice(hit.index + hit.len).trim();
  let cat;
  if (!prefix && !suffix) cat = 'whole';
  else if (/^(<[^<>]*>\s*)+$/.test(prefix) && !suffix) cat = 'promptPrefixed';
  else if (SPEECH.test(line) || /['"]/.test(prefix)) cat = 'speech';
  else cat = 'otherPrefixOrSuffix';
  s[cat]++;
  if (cat !== 'whole') bump(s.shapes, `${cat}: ${shape(prefix)} ⟂ ${shape(suffix)}`);
  if (!s.samples[cat]) s.samples[cat] = redact(line);
}
// ctx carries wire-order state (jsonl only)
function processLine(line, t, ctx) {
  extra.lines++;
  for (const key of Object.keys(NEEDLES)) {
    const hit = findNeedle(key, line);
    if (!hit) continue;
    classify(key, line, hit);
    if (key === 'skillUp') { const v = parseInt(hit.m[1], 10); minmax(extra.skillUpValues, v); if (v > 1001) extra.skillUpValues.over1001++; }
    if (key === 'condition') { const v = parseInt(hit.m[1], 10); minmax(extra.conditionValues, v); if (v > 100) extra.conditionValues.over100++; }
    if (!ctx) continue;
    if (key === 'craftInterrupted' && ctx.lastInput) {
      bump(extra.precedingCommandForInterrupt, ctx.lastInput.cmd.split(/\s+/)[0].toLowerCase());
      extra.interruptDeltaMs.push(t - ctx.lastInput.t);
    }
    if ((key === 'craftSuccess' || key === 'craftDestroyed' || key === 'craftNoLoss') && ctx.pendingOutcomeFrom != null) {
      extra.craftToOutcomeMs.push(t - ctx.pendingOutcomeFrom);
      ctx.pendingOutcomeFrom = null;
    }
  }
}

async function scanJsonl(file) {
  extra.filesScanned++;
  const ctx = { lastInput: null, lastCraftInput: null, pendingOutcomeFrom: null };
  let buf = '';
  const rl = readline.createInterface({ input: fs.createReadStream(file, 'utf8'), crlfDelay: Infinity });
  for await (const raw of rl) {
    let o;
    try { o = JSON.parse(raw); } catch { continue; }
    const t = Date.parse(o.timestamp);
    if (o.type === 'game:client:input') {
      let p = o.payload;
      try { if (typeof p === 'string') p = JSON.parse(p); } catch { continue; }
      if (p && p.type === 'data' && typeof p.data === 'string') {
        const cmd = p.data.trim();
        ctx.lastInput = { cmd, t };
        if (/^craft\s/i.test(cmd)) {
          extra.craftInputs++;
          if (ctx.lastCraftInput != null && t - ctx.lastCraftInput < 30000) extra.doubleCraftWithin30s++;
          ctx.lastCraftInput = t; ctx.pendingOutcomeFrom = t;
        }
      }
      continue;
    }
    if (o.type !== 'game:remote-server:raw') continue;
    const data = o.payload && o.payload.data;
    if (typeof data !== 'string') continue;
    buf += data.replace(ANSI, '').replace(/\r/g, '');
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
      if (line.trim()) processLine(line, t, ctx);
    }
  }
}
async function scanTxt(file) {
  extra.filesScanned++;
  const rl = readline.createInterface({ input: fs.createReadStream(file, 'utf8'), crlfDelay: Infinity });
  for await (const raw of rl) {
    const line = raw.replace(ANSI, '').replace(/\r/g, '');
    if (line.trim()) processLine(line, 0, null);
  }
}
function walk(dir, ext, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'Compressed') walk(p, ext, out); }
    else if (e.name.endsWith(ext)) out.push(p);
  }
  return out;
}

(async () => {
  const files = walk(root, mode === 'jsonl' ? '.jsonl' : '.txt', []).sort();
  for (const f of files) await (mode === 'jsonl' ? scanJsonl(f) : scanTxt(f));
  const top = (m) => Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const result = {
    mode, scannedAt: new Date().toISOString(), root, filesScanned: extra.filesScanned, logicalLines: extra.lines,
    needles: Object.fromEntries(Object.entries(stats).map(([k, s]) => [k, {
      total: s.total, whole: s.whole, promptPrefixed: s.promptPrefixed, speech: s.speech,
      otherPrefixOrSuffix: s.otherPrefixOrSuffix, topNonWholeShapes: top(s.shapes), samples: s.samples,
    }])),
    skillUpValues: extra.skillUpValues, conditionValues: extra.conditionValues,
    ...(mode === 'jsonl' ? {
      precedingCommandForInterrupt: top(extra.precedingCommandForInterrupt),
      interruptDeltaMs: quantiles(extra.interruptDeltaMs), craftToOutcomeMs: quantiles(extra.craftToOutcomeMs),
      craftInputs: extra.craftInputs, doubleCraftWithin30s: extra.doubleCraftWithin30s,
    } : {}),
  };
  fs.writeFileSync(outFile, JSON.stringify(result, null, 2));
  console.log('done', JSON.stringify({ mode, files: result.filesScanned, lines: result.logicalLines }));
})();
