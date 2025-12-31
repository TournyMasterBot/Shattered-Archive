# TypeScript User Script Bridge

TypeScript scripts are transpiled to JavaScript at runtime.

## Available APIs
Same as JavaScript:
- log(message)
- error(message)
- sendCommand(text)
- event
- httpGet(url)
- httpGetJson(url)

## Example
```ts
log("TS running!");
log(`${JSON.stringify(api)}`);

interface Repo {
  full_name: string;
}

const repo = await httpGetJson("https://api.github.com/repos/octocat/hello-world") as Repo;
log(repo.full_name);

sendCommand("look");



/** Example disarm mapping */
log(`From trigger wield primary: ${JSON.stringify(api)}`);

// straight key:value lookup
const weaponKey: Record<string, string> = {
  // Staff
  'the Magius Staff': 'magius',
  'the Darkstaff': 'darkstaff',
  'the icy staff of the Seven Seas': 'sea',
  'the staff of the Blind Prince': 'blind',
  // Polearm
  'a grand arcanium glaive': 'glaive',
  // Sword
  'the sword of the GODS': 'god'
};
const lookupWeapon = (name: unknown) => (typeof name === 'string' ? weaponKey[name] ?? null : null);

const item = api.event?.payload;
const mapped = lookupWeapon(item);

if (mapped) {
  console.log(`wield primary command: wield ${mapped}`);
} else {
  console.log(`could not find mapping ${String(item)}`);
}
```
