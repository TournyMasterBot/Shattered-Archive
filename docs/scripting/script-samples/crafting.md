# Skinning
Global
```javascript
// Built once when the Globals module loads (again only when you save this file).
// No g or y flag, so the regex keeps no lastIndex state and is safe to share.
const SKINNED_RE = /You have killed and skinned (\d+) deer\(s\)\./;
const ANSI_RE = /\x1b\[[0-9;]*m/g;   // g is fine for replace(), which resets lastIndex

// One parameter: called as skinnedCount(line)
exports.skinnedCount = (line) => {
  const m = SKINNED_RE.exec(String(line).replace(ANSI_RE, ""));
  return m ? parseInt(m[1], 10) : null;
};
```

Trigger
```javascript
const p = event?.payload;
const count = skinnedCount(typeof p === "string" ? p : p?.text ?? p?.rawText ?? p?.line ?? "");
if (count !== null) {
  // use count
}
```