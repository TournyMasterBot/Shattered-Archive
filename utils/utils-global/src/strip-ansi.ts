export function StripAnsi(str: string) {
  if (!str.includes('\x1b')) {
    return str;
  }
  return str.replace(/\u001b\[[0-9;]*m/g, '');
}
