/* ----------------------------------------------------------
   DSL → ANSI mapping (no auto-reset; use {x to clear)
---------------------------------------------------------- */
export const DSL_ANSI_COLORS: Record<string, string> = {
  '{r': '\u001b[31m', // red
  '{R': '\u001b[91m', // Lt Red

  '{g': '\u001b[32m', // green
  '{G': '\u001b[92m', // Lt Green

  '{y': '\u001b[33m', // yellow
  '{Y': '\u001b[93m', // Lt Yellow

  '{b': '\u001b[34m', // blue
  '{B': '\u001b[94m', // Lt Blue

  '{m': '\u001b[35m', // magenta
  '{M': '\u001b[95m', // Lt Magenta

  '{c': '\u001b[36m', // cyan
  '{C': '\u001b[96m', // Lt Cyan

  '{D': '\u001b[30m', // black
  '{w': '\u001b[37m', // Grey
  '{W': '\u001b[97m', // Lt White

  '{o': '\u001b[38;5;208m', // orange
  '{n': '\u001b[38;5;130m', // brown
  '{p': '\u001b[38;5;213m', // pink
  '{u': '\u001b[38;5;141m', // purple
};

export function dslToAnsi(input: string): string {
  if (!input) return '';

  let out = '';
  let i = 0;

  while (i < input.length) {
    const ch = input[i];

    if (ch === '{' && i + 1 < input.length) {
      const next = input[i + 1];

      // Literal '{' → '{{'
      if (next === '{') {
        out += '{';
        i += 2;
        continue;
      }

      const code = input.slice(i, i + 2);

      // Reset
      if (code === '{x') {
        out += '\u001b[0m';
        i += 2;
        continue;
      }

      // Bell icon
      if (code === '{!') {
        out += '🔔';
        i += 2;
        continue;
      }

      // Literal tilde
      if (code === '{-') {
        out += '~';
        i += 2;
        continue;
      }

      // Reverse video
      if (code === '{&') {
        out += '\u001b[7m';
        i += 2;
        continue;
      }

      // Underline
      if (code === '{_') {
        out += '\u001b[4m';
        i += 2;
        continue;
      }

      const ansi = DSL_ANSI_COLORS[code];
      if (ansi) {
        out += ansi;
        i += 2;
        continue;
      }
    }

    out += ch;
    i++;
  }

  return out;
}