export function stripAnsi(input: string): string {
  return String(input ?? '').replace(/\u001b\[[0-9;]*m/g, '');
}

export function cleanText(input: string): string {
  return stripAnsi(input).replace(/\r/g, '');
}
