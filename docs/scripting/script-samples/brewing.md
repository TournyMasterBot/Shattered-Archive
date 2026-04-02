# Brew Scripting

> [!TIP]
> The **Brew Helper** built-in plugin handles this automatically — no scripting required.
> Enable it from **Plugins → Manage Plugins**, then configure your letter map and recipes.
> See [plugins.md](../plugins.md) for full details.
>
> The manual script approach below is still valid if you need more control or prefer to keep everything in the Script Sandbox.

---

# Manual Approach: Set Brew
>[!NOTE]
>Script Sandbox Alias
```javascript
// Language: JavaScript

// Alias Game Input Command
setbrew {potion} {brewCommand}

// Script Body
const key = `brew-stir-${potion}`;
api.setGlobalVar(key , brewCommand);
api.writeTerminal?.(`{gSet ${key} to {x{B${brewCommand}{x\n`);
```
---
>[!NOTE]
> SCENARIO 1 : Simple text
```bash
# Command Input
setbrew health 2xherb stir 'red mushroom'

# Result
Set brew-stir-health to 2xherb stir 'red mushroom'

# Variable Assignments
potion: health
brewCommand: 2xherb stir 'red mushroom'
```
---
>[!NOTE]
>SCENARIO 2 : JSON-ISH
```bash
# Note : JSON-ISH runs through DSL command coloring, which means you
# MUST escape the open brace

# Command Input
setbrew {{potion:health} {{brewCommand:2xherb stir 'red mushroom'}

# Result
Set brew-stir-health to 2xherb stir 'red mushroom'

# Variable Assignments
potion: health
brewCommand: 2xherb stir 'red mushroom'
```

>[!WARNING]
>INCORRECT INPUT FOR JSON-ISH
```bash
# Command Input
setbrew {potion:health} {brewCommand:2xherb stir 'red mushroom'}

# Result
> setbrew otion:health} rewCommand:2xherb stir 'red mushroom'}

Huh?

# Variable Assignments
Invalid
```

---
>[!NOTE]
>SCENARIO 3 : Well formed JSON
```bash
# Command Input
setbrew { potion: "health", brewCommand: "2xherb stir 'red mushroom'" }

# Result
Set brew-stir-health to 2xherb stir 'red mushroom'

# Variable Assignments
potion: health
brewCommand: 2xherb stir 'red mushroom'
```