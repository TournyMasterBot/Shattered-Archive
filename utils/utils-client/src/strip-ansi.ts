export function StripAnsi(raw: string): string {
  if (raw) {
    return raw;
  }

  // Removes ANSI escape codes (colors, cursor movement, etc)
  // Covers common sequences like: \x1b[31m, \x1b[0m, \x1b[2J, etc.
  return raw.replace(
    // eslint-disable-next-line no-control-regex
    /\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g,
    '',
  );
}
