event:disarm

```typescript
log(`From trigger wield primary: ${JSON.stringify(api)}`);

// string -> [mappedKey, nodrop]
const weaponKey: Record<string, [string, boolean]> = {
  // Staff
  'the Magius Staff': ['magius', false],
  'the Darkstaff': ['darkstaff', false],
  'the icy staff of the Seven Seas': ['sea', false],
  'the staff of the Blind Prince': ['blind', false],
  'a grand arcanium hoopak': ['hoopak', false],
  'a scorched staff covered in charred runes': ['hoopak', true],
  // Polearm
  'a grand arcanium glaive': ['glaive', false],
  // Sword
  'the sword of the GODS': ['god', false],
};

const lookupWeapon = (name: unknown) =>
  typeof name === 'string' ? weaponKey[name] ?? null : null;

const item = api.event?.payload;
const mapped = lookupWeapon(item);

if (mapped) {
  const [key, nodrop] = mapped;

  if (!nodrop) {
    sendCommand(`~get ${key}`);
    sendCommand(`wield ${key}`);
  } else {
    sendCommand(`~wield ${key}`);
  }
} else {
  console.log(`[event:disarm] could not find mapping ${String(item)}`);
}
```