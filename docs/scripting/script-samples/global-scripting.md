```javascript
// JS Global (Globals tab -> JavaScript)

exports.core = exports.core || {};

// Proof: called by runGlobal("global.javascript.core.echo", { text: "..." })
exports.core.echo = (api, args) => {
  const text = String(args?.text ?? "");
  api.writeTerminal?.(`{G[JS global]{x echo: ${text}\n`);
};

// Proof: global var store usage
exports.core.bumpCounter = (api, _args) => {
  const key = "JS_COUNTER";
  const cur = Number(api.getGlobalVar?.(key) ?? 0) || 0;
  const next = cur + 1;

  api.setGlobalVar?.(key, next);
  api.writeTerminal?.(`{G[JS global]{x counter=${next}\n`);
};

// Proof: named vars (Variables tab) integrated into command
exports.core.attackTarget = (api, _args) => {
  const target = api.getNamedVar?.("TARGET") || "rat";
  api.sendCommand(`kill ${target}`);
};

```