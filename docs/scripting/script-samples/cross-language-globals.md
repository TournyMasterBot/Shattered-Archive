# Sample: one library, used from every language

A global written in any language can be called from a script in any language. This sample puts one function in each
Globals file and calls each from each of the others. Everything here runs on the web client; on mobile the same code
runs, with the note about `await` at the end.

See [scripting-summary.md](../scripting-summary.md#calling-a-global-from-any-language) for the rules.

## The Globals files

**Globals → JavaScript**

```javascript
exports.jsapi = {
  state: { count: 0 },
  double: (args) => args.n * 2,                       // (args): one parameter
  bump() { return ++this.state.count; },              // a method keeps `this`
  later: (args) =>                                    // async: returns a promise
    new Promise((resolve) => setTimeout(() => resolve("JS-LATER-" + args.n), 200)),
  hello(api, args) { api.writeTerminal("hello from js\n"); },   // (api, args): two parameters
};
```

**Globals → TypeScript**

```typescript
exports.tsapi = {
  triple: (args: { n: number }): number => args.n * 3,
};
```

**Globals → Lua**

```lua
counter = 0
function bump() counter = counter + 1 end

-- a Lua global receives its arguments as a JSON string, so decode what you need
function core_add(json)
  local a = tonumber(json:match('"a":(%d+)'))
  local b = tonumber(json:match('"b":(%d+)'))
  return a + b
end
function core_numbers() return {10, 20, 30} end        -- comes back as a list
```

**Globals → Python**

```python
total = 0
def add(n):
    global total
    total += n

# a Python global receives the value itself (a dict here)
def core_info(args):
    return {"name": args["who"].upper(), "n": len(args["who"])}
def core_mul(args):
    return args["a"] * args["b"]
```

## From JavaScript and TypeScript

The JS and TS exports are plain names. Other languages go through `runGlobal`.

```javascript
// a JavaScript trigger
writeTerminal("double " + jsapi.double({ n: 21 }) + "\n");        // 42
writeTerminal("triple " + tsapi.triple({ n: 14 }) + "\n");        // 42, a TS global called from JS
writeTerminal("bump " + jsapi.bump() + "," + jsapi.bump() + "\n"); // 1,2
const sum = await runGlobal("global.lua.core.add", { a: 40, b: 2 });
const prod = await runGlobal("global.python.core.mul", { a: 6, b: 7 });
const later = await jsapi.later({ n: 5 });                         // JS-LATER-5
writeTerminal(sum + " " + prod + " " + later + "\n");
```

```typescript
// a TypeScript alias "kk {TARGET}": the capture is a constant
const n: number = jsapi.double({ n: TARGET.length });
writeTerminal("name length doubled: " + n + "\n");
```

## From Lua

`runGlobal` is a call. It returns the value when the global finished at once, so no callback is needed here.

```lua
local d    = runGlobal("global.javascript.jsapi.double", {n = 21})    -- 42
local t    = runGlobal("global.typescript.tsapi.triple", {n = 14})    -- 42
local info = runGlobal("global.python.core.info", {who = "orc"})      -- a table
local sum  = runGlobal("global.lua.core.add", {a = 1, b = 2})         -- 3
local list = runGlobal("global.python.core.numbers")                  -- {1, 2, 3} if it were in Python
writeTerminal(d .. " " .. t .. " " .. info.name .. "/" .. info.n .. " " .. sum .. "\n")

-- a global that takes time: use a callback. It runs after this script has finished.
runGlobal("global.javascript.jsapi.later", {n = 7}, function(result, err)
  writeTerminal("later: " .. tostring(result) .. " err=" .. tostring(err) .. "\n")
end)
```

## From Python

```python
d = runGlobal("global.javascript.jsapi.double", {"n": 21})        # 42
t = runGlobal("global.typescript.tsapi.triple", {"n": 14})        # 42
l = runGlobal("global.lua.core.add", {"a": 40, "b": 2})          # 42
nums = runGlobal("global.lua.core.numbers")                       # [10, 20, 30]
writeTerminal("PY %d %d %d %d\n" % (d, t, l, nums[2]))

def got(result, err):
    writeTerminal("later: %s err=%s\n" % (result, err))

runGlobal("global.javascript.jsapi.later", {"n": 9}, got)         # callback, later
```

## Sharing state inside one language

Lua and Python are one program each, so no `runGlobal` is needed to reach your own language's globals:

```lua
-- trigger A (Lua)
shared_x = 7
bump()
bump()
-- trigger B (Lua), a later line
writeTerminal("x*6=" .. (shared_x * 6) .. " counter=" .. counter .. "\n")   -- x*6=42 counter=2
```

```python
# trigger A (Python)
py_x = 7
add(5)
add(8)
# trigger B (Python)
writeTerminal("x*6=%d total=%d\n" % (py_x * 6, total))                      # x*6=42 total=13
```

## Notes

- Results are plain data. A function, class instance or self-referencing value comes back as nothing.
- A failing global is reported in the script log and gives `nil` / `None` (and `undefined` in JavaScript); a callback
  receives it as its second argument.
- On mobile, top-level `await` in a JavaScript or TypeScript script works where the phone's engine supports it. If it
  does not, write `runGlobal("global.lua.core.add", {...}).then((sum) => ...)` instead.
- Saving a Globals file restarts that language's engine, so values scripts had set (`shared_x`, `py_x`) start over.
