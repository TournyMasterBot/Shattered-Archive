// Adds / removes the CVE-2026-111497 request-side brotli block in nginx configs.
//   node deploy/scripts/brotli-mitigation.mjs add|remove|check <file...>
// A server block gets the two lines only if it contains a (non-comment) proxy_pass: a block that
// forwards nothing never hands a request body to Node. Idempotent. Preserves CRLF/LF.
import fs from "node:fs";

const MARK = "BROTLI-MITIGATION";
const COMMENT = `# ${MARK} CVE-2026-111497: refuse brotli request bodies (nginx forwards them undecoded to Node). Re-enable with: node ShatteredArchive/deploy/scripts/brotli-mitigation.mjs remove <file>`;
const RULE = `if ($http_content_encoding ~* "(^|[ ,])br($|[ ,;])") { return 415; }`;
// a line is ours only when the marker is a comment tag (`# BROTLI-MITIGATION`), so prose that merely names it survives
const TAGGED = /#\s*BROTLI-MITIGATION\b/;

const [mode, ...files] = process.argv.slice(2);
if (!["add", "remove", "check"].includes(mode) || !files.length) {
  console.error("usage: add|remove|check <file...>");
  process.exit(2);
}

function stripComment(line) {
  let q = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === q) q = null; continue; }
    if (c === '"' || c === "'") { q = c; continue; }
    if (c === "#") return line.slice(0, i);
  }
  return line;
}

for (const file of files) {
  const raw = fs.readFileSync(file, "utf8");
  const eol = raw.includes("\r\n") ? "\r\n" : "\n";
  const lines = raw.split(/\r?\n/);

  if (mode === "remove") {
    const kept = lines.filter((l) => !TAGGED.test(l) && !(l.includes("$http_content_encoding") && l.includes("return 415")));
    fs.writeFileSync(file, kept.join(eol));
    console.log(`${file}: removed ${lines.length - kept.length} line(s)`);
    continue;
  }

  // find top-level server blocks by brace depth (comments and quoted strings ignored)
  const blocks = []; // {open, close, hasProxy, has}
  let depth = 0, cur = null, inQuote = null;
  for (let i = 0; i < lines.length; i++) {
    const code = stripComment(lines[i]);
    // multi-line quoted strings (e.g. return 200 '...') : track quote state across lines
    let scan = "";
    for (const c of code) {
      if (inQuote) { if (c === inQuote) inQuote = null; continue; }
      if (c === '"' || c === "'") { inQuote = c; continue; }
      scan += c;
    }
    if (!cur && /^\s*server\s*\{/.test(scan)) cur = { open: i, depth, hasProxy: false, has: false };
    if (cur) {
      if (/\bproxy_pass\b/.test(scan)) cur.hasProxy = true;
      if (TAGGED.test(lines[i]) || (lines[i].includes("$http_content_encoding") && lines[i].includes("return 415"))) cur.has = true;
    }
    for (const c of scan) { if (c === "{") depth++; else if (c === "}") depth--; }
    if (cur && depth === cur.depth) { cur.close = i; blocks.push(cur); cur = null; }
  }
  const declared = lines.filter((l) => /^\s*server\s*\{/.test(stripComment(l))).length;
  if (depth !== 0 || cur || declared !== blocks.length) {
    console.error(`${file}: brace parse mismatch (depth ${depth}, declared ${declared}, parsed ${blocks.length}); not touched`);
    process.exitCode = 1;
    continue;
  }

  const todo = blocks.filter((b) => b.hasProxy && !b.has);
  if (mode === "check") {
    console.log(`${file}: ${blocks.length} server blocks, ${blocks.filter((b) => b.hasProxy).length} proxy, ${blocks.filter((b) => b.hasProxy && b.has).length} protected, ${todo.length} unprotected`);
    continue;
  }

  // insert bottom-up so earlier indexes stay valid
  for (const b of todo.sort((a, c) => c.open - a.open)) {
    let j = b.open + 1;
    while (j < b.close && lines[j].trim() === "") j++;
    const indent = (lines[j].match(/^\s*/) || [""])[0] || "  ";
    lines.splice(b.open + 1, 0, `${indent}${COMMENT}`, `${indent}${RULE}`);
  }
  fs.writeFileSync(file, lines.join(eol));
  console.log(`${file}: ${blocks.length} server blocks, protected ${todo.length} more`);
}
